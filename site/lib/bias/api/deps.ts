import { createLimiter } from "@/lib/bias/api/http";
import type { ApiDeps } from "@/lib/bias/api/handlers";
import { DisabledKeyStore } from "@/lib/bias/api/keys";
import { FileJobStore, FileRunStore } from "@/lib/bias/api/store";

/** Server-side cap per commissioned run. Clients cannot raise it. */
export function serverBudgetCapUsd(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.BIAS_RUN_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : 5;
}

/**
 * Hosted runs stay closed until the Verafy API key ledger and a long-running worker are connected
 * to this deployment. While false, POST /api/v1/runs answers 503 and the Benchmark page says so.
 */
export const HOSTED_RUNS_OPEN = false;

let cached: ApiDeps | null = null;

/** Stored runs are served from the committed files in data/bias/runs. */
export function apiDeps(): ApiDeps {
  if (cached) return cached;
  cached = {
    runs: new FileRunStore(),
    jobs: new FileJobStore(process.env.BIAS_JOBS_DIR ?? "/tmp/bias-jobs"),
    keys: new DisabledKeyStore(),
    limiter: createLimiter(),
    legacyRun: async () => null,
    budgetCapUsd: serverBudgetCapUsd(),
  };
  return cached;
}
