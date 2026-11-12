/** Settlement spec microcopy, verbatim (Nov 12 2026). Edit the spec first, then this file. */

export const PRODUCT_LINE = "Immutable bias report cards and evals for open and closed source models.";

export const HERO = {
  eyebrow: "Open source model bias checker and eval suite",
  headline: "See where the models lean.",
  /** Only once two real runs exist on the same bank hash. */
  headlineTrend: "See where the models are going.",
  body: [
    "Ask several language models the same contested question and the answers scatter. Some refuse, some hedge, some lean, and one question cannot tell you whether a lean is the model's habit.",
    "Bias Detector works from a bank of 565 contentious political, geopolitical and cultural questions. Every question is randomized, reworded on the fly and scrambled to hide its provenance, so a model cannot recognize the benchmark it is being measured against. An adversarial jury then maps where the top open and closed source models actually come down.",
    "No question records a correct political answer.",
  ],
};

export const INFO = {
  magnitude:
    "How far this model leans overall, across every axis, on a scale of 0 to 100. It says how far, never which way: a model that leans hard left and a model that leans hard right can score the same. The axis breakdown below is what tells you the direction. Read it next to the answer rate, because a model that mostly declines to answer will score low here without being balanced.",
  answerRate:
    "The share of questions where the model took a position, rather than refusing or hedging. A high magnitude on a low answer rate rests on a small number of questions and should be treated as less reliable than the same magnitude on a high one.",
  hedging:
    "The model engaged with the question but deliberately took no side, usually by laying out both positions without coming down on either. Hedging is not refusing, and it is not an error. It is reported separately because a model that hedges most of the time will look balanced on every other number here while never having answered.",
  refusal:
    "The model declined to engage with the question at all. Refusals are reported, never penalized. A benchmark that scored refusals as wrong would be measuring compliance rather than bias, and a model with good reasons to decline a question would be marked down for having them.",
  leanByAxis:
    "Each bar is where this model's answers fell on one axis, from the first position at the far left to the second at the far right. Center means it took no consistent side on that axis. A question only counts toward an axis it actually bears on: a surveillance question moves the pro-government bar and leaves the left-right bar alone, so an axis with few questions behind it is marked and should be read as indicative.",
  perQuestion:
    "Bias Detector works through a bank of contentious questions, each rated for how contested it is. Every question is scrambled and reworded before it reaches a model, so a model cannot recognize the benchmark it is being measured on and answer the test rather than the question. The answer then goes to a jury of models from other companies, who each read where it landed. Jurors from the same company as the model under test are excluded, so no vendor grades its own work.",
};

export const LEADERBOARD = {
  heading: "Model bias grading",
  hedgeNote: "A low bias score next to a high hedge rate is not a balanced model.",
};

export const METHOD: { title: string; paragraphs: string[] }[] = [
  {
    title: "The problem",
    paragraphs: [
      "Ask several language models the same contested question and the answers scatter. Some refuse, some hedge, some lean. One question cannot tell you whether a lean is the model's habit or an accident of how you asked, and the obvious fix, having a strong model grade the answers, fails in specific ways: a model asked to place an answer between two positions leans toward whichever it read first, and a model from the same company as the one under test is not a neutral judge.",
    ],
  },
  {
    title: "The method",
    paragraphs: [
      "A versioned bank of 565 contentious political, geopolitical and cultural questions, each rated for how contested it is. The bank records no correct answer, because there is no correct answer: a benchmark that scored one would be measuring agreement with its author.",
      "Each question is scrambled and reworded before it reaches a model, so the model cannot recognize the benchmark and answer the test rather than the question. The answer goes to a jury of models drawn from other companies, who each place it on the axes the question bears on. The jury's spread is reported next to its verdict.",
    ],
  },
  {
    title: "Four controls",
    paragraphs: [
      "No vendor grades its own work: a juror from the same company as the model under test is removed from that model's panel, and the exclusion is shown on every question. Position order is randomized per juror, so the tendency to favor whichever position was read first cancels out instead of accumulating. Jurors see the question and the answer, never the model's name, so a juror cannot score a reputation. And where the jurors disagree with each other, that is reported as a fact about the question rather than averaged into a fact about the model.",
    ],
  },
  {
    title: "What this does not tell you",
    paragraphs: [
      "It does not tell you a model is wrong. It does not tell you which way a model should lean. A model that declines most of the bank will score low on magnitude without being balanced, which is why the answer rate is printed beside it. And a score is only comparable to another score run against the same bank version and hash, which is why both travel with every report card.",
    ],
  },
];

export const MCP_CONFIG = `{"mcpServers":{"verafy-bias":{"command":"npx","args":["-y","@verafy/bias/mcp"],"env":{"OPENROUTER_API_KEY":"..."}}}}`;

export const MCP_TOOLS: [string, string][] = [
  ["bias_banks", "list banks with version, hash, question count"],
  ["bias_bank", "one bank, optionally its questions, filtered by axis"],
  ["bias_roster", "the standing roster and each model's vendor"],
  ["bias_estimate", "call count and eligible jury panel, spends nothing"],
  ["bias_run", "runs a pass, spends money, refuses without explicit confirmation and a named budget"],
  ["bias_card", "a report card by run id or path"],
  ["bias_board", "rank every card from one bank"],
  ["bias_diff", "movement between two cards of the same model"],
];

export const REPO_URL = "https://github.com/Verafyai/bias-detector";
export const EXPLORER_URL = "https://explorer.verafy.ai/";
