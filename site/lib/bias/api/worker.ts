import { bankHash, bankVersion } from "@/lib/bias/api/bank";
import type { KeyStore } from "@/lib/bias/api/keys";
import { sealRun, type JobStore, type PublishedRun, type RunJob, type RunStore } from "@/lib/bias/api/store";
import type { FetchLike } from "@/lib/bias/live/openrouter";
import { BudgetExceededError, runLive, type SpendTracker } from "@/lib/bias/live/run";
import { getBenchmarkQuestions } from "@/lib/bias/questions";
import type { ContentiousQuestion } from "@/lib/contentious-questions";

/** Deterministic sample: every k-th question by id, so a sampled run is reproducible. */
export function sampleQuestions(all: ContentiousQuestion[], n: number | null): ContentiousQuestion[] {
  if (!n || n >= all.length) return all;
  const step = all.length / n;
  return Array.from({ length: n }, (_, i) => all[Math.floor(i * step)]);
}

export interface WorkerDeps {
  runs: RunStore;
  jobs: JobStore;
  keys?: KeyStore;
  apiKey: string;
  budgetCapUsd: number;
  fetchImpl?: FetchLike;
  concurrency?: number;
}

export async function processJob(job: RunJob, deps: WorkerDeps): Promise<PublishedRun | null> {
  if (job.status !== "queued") return null;
  if (job.bankVersion !== bankVersion()) {
    await deps.jobs.update(job.runId, { status: "failed", error: `Bank ${job.bankVersion} is not the current bank.` });
    return null;
  }
  const questions = sampleQuestions(getBenchmarkQuestions(), job.sample);
  await deps.jobs.update(job.runId, { status: "running", progress: { done: 0, total: questions.length } });
  const spend: SpendTracker = { capUsd: deps.budgetCapUsd, spentUsd: 0, calls: 0 };
  const createdAt = new Date().toISOString();
  let lastWrite = 0;
  try {
    const result = await runLive({
      runId: job.runId,
      model: job.model,
      questions,
      bankVersion: job.bankVersion,
      bankHash: bankHash(),
      jurySize: job.jurySize,
      apiKey: deps.apiKey,
      spend,
      fetchImpl: deps.fetchImpl,
      concurrency: deps.concurrency,
      sampled: job.sample !== null,
      onProgress: (done, total) => {
        if (done - lastWrite >= 25 || done === total) {
          lastWrite = done;
          void deps.jobs.update(job.runId, { progress: { done, total } });
        }
      },
    });
    const run = sealRun({
      schema: "verafy-bias-run/1",
      runId: job.runId,
      model: job.model,
      bankVersion: job.bankVersion,
      bankHash: bankHash(),
      jurySize: job.jurySize,
      sampled: job.sample !== null,
      questionIds: questions.map((q) => q.id),
      measured: true,
      createdAt,
      completedAt: new Date().toISOString(),
      costUsd: Math.round(result.costUsd * 1e6) / 1e6,
      calls: result.calls,
      jurors: result.jurorsUsed,
      card: result.card,
      items: result.items,
    });
    await deps.runs.publish(run);
    await deps.jobs.update(job.runId, { status: "complete", progress: { done: questions.length, total: questions.length } });
    return run;
  } catch (error) {
    const aborted = error instanceof BudgetExceededError;
    await deps.jobs.update(job.runId, {
      status: aborted ? "aborted" : "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    if (deps.keys && job.apiKeyId) await deps.keys.refund(job.apiKeyId, job.credits);
    return null;
  }
}
