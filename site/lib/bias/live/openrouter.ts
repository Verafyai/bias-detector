import { failureFromThrown, providerRejection, parseFailure } from "@/lib/midterms/call-error";

/** Same endpoint as lib/midterms/openrouter.ts. Kept local so this module does not load the midterms model catalog. */
export const OPENROUTER_CHAT_COMPLETIONS = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Bias Detector completion call. Shares the endpoint and the key-redacting failure
 * helpers with the midterms OpenRouter client, but never adds `:online` or web search:
 * a bias probe must answer from the model alone.
 */
export interface BiasCompletionRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  json?: boolean;
}

export interface BiasCompletion {
  ok: boolean;
  content: string;
  costUsd: number;
  generationId: string | null;
  status: number | null;
  error?: string;
}

export type FetchLike = typeof fetch;

export class UpstreamError extends Error {
  constructor(message: string, public status: number | null) {
    super(message);
    this.name = "UpstreamError";
  }
}

export async function biasComplete(
  req: BiasCompletionRequest,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 90_000,
): Promise<BiasCompletion> {
  const first = await once(req, apiKey, fetchImpl, timeoutMs, true);
  // Some endpoints reject the reasoning parameter ("No endpoints found"). Retry once without it.
  if (!first.ok && first.status === 404 && /no endpoints/i.test(first.error ?? "")) {
    const second = await once(req, apiKey, fetchImpl, timeoutMs, false);
    return { ...second, costUsd: second.costUsd + first.costUsd };
  }
  return first;
}

async function once(
  req: BiasCompletionRequest,
  apiKey: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  withReasoning: boolean,
): Promise<BiasCompletion> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    max_tokens: req.maxTokens,
    temperature: 0,
    usage: { include: true },
  };
  if (withReasoning) body.reasoning = { effort: "low", exclude: true };
  if (req.json) body.response_format = { type: "json_object" };
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Verafy Bias Detector",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const failure = failureFromThrown(error, req.model, [apiKey]);
    return { ok: false, content: "", costUsd: 0, generationId: null, status: null, error: failure.message };
  }
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    // The timeout can fire while the body is still streaming.
    const failure = failureFromThrown(error, req.model, [apiKey]);
    return { ok: false, content: "", costUsd: 0, generationId: null, status: response.status, error: failure.message };
  }
  if (!response.ok) {
    const failure = providerRejection(raw, response.status, req.model, [apiKey]);
    return { ok: false, content: "", costUsd: 0, generationId: null, status: response.status, error: failure.message };
  }
  let data: {
    id?: string;
    error?: unknown;
    usage?: { cost?: number };
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  try {
    data = JSON.parse(raw);
  } catch {
    const failure = parseFailure(raw, response.status, req.model, [apiKey]);
    return { ok: false, content: "", costUsd: 0, generationId: null, status: response.status, error: failure.message };
  }
  const costUsd = typeof data.usage?.cost === "number" && data.usage.cost >= 0 ? data.usage.cost : 0;
  if (data.error) {
    const failure = providerRejection(raw, response.status, req.model, [apiKey]);
    return { ok: false, content: "", costUsd, generationId: data.id ?? null, status: response.status, error: failure.message };
  }
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("\n") : "";
  if (!text.trim()) {
    return { ok: false, content: "", costUsd, generationId: data.id ?? null, status: response.status, error: "Empty completion" };
  }
  return { ok: true, content: text, costUsd, generationId: data.id ?? null, status: response.status };
}
