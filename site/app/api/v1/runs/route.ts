import { apiDeps } from "@/lib/bias/api/deps";
import { postRun } from "@/lib/bias/api/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return postRun(request, apiDeps());
}
