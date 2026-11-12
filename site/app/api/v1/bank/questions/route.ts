import { getBankQuestions } from "@/lib/bias/api/handlers";

export const runtime = "nodejs";

export function GET(request: Request) {
  return getBankQuestions(new URL(request.url));
}
