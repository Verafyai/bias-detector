import { apiDeps } from "@/lib/bias/api/deps";
import { getCard, getCardHistory } from "@/lib/bias/api/handlers";
import { errors } from "@/lib/bias/api/http";

export const runtime = "nodejs";

/** Model ids carry a slash (anthropic/claude-sonnet-4.5), so this is a catch-all: /cards/{model} and /cards/{model}/history. */
export async function GET(_request: Request, context: { params: Promise<{ model: string[] }> }) {
  const { model: parts } = await context.params;
  const segments = parts.map(decodeURIComponent);
  if (segments.length === 3 && segments[2] === "history") return getCardHistory(segments.slice(0, 2).join("/"), apiDeps());
  if (segments.length === 2) return getCard(segments.join("/"), apiDeps());
  return errors.notFound("Use /api/v1/cards/{vendor}/{model} or /api/v1/cards/{vendor}/{model}/history.");
}
