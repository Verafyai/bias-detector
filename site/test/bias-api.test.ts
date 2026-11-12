import assert from "node:assert/strict";
import { test } from "node:test";
import { bankSummary, queryQuestions } from "@/lib/bias/api/bank";
import { dataIsMeasured } from "@/lib/bias/api/flags";
import { createLimiter } from "@/lib/bias/api/http";
import { creditsFor, estimateCalls, getBank, getBankQuestions, getCard, getCardHistory, getCards, getRun, postRun, type ApiDeps } from "@/lib/bias/api/handlers";
import { MemoryKeyStore } from "@/lib/bias/api/keys";
import { buildReportCard, type ItemResult } from "@/lib/bias/api/report-card";
import { FileRunStore, ImmutableRunError, MemoryJobStore, MemoryRunStore, sealRun, TamperedRunError, UnmeasuredRunError, type PublishedRun } from "@/lib/bias/api/store";
import { processJob } from "@/lib/bias/api/worker";
import { biasComplete } from "@/lib/bias/live/openrouter";
import { blindAnswer, jurorPrompt, parseJuror, runLive, seatJurors, BudgetExceededError } from "@/lib/bias/live/run";
import { getBenchmarkQuestions, getQuestionSetHash } from "@/lib/bias/questions";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const bank = getBenchmarkQuestions();

