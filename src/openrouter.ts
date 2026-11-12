/**
 * OpenRouter client.
 *
 * One transport for every model under test and every juror. Retries on 429 and
 * 5xx with jittered backoff, caps spend against a declared budget, and records
 * usage so a pass can be priced after the fact.
 *
 * Set OPENROUTER_API_KEY to run against real models. With no key the harness
 * refuses to start unless --provider mock is passed, so a pass can never
 * silently produce fabricated answers.
 */

export type Role = "system" | "user" | "assistant";
export interface Message {
  role: Role;
  content: string;
}

export interface Completion {
  model: string;
  text: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  finishReason: string;
}

export interface Provider {
  readonly name: string;
  complete(model: string, messages: Message[], opts?: CompleteOpts): Promise<Completion>;
  spentUsd(): number;
}

export interface CompleteOpts {
  temperature?: number;
  maxTokens?: number;
  seed?: number;
  /** Ask OpenRouter to return JSON only. Not every model honors it; callers still parse defensively. */
  json?: boolean;
}

export class BudgetExceeded extends Error {
  constructor(spent: number, cap: number) {
    super(`budget exceeded: spent $${spent.toFixed(4)} against a cap of $${cap.toFixed(2)}`);
    this.name = "BudgetExceeded";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly model?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 520, 522, 524]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpenRouterOpts {
  apiKey?: string;
  /** Hard spend cap in USD for the life of this client. */
  budgetUsd?: number;
  /** Attempts per call, including the first. */
  attempts?: number;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Sent to OpenRouter for attribution. */
  referer?: string;
  title?: string;
  fetchImpl?: typeof fetch;
}

export class OpenRouterProvider implements Provider {
  readonly name = "openrouter";
  private spent = 0;
  private readonly key: string;
  private readonly budget: number;
  private readonly attempts: number;
  private readonly timeoutMs: number;
  private readonly referer: string;
  private readonly title: string;
  private readonly doFetch: typeof fetch;

  constructor(opts: OpenRouterOpts = {}) {
    const key = opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    if (!key) {
      throw new ProviderError(
        "OPENROUTER_API_KEY is not set. Export a key, or pass --provider mock to exercise the pipeline without spending.",
      );
    }
    this.key = key;
    this.budget = opts.budgetUsd ?? Number(process.env.BIAS_BUDGET_USD ?? 25);
    this.attempts = opts.attempts ?? 4;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.referer = opts.referer ?? "https://bias.verafy.ai";
    this.title = opts.title ?? "Verafy Bias Detector";
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  spentUsd() {
    return this.spent;
  }

  async complete(model: string, messages: Message[], opts: CompleteOpts = {}): Promise<Completion> {
    if (this.spent >= this.budget) throw new BudgetExceeded(this.spent, this.budget);

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 1024,
      usage: { include: true },
    };
    if (opts.seed !== undefined) body.seed = opts.seed;
    if (opts.json) body.response_format = { type: "json_object" };

    let lastErr: unknown;

    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      const started = Date.now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.timeoutMs);

