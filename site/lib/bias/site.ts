import { readdirSync, readFileSync } from "fs";
import path from "path";
import { isListable } from "@/lib/bias/api/handlers";
import { DIMENSION_META, type DimensionId } from "@/lib/bias/api/dimensions";
import type { ReportCard } from "@/lib/bias/api/report-card";
import { runDigest, type PublishedRun } from "@/lib/bias/api/store";
import { getQuestion } from "@/lib/bias/questions";
import { ROSTER, displayName, providerIdOf, type RosterModel } from "@/lib/bias/roster";
import logos from "@/lib/bias/logos.json";

/**
 * Everything the pages show comes from the sealed run files in data/bias/runs.
 * A file whose seal does not verify is skipped, never shown. Nothing on the site is simulated.
 */

export interface RunSummary {
  runId: string;
  model: string;
  name: string;
  provider: string;
  bankVersion: string;
  bankHash: string;
  jurySize: number;
  sampled: boolean;
  createdAt: string;
  completedAt: string;
  costUsd: number;
  calls: number;
  jurors: string[];
  card: ReportCard;
  sha256: string;
  listable: boolean;
}

let loaded: { runs: Map<string, PublishedRun>; summaries: RunSummary[] } | null = null;

function runsDir(): string {
  return process.env.BIAS_RUNS_DIR || path.join(process.cwd(), "data/bias/runs");
}

function load() {
  if (loaded) return loaded;
  const runs = new Map<string, PublishedRun>();
  let files: string[] = [];
  try {
    files = readdirSync(runsDir()).filter((file) => file.endsWith(".json"));
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(path.join(runsDir(), file), "utf8")) as PublishedRun;
      if (!run.measured || runDigest(run) !== run.sha256) continue;
      runs.set(run.runId, run);
    } catch {
      continue;
    }
  }
  const summaries = [...runs.values()]
    .map((run) => ({
      runId: run.runId,
      model: run.model,
      name: displayName(run.model),
      provider: providerIdOf(run.model),
      bankVersion: run.bankVersion,
      bankHash: run.bankHash,
      jurySize: run.jurySize,
      sampled: run.sampled,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      costUsd: run.costUsd,
      calls: run.calls,
      jurors: run.jurors,
      card: run.card,
      sha256: run.sha256,
      listable: isListable(run),
    }))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  loaded = { runs, summaries };
  return loaded;
}

export function allRuns(): RunSummary[] {
  return load().summaries;
}

export function getRunFile(runId: string): PublishedRun | undefined {
  return load().runs.get(runId);
}

/** Latest listable card per model, ranked by magnitude (closest to center first). */
export function measuredBoard(): RunSummary[] {
  const latest = new Map<string, RunSummary>();
  for (const run of allRuns()) {
    if (!run.listable) continue;
    if (!latest.has(run.model)) latest.set(run.model, run);
  }
  return [...latest.values()].sort((a, b) => a.card.magnitude - b.card.magnitude);
}

export function runsForModel(model: string): RunSummary[] {
  return allRuns().filter((run) => run.model === model);
}

export interface RosterStatus {
  model: RosterModel;
  card: RunSummary | null;
  /** Runs that exist but do not meet the listing bar (more than 5% of items failed, or sampled). */
  unlisted: RunSummary[];
}

export function rosterStatus(): RosterStatus[] {
  const board = new Map(measuredBoard().map((run) => [run.model, run]));
  return ROSTER.map((model) => ({
    model,
    card: board.get(model.id) ?? null,
    unlisted: runsForModel(model.id).filter((run) => !run.listable),
  }));
}

/** True once some model has two listable runs on the same bank hash, which is what a trend needs. */
export function hasRepeatRuns(): boolean {
  const seen = new Set<string>();
  for (const run of allRuns()) {
    if (!run.listable) continue;
    const key = `${run.model}|${run.bankHash}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function logoFor(provider: string): string | null {
  return (logos as Record<string, string>)[provider] ?? null;
}

/** label reads low pole first, so "-0.2" sits toward the first name and "+0.2" toward the second. */
export function dimensionLabel(id: DimensionId): { label: string; low: string; high: string } {
  const meta = DIMENSION_META.find((entry) => entry.dimension === id)!;
  return { label: `${meta.low} / ${meta.high}`, low: meta.low, high: meta.high };
}

export function questionText(id: string): string {
  return getQuestion(id)?.question ?? id;
}

export function contentiousness(id: string): number | null {
  return getQuestion(id)?.contentiousness ?? null;
}

export function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function signed(value: number, places = 2): string {
  const fixed = value.toFixed(places);
  return value > 0 ? `+${fixed}` : fixed;
}

/** Letter grades only help if they separate the board. */
export function gradesSeparate(board: RunSummary[], grade: (m: number) => string): boolean {
  if (board.length < 3) return false;
  return new Set(board.map((run) => grade(run.card.magnitude))).size >= Math.ceil(board.length / 2);
}

/**
 * Answer rate as the settlement spec defines it: the share of questions where the model took a
 * position. Answered, Hedged and Refused sum to 100%. The stored card's answerRate field counts
 * hedged answers as answered, so the pages derive this from the stored counts instead.
 */
export function positionRate(card: ReportCard): number {
  return card.n ? (card.answered - card.hedged) / card.n : 0;
}
