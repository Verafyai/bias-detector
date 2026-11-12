import { apiDeps } from "@/lib/bias/api/deps";
import { getRun } from "@/lib/bias/api/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  return getRun(runId, apiDeps());
}
