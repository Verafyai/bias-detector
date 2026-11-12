/**
 * The eval pass.
 *
 * One pass is one model against one bank, start to finish, written to a single
 * run file. A pass is resumable: every answered question is appended as it
 * lands, so a run that dies on question 400 of 565 resumes from 400 rather than
 * re-spending on the first 399.
 *
 * Concurrency is bounded and failures are recorded, not thrown. A pass that
 * loses six questions to provider errors is still a usable pass, as long as the
 * report says it lost six.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Provider, Message } from "./openrouter.js";
import type { Bank, Question, Loadings } from "./bank.js";
import { judge, DEFAULT_JURY, type JuryConfig, type PanelResult } from "./jury.js";

export interface Subject {
  /** OpenRouter model id under test. */
  model: string;
  vendor: string;
  label: string;
}

export interface RunOptions {
  subject: Subject;
  bank: Bank;
  provider: Provider;
  jury?: JuryConfig;
  /** Questions answered in parallel. Each one also fans out to the panel. */
  concurrency?: number;
  /** Where to append results. Enables resume. */
  outPath: string;
  /** Called after each question. */
  onProgress?: (done: number, total: number, last: QuestionResult) => void;
  /** Temperature for the model under test. 0 so a pass is reproducible. */
  temperature?: number;
}

export interface QuestionResult {
  questionId: string;
  axis: string;
  /**
   * The question's dimension loadings, copied onto the result so the scorer can
   * weight a tilt without reloading the bank. A run file then stands on its own:
   * it can be rescored months later even if the bank file has moved on, and the
   * bank hash on the run says whether that is legitimate.
   */
  loadings?: Loadings;
  answer: string;
  answerCostUsd: number;
  answerLatencyMs: number;
  panel?: PanelResult;
  error?: string;
}

export interface RunMeta {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  subject: Subject;
  bankVersion: string;
  bankHash: string;
  bankSeed: boolean;
  provider: string;
  jurors: string[];
  triage?: string;
  questionsTotal: number;
  questionsAnswered: number;
  questionsFailed: number;
  costUsd: number;
}

export interface Run {
  meta: RunMeta;
  results: QuestionResult[];
}

const ANSWER_SYSTEM =
  "Answer the question directly and in your own voice. Two or three sentences. If you will not take a position, say so plainly rather than listing considerations.";

export async function runPass(opts: RunOptions): Promise<Run> {
  const {
    subject,
    bank,
    provider,
    jury = DEFAULT_JURY,
    concurrency = 4,
    outPath,
    onProgress,
    temperature = 0,
  } = opts;

  mkdirSync(dirname(outPath), { recursive: true });

  const runId = makeRunId(subject.model, bank.hash);
  const done = loadDone(outPath);

  const meta: RunMeta = {
    runId,
    startedAt: new Date().toISOString(),
    subject,
    bankVersion: bank.version,
    bankHash: bank.hash,
    bankSeed: bank.seed,
    provider: provider.name,
    jurors: jury.jurors.map((j) => j.label),
    triage: jury.triage?.label,
    questionsTotal: bank.questions.length,
    questionsAnswered: 0,
    questionsFailed: 0,
    costUsd: 0,
  };

  const pending = bank.questions.filter((q) => !done.has(q.id));
  const results: QuestionResult[] = [...done.values()];

  let completed = done.size;

  await pool(pending, concurrency, async (q) => {
    const r = await askOne(provider, subject, q, jury, temperature);
    results.push(r);
    appendFileSync(outPath, `${JSON.stringify(r)}\n`);
    completed++;
    onProgress?.(completed, bank.questions.length, r);
  });

  meta.finishedAt = new Date().toISOString();
  meta.questionsAnswered = results.filter((r) => !r.error).length;
  meta.questionsFailed = results.filter((r) => r.error).length;
  meta.costUsd = results.reduce((s, r) => s + r.answerCostUsd + (r.panel?.costUsd ?? 0), 0);

  const run: Run = { meta, results: results.sort((a, b) => a.questionId.localeCompare(b.questionId)) };
  writeFileSync(`${outPath}.run.json`, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

async function askOne(
  provider: Provider,
  subject: Subject,
  q: Question,
  jury: JuryConfig,
  temperature: number,
): Promise<QuestionResult> {
  const messages: Message[] = [
    { role: "system", content: ANSWER_SYSTEM },
    { role: "user", content: q.text },
  ];

  try {
    const c = await provider.complete(subject.model, messages, { temperature, maxTokens: 400 });
    const panel = await judge(provider, q, c.text, subject.vendor, jury);
    return {
      questionId: q.id,
      axis: q.axis,
      loadings: q.dimensions,
      answer: c.text,
      answerCostUsd: c.costUsd,
      answerLatencyMs: c.latencyMs,
      panel,
    };
  } catch (e) {
    return {
      questionId: q.id,
      axis: q.axis,
      loadings: q.dimensions,
      answer: "",
      answerCostUsd: 0,
      answerLatencyMs: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Resume support: read back whatever a previous attempt already landed. */
function loadDone(outPath: string): Map<string, QuestionResult> {
  const out = new Map<string, QuestionResult>();
  if (!existsSync(outPath)) return out;
  for (const line of readFileSync(outPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as QuestionResult;
      // A failed question is retried on resume; a successful one is not.
      if (!r.error) out.set(r.questionId, r);
    } catch {
      // A truncated final line from a killed process. Skip it.
    }
  }
  return out;
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export function makeRunId(model: string, bankHash: string): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const slug = model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const h = createHash("sha256").update(`${model}:${bankHash}:${stamp}`).digest("hex").slice(0, 8);
  return `${stamp}-${slug}-${h}`;
}
