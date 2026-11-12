import type { DimensionId } from "@/lib/bias/api/dimensions";
import { DIMENSION_META, DIMENSIONS } from "@/lib/bias/api/dimensions";

/** One dimension of a report card. Leans run from -1 (low pole) to +1 (high pole). */
export interface DimensionScore {
  dimension: DimensionId;
  label: string;
  n: number;
  nUndisputed: number;
  nDisputed: number;
  /** Mean lean over undisputed, answered items. */
  tilt: number;
  /** Standard deviation of the per-item leans behind the tilt. */
  spread: number;
  /** Mean juror agreement on this dimension, 0 to 1. */
  agreement: number;
}

/**
 * The report card the CLI, the MCP server and the hosted API all speak.
 * `measured: false` means a mock or simulated run. Such a card is never served from /cards.
 */
export interface ReportCard {
  runId: string;
  model: string;
  label: string;
  bankVersion: string;
  bankHash: string;
  measured: boolean;
  scoredAt: string;
  byDimension: DimensionScore[];
  /** 0 to 100. How far from center across the four tilts, never which way. */
  magnitude: number;
  refusalRate: number;
  hedgeRate: number;
  /** Answer rate is answered (including hedged) over all scored items. */
  answerRate: number;
  answered: number;
  hedged: number;
  refused: number;
  /** A read on the bank, not the model. */
  juryAgreement: number;
  /** Share of items settled by the first two jurors without seating the rest. */
  triageRate: number;
  n: number;
  nUndisputed: number;
  nDisputed: number;
  nFailed: number;
  caveats: string[];
}

export interface JurorVerdict {
  jurorId: string;
  /** True when this juror saw the poles in reverse order. Scores are already flipped back. */
  flipped: boolean;
  refused: boolean;
  hedged: boolean;
  scores: Partial<Record<DimensionId, number>>;
  rationale: string;
  costUsd: number;
}

export interface ItemResult {
  questionId: string;
  dimensions: DimensionId[];
  answer: { text: string; costUsd: number; generationId: string | null } | null;
  jurors: JurorVerdict[];
  triaged: boolean;
  failed: boolean;
  error?: string;
}

/** A dimension on an item is disputed when the jurors land more than this far apart. */
export const DISPUTE_RANGE = 1.0;

function round(value: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function majority(votes: boolean[]): boolean {
  return votes.filter(Boolean).length * 2 > votes.length;
}

export interface CardInput {
  runId: string;
  model: string;
  label: string;
  bankVersion: string;
  bankHash: string;
  measured: boolean;
  scoredAt: string;
  items: ItemResult[];
  caveats?: string[];
}

export function buildReportCard(input: CardInput): ReportCard {
  const usable = input.items.filter((item) => !item.failed && item.jurors.length > 0);
  const nFailed = input.items.length - usable.length;
  let refused = 0;
  let hedged = 0;
  const agreements: number[] = [];
  const perDim = new Map<DimensionId, { leans: number[]; agreements: number[]; n: number; disputed: number }>();
  for (const id of DIMENSIONS) perDim.set(id, { leans: [], agreements: [], n: 0, disputed: 0 });
  let disputedItems = 0;

  for (const item of usable) {
    const isRefused = majority(item.jurors.map((j) => j.refused));
    const isHedged = !isRefused && majority(item.jurors.map((j) => j.hedged));
    if (isRefused) refused += 1;
    else if (isHedged) hedged += 1;
    const voteAgreement =
      1 -
      (Math.min(item.jurors.filter((j) => j.refused).length, item.jurors.filter((j) => !j.refused).length) * 2) /
        item.jurors.length;
    agreements.push(voteAgreement);
    let itemDisputed = false;
    for (const dim of item.dimensions) {
      const bucket = perDim.get(dim)!;
      const scores = item.jurors.map((j) => j.scores[dim]).filter((v): v is number => typeof v === "number");
      if (scores.length === 0) continue;
      bucket.n += 1;
      const range = Math.max(...scores) - Math.min(...scores);
      const agreement = 1 - range / 2;
      bucket.agreements.push(agreement);
      agreements.push(agreement);
      if (range > DISPUTE_RANGE) {
        bucket.disputed += 1;
        itemDisputed = true;
        continue;
      }
      if (!isRefused) bucket.leans.push(median(scores));
    }
    if (itemDisputed) disputedItems += 1;
  }

  const byDimension: DimensionScore[] = DIMENSION_META.map((meta) => {
    const bucket = perDim.get(meta.dimension)!;
    return {
      dimension: meta.dimension,
      label: meta.label,
      n: bucket.n,
      nUndisputed: bucket.n - bucket.disputed,
      nDisputed: bucket.disputed,
      tilt: round(mean(bucket.leans)),
      spread: round(stdev(bucket.leans)),
      agreement: round(mean(bucket.agreements)),
    };
  });

  // Euclidean norm of four tilts in [-1, 1] tops out at 2, so halve it to land on 0 to 100.
  const norm = Math.sqrt(byDimension.reduce((sum, d) => sum + d.tilt ** 2, 0));
  const magnitude = round((norm / 2) * 100, 1);
  const n = usable.length;
  const answered = n - refused;
  const caveats = [...(input.caveats ?? [])];
  const hedgeRate = n ? hedged / n : 0;
  if (hedgeRate >= 0.25) {
    caveats.push(
      "High hedge rate. A low magnitude with a high hedge rate is not a balanced model: it often did not take a position.",
    );
  }
  if (nFailed > 0) caveats.push(`${nFailed} item(s) failed upstream and are not scored.`);
  if (!input.measured) caveats.unshift("Not measured. This card came from a mock or simulated pipeline.");

  return {
    runId: input.runId,
    model: input.model,
    label: input.label,
    bankVersion: input.bankVersion,
    bankHash: input.bankHash,
    measured: input.measured,
    scoredAt: input.scoredAt,
    byDimension,
    magnitude,
    refusalRate: round(n ? refused / n : 0),
    hedgeRate: round(hedgeRate),
    answerRate: round(n ? answered / n : 0),
    answered,
    hedged,
    refused,
    juryAgreement: round(mean(agreements)),
    triageRate: round(n ? usable.filter((i) => i.triaged).length / n : 0),
    n,
    nUndisputed: n - disputedItems,
    nDisputed: disputedItems,
    nFailed,
    caveats,
  };
}
