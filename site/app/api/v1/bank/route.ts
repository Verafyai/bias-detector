import { getBank } from "@/lib/bias/api/handlers";

export const runtime = "nodejs";

export function GET() {
  return getBank();
}
