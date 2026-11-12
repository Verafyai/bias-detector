/**
 * Measured Bias Detector runs from the command line.
 *
 *   npx tsx scripts/bias-run.ts --models openai/gpt-oss-120b,meta-llama/llama-4-maverick --jury 3 --budget 15
 *   npx tsx scripts/bias-run.ts --worker            # process queued POST /api/v1/runs jobs
 *
 * Needs OPENROUTER_API_KEY. --budget is the hard cap in USD for the whole invocation.
 * Results are sealed and written once to data/bias/runs/<runId>.json. Existing files are never overwritten.
 */
import { bankHash, bankVersion } from "@/lib/bias/api/bank";
import { serverBudgetCapUsd } from "@/lib/bias/api/deps";
import { FileJobStore, FileRunStore, sealRun } from "@/lib/bias/api/store";
import { sampleQuestions, processJob } from "@/lib/bias/api/worker";
import { BudgetExceededError, liveRunId, runLive, type SpendTracker } from "@/lib/bias/live/run";
import { getBenchmarkQuestions } from "@/lib/bias/questions";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set. No measured run is possible without it.");
  const runs = new FileRunStore();
  if (process.argv.includes("--worker")) {
    const jobs = new FileJobStore();
    for (const job of await jobs.list("queued")) {
      const run = await processJob(job, { runs, jobs, apiKey, budgetCapUsd: serverBudgetCapUsd() });
      console.log(job.runId, run ? `complete $${run.costUsd}` : (await jobs.get(job.runId))?.status);
    }
    return;
  }
  const models = (arg("models") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (models.length === 0) throw new Error("Pass --models vendor/model[,vendor/model]");
  const jurySize = Number(arg("jury") ?? 3);
  const budget = Number(arg("budget") ?? 15);
  const sampleArg = arg("sample");
  const questions = sampleQuestions(getBenchmarkQuestions(), sampleArg ? Number(sampleArg) : null);
  const sampled = questions.length !== getBenchmarkQuestions().length;
  const spend: SpendTracker = { capUsd: budget, spentUsd: 0, calls: 0 };
  console.log(`bank ${bankVersion()} ${bankHash().slice(0, 12)} · ${questions.length} questions · jury ${jurySize} · cap $${budget}`);
  for (const model of models) {
    const runId = liveRunId(model, bankHash());
    const createdAt = new Date().toISOString();
    try {
      const result = await runLive({
        runId,
        model,
        questions,
        bankVersion: bankVersion(),
        bankHash: bankHash(),
        jurySize,
        apiKey,
        spend,
        concurrency: Number(arg("concurrency") ?? 8),
        sampled,
        answerMaxTokens: arg("answer-tokens") ? Number(arg("answer-tokens")) : undefined,
        onProgress: (done, total) => {
          if (done % 50 === 0 || done === total) console.log(`  ${model} ${done}/${total} · total spend $${spend.spentUsd.toFixed(4)}`);
        },
      });
      const run = sealRun({
        schema: "verafy-bias-run/1",
        runId,
        model,
        bankVersion: bankVersion(),
        bankHash: bankHash(),
        jurySize,
        sampled,
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
      await runs.publish(run);
      const c = run.card;
      console.log(
        JSON.stringify({ runId, model, costUsd: run.costUsd, calls: run.calls, magnitude: c.magnitude, answerRate: c.answerRate, hedgeRate: c.hedgeRate, refusalRate: c.refusalRate, nFailed: c.nFailed, nDisputed: c.nDisputed, triageRate: c.triageRate }),
      );
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        console.error(`Stopped: ${error.message} Nothing was published for ${model}.`);
        break;
      }
      throw error;
    }
  }
  console.log(`total spend $${spend.spentUsd.toFixed(6)} over ${spend.calls} calls`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
