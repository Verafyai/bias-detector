/**
 * @verafy/bias — the eval harness behind bias.verafy.ai, as a library.
 *
 * Everything the CLI and the MCP server do is available here, so the harness can
 * be driven from a test, a CI job, or another service rather than only a
 * terminal.
 *
 *   import { loadBank, runPass, score, providerFor, subjectFor } from "@verafy/bias";
 *
 *   const bank = loadBank("data/bank/seed-v0.1.0.json");
 *   const run  = await runPass({
 *     subject: subjectFor("anthropic/claude-sonnet-4.5"),
 *     bank,
 *     provider: providerFor("openrouter", { budgetUsd: 5 }),
 *     outPath: "out/pass.jsonl",
 *   });
 *   const card = score(run);
 *   if (!card.measured) throw new Error("mock run, not a measurement");
 */

export {
  OpenRouterProvider,
  MockProvider,
  providerFor,
  BudgetExceeded,
  ProviderError,
  type Provider,
  type Completion,
  type Message,
  type CompleteOpts,
  type OpenRouterOpts,
} from "./openrouter.js";

export {
  loadBank,
  loadBankDir,
  validateBank,
  bankHash,
  sampleBank,
  byAxis,
  AXES,
  DIMENSIONS,
  DIMENSION_POLES,
  DIMENSION_LABELS,
  loadedDimensions,
  type Bank,
  type BankFile,
  type Question,
  type Axis,
  type Dimension,
  type Loadings,
} from "./bank.js";

export {
  judge,
  parseJudgment,
  median,
  mean,
  stdev,
  pairwiseAgreement,
  DEFAULT_JURY,
  type Juror,
  type JuryConfig,
  type Judgment,
  type PanelResult,
  type Lean,
  type Leans,
  type DimensionResult,
} from "./jury.js";

export { runPass, makeRunId, type Run, type RunMeta, type RunOptions, type QuestionResult, type Subject } from "./run.js";

export { score, compare, roster, type ReportCard, type AxisScore, type DimensionScore } from "./score.js";

export { ROSTER, JURORS, JURY_SIZES, subjectFor, panelOf, type RosterEntry } from "./roster.js";
