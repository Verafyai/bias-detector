import { getBenchmarkQuestions, getQuestionSetHash, getQuestionSetMeta, EXCLUDED_DEMO_IDS } from "@/lib/bias/questions";
import type { ContentiousQuestion } from "@/lib/contentious-questions";
import { DIMENSIONS, dimensionsOf, parseDimension, type DimensionId } from "@/lib/bias/api/dimensions";

/** The bank's public version label. The dataset file stores "1.0.0". */
export function bankVersion(): string {
  const raw = getQuestionSetMeta().version;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

export function bankHash(): string {
  return getQuestionSetHash();
}

export function normalizeBankVersion(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return bankVersion();
  if (typeof value !== "string") return null;
  const v = value.startsWith("v") ? value : `v${value}`;
  return v === bankVersion() ? v : null;
}

export interface BankSummary {
  version: string;
  hash: string;
  hashNote: string;
  questionCount: number;
  bankFileCount: number;
  excluded: { ids: readonly string[]; reason: string };
  byAxis: Record<string, number>;
  byDimension: Record<DimensionId, number>;
  unscoredOnDimensions: number;
}

export function bankSummary(): BankSummary {
  const meta = getQuestionSetMeta();
  const questions = getBenchmarkQuestions();
  const byAxis: Record<string, number> = {};
  for (const q of questions) for (const axis of q.bias_axes) byAxis[axis] = (byAxis[axis] ?? 0) + 1;
  const byDimension = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<DimensionId, number>;
  let none = 0;
  for (const q of questions) {
    const dims = dimensionsOf(q.bias_axes);
    if (dims.length === 0) none += 1;
    for (const d of dims) byDimension[d] += 1;
  }
  return {
    version: bankVersion(),
    hash: bankHash(),
    hashNote: "sha256 of the benchmark subset (bank minus cq-0001 through cq-0011), canonical JSON with sorted keys.",
    questionCount: questions.length,
    bankFileCount: meta.bankCount,
    excluded: {
      ids: EXCLUDED_DEMO_IDS,
      reason:
        "Held out on purpose. cq-0001 is an AI-is-beneficial demo prompt and cq-0002 to cq-0011 are network and validator yes/no prompts shared with Verafy Explorer. None are political bias probes.",
    },
    byAxis,
    byDimension,
    unscoredOnDimensions: none,
  };
}

export interface QuestionQuery {
  axis?: string | null;
  dimension?: string | null;
  limit?: number;
  offset?: number;
}

export function queryQuestions(query: QuestionQuery): { total: number; limit: number; offset: number; questions: ContentiousQuestion[] } {
  const dim = parseDimension(query.dimension ?? null);
  let list = getBenchmarkQuestions();
  if (query.axis) list = list.filter((q) => q.bias_axes.includes(query.axis!));
  if (dim) list = list.filter((q) => q.bias_axes.includes(dim));
  const limit = Math.max(1, Math.min(200, query.limit ?? 50));
  const offset = Math.max(0, query.offset ?? 0);
  return { total: list.length, limit, offset, questions: list.slice(offset, offset + limit) };
}
