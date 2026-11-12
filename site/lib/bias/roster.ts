export interface RosterModel {
  id: string;
  name: string;
  provider: string;
  /** OpenRouter `:batch` variant exists for this model. */
  batch: boolean;
  /** USD per 1M input tokens, from the Oct 10, 2026 cost study. */
  promptPerM: number;
  /** USD per 1M output tokens. */
  completionPerM: number;
}

/**
 * The twenty models in the cost study. Ids match the OpenRouter catalog snapshot.
 * Prices are the study's per-model table, not a live quote.
 */
export const ROSTER: RosterModel[] = [
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", provider: "anthropic", batch: true, promptPerM: 4, completionPerM: 20 },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", provider: "anthropic", batch: true, promptPerM: 2, completionPerM: 10 },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", provider: "anthropic", batch: true, promptPerM: 0.1, completionPerM: 0.5 },
  { id: "openai/gpt-6-astra", name: "GPT-6 Astra", provider: "openai", batch: true, promptPerM: 10, completionPerM: 50 },
  { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "openai", batch: true, promptPerM: 2, completionPerM: 10 },
  { id: "openai/gpt-6-luna", name: "GPT-6 Luna", provider: "openai", batch: true, promptPerM: 0.1, completionPerM: 0.5 },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "google", batch: true, promptPerM: 2, completionPerM: 12 },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "google", batch: true, promptPerM: 0.75, completionPerM: 3.75 },
  { id: "x-ai/grok-4.7", name: "Grok 4.7", provider: "xai", batch: false, promptPerM: 2, completionPerM: 6 },
  { id: "x-ai/grok-4.3", name: "Grok 4.3", provider: "xai", batch: true, promptPerM: 1.25, completionPerM: 2.5 },
  { id: "mistralai/mistral-large-4-0", name: "Mistral Large 4", provider: "mistral", batch: false, promptPerM: 0.68, completionPerM: 2.09 },
  { id: "mistralai/mistral-medium-3-5", name: "Mistral Medium 3.5", provider: "mistral", batch: true, promptPerM: 1.5, completionPerM: 7.5 },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "deepseek", batch: false, promptPerM: 0.209, completionPerM: 0.418 },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "deepseek", batch: true, promptPerM: 0.3, completionPerM: 1.2 },
  { id: "qwen/qwen3.8-max-0902", name: "Qwen 3.8 Max", provider: "qwen", batch: false, promptPerM: 2, completionPerM: 6 },
  { id: "qwen/qwen3.7-plus", name: "Qwen 3.7 Plus", provider: "qwen", batch: false, promptPerM: 0.32, completionPerM: 1.28 },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", provider: "moonshot", batch: false, promptPerM: 0.8, completionPerM: 12 },
  { id: "z-ai/glm-5.3", name: "GLM-5.3", provider: "zai", batch: true, promptPerM: 0.039, completionPerM: 4.8 },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", provider: "meta", batch: false, promptPerM: 0.188, completionPerM: 0.652 },
  { id: "openai/gpt-oss-120b", name: "gpt-oss-120b", provider: "openai", batch: true, promptPerM: 0.037, completionPerM: 0.17 },
];

export const ROSTER_IDS = ROSTER.map((model) => model.id);

export interface JuryCandidate {
  id: string;
  name: string;
  provider: string;
}

/** Cheap, vendor-diverse pool. A juror is dropped when its provider matches the model under test. */
export const JURY_POOL: JuryCandidate[] = [
  { id: "openai/gpt-6-luna", name: "GPT-6 Luna", provider: "openai" },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", provider: "anthropic" },
  { id: "google/gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", provider: "google" },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "deepseek" },
  { id: "z-ai/glm-5.3-flash", name: "GLM-5.3 Flash", provider: "zai" },
  { id: "mistralai/mistral-medium-3-5", name: "Mistral Medium 3.5", provider: "mistral" },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", provider: "meta" },
  { id: "qwen/qwen3.7-plus", name: "Qwen 3.7 Plus", provider: "qwen" },
  { id: "x-ai/grok-4.3", name: "Grok 4.3", provider: "xai" },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", provider: "moonshot" },
  { id: "cohere/command-r-plus-08-2024", name: "Command R+", provider: "cohere" },
  { id: "amazon/nova-lite-v1", name: "Nova Lite", provider: "amazon" },
  { id: "perplexity/sonar", name: "Sonar", provider: "perplexity" },
  { id: "nvidia/nemotron-3.5-lightning", name: "Nemotron 3.5 Lightning", provider: "nvidia" },
  { id: "minimax/minimax-m3", name: "MiniMax M3", provider: "minimax" },
  { id: "microsoft/phi-4", name: "Phi-4", provider: "microsoft" },
];

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  moonshot: "Moonshot",
  zai: "Z.ai",
  meta: "Meta",
  cohere: "Cohere",
  amazon: "Amazon",
  perplexity: "Perplexity",
  nvidia: "NVIDIA",
  minimax: "MiniMax",
  microsoft: "Microsoft",
  nous: "Nous Research",
  stepfun: "StepFun",
  inclusion: "InclusionAI",
  writer: "Writer",
  typesafe: "TypeSafe",
  other: "Other",
};

const SLUG_TO_PROVIDER: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  "x-ai": "xai",
  mistralai: "mistral",
  deepseek: "deepseek",
  qwen: "qwen",
  moonshotai: "moonshot",
  "z-ai": "zai",
  "meta-llama": "meta",
  cohere: "cohere",
  amazon: "amazon",
  perplexity: "perplexity",
  nvidia: "nvidia",
  minimax: "minimax",
  microsoft: "microsoft",
  nousresearch: "nous",
  stepfun: "stepfun",
  inclusionai: "inclusion",
  writer: "writer",
  typesafe: "typesafe",
};

export function providerIdOf(modelId: string): string {
  const slug = modelId.split("/")[0] ?? "";
  return SLUG_TO_PROVIDER[slug] ?? "other";
}

export function providerName(providerId: string): string {
  return PROVIDER_NAMES[providerId] ?? providerId;
}

export function rosterById(id: string): RosterModel | undefined {
  return ROSTER.find((model) => model.id === id);
}

export function displayName(modelId: string, catalogName?: string): string {
  const known = rosterById(modelId);
  if (known) return known.name;
  if (catalogName) {
    const parts = catalogName.split(":");
    const trimmed = (parts.length > 1 ? parts.slice(1).join(":") : parts[0]).trim();
    return trimmed || modelId;
  }
  const slug = modelId.split("/").slice(1).join("/");
  return slug || modelId;
}

export function speakerName(modelId: string): string {
  const name = displayName(modelId);
  if (name.toLowerCase().includes("qwen")) return "Qwen";
  if (name.toLowerCase().includes("claude")) return "Claude";
  if (name.toLowerCase().includes("gpt")) return "GPT";
  if (name.toLowerCase().includes("gemini")) return "Gemini";
  if (name.toLowerCase().includes("grok")) return "Grok";
  if (name.toLowerCase().includes("mistral")) return "Mistral";
  if (name.toLowerCase().includes("deepseek")) return "DeepSeek";
  if (name.toLowerCase().includes("kimi")) return "Kimi";
  if (name.toLowerCase().includes("glm") || name.toLowerCase().includes("llama")) {
    return name.split(" ")[0];
  }
  return name.split(" ")[0];
}


