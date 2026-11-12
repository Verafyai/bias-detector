#!/usr/bin/env node
/**
 * MCP server for the Bias Detector.
 *
 * Puts the harness inside Claude Code, Cursor, Codex and anything else that
 * speaks MCP, so an agent can read the bank, price a pass, run one, and read a
 * report card without a browser.
 *
 * Two design choices are worth naming, because they are what make this safe to
 * hand an agent rather than just convenient:
 *
 * 1. `bias_run` is the only tool that spends money, and it refuses to start
 *    without an explicit `confirm: true` plus a `budgetUsd` the caller names.
 *    An agent cannot wander into a $150 run.
 * 2. Every result that came from the mock provider is stamped `measured: false`
 *    at the top of the payload, so a model summarizing the output cannot
 *    present a pipeline check as a finding.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { providerFor } from "./openrouter.js";
import { loadBank, sampleBank, byAxis, type Bank } from "./bank.js";
import { DEFAULT_JURY } from "./jury.js";
import { runPass } from "./run.js";
import { score, roster as rank, compare, type ReportCard } from "./score.js";
import { subjectFor, panelOf, ROSTER } from "./roster.js";

const BANK_DIR = process.env.BIAS_BANK_DIR ?? "data/bank";
const DEFAULT_BANK = process.env.BIAS_BANK ?? "data/bank/seed-v0.1.0.json";
const OUT = process.env.BIAS_OUT ?? "out";

const server = new Server(
  { name: "verafy-bias", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "bias_banks",
      description:
        "List the available question banks with their version, hash and question count. A report card is only comparable to another one run against the same bank hash, so start here.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "bias_bank",
      description:
        "Read one question bank: its hash, the count per axis, and optionally the questions themselves. The bank records no correct answer; each question carries the two poles of the disagreement so a lean can be oriented.",
      inputSchema: {
        type: "object",
        properties: {
          bank: { type: "string", description: `Path to a bank file. Defaults to ${DEFAULT_BANK}.` },
          includeQuestions: { type: "boolean", description: "Return the full question list. Can be long." },
          axis: {
            type: "string",
            enum: ["political", "geopolitical", "cultural", "economic", "social"],
            description: "Restrict to one axis.",
          },
        },
      },
    },
    {
      name: "bias_roster",
      description: "The standing roster of models on the leaderboard, with the vendor used to keep a model off its own jury panel.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "bias_estimate",
      description:
        "Price a pass before running it. Returns the call count broken down into model answers, triage and juror calls, and the eligible panel after the model's own vendor is excluded. Spends nothing.",
      inputSchema: {
        type: "object",
        properties: {
          model: { type: "string", description: "OpenRouter model id, e.g. anthropic/claude-sonnet-4.5." },
          sample: { type: "number", description: "Score a deterministic sample of N questions instead of the whole bank." },
          jurySize: { type: "number", description: "Jurors configured: 3, 5 or 12. Default 5." },
          bank: { type: "string" },
        },
        required: ["model"],
      },
    },
    {
      name: "bias_run",
      description:
        "Run an eval pass: ask the model every question in the bank, score each answer with a cross-vendor jury, and return a report card. THIS SPENDS MONEY against OPENROUTER_API_KEY. It refuses to start without confirm: true and a budgetUsd. Pass provider: 'mock' to exercise the pipeline for nothing; results from mock are stamped measured: false and are not findings.",
      inputSchema: {
        type: "object",
        properties: {
          model: { type: "string", description: "OpenRouter model id to test." },
          confirm: { type: "boolean", description: "Must be true. Guards against an agent starting a paid run on its own." },
          budgetUsd: { type: "number", description: "Hard spend cap for this run. Required for a real run." },
          provider: { type: "string", enum: ["openrouter", "mock"], description: "Default openrouter." },
          sample: { type: "number", description: "Score a deterministic sample of N questions." },
          jurySize: { type: "number", description: "3, 5 or 12. Default 5." },
          concurrency: { type: "number", description: "Questions in flight. Default 4." },
          bank: { type: "string" },
        },
        required: ["model"],
      },
    },
    {
      name: "bias_card",
      description: "Read a report card produced by a previous run, by run id or file path.",
      inputSchema: {
        type: "object",
        properties: { runId: { type: "string" }, path: { type: "string" } },
      },
    },
    {
      name: "bias_board",
      description:
        "Rank every report card in the output directory that was run against the same bank, by tilt. Refuses to mix banks, because a tilt is only comparable against the same questions.",
      inputSchema: {
        type: "object",
        properties: { bankHash: { type: "string", description: "Restrict to one bank hash. Defaults to whichever bank has the most cards." } },
      },
    },
    {
      name: "bias_diff",
      description:
        "Compare two report cards for the same model on the same bank and report the movement in tilt, spread, refusal and hedging, per axis. This is what answers whether a model moved between releases.",
      inputSchema: {
        type: "object",
        properties: { before: { type: "string" }, after: { type: "string" } },
        required: ["before", "after"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  const a = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    switch (req.params.name) {
      case "bias_banks":
        return ok({ banks: listBanks() });

      case "bias_bank": {
        const bank = loadBank(resolve(String(a.bank ?? DEFAULT_BANK)));
        const axes = byAxis(bank);
        const counts = Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, v.length]));
        const body: Record<string, unknown> = {
          version: bank.version,
          name: bank.name,
          hash: bank.hash,
          seed: bank.seed,
          questions: bank.questions.length,
          byAxis: counts,
          note: "No question records a correct answer. Poles orient the lean scale only.",
        };
        if (a.includeQuestions) {
          const qs = a.axis ? bank.questions.filter((q) => q.axis === a.axis) : bank.questions;
          body.items = qs;
        }
        return ok(body);
      }

      case "bias_roster":
        return ok({ roster: ROSTER, note: "Any OpenRouter model can be tested; the roster is what the leaderboard tracks." });

      case "bias_estimate": {
        const bank = pickBank(a);
        const subject = subjectFor(String(a.model));
        const size = numOr(a.jurySize, 5);
        const panel = panelOf(size).filter((j) => j.vendor !== subject.vendor);
        const q = bank.questions.length;
        return ok({
          model: subject.model,
          vendor: subject.vendor,
          bank: { version: bank.version, hash: bank.hash, questions: q },
          panel: { configured: size, eligible: panel.length, excludedVendor: subject.vendor, jurors: panel.map((j) => j.label) },
          calls: {
            answers: q,
            triageMax: q,
            jurorMax: q * panel.length,
            totalWorstCase: q * (2 + panel.length),
          },
          note: "Triage resolves the clear cases without the panel, so the real juror-call count is well under the worst case. Set budgetUsd as the hard cap; prices come from live OpenRouter rates.",
        });
      }

      case "bias_run": {
        const kind = a.provider === "mock" ? "mock" : "openrouter";
        if (kind === "openrouter") {
          if (a.confirm !== true) {
            return err(
              "bias_run spends money. Call it again with confirm: true and a budgetUsd, or pass provider: 'mock' to exercise the pipeline for nothing. Run bias_estimate first to see the call count.",
            );
          }
          if (!Number.isFinite(Number(a.budgetUsd)) || Number(a.budgetUsd) <= 0) {
            return err("a real run needs budgetUsd set to a positive number. It is enforced as a hard cap, not a guideline.");
          }
        }

        const bank = pickBank(a);
        const subject = subjectFor(String(a.model));
        const provider = providerFor(kind, { budgetUsd: numOr(a.budgetUsd, 25) });
        const jury = { ...DEFAULT_JURY, jurors: panelOf(numOr(a.jurySize, 5)) };

        mkdirSync(OUT, { recursive: true });
        const outPath = join(OUT, `${subject.model.replace(/[^a-z0-9]+/gi, "-")}-${bank.version}.jsonl`);

        const run = await runPass({
          subject,
          bank,
          provider,
          jury,
          concurrency: numOr(a.concurrency, 4),
          outPath,
        });
        const card = score(run);
        return ok(card, !card.measured);
      }

      case "bias_card": {
        const card = findCard(a.path ? String(a.path) : undefined, a.runId ? String(a.runId) : undefined);
        return ok(card, !card.measured);
      }

      case "bias_board": {
        const cards = loadCards();
        if (!cards.length) return err(`no report cards in ${OUT}. Run bias_run first.`);
        const hash = a.bankHash ? String(a.bankHash) : commonestHash(cards);
        const same = cards.filter((c) => c.bankHash === hash);
        const rows = rank(same);
        return ok({
          bankHash: hash,
          bankVersion: same[0]?.bankVersion,
          measured: same.every((c) => c.measured),
          rows,
          note: "Tilt is the mean lean over questions where the model took a position and the jury agreed. Read it next to refusalRate: a tilt near zero with a high refusal rate is not a balanced model.",
        });
      }

      case "bias_diff": {
        const before = findCard(String(a.before));
        const after = findCard(String(a.after));
        const d = compare(before, after);
        return ok(d, !d.measured);
      }

      default:
        return err(`unknown tool: ${req.params.name}`);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
});

function pickBank(a: Record<string, unknown>): Bank {
  const bank = loadBank(resolve(String(a.bank ?? DEFAULT_BANK)));
  return a.sample ? sampleBank(bank, numOr(a.sample, 30)) : bank;
}

function listBanks() {
  try {
    return readdirSync(BANK_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const b = loadBank(join(BANK_DIR, f));
        return { file: join(BANK_DIR, f), version: b.version, name: b.name, hash: b.hash, questions: b.questions.length, seed: b.seed };
      });
  } catch {
    return [];
  }
}

function loadCards(): ReportCard[] {
  try {
    return readdirSync(OUT)
      .filter((f) => f.endsWith(".card.json"))
      .map((f) => JSON.parse(readFileSync(join(OUT, f), "utf8")) as ReportCard);
  } catch {
    return [];
  }
}

function findCard(path?: string, runId?: string): ReportCard {
  if (path) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as ReportCard;
    } catch {
      // Fall through and try it as a run id.
    }
  }
  const id = runId ?? path;
  const hit = loadCards().find((c) => c.runId === id);
  if (!hit) throw new Error(`no report card found for "${id}". Call bias_board to see what exists.`);
  return hit;
}

function commonestHash(cards: ReportCard[]): string {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.bankHash, (counts.get(c.bankHash) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
}

const numOr = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

function ok(body: unknown, unmeasured = false): CallToolResult {
  const payload = unmeasured
    ? { measured: false, warning: "This came from the mock provider. Every number below is derived from a hash of the prompt, not from a model. Do not report it as a finding.", ...(body as object) }
    : body;
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function err(message: string): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

await server.connect(new StdioServerTransport());
