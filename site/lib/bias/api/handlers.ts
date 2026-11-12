import type { RateLimiterMemory } from "rate-limiter-flexible";
import { bankHash, bankSummary, bankVersion, normalizeBankVersion, queryQuestions } from "@/lib/bias/api/bank";
import { parseDimension } from "@/lib/bias/api/dimensions";
import { dataIsMeasured } from "@/lib/bias/api/flags";
import { consume, errors, json, PUBLIC_CACHE, type FieldError } from "@/lib/bias/api/http";
import type { KeyStore } from "@/lib/bias/api/keys";
import type { ReportCard } from "@/lib/bias/api/report-card";
import type { JobStore, PublishedRun, RunJob, RunStore } from "@/lib/bias/api/store";
import { liveRunId } from "@/lib/bias/live/run";
import { ROSTER_IDS } from "@/lib/bias/roster";
import { getBenchmarkQuestions } from "@/lib/bias/questions";

export interface LegacyRunLookup {
  (runId: string): Promise<{ id: string; simulated: true } | null>;
}

export interface ApiDeps {
  runs: RunStore;
  jobs: JobStore;
  keys: KeyStore;
  limiter: RateLimiterMemory;
  legacyRun: LegacyRunLookup;
  /** Server-side cap per commissioned run, in USD. Never taken from the client. */
  budgetCapUsd: number;
  env?: Record<string, string | undefined>;
}

/** 1,000 credits buys a full 20-model pass over the bank, so one model over the full bank is 50. */
export const CREDITS_PER_FULL_PASS = 1000;
export const FULL_PASS_MODELS = 20;
export const JURY_SIZES = [3, 5] as const;

export function creditsFor(models: number, questions: number, bankSize: number): number {
  return Math.max(1, Math.ceil((CREDITS_PER_FULL_PASS / FULL_PASS_MODELS) * models * (questions / bankSize)));
}

/** Upper bound: one answer plus every seated juror. Triage usually settles items with fewer. */
export function estimateCalls(questions: number, jurySize: number): number {
  return questions * (1 + jurySize);
}

function meta(deps: ApiDeps) {
  return { bankVersion: bankVersion(), bankHash: bankHash(), dataIsMeasured: dataIsMeasured(deps.env) };
}

export function getBank(): Response {
  return json(bankSummary(), 200, PUBLIC_CACHE);
}

export function getBankQuestions(url: URL): Response {
  const details: FieldError[] = [];
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const dimension = url.searchParams.get("dimension");
  if (limit !== null && !/^\d+$/.test(limit)) details.push({ field: "limit", message: "Must be a whole number from 1 to 200." });
  if (offset !== null && !/^\d+$/.test(offset)) details.push({ field: "offset", message: "Must be a whole number." });
  if (dimension && !parseDimension(dimension)) {
    details.push({ field: "dimension", message: "Use left_right, pro_gov_anti_gov, western_nonwestern or religious_secular." });
  }
  if (details.length) return errors.validation(details);
  const result = queryQuestions({
    axis: url.searchParams.get("axis"),
    dimension,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return json({ bankVersion: bankVersion(), bankHash: bankHash(), ...result }, 200, PUBLIC_CACHE);
}

/** A run with more failed items than this is readable by id but is not listed as the model's card. */
export const MAX_FAILED_SHARE = 0.05;

export function isListable(run: PublishedRun): boolean {
  const total = run.card.n + run.card.nFailed;
  return run.measured === true && run.card.measured === true && !run.sampled && total > 0 && run.card.nFailed / total <= MAX_FAILED_SHARE;
}

/** Only measured, full-bank cards with enough coverage. A measured:false card is never returned here, flagged or not. */
async function measuredRuns(deps: ApiDeps): Promise<PublishedRun[]> {
  return (await deps.runs.list()).filter(isListable);
}

export async function getCards(url: URL, deps: ApiDeps): Promise<Response> {
  const sort = url.searchParams.get("sort") ?? "magnitude";
  const dimParam = url.searchParams.get("dimension");
  const details: FieldError[] = [];
  if (!["magnitude", "refusal", "hedge", "name"].includes(sort)) {
    details.push({ field: "sort", message: "Use magnitude, refusal, hedge or name." });
  }
  const dimension = dimParam ? parseDimension(dimParam) : null;
  if (dimParam && !dimension) details.push({ field: "dimension", message: "Unknown dimension." });
  if (details.length) return errors.validation(details);

  const hash = bankHash();
  const latest = new Map<string, ReportCard>();
  for (const run of await measuredRuns(deps)) {
    if (run.bankHash !== hash) continue;
    if (!latest.has(run.model)) latest.set(run.model, run.card);
  }
  const cards = [...latest.values()];
  const key = (card: ReportCard): number | string => {
    if (dimension) return card.byDimension.find((d) => d.dimension === dimension)?.tilt ?? 0;
    if (sort === "refusal") return card.refusalRate;
    if (sort === "hedge") return card.hedgeRate;
    if (sort === "name") return card.label.toLowerCase();
    return card.magnitude;
  };
  cards.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return typeof ka === "string" ? ka.localeCompare(kb as string) : (ka as number) - (kb as number);
  });
  return json({ ...meta(deps), count: cards.length, cards }, 200, PUBLIC_CACHE);
}