/** Fake OpenRouter: answers plainly, jurors score every requested dimension at 0.2 on the unflipped scale. */
function fakeFetch(opts: { fail?: (model: string) => boolean; cost?: number } = {}) {
  const calls: { model: string; user: string }[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const user = body.messages[1].content as string;
    calls.push({ model: body.model, user });
    if (opts.fail?.(body.model)) return new Response(JSON.stringify({ error: { message: "Provider returned error" } }), { status: 502 });
    let content = "I am Claude. Here is a balanced view of both sides.";
    if (body.response_format) {
      const dims = [...user.matchAll(/^ {2}"(\w+)": number/gm)].map((m) => m[1]);
      const flipped = /-1 means the answer leans (Right|Pro-government|Western|Religious)/.test(user);
      const scores = Object.fromEntries(dims.map((d) => [d, flipped ? -0.2 : 0.2]));
      content = JSON.stringify({ refused: false, hedged: false, scores, rationale: "Gives both sides room." });
    }
    return new Response(JSON.stringify({ id: "gen-1", choices: [{ message: { content } }], usage: { cost: opts.cost ?? 0.0001 } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    runs: new MemoryRunStore(),
    jobs: new MemoryJobStore(),
    keys: new MemoryKeyStore(new Map([["good-key", { id: "k1", credits: 500 }], ["poor-key", { id: "k2", credits: 3 }]])),
    limiter: createLimiter(),
    legacyRun: async (id) => (id === "run_legacy" ? { id, simulated: true } : null),
    budgetCapUsd: 5,
    env: {},
    ...overrides,
  };
}

async function sealedRun(model = "openai/gpt-oss-120b", n = 12, extra: Partial<PublishedRun> = {}): Promise<PublishedRun> {
  const { impl } = fakeFetch();
  const questions = bank.slice(0, n);
  const result = await runLive({
    runId: `test-${model.replace(/\W+/g, "-")}-${n}`,
    model,
    questions,
    bankVersion: "v1.0.0",
    bankHash: getQuestionSetHash(),
    jurySize: 3,
    apiKey: "sk-test",
    spend: { capUsd: 1, spentUsd: 0, calls: 0 },
    fetchImpl: impl,
  });
  return sealRun({
    schema: "verafy-bias-run/1",
    runId: `test-${model.replace(/\W+/g, "-")}-${n}`,
    model,
    bankVersion: "v1.0.0",
    bankHash: getQuestionSetHash(),
    jurySize: 3,
    sampled: false,
    questionIds: questions.map((q) => q.id),
    measured: true,
    createdAt: "2026-11-12T19:00:00Z",
    completedAt: "2026-11-12T19:05:00Z",
    costUsd: result.costUsd,
    calls: result.calls,
    jurors: result.jurorsUsed,
    card: result.card,
    items: result.items,
    ...extra,
  } as Omit<PublishedRun, "sha256">);
}

test("bank: 565 scored questions, demo prompts excluded, hash matches the published 1e2a63eb258f", () => {
  const s = bankSummary();
  assert.equal(s.questionCount, 565);
  assert.equal(s.bankFileCount, 576);
  assert.equal(s.version, "v1.0.0");
  assert.ok(s.hash.startsWith("1e2a63eb258f"), s.hash);
  assert.equal(s.excluded.ids.length, 11);
  assert.ok(!bank.some((q) => s.excluded.ids.includes(q.id)));
  assert.deepEqual(Object.keys(s.byDimension), ["left_right", "pro_gov_anti_gov", "western_nonwestern", "religious_secular"]);
});

test("bank questions: filters and validation", async () => {
  const r = queryQuestions({ dimension: "religion", limit: 5 });
  assert.equal(r.questions.length, 5);
  assert.ok(r.questions.every((q) => q.bias_axes.includes("religious_secular")));
  const bad = getBankQuestions(new URL("http://x/api/v1/bank/questions?dimension=nope&limit=abc"));
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.deepEqual(body.details.map((d: { field: string }) => d.field).sort(), ["dimension", "limit"]);
  assert.equal(getBank().status, 200);
});

test("DATA_IS_MEASURED defaults to false", () => {
  assert.equal(dataIsMeasured({}), false);
  assert.equal(dataIsMeasured({ DATA_IS_MEASURED: "true" }), true);
});

test("jurors: same provider is never seated, order flips for half, model name is hidden", () => {
  const seat = seatJurors("openai/gpt-oss-120b", "cq-0100", 5);
  assert.equal(seat.length, 5);
  assert.ok(seat.every((id) => !id.startsWith("openai/")));
  assert.equal(blindAnswer("As Claude, and unlike GPT-4o or Llama 4, I think"), "As [model], and unlike [model] or [model] 4, I think");
  const q = bank.find((x) => x.bias_axes.includes("left_right"))!;
  assert.match(jurorPrompt(q, "x", ["left_right"], false), /-1 means the answer leans Left/);
  assert.match(jurorPrompt(q, "x", ["left_right"], true), /-1 means the answer leans Right/);
  const parsed = parseJuror('{"refused":false,"hedged":true,"scores":{"left_right":0.5},"rationale":"r"}', ["left_right"], true)!;
  assert.equal(parsed.scores.left_right, -0.5);
  assert.equal(parsed.hedged, true);
});

test("live run: flipped jurors are un-flipped, triage settles agreeing items, card shape is complete", async () => {
  const run = await sealedRun();
  const card = run.card;
  assert.equal(card.measured, true);
  assert.equal(card.n, 12);
  assert.equal(card.nFailed, 0);
  assert.equal(card.triageRate, 1);
  const lr = card.byDimension.find((d) => d.dimension === "left_right")!;
  assert.ok(lr.n > 0);
  assert.equal(lr.tilt, 0.2);
  assert.equal(card.byDimension.length, 4);
  for (const key of ["runId", "model", "label", "bankVersion", "bankHash", "scoredAt", "magnitude", "refusalRate", "hedgeRate", "answerRate", "juryAgreement", "triageRate", "nUndisputed", "nDisputed", "caveats"]) {
    assert.ok(key in card, key);
  }
  assert.ok(!run.items.some((i) => i.jurors.some((j) => j.jurorId.startsWith("openai/"))));
});

test("live run: the server budget cap stops the run", async () => {
  const { impl } = fakeFetch({ cost: 0.5 });
  await assert.rejects(
    runLive({ runId: "cap-test-1", model: "openai/gpt-oss-120b", questions: bank.slice(0, 20), bankVersion: "v1.0.0", bankHash: "h", jurySize: 3, apiKey: "k", spend: { capUsd: 1, spentUsd: 0, calls: 0 }, fetchImpl: impl, concurrency: 1 }),
    BudgetExceededError,
  );
});

test("live run: upstream failures are counted, not scored", async () => {
  const { impl } = fakeFetch({ fail: (m) => m === "openai/gpt-oss-120b" });
  const r = await runLive({ runId: "fail-test-1", model: "openai/gpt-oss-120b", questions: bank.slice(0, 4), bankVersion: "v1.0.0", bankHash: "h", jurySize: 3, apiKey: "sk-secret-123", spend: { capUsd: 1, spentUsd: 0, calls: 0 }, fetchImpl: impl });
  assert.equal(r.card.nFailed, 4);
  assert.equal(r.card.n, 0);
  assert.ok(!JSON.stringify(r.items).includes("sk-secret-123"));
});

test("openrouter client never adds :online or web search", async () => {
  const { impl, calls } = fakeFetch();
  const res = await biasComplete({ model: "openai/gpt-oss-120b", system: "s", user: "u", maxTokens: 10 }, "k", impl);
  assert.equal(res.ok, true);
  assert.equal(calls[0].model, "openai/gpt-oss-120b");
});

test("report card: disputes are reported, not averaged; high hedge gets a caveat", () => {
  const items: ItemResult[] = [
    { questionId: "a", dimensions: ["left_right"], answer: null, triaged: false, failed: false, jurors: [
      { jurorId: "x", flipped: false, refused: false, hedged: true, scores: { left_right: -0.9 }, rationale: "", costUsd: 0 },
      { jurorId: "y", flipped: true, refused: false, hedged: true, scores: { left_right: 0.9 }, rationale: "", costUsd: 0 },
    ] },
    { questionId: "b", dimensions: ["left_right"], answer: null, triaged: true, failed: false, jurors: [
      { jurorId: "x", flipped: false, refused: false, hedged: true, scores: { left_right: 0.4 }, rationale: "", costUsd: 0 },
      { jurorId: "y", flipped: true, refused: false, hedged: true, scores: { left_right: 0.4 }, rationale: "", costUsd: 0 },
    ] },
  ];
  const card = buildReportCard({ runId: "r", model: "m/m", label: "M", bankVersion: "v1.0.0", bankHash: "h", measured: true, scoredAt: "t", items });
  const lr = card.byDimension[0];
  assert.equal(lr.nDisputed, 1);
  assert.equal(lr.tilt, 0.4);
  assert.equal(card.hedgeRate, 1);
  assert.ok(card.caveats.some((c) => c.includes("not a balanced model")));
});

test("store: runs are write-once, tamper-evident, and unmeasured runs are refused", async () => {
  const run = await sealedRun();
  const dir = mkdtempSync(path.join(tmpdir(), "bias-runs-"));
  const store = new FileRunStore(dir);
  await store.publish(run);
  await assert.rejects(store.publish(run), ImmutableRunError);
  const file = path.join(dir, `${run.runId}.json`);
  const edited = JSON.parse(readFileSync(file, "utf8"));
  edited.card.magnitude = 0;
  writeFileSync(file, JSON.stringify(edited));
  await assert.rejects(store.get(run.runId), TamperedRunError);
  assert.equal((await store.list()).length, 0);
  const { sha256: _s, ...rest } = run;
  assert.throws(() => sealRun({ ...rest, measured: false as unknown as true }), UnmeasuredRunError);
  assert.throws(() => sealRun({ ...rest, card: { ...rest.card, measured: false } }), UnmeasuredRunError);
});

test("cards: only measured, full-bank cards on the current bank; history grouped by bank hash", async () => {
  const d = deps();
  assert.equal((await (await getCards(new URL("http://x/api/v1/cards"), d)).json()).count, 0);
  await d.runs.publish(await sealedRun("openai/gpt-oss-120b"));
  await d.runs.publish(await sealedRun("meta-llama/llama-4-maverick"));
  await d.runs.publish(await sealedRun("x-ai/grok-4.3", 12, { bankHash: "oldhash", runId: "old-grok-run" }));
  const list = await (await getCards(new URL("http://x/api/v1/cards?sort=name"), d)).json();
  assert.equal(list.count, 2);
  assert.equal(list.dataIsMeasured, false);
  assert.equal((await getCard("openai/gpt-oss-120b", d)).status, 200);
  assert.equal((await getCard("x-ai/grok-4.3", d)).status, 404);
  const hist = await (await getCardHistory("x-ai/grok-4.3", d)).json();
  assert.equal(hist.series.length, 1);
  assert.equal(hist.series[0].bankHash, "oldhash");
  assert.equal((await getCards(new URL("http://x/api/v1/cards?sort=bogus"), d)).status, 400);
});

test("runs: legacy simulated runs are labeled and carry no card", async () => {
  const d = deps();
  const res = await (await getRun("run_legacy", d)).json();
  assert.equal(res.status, "simulated");
  assert.equal(res.measured, false);
  assert.equal(res.card, null);
  assert.equal((await getRun("nope_nope", d)).status, 404);
});

function post(body: unknown, key?: string) {
  return new Request("http://x/api/v1/runs", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) }, body: JSON.stringify(body) });
}

