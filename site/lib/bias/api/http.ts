import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

/** Error bodies match the @verafy/sdk error classes so one client handles both services. */
export interface FieldError {
  field: string;
  message: string;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export const PUBLIC_CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };

export const errors = {
  invalidKey: (headers?: Record<string, string>) => json({ error: "Invalid API key" }, 401, headers),
  missingKey: (headers?: Record<string, string>) => json({ error: "API key required" }, 401, headers),
  insufficientCredits: (required: number, available: number, headers?: Record<string, string>) =>
    json({ error: "Insufficient credits", required, available }, 403, headers),
  rateLimited: (resetEpochSeconds: number) =>
    json({ error: "Rate limit exceeded" }, 429, {
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(resetEpochSeconds),
      "Retry-After": String(Math.max(1, resetEpochSeconds - Math.floor(Date.now() / 1000))),
    }),
  validation: (details: FieldError[], headers?: Record<string, string>) =>
    json({ error: "Validation failed", details }, 400, headers),
  notFound: (message: string, headers?: Record<string, string>) => json({ error: message }, 404, headers),
  upstream: (message: string, headers?: Record<string, string>) => json({ error: message }, 502, headers),
};

export const RATE_LIMIT_POINTS = 100;
export const RATE_LIMIT_SECONDS = 3600;

/** Same limiter as verafy-apis: 100 requests per hour per API key. */
export function createLimiter(): RateLimiterMemory {
  return new RateLimiterMemory({ points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_SECONDS });
}

export type LimitResult = { ok: true; headers: Record<string, string> } | { ok: false; response: Response };

export async function consume(limiter: RateLimiterMemory, key: string): Promise<LimitResult> {
  try {
    const res = await limiter.consume(key);
    return { ok: true, headers: limitHeaders(res) };
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return { ok: false, response: errors.rateLimited(Math.ceil((Date.now() + error.msBeforeNext) / 1000)) };
    }
    throw error;
  }
}

function limitHeaders(res: RateLimiterRes): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(Math.max(0, res.remainingPoints)),
    "X-RateLimit-Reset": String(Math.ceil((Date.now() + res.msBeforeNext) / 1000)),
  };
}
