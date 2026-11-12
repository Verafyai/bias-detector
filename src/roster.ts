/**
 * The standing roster and the juror pools.
 *
 * Vendor is the field that matters. It is what keeps a model off its own panel,
 * so it has to be right even when a model id does not make the vendor obvious
 * (gpt-oss is OpenAI's, Llama is Meta's, GLM is Zhipu's).
 */

import type { Juror } from "./jury.js";
import type { Subject } from "./run.js";

export interface RosterEntry extends Subject {
  /** On the standing roster shown on the leaderboard. */
  standing: boolean;
}

export const ROSTER: RosterEntry[] = [
  { model: "anthropic/claude-opus-4.5", vendor: "anthropic", label: "Claude Opus 4.5", standing: true },
  { model: "anthropic/claude-sonnet-4.5", vendor: "anthropic", label: "Claude Sonnet 4.5", standing: true },
  { model: "anthropic/claude-haiku-4.5", vendor: "anthropic", label: "Claude Haiku 4.5", standing: true },
  { model: "openai/gpt-4.1", vendor: "openai", label: "GPT-4.1", standing: true },
  { model: "openai/gpt-4.1-mini", vendor: "openai", label: "GPT-4.1 mini", standing: true },
  { model: "openai/gpt-oss-120b", vendor: "openai", label: "gpt-oss-120b", standing: true },
  { model: "google/gemini-2.5-pro", vendor: "google", label: "Gemini 2.5 Pro", standing: true },
  { model: "google/gemini-2.5-flash", vendor: "google", label: "Gemini 2.5 Flash", standing: true },
  { model: "x-ai/grok-4", vendor: "xai", label: "Grok 4", standing: true },
  { model: "mistralai/mistral-large", vendor: "mistral", label: "Mistral Large", standing: true },
  { model: "mistralai/mistral-medium", vendor: "mistral", label: "Mistral Medium", standing: true },
  { model: "deepseek/deepseek-chat", vendor: "deepseek", label: "DeepSeek V3", standing: true },
  { model: "deepseek/deepseek-r1", vendor: "deepseek", label: "DeepSeek R1", standing: true },
  { model: "qwen/qwen-max", vendor: "alibaba", label: "Qwen Max", standing: true },
  { model: "qwen/qwen-2.5-72b-instruct", vendor: "alibaba", label: "Qwen 2.5 72B", standing: true },
  { model: "moonshotai/kimi-k2", vendor: "moonshot", label: "Kimi K2", standing: true },
  { model: "z-ai/glm-4.6", vendor: "zhipu", label: "GLM-4.6", standing: true },
  { model: "meta-llama/llama-3.3-70b-instruct", vendor: "meta", label: "Llama 3.3 70B", standing: true },
  { model: "meta-llama/llama-4-maverick", vendor: "meta", label: "Llama 4 Maverick", standing: true },
  { model: "amazon/nova-pro-v1", vendor: "amazon", label: "Nova Pro", standing: true },
];

const VENDOR_PREFIX: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  "x-ai": "xai",
  mistralai: "mistral",
  deepseek: "deepseek",
  qwen: "alibaba",
  moonshotai: "moonshot",
  "z-ai": "zhipu",
  "meta-llama": "meta",
  amazon: "amazon",
  cohere: "cohere",
  microsoft: "microsoft",
  nvidia: "nvidia",
  perplexity: "perplexity",
  ai21: "ai21",
  liquid: "liquid",
  nousresearch: "nous",
};

/**
 * Any OpenRouter model can be tested, not just the roster. The vendor is read
 * off the id prefix, because getting it wrong would let a model sit on its own
 * panel.
 */
export function subjectFor(model: string, label?: string): Subject {
  const known = ROSTER.find((r) => r.model === model);
  if (known) return { model: known.model, vendor: known.vendor, label: known.label };

  const prefix = model.split("/")[0]?.toLowerCase() ?? "";
  const vendor = VENDOR_PREFIX[prefix];
  if (!vendor) {
    throw new Error(
      `cannot determine the vendor for "${model}". Add its prefix to VENDOR_PREFIX in src/roster.ts, or the model could end up judging its own answers.`,
    );
  }
  return { model, vendor, label: label ?? model };
}

/** Jurors, kept apart from the roster so a panel change is a deliberate edit. */
export const JURORS: Juror[] = [
  { model: "anthropic/claude-sonnet-4.5", vendor: "anthropic", label: "Claude Sonnet 4.5" },
  { model: "openai/gpt-4.1", vendor: "openai", label: "GPT-4.1" },
  { model: "google/gemini-2.5-pro", vendor: "google", label: "Gemini 2.5 Pro" },
  { model: "meta-llama/llama-3.3-70b-instruct", vendor: "meta", label: "Llama 3.3 70B" },
  { model: "mistralai/mistral-large", vendor: "mistral", label: "Mistral Large" },
  { model: "deepseek/deepseek-chat", vendor: "deepseek", label: "DeepSeek V3" },
  { model: "qwen/qwen-2.5-72b-instruct", vendor: "alibaba", label: "Qwen 2.5 72B" },
];

/** Jury sizes the product offers. Twelve is for a published run. */
export const JURY_SIZES = [3, 5, 12] as const;

export function panelOf(size: number): Juror[] {
  if (size > JURORS.length) {
    throw new Error(
      `a panel of ${size} needs ${size} jurors but only ${JURORS.length} are configured. Add jurors from companies not already on the panel.`,
    );
  }
  return JURORS.slice(0, size);
}
