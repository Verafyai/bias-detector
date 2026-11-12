import { createHash } from "crypto";
import {
  getContentiousQuestionById,
  getContentiousQuestionDataset,
  getContentiousQuestions,
  type ContentiousQuestion,
} from "@/lib/contentious-questions";

/**
 * Demo prompts that live in the bank so the Swarm Explorer can share one copy.
 * They are not political-bias probes and are left out of every Bias Detector score.
 * cq-0001 is the AI-beneficial placeholder. cq-0002–cq-0011 are network/validator yes/no lines.
 */
export const EXCLUDED_DEMO_IDS: readonly string[] = Array.from({ length: 11 }, (_, index) => {
  return `cq-${String(index + 1).padStart(4, "0")}`;
});

const excluded = new Set(EXCLUDED_DEMO_IDS);

export function isExcludedDemoQuestion(id: string): boolean {
  return excluded.has(id);
}

const benchmarkQuestions: ContentiousQuestion[] = getContentiousQuestions()
  .filter((question) => !excluded.has(question.id))
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id));

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = canonical(source[key]);
    return out;
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const questionSetHash = sha256Hex(canonicalStringify(benchmarkQuestions));

export function getBenchmarkQuestions(): ContentiousQuestion[] {
  return benchmarkQuestions;
}

export function getQuestion(id: string): ContentiousQuestion | undefined {
  if (excluded.has(id)) return undefined;
  return benchmarkQuestions.find((question) => question.id === id) ?? getContentiousQuestionById(id);
}

export function questionsByIds(ids: string[]): ContentiousQuestion[] {
  const wanted = new Set(ids.filter((id) => !excluded.has(id)));
  return benchmarkQuestions.filter((question) => wanted.has(question.id));
}

export function getQuestionSetVersion(): string {
  return getContentiousQuestionDataset().version;
}

export function getQuestionSetHash(): string {
  return questionSetHash;
}

export function getQuestionSetMeta(): {
  version: string;
  name: string;
  description: string;
  bankCount: number;
  benchmarkCount: number;
  hash: string;
} {
  const dataset = getContentiousQuestionDataset();
  return {
    version: dataset.version,
    name: dataset.name,
    description: dataset.description,
    bankCount: dataset.questions.length,
    benchmarkCount: benchmarkQuestions.length,
    hash: questionSetHash,
  };
}

export function getExcludedDemoQuestions(): ContentiousQuestion[] {
  return getContentiousQuestions().filter((question) => excluded.has(question.id));
}

export function getVersionHistory(): {
  version: string;
  released: string;
  summary: string;
  hash: string;
  hashNote: string;
  added: string[];
  excluded: { id: string; question: string; reason: string }[];
  removed: { id: string; question: string; reason: string }[];
  edited: { id: string; change: string }[];
}[] {
  const meta = getQuestionSetMeta();
  return [
    {
      version: meta.version,
      released: "2026-10-11",
      summary:
        "First shipped bank (PR #127). 576 items in data/contentious-questions/questions.json. The Bias Detector scores every item except the 11 demo prompts cq-0001 through cq-0011.",
      hash: meta.hash,
      hashNote: "sha256 of the benchmark subset (bank minus cq-0001 through cq-0011), canonical JSON with sorted keys.",
      added: benchmarkQuestions.map((question) => question.id),
      excluded: getExcludedDemoQuestions().map((question) => ({
        id: question.id,
        question: question.question,
        reason:
          question.id === "cq-0001"
            ? "Explorer demo prompt about AI being beneficial. Held in the bank, excluded from bias scores."
            : "Network and validator demo prompt shared with the Swarm Explorer. Not a political bias probe.",
      })),
      removed: [],
      edited: [],
    },
  ];
}

export const QUESTION_TOPICS = [...new Set(benchmarkQuestions.map((q) => q.topic))].sort();
export const QUESTION_REGIONS = [...new Set(benchmarkQuestions.flatMap((q) => q.regions))].sort();
export const QUESTION_TYPES = [...new Set(benchmarkQuestions.map((q) => q.question_type))].sort();