test("POST /runs: auth, validation, credits, rate-limit headers, no client budget", async () => {
  const d = deps();
  assert.equal((await postRun(post({ model: "openai/gpt-oss-120b" }), d)).status, 401);
  assert.equal((await postRun(post({ model: "openai/gpt-oss-120b" }, "bad-key"), d)).status, 401);
  const bad = await postRun(post({ model: "nope", jurySize: 4, sample: 3, budget: 999 }, "good-key"), d);
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json()).details.map((x: { field: string }) => x.field).sort(), ["budget", "jurySize", "model", "sample"]);
  assert.ok(bad.headers.get("X-RateLimit-Remaining"));
  const poor = await postRun(post({ model: "openai/gpt-oss-120b" }, "poor-key"), d);
  assert.equal(poor.status, 403);
  assert.deepEqual(await poor.json(), { error: "Insufficient credits", required: 50, available: 3 });
  const ok = await postRun(post({ model: "openai/gpt-oss-120b", jurySize: 3, sample: 20 }, "good-key"), d);
  assert.equal(ok.status, 202);
  const body = await ok.json();
  assert.equal(body.status, "queued");
  assert.equal(body.estimatedCalls, 80);
  assert.equal(body.credits, 2);
  assert.ok(!("estimatedCostUsd" in body));
  assert.ok(Number(ok.headers.get("X-RateLimit-Reset")) > Date.now() / 1000);
  const status = await (await getRun(body.runId, d)).json();
  assert.equal(status.status, "queued");
});

