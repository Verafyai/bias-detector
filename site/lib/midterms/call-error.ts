import type { RaceFailureReason } from "@/lib/midterms/types";

/** Failure details safe to print in Vercel logs. Messages are redacted and short. */
export type MidtermCallFailureKind =
  | "timeout"
  | "parse_failure"
  | "provider_rejection"
  | "request_failed";

export interface MidtermCallFailure {
  modelId: string;
  status: number | null;
  code: string | null;
  message: string;
  kind: MidtermCallFailureKind;
  /** Redacted provider response body. Absent when the call never returned one. */
  body?: string | null;
}

const REDACTED = "[redacted]";
const MESSAGE_LIMIT = 300;
const BODY_LIMIT = 1_200;

/**
 * Per-run counts keyed by HTTP status and OpenRouter error code.
 * Timeouts and parse failures use the kind when the body has no code: `none:timeout`, `200:parse_failure`.
 */
export function failureReasonKey(
  failure: Pick<MidtermCallFailure, "status" | "code" | "kind">,
): string {
  const status = failure.status == null ? "none" : String(failure.status);
  const code = (failure.code ?? "").trim().slice(0, 80);
  return `${status}:${code || failure.kind}`;
}

export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "TimeoutError") return true;
  if (
    code === "ABORT_ERR" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT"
  )
    return true;
  if (name === "AbortError" && /timeout|aborted/i.test(message)) return true;
  return /aborted due to timeout|operation was aborted|this operation was aborted/i.test(
    message,
  );
}

/**
 * Bucket stored on the snapshot. HTTP 504 is a provider timeout even when
 * OpenRouter's message is only "Provider returned error". HTTP 402 stays separate.
 */
export function storedFailureReason(
  failure: Pick<MidtermCallFailure, "kind" | "status" | "code">,
): RaceFailureReason {
  if (failure.status === 402 || failure.code === "402") return "http_402";
  if (
    failure.kind === "timeout" ||
    failure.status === 504 ||
    failure.status === 408 ||
    failure.code === "timeout"
  ) {
    return "timeout";
  }
  if (failure.kind === "parse_failure") return "parse_error";
  return "provider_error";
}

export function failureFromThrown(
  error: unknown,
  modelId: string,
  extras: readonly string[] = [],
): MidtermCallFailure {
  const message =
    clipMessage(
      error instanceof Error ? error.message : "OpenRouter request failed",
      extras,
    ) || "OpenRouter request failed";
  if (isTimeoutError(error))
    return { modelId, status: null, code: null, message, kind: "timeout" };
  if (error instanceof SyntaxError)
    return {
      modelId,
      status: null,
      code: null,
      message,
      kind: "parse_failure",
    };
  return { modelId, status: null, code: null, message, kind: "request_failed" };
}

export function providerRejection(
  raw: string,
  status: number,
  modelId: string,
  extras: readonly string[] = [],
): MidtermCallFailure {
  const provider = readProviderError(parseJson(raw));
  const message =
    clipMessage(provider.message ?? raw, extras) || `OpenRouter ${status}`;
  return {
    modelId,
    status,
    code: cleanCode(provider.code, extras),
    message,
    kind: "provider_rejection",
    body: clipBody(raw, extras),
  };
}

export function parseFailure(
  raw: string,
  status: number,
  modelId: string,
  extras: readonly string[] = [],
): MidtermCallFailure {
  return {
    modelId,
    status,
    code: null,
    message: clipMessage(raw, extras) || "OpenRouter returned non-JSON",
    kind: "parse_failure",
    body: clipBody(raw, extras),
  };
}

export function readProviderError(data: unknown): {
  code: string | null;
  message: string | null;
} {
  if (!data || typeof data !== "object") return { code: null, message: null };
  const record = data as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return { code: null, message: error };
  const source =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : record;
  const code = readCode(source.code) ?? readCode(source.type);
  const message = typeof source.message === "string" ? source.message : null;
  return { code, message };
}

export function clipMessage(
  text: string,
  extras: readonly string[] = [],
): string {
  return clip(text, extras, MESSAGE_LIMIT);
}

/** Redacted provider body for logs. Longer than the message so metadata.raw survives. */
export function clipBody(text: string, extras: readonly string[] = []): string {
  return clip(text, extras, BODY_LIMIT);
}

function clip(text: string, extras: readonly string[], limit: number): string {
  const redacted = redactSecrets(text.slice(0, 8_000), extras)
    .replace(/[\r\n]+/g, " ")
    .trim();
  return redacted.length > limit ? redacted.slice(0, limit) : redacted;
}

/** Remove API keys, bearer tokens, cron secrets, and other key-shaped strings. */
export function redactSecrets(
  text: string,
  extras: readonly string[] = [],
): string {
  let out = text;
  out = out.replace(
    /\bauthorization\b\s*[:=]\s*["']?(?:bearer\s+)?\S+/gi,
    REDACTED,
  );
  out = out.replace(/bearer\s+\S+/gi, REDACTED);
  for (const secret of knownSecrets(extras)) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  const patterns = [
    /\bsk-[A-Za-z0-9_-]{8,}\b/g,
    /\bAIza[0-9A-Za-z_-]{10,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{10,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    /\bvercel_blob_rw_[A-Za-z0-9_]+\b/gi,
    /\b(?:api[_-]?key|apikey|access[_-]?token|token|secret|password)\b\s*[:=]\s*["']?[^\s"']+/gi,
    /\b[A-Za-z0-9_-]{32,}\b/g,
  ];
  for (const pattern of patterns) out = out.replace(pattern, REDACTED);
  return out;
}

function knownSecrets(extras: readonly string[]): string[] {
  const values = [
    process.env.OPENROUTER_API_KEY,
    process.env.MIDTERMS_CRON_SECRET,
    process.env.CRON_SECRET,
    process.env.BLOB_READ_WRITE_TOKEN,
    ...extras,
  ];
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && value.length >= 8) unique.add(value);
  }
  return [...unique].sort((a, b) => b.length - a.length);
}

function cleanCode(
  code: string | null,
  extras: readonly string[],
): string | null {
  if (!code) return null;
  const redacted = redactSecrets(code, extras).trim().slice(0, 80);
  return redacted || null;
}

function readCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim())
    return value.trim().slice(0, 80);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw.length > 20_000 ? raw.slice(0, 20_000) : raw);
  } catch {
    return null;
  }
}