export async function getCard(model: string, deps: ApiDeps): Promise<Response> {
  const hash = bankHash();
  const run = (await measuredRuns(deps)).find((r) => r.model === model && r.bankHash === hash);
  if (!run) return errors.notFound(`No measured card for ${model} on bank ${bankVersion()}.`);
  return json(run.card, 200, PUBLIC_CACHE);
}

export async function getCardHistory(model: string, deps: ApiDeps): Promise<Response> {
  const runs = (await measuredRuns(deps)).filter((r) => r.model === model);
  // Cards from different banks are separate series. Plotting them as one line would draw a trend that does not exist.
  const series = new Map<string, { bankHash: string; bankVersion: string; cards: ReportCard[] }>();
  for (const run of runs) {
    const entry = series.get(run.bankHash) ?? { bankHash: run.bankHash, bankVersion: run.bankVersion, cards: [] };
    entry.cards.push(run.card);
    series.set(run.bankHash, entry);
  }
  return json({ model, series: [...series.values()] }, 200, PUBLIC_CACHE);
}

function jobView(job: RunJob, card: ReportCard | null) {
  return {
    runId: job.runId,
    status: job.status,
    progress: job.progress,
    estimatedCalls: job.estimatedCalls,
    ...(job.error ? { error: job.error } : {}),
    ...(card ? { card } : {}),
  };
}

export async function getRun(runId: string, deps: ApiDeps): Promise<Response> {
  const published = await deps.runs.get(runId);
  const job = await deps.jobs.get(runId);
  if (job) return json(jobView(job, published?.card ?? null), 200, { "Cache-Control": "no-store" });
  if (published) {
    return json(
      { runId, status: "complete", progress: { done: published.items.length, total: published.items.length }, card: published.card, sha256: published.sha256 },
      200,
      PUBLIC_CACHE,
    );
  }
  const legacy = await deps.legacyRun(runId);
  if (legacy) {
    return json(
      {
        runId,
        status: "simulated",
        measured: false,
        card: null,
        message: "This run came from the simulated pipeline. Its scores are not measurements and are not served by this API.",
      },
      200,
      PUBLIC_CACHE,
    );
  }
  return errors.notFound(`No run ${runId}.`);
}

const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export async function postRun(request: Request, deps: ApiDeps): Promise<Response> {
  if ((deps.keys as { disabled?: boolean }).disabled) {
    return json(
      {
        error: "runs_disabled",
        message:
          "Hosted runs are not open on this deployment yet. Every stored report card is readable, and you can run the benchmark yourself with your own OpenRouter key.",
      },
      503,
    );
  }
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey) return errors.missingKey();
  const limit = await consume(deps.limiter, apiKey);
  if (!limit.ok) return limit.response;
  const headers = limit.headers;
  const key = await deps.keys.find(apiKey);
  if (!key) return errors.invalidKey(headers);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errors.validation([{ field: "body", message: "Send a JSON object." }], headers);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errors.validation([{ field: "body", message: "Send a JSON object." }], headers);
  }
  const details: FieldError[] = [];
  const model = body.model;
  if (typeof model !== "string" || !MODEL_ID.test(model)) {
    details.push({ field: "model", message: "Use an OpenRouter model id, for example openai/gpt-oss-120b." });
  } else if (!ROSTER_IDS.includes(model)) {
    details.push({ field: "model", message: "Model is not on the Bias Detector roster." });
  }
  const version = normalizeBankVersion(body.bankVersion);
  if (!version) details.push({ field: "bankVersion", message: `Only ${bankVersion()} is open for runs.` });
  const jurySize = body.jurySize === undefined ? 5 : Number(body.jurySize);
  if (!(JURY_SIZES as readonly number[]).includes(jurySize)) details.push({ field: "jurySize", message: "Use 3 or 5." });
  const bankSize = getBenchmarkQuestions().length;
  let sample: number | null = null;
  if (body.sample !== undefined && body.sample !== null) {
    const n = Number(body.sample);
    if (!Number.isInteger(n) || n < 10 || n > bankSize) details.push({ field: "sample", message: `Use a whole number from 10 to ${bankSize}.` });
    else sample = n === bankSize ? null : n;
  }
  for (const field of ["budget", "budgetUsd", "maxCostUsd", "cap"]) {
    if (field in body) details.push({ field, message: "The budget cap is set by the server and cannot be sent by a client." });
  }
  if (details.length) return errors.validation(details, headers);

  const questions = sample ?? bankSize;
  const credits = creditsFor(1, questions, bankSize);
  const debit = await deps.keys.debit(key.id, credits);
  if (!debit.ok) return errors.insufficientCredits(credits, debit.available, headers);

  const now = new Date();
  const runId = liveRunId(model as string, bankHash(), now);
  const estimatedCalls = estimateCalls(questions, jurySize);
  const job: RunJob = {
    runId,
    status: "queued",
    model: model as string,
    bankVersion: version!,
    jurySize,
    sample,
    estimatedCalls,
    credits,
    apiKeyId: key.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    progress: { done: 0, total: questions },
  };
  try {
    await deps.jobs.create(job);
  } catch (error) {
    await deps.keys.refund(key.id, credits);
    throw error;
  }
  return json({ runId, status: "queued", estimatedCalls, credits }, 202, headers);
}
