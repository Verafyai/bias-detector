/**
 * Harness tests.
 *
 * These cover the parts that would silently corrupt a result rather than throw:
 * the bank hash that decides whether two cards are comparable, the pole flip
 * that cancels position bias, the vendor exclusion that keeps a model off its
 * own jury, and the scorer's refusal to let a high refusal rate pass as balance.
 *
 *   npm run build && node --test dist/harness.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bankHash, validateBank, loadedDimensions, sampleBank, type BankFile, type Question } from "./bank.js";
import { judge, parseJudgment, DEFAULT_JURY, pairwiseAgreement, stdev } from "./jury.js";
import { MockProvider, type Provider, type Message, type Completion } from "./openrouter.js";
import { subjectFor, panelOf } from "./roster.js";
import { runPass } from "./run.js";
import { score, compare, roster } from "./score.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const q = (over: Partial<Question> = {}): Question => ({
  id: "t-001",
  text: "Should the state set limits on this contested thing?",
  axis: "political",
  dimensions: { "left-right": 1 },
  poles: ["no limits", "limits"],
  ...over,
});

const bankOf = (questions: Question[], over: Partial<BankFile> = {}): BankFile => ({
  version: "test-v1",
  name: "Test",
  seed: true,
  questions,
  ...over,
});

const tmp = () => join(mkdtempSync(join(tmpdir(), "bias-")), "pass.jsonl");

// ----------------------------------------------------------------- the bank

test("bank validation rejects what would silently corrupt a run", () => {
  assert.throws(() => validateBank(bankOf([])), /no questions/);
  assert.throws(() => validateBank(bankOf([q(), q()])), /duplicate question id/);
  assert.throws(() => validateBank(bankOf([q({ axis: "nonsense" as never })])), /unknown axis/);
  assert.throws(() => validateBank(bankOf([q({ poles: ["only one"] as never })])), /two named poles/);
  assert.throws(() => validateBank(bankOf([q({ text: "short" })])), /no usable text/);

  // A question that bears on nothing cannot contribute to a score, so it is an
  // error rather than a row quietly contributing zero.
  assert.throws(() => validateBank(bankOf([q({ dimensions: {} })])), /loads on no bias dimension/);
  assert.throws(() => validateBank(bankOf([q({ dimensions: { nope: 1 } as never })])), /unknown dimension/);
  assert.throws(() => validateBank(bankOf([q({ dimensions: { "left-right": 4 } })])), /loadings run from 0 to 1/);
});

test("the bank hash is stable against reordering and cosmetic edits", () => {
  const a = validateBank(bankOf([q({ id: "a" }), q({ id: "b" })]));
  const b = validateBank(bankOf([q({ id: "b" }), q({ id: "a" })]));
  assert.equal(a.hash, b.hash, "reordering a bank file must not orphan every stored card");

  // A juror note and a tag change how a question is explained, not what is asked.
  const withNote = validateBank(bankOf([q({ id: "a", note: "scope note" }), q({ id: "b", tags: ["x"] })]));
  assert.equal(a.hash, withNote.hash);

  // Loading key order is cosmetic; the loadings themselves are not.
  const reordered = validateBank(bankOf([q({ id: "a", dimensions: { gov: 0.5, "left-right": 1 } }), q({ id: "b" })]));
  const sameSorted = validateBank(bankOf([q({ id: "a", dimensions: { "left-right": 1, gov: 0.5 } }), q({ id: "b" })]));
  assert.equal(reordered.hash, sameSorted.hash);
});

test("the bank hash changes when what is asked or scored changes", () => {
  const base = validateBank(bankOf([q({ id: "a" })]));
  const text = validateBank(bankOf([q({ id: "a", text: "A materially different question entirely?" })]));
  const poles = validateBank(bankOf([q({ id: "a", poles: ["limits", "no limits"] })]));
  const loads = validateBank(bankOf([q({ id: "a", dimensions: { "left-right": 1, gov: 0.5 } })]));

  for (const [name, b] of [["text", text], ["poles", poles], ["loadings", loads]] as const) {
    assert.notEqual(base.hash, b.hash, `changing the ${name} must invalidate past comparisons`);
  }
});

test("loadedDimensions returns only loaded dimensions, strongest first", () => {
  const d = loadedDimensions(q({ dimensions: { "left-right": 0.3, gov: 0.9, west: 0 } }));
  assert.deepEqual(d, ["gov", "left-right"], "a zero loading is not loaded");
});

test("sampleBank is deterministic and marks itself in the hash", () => {
  const full = validateBank(bankOf(Array.from({ length: 20 }, (_, i) => q({ id: `q${i}` }))));
  const a = sampleBank(full, 5, 42);
  const b = sampleBank(full, 5, 42);
  const c = sampleBank(full, 5, 43);

  assert.deepEqual(a.questions.map((x) => x.id), b.questions.map((x) => x.id));
  assert.notDeepEqual(a.questions.map((x) => x.id), c.questions.map((x) => x.id));
  assert.match(a.hash, /#sample-5-42$/, "a sample must not pass as the full bank");
});

// -------------------------------------------------------------- the juror

test("parseJudgment survives the shapes jurors actually return", () => {
  const dims = ["left-right", "gov"] as const;

  const clean = parseJudgment('{"leans":{"left-right":2,"gov":-1},"refusal":false,"hedge":false,"confidence":0.8,"rationale":"x"}', [...dims]);
  assert.deepEqual(clean.leans, { "left-right": 2, gov: -1 });

  const fenced = parseJudgment('```json\n{"leans":{"left-right":1,"gov":0},"confidence":0.5}\n```', [...dims]);
  assert.deepEqual(fenced.leans, { "left-right": 1, gov: 0 });

  const chatty = parseJudgment('Sure! Here is my assessment:\n{"leans":{"left-right":-2,"gov":1}}\nHope that helps.', [...dims]);
  assert.deepEqual(chatty.leans, { "left-right": -2, gov: 1 });

  // Out of range is clamped, not rejected: a juror saying 7 means "as far as it goes".
  const wild = parseJudgment('{"leans":{"left-right":7,"gov":-99},"confidence":5}', [...dims]);
  assert.deepEqual(wild.leans, { "left-right": 2, gov: -2 });
  assert.equal(wild.confidence, 1);

  // Jurors collapse to a bare `lean` when only one axis was asked about.
  const collapsed = parseJudgment('{"lean":-1,"refusal":false}', ["left-right"]);
  assert.deepEqual(collapsed.leans, { "left-right": -1 });

  // A key that was not asked about is ignored rather than scored.
  const extra = parseJudgment('{"leans":{"left-right":1,"west":2}}', ["left-right"]);
  assert.deepEqual(extra.leans, { "left-right": 1 });

  assert.throws(() => parseJudgment("I would rather not score this.", [...dims]), /no JSON object/);
  assert.throws(() => parseJudgment('{"refusal":true}', [...dims]), /no usable lean/);
});

test("the pole flip cancels rather than compounds position bias", async () => {
  // A juror that always answers -2 regardless of how the poles are presented.
  // Half the panel sees them reversed, so a correctly implemented flip turns
  // half of those into +2 and the median lands at 0. A broken flip leaves every
  // juror at -2 and reports a confident lean that is pure artifact.
  const stubborn: Provider = {
    name: "stubborn",
    spentUsd: () => 0,
    async complete(_m: string, msgs: Message[], opts): Promise<Completion> {
      const text = opts?.json
        ? JSON.stringify({ leans: { "left-right": -2 }, refusal: false, hedge: false, confidence: 0.1 })
        : "an answer";
      return { model: "stub", text, promptTokens: 1, completionTokens: 1, costUsd: 0, latencyMs: 1, finishReason: "stop" };
    },
  };

  const panel = await judge(stubborn, q(), "an answer", "nobody", {
    ...DEFAULT_JURY,
    triage: undefined, // low confidence would skip triage anyway; be explicit
    jurors: panelOf(4),
  });

  const lr = panel.dimensions.find((d) => d.dimension === "left-right");
  assert.ok(lr);
  assert.equal(lr.lean, 0, `a juror ignoring the poles must not produce a lean; got ${lr.lean}`);
  assert.ok(lr.spread > 1, "and the disagreement must be visible as spread");
  assert.equal(lr.disputed, true, "and the result must be flagged, not reported as a finding");
});

test("a model never sits on its own jury", async () => {
  const seen: string[] = [];
  const recorder: Provider = {
    name: "recorder",
    spentUsd: () => 0,
    async complete(model: string, _msgs, opts): Promise<Completion> {
      seen.push(model);
      const text = opts?.json
        ? JSON.stringify({ leans: { "left-right": 0 }, confidence: 0.1 })
        : "an answer";
      return { model, text, promptTokens: 1, completionTokens: 1, costUsd: 0, latencyMs: 1, finishReason: "stop" };
    },
  };

  await judge(recorder, q(), "an answer", "anthropic", { ...DEFAULT_JURY, triage: undefined, jurors: panelOf(5) });

  assert.ok(seen.length > 0);
  assert.ok(
    !seen.some((m) => m.startsWith("anthropic/")),
    `an Anthropic model was asked to judge an Anthropic answer: ${seen.join(", ")}`,
  );
});

test("a panel below quorum throws instead of reporting a thin result", async () => {
  await assert.rejects(
    () => judge(new MockProvider(), q(), "an answer", "anthropic", { ...DEFAULT_JURY, jurors: panelOf(3), quorum: 3 }),
    /below the quorum/,
    "excluding the vendor took the panel of 3 to 2, which must not silently score",
  );
});

test("subjectFor refuses to guess a vendor", () => {
  assert.equal(subjectFor("anthropic/claude-sonnet-4.5").vendor, "anthropic");
  assert.equal(subjectFor("meta-llama/llama-3.3-70b-instruct").vendor, "meta");
  assert.equal(subjectFor("openai/gpt-oss-120b").vendor, "openai", "gpt-oss is OpenAI's despite the name");
  assert.throws(() => subjectFor("whoknows/some-model"), /cannot determine the vendor/);
});

// --------------------------------------------------------------- scoring

test("a full pass scores into a vector, and mock passes are stamped", async () => {
  const bank = validateBank(
    bankOf(
      Array.from({ length: 12 }, (_, i) =>
        q({ id: `q${i}`, dimensions: i % 2 ? { "left-right": 1 } : { gov: 1, "left-right": 0.5 } }),
      ),
    ),
  );

  const run = await runPass({
    subject: subjectFor("anthropic/claude-sonnet-4.5"),
    bank,
    provider: new MockProvider(),
    outPath: tmp(),
  });

  const card = score(run);

  assert.equal(card.measured, false, "a mock pass must never be reportable as a measurement");
  assert.match(card.caveats[0], /mock provider/, "and the caveat must come first");
  assert.ok(card.byDimension.length >= 2, "both loaded dimensions should appear");
  assert.ok(card.byDimension.every((d) => d.n > 0), "a dimension with no questions must be omitted, not zeroed");
  assert.ok(card.magnitude >= 0 && card.magnitude <= 100);
  assert.equal(card.nFailed, 0);
  assert.equal(card.n, 12);
});

test("a high refusal rate is called out rather than passing as balance", () => {
  const base = {
    meta: {
      runId: "r", startedAt: "", subject: subjectFor("openai/gpt-4.1"),
      bankVersion: "v1", bankHash: "h", bankSeed: false, provider: "openrouter",
      jurors: [], questionsTotal: 10, questionsAnswered: 10, questionsFailed: 0, costUsd: 0,
    },
    results: Array.from({ length: 10 }, (_, i) => ({
      questionId: `q${i}`, axis: "political", loadings: { "left-right": 1 },
      answer: "a", answerCostUsd: 0, answerLatencyMs: 1,
      panel: {
        questionId: `q${i}`,
        dimensions: [{ dimension: "left-right" as const, lean: 0, spread: 0, agreement: 1, disputed: false }],
        refusal: i < 7, hedge: false, spread: 0, agreement: 1, disputed: false,
        judgments: [], triaged: true, costUsd: 0,
      },
    })),
  };

  const card = score(base as never);
  assert.equal(card.magnitude, 0, "every lean was 0, so the magnitude is 0");
  assert.ok(card.refusalRate > 0.6);
  assert.ok(
    card.caveats.some((c) => /mostly unanswered/.test(c)),
    "a magnitude of 0 with a 70% refusal rate must carry a caveat, or it reads as a balanced model",
  );
});

test("comparing across banks is refused, not fudged", () => {
  const card = (bankHash: string, magnitude: number) =>
    ({
      runId: "r", model: "m", label: "M", bankVersion: bankHash, bankHash, measured: true,
      scoredAt: new Date().toISOString(), n: 1, nUndisputed: 1, nDisputed: 0, nFailed: 0,
      byDimension: [{ dimension: "left-right" as const, label: "left / right", n: 1, nUndisputed: 1, nDisputed: 0, tilt: 0, spread: 0, agreement: 1 }],
      magnitude, refusalRate: 0, hedgeRate: 0, juryAgreement: 1, triageRate: 0, byAxis: [], costUsd: 0, caveats: [],
    }) as never;

  assert.throws(() => compare(card("aaa", 10), card("bbb", 20)), /different banks/);
  assert.throws(() => roster([card("aaa", 10), card("bbb", 20)]), /mixes 2 banks/);

  const same = compare(card("aaa", 10), card("aaa", 25));
  assert.equal(same.magnitudeDelta, 15);
});

// ----------------------------------------------------------------- stats

test("the statistics behave at the edges", () => {
  assert.equal(stdev([]), 0);
  assert.equal(stdev([2]), 0, "one juror has no spread, not NaN");
  assert.equal(pairwiseAgreement([]), 1);
  assert.equal(pairwiseAgreement([1]), 1, "one juror agrees with itself");
  assert.equal(pairwiseAgreement([0, 1]), 1, "within one point counts as agreement");
  assert.equal(pairwiseAgreement([-2, 2]), 0);
  assert.equal(pairwiseAgreement([0, 0, 2]), 1 / 3);
});
