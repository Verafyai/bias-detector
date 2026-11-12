import { promises as fs } from "fs";
import path from "path";
import { canonicalStringify, sha256Hex } from "@/lib/bias/questions";
import type { ItemResult, ReportCard } from "@/lib/bias/api/report-card";

/** A published, measured run. Write-once: the stored sha256 covers every other field. */
export interface PublishedRun {
  schema: "verafy-bias-run/1";
  runId: string;
  model: string;
  bankVersion: string;
  bankHash: string;
  jurySize: number;
  sampled: boolean;
  questionIds: string[];
  measured: true;
  createdAt: string;
  completedAt: string;
  costUsd: number;
  calls: number;
  jurors: string[];
  card: ReportCard;
  items: ItemResult[];
  sha256: string;
}

export class ImmutableRunError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} is already published and cannot be rewritten.`);
    this.name = "ImmutableRunError";
  }
}

export class UnmeasuredRunError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} is not measured. Mock and simulated runs are never published.`);
    this.name = "UnmeasuredRunError";
  }
}

export class TamperedRunError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} does not match its stored sha256. Refusing to serve it.`);
    this.name = "TamperedRunError";
  }
}

export function runDigest(run: Omit<PublishedRun, "sha256"> | PublishedRun): string {
  const { sha256: _omit, ...rest } = run as PublishedRun;
  return sha256Hex(canonicalStringify(rest));
}

export function sealRun(run: Omit<PublishedRun, "sha256">): PublishedRun {
  if ((run as { measured?: unknown }).measured !== true || run.card.measured !== true) {
    throw new UnmeasuredRunError(run.runId);
  }
  return { ...run, sha256: runDigest(run) };
}

function verify(run: PublishedRun): PublishedRun {
  if (runDigest(run) !== run.sha256) throw new TamperedRunError(run.runId);
  if (run.measured !== true || run.card?.measured !== true) throw new UnmeasuredRunError(run.runId);
  return run;
}

export interface RunStore {
  publish(run: PublishedRun): Promise<void>;
  get(runId: string): Promise<PublishedRun | null>;
  list(): Promise<PublishedRun[]>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{6,120}$/;

/** Published runs committed to the repo under data/bias/runs, plus local writes. */
export class FileRunStore implements RunStore {
  constructor(private dir = process.env.BIAS_RUNS_DIR || path.join(process.cwd(), "data/bias/runs")) {}

  async publish(run: PublishedRun): Promise<void> {
    if (!SAFE_ID.test(run.runId)) throw new Error(`Invalid run id ${run.runId}`);
    verify(run);
    await fs.mkdir(this.dir, { recursive: true });
    try {
      // "wx" fails when the file exists, so a published run can never be overwritten.
      await fs.writeFile(path.join(this.dir, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ImmutableRunError(run.runId);
      throw error;
    }
  }

  async get(runId: string): Promise<PublishedRun | null> {
    if (!SAFE_ID.test(runId)) return null;
    try {
      const raw = await fs.readFile(path.join(this.dir, `${runId}.json`), "utf8");
      return verify(JSON.parse(raw) as PublishedRun);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async list(): Promise<PublishedRun[]> {
    let names: string[] = [];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const runs: PublishedRun[] = [];
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      try {
        const run = await this.get(name.replace(/\.json$/, ""));
        if (run) runs.push(run);
      } catch {
        /* A tampered or unmeasured file is skipped, never served. */
      }
    }
    return runs.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  }
}

export type JobStatus = "queued" | "running" | "complete" | "failed" | "aborted";

export interface RunJob {
  runId: string;
  status: JobStatus;
  model: string;
  bankVersion: string;
  jurySize: number;
  sample: number | null;
  estimatedCalls: number;
  credits: number;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  progress: { done: number; total: number };
  error?: string;
}

export interface JobStore {
  create(job: RunJob): Promise<void>;
  get(runId: string): Promise<RunJob | null>;
  update(runId: string, patch: Partial<RunJob>): Promise<RunJob>;
  list(status?: JobStatus): Promise<RunJob[]>;
}

/** Mutable job state for commissioned runs. The result is published separately and is immutable. */
export class FileJobStore implements JobStore {
  constructor(private dir = process.env.BIAS_JOBS_DIR || path.join(process.cwd(), "data/bias/jobs")) {}

  private file(runId: string) {
    if (!SAFE_ID.test(runId)) throw new Error(`Invalid run id ${runId}`);
    return path.join(this.dir, `${runId}.json`);
  }

  async create(job: RunJob): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(job.runId), JSON.stringify(job, null, 2), { flag: "wx" });
  }

  async get(runId: string): Promise<RunJob | null> {
    try {
      return JSON.parse(await fs.readFile(this.file(runId), "utf8")) as RunJob;
    } catch {
      return null;
    }
  }

  async update(runId: string, patch: Partial<RunJob>): Promise<RunJob> {
    const current = await this.get(runId);
    if (!current) throw new Error(`No job ${runId}`);
    const next = { ...current, ...patch, runId, updatedAt: new Date().toISOString() };
    await fs.writeFile(this.file(runId), JSON.stringify(next, null, 2));
    return next;
  }

  async list(status?: JobStatus): Promise<RunJob[]> {
    let names: string[] = [];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const jobs: RunJob[] = [];
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      const job = await this.get(name.replace(/\.json$/, ""));
      if (job && (!status || job.status === status)) jobs.push(job);
    }
    return jobs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}

export class MemoryRunStore implements RunStore {
  private runs = new Map<string, PublishedRun>();
  async publish(run: PublishedRun) {
    verify(run);
    if (this.runs.has(run.runId)) throw new ImmutableRunError(run.runId);
    this.runs.set(run.runId, structuredClone(run));
  }
  async get(runId: string) {
    const run = this.runs.get(runId);
    return run ? verify(structuredClone(run)) : null;
  }
  async list() {
    return [...this.runs.values()].map((r) => structuredClone(r)).sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  }
}

export class MemoryJobStore implements JobStore {
  private jobs = new Map<string, RunJob>();
  async create(job: RunJob) {
    if (this.jobs.has(job.runId)) throw new Error("exists");
    this.jobs.set(job.runId, { ...job });
  }
  async get(runId: string) {
    return this.jobs.get(runId) ?? null;
  }
  async update(runId: string, patch: Partial<RunJob>) {
    const next = { ...this.jobs.get(runId)!, ...patch, runId };
    this.jobs.set(runId, next);
    return next;
  }
  async list(status?: JobStatus) {
    return [...this.jobs.values()].filter((j) => !status || j.status === status);
  }
}