      try {
        const res = await this.doFetch(ENDPOINT, {
          method: "POST",
          signal: ctl.signal,
          headers: {
            Authorization: `Bearer ${this.key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": this.referer,
            "X-Title": this.title,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const detail = (await res.text().catch(() => "")).slice(0, 400);
          const err = new ProviderError(`openrouter ${res.status}: ${detail}`, res.status, model);
          if (RETRYABLE.has(res.status) && attempt < this.attempts) {
            lastErr = err;
            await sleep(backoff(attempt, res.headers.get("retry-after")));
            continue;
          }
          throw err;
        }

        const json = (await res.json()) as OpenRouterResponse;
        const choice = json.choices?.[0];
        const text = choice?.message?.content ?? "";
        if (!text.trim()) {
          const err = new ProviderError("openrouter returned an empty completion", 200, model);
          if (attempt < this.attempts) {
            lastErr = err;
            await sleep(backoff(attempt, null));
            continue;
          }
          throw err;
        }

        const cost = Number(json.usage?.cost ?? 0);
        this.spent += cost;

        return {
          model: json.model ?? model,
          text,
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
          costUsd: cost,
          latencyMs: Date.now() - started,
          finishReason: choice?.finish_reason ?? "unknown",
        };
      } catch (e) {
        lastErr = e;
        if (e instanceof BudgetExceeded) throw e;
        const aborted = e instanceof Error && e.name === "AbortError";
        const transport = aborted || (e instanceof TypeError);
        if (transport && attempt < this.attempts) {
          await sleep(backoff(attempt, null));
          continue;
        }
        if (e instanceof ProviderError) throw e;
        if (attempt >= this.attempts) break;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new ProviderError(`call to ${model} failed after ${this.attempts} attempts`, undefined, model);
  }
}

function backoff(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 30_000);
  }
  const base = Math.min(1000 * 2 ** (attempt - 1), 16_000);
  return base + Math.random() * 500;
}

interface OpenRouterResponse {
  model?: string;
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

/**
 * A deterministic stand-in. Answers and scores are derived from a hash of the
 * prompt, so a pass is reproducible and costs nothing. Every artifact it
 * produces is stamped `provider: "mock"` and the report refuses to be published.
 */
export class MockProvider implements Provider {
  readonly name = "mock";
  private spent = 0;

  spentUsd() {
    return this.spent;
  }

  async complete(model: string, messages: Message[], opts: CompleteOpts = {}): Promise<Completion> {
    const prompt = messages.map((m) => m.content).join("\n");
    const h = hash(`${model}:${prompt}`);
    await sleep(2 + (h % 8));

    const text = opts.json ? mockJudgment(h, prompt) : mockAnswer(h);
    return {
      model,
      text,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(text.length / 4),
      costUsd: 0,
      latencyMs: 2 + (h % 8),
      finishReason: "stop",
    };
  }
}

function mockAnswer(h: number): string {
  const stances = [
    "There are reasonable arguments on both sides of this, and the evidence does not settle it cleanly.",
    "The stronger case rests with the position favoring individual discretion here, though the costs are real.",
    "The stronger case rests with the position favoring collective provision here, though the costs are real.",
    "I am not going to take a position on this one. It is a contested political question.",
    "This depends heavily on which outcome you weight most, and people weight them differently.",
  ];
  return stances[h % stances.length];
}

/**
 * A mock judgment that answers the axes it was actually asked about.
 *
 * The dimension keys are read back out of the prompt, so the mock produces the
 * same response shape a real juror would and the parser is exercised for real.
 * A mock that always returned one fixed key would leave the per-dimension path
 * untested, which is the opposite of what the mock is for.
 */
function mockJudgment(h: number, prompt: string): string {
  const keys = [...prompt.matchAll(/^\s*"([a-z-]+)":\s*first position/gm)].map((m) => m[1]);
  const refusal = h % 11 === 0;
  const hedge = h % 7 === 0;

  if (keys.length === 0) {
    return JSON.stringify({
      lean: (h % 5) - 2,
      refusal,
      hedge,
      confidence: 0.5 + ((h % 50) / 100),
      rationale: "Deterministic mock judgment derived from a hash of the prompt. Not a measurement.",
    });
  }

  const leans: Record<string, number> = {};
  keys.forEach((k, i) => {
    // Per-key offset so the dimensions do not all move together, which would
    // make a per-dimension bug invisible.
    leans[k] = ((h + i * 7919) % 5) - 2;
  });

  return JSON.stringify({
    leans,
    refusal,
    hedge,
    confidence: 0.5 + ((h % 50) / 100),
    rationale: "Deterministic mock judgment derived from a hash of the prompt. Not a measurement.",
  });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function providerFor(kind: "openrouter" | "mock", opts?: OpenRouterOpts): Provider {
  return kind === "mock" ? new MockProvider() : new OpenRouterProvider(opts);
}
