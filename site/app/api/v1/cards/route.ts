import { apiDeps } from "@/lib/bias/api/deps";
import { getCards } from "@/lib/bias/api/handlers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return getCards(new URL(request.url), apiDeps());
}