test("POST /runs: 429 after 100 requests in an hour", async () => {
  const d = deps();
  for (let i = 0; i < 100; i++) await postRun(post({}, "good-key"), d);
  const res = await postRun(post({}, "good-key"), d);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("X-RateLimit-Remaining"), "0");
  assert.ok(res.headers.get("X-RateLimit-Reset"));
});

test("credits: 1,000 for a full 20-model pass, pro rata", () => {
  assert.equal(creditsFor(20, 565, 565), 1000);
  assert.equal(creditsFor(1, 565, 565), 50);
  assert.equal(estimateCalls(565, 5), 3390);
});

test("worker: a queued job runs, publishes once, and its card is served", async () => {
  const d = deps();
  const res = await (await postRun(post({ model: "openai/gpt-oss-120b", jurySize: 3, sample: 10 }, "good-key"), d)).json();
  const job = (await d.jobs.get(res.runId))!;
  const { impl } = fakeFetch();
  const run = await processJob(job, { runs: d.runs, jobs: d.jobs, apiKey: "k", budgetCapUsd: 1, fetchImpl: impl });
  assert.ok(run);
  const status = await (await getRun(res.runId, d)).json();
  assert.equal(status.status, "complete");
  assert.equal(status.card.measured, true);
  // Sampled runs are viewable by id but never listed as the model's card.
  assert.equal((await (await getCards(new URL("http://x/api/v1/cards"), d)).json()).count, 0);
});

test("worker: a run over the server cap is aborted, unpublished, and refunded", async () => {
  const keys = new MemoryKeyStore(new Map([["good-key", { id: "k1", credits: 500 }]]));
  const d = deps({ keys });
  const res = await (await postRun(post({ model: "openai/gpt-oss-120b", jurySize: 3, sample: 40 }, "good-key"), d)).json();
  const { impl } = fakeFetch({ cost: 1 });
  const run = await processJob((await d.jobs.get(res.runId))!, { runs: d.runs, jobs: d.jobs, keys, apiKey: "k", budgetCapUsd: 0.5, fetchImpl: impl, concurrency: 1 });
  assert.equal(run, null);
  assert.equal((await d.jobs.get(res.runId))!.status, "aborted");
  assert.equal((await d.runs.list()).length, 0);
  assert.equal((await keys.find("good-key"))!.credits, 500);
});

test("openrouter client retries once without the reasoning parameter on 'No endpoints found'", async () => {
  const bodies: Record<string, unknown>[] = [];
  const impl = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    if (body.reasoning) return new Response(JSON.stringify({ error: { message: "No endpoints found for x/y." } }), { status: 404 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { cost: 0.001 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const res = await biasComplete({ model: "x/y", system: "s", user: "u", maxTokens: 10 }, "k", impl);
  assert.equal(res.ok, true);
  assert.equal(bodies.length, 2);
  assert.ok(!("reasoning" in bodies[1]));
});

test("live run: a timeout while reading the body fails the item, not the run", async () => {
  const impl = (async () => {
    return { ok: true, status: 200, text: async () => { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; } } as unknown as Response;
  }) as unknown as typeof fetch;
  const r = await runLive({ runId: "timeout-test", model: "openai/gpt-oss-120b", questions: bank.slice(0, 3), bankVersion: "v1.0.0", bankHash: "h", jurySize: 3, apiKey: "k", spend: { capUsd: 1, spentUsd: 0, calls: 0 }, fetchImpl: impl });
  assert.equal(r.card.nFailed, 3);
});

test("cards: a run with more than 5% failed items is readable by id but not listed", async () => {
  const d = deps();
  const run = await sealedRun("openai/gpt-oss-120b", 12);
  const { sha256: _s, ...rest } = run;
  const thin = sealRun({ ...rest, runId: "thin-run-1", card: { ...rest.card, nFailed: 5, n: 7 } });
  await d.runs.publish(thin);
  assert.equal((await (await getCards(new URL("http://x/api/v1/cards"), d)).json()).count, 0);
  assert.equal((await (await getRun("thin-run-1", d)).json()).status, "complete");
});
