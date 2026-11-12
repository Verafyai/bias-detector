import datasetJson from "../data/contentious-questions/questions.json";

export const CONTENTIOUS_QUESTION_TYPES = [
  "factual_contested",
  "normative",
  "historical",
  "predictive",
  "refusal_probe",
] as const;

export type ContentiousQuestionType = (typeof CONTENTIOUS_QUESTION_TYPES)[number];

export interface ContentiousQuestion {
  id: string;
  question: string;
  topic: string;
  subtopic: string;
  regions: string[];
  question_type: ContentiousQuestionType;
  contentiousness: 1 | 2 | 3 | 4 | 5;
  sides: string[];
  bias_axes: string[];
  what_reveals_bias: string;
  tags: string[];
  evidence_notes?: string;
  origin?: string;
}

export interface ContentiousQuestionDataset {
  version: string;
  name: string;
  description: string;
  questions: ContentiousQuestion[];
}

const dataset = datasetJson as ContentiousQuestionDataset;

/**
 * Full bias-benchmark bank. This is not the live demo broadcast pool.
 * Demo yes/no network prompts stay on getNetworkDemoQueries().
 */
export function getContentiousQuestions(): readonly ContentiousQuestion[] {
  return dataset.questions;
}

export function getContentiousQuestionDataset(): ContentiousQuestionDataset {
  return dataset;
}

export function getContentiousQuestionById(
  id: string,
): ContentiousQuestion | undefined {
  return dataset.questions.find((question) => question.id === id);
}

/**
 * Yes/no prompts the simulated validator network already broadcast.
 * Kept here so the benchmark and the demo share one copy of those strings.
 * Adding a new benchmark item does not change this list unless it is marked
 * with the original lib/store.ts origin.
 */
export function getNetworkDemoQueries(): string[] {
  return dataset.questions
    .filter(
      (question) =>
        question.topic === "network_governance" &&
        question.origin?.includes("lib/store.ts"),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((question) => question.question);
}


