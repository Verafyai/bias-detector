/**
 * The question bank.
 *
 * A bank is a versioned, content-addressed set of contentious questions. The
 * bank records no correct answer: there is no right position on whether abortion
 * should be legal, and a benchmark that scored one would be measuring agreement
 * with its author rather than a model's lean.
 *
 * Versioning is the point. A report card is only comparable to another report
 * card run against the same bank hash, so the hash travels with every result and
 * the scorer refuses to compare across banks.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Axis = "political" | "geopolitical" | "cultural" | "economic" | "social";

/**
 * The four bias dimensions, each with fixed poles.
 *
 * A single lean is not enough, and collapsing to one would throw away the most
 * interesting result. A question about surveillance loads on pro/anti-government
 * and barely at all on left/right. A model can be centered on left/right and
 * strongly pro-government at the same time, and a scalar hides exactly that.
 *
 * The dimensions are fixed rather than per-question so that a tilt on one
 * dimension means the same thing across the whole bank and can be summed.
 */
export type Dimension = "left-right" | "gov" | "west" | "religion";

export const DIMENSIONS: Dimension[] = ["left-right", "gov", "west", "religion"];

/** [negative pole, positive pole] for each dimension. */
export const DIMENSION_POLES: Record<Dimension, [string, string]> = {
  "left-right": ["the political left", "the political right"],
  gov: ["less state power and intervention", "more state power and intervention"],
  west: ["non-Western perspectives and interests", "Western perspectives and interests"],
  religion: ["secular framing and authority", "religious framing and authority"],
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  "left-right": "left / right",
  gov: "anti / pro government",
  west: "non-Western / Western",
  religion: "secular / religious",
};

/** How strongly a question bears on a dimension. 0 means not at all. */
export type Loadings = Partial<Record<Dimension, number>>;

export interface Question {
  /** Stable within a bank version. Never reused for different text. */
  id: string;
  text: string;
  /** Subject category, for breakdowns. Not a bias dimension. */
  axis: Axis;
  /**
   * Which bias dimensions this question bears on, and how strongly, 0 to 1.
   * A question is only scored on the dimensions it loads on, so a surveillance
   * question does not contribute noise to the left/right tilt.
   */
  dimensions: Loadings;
  /**
   * The two poles of the disagreement, in the terms its own partisans would use.
   * Context for the jurors. Scoring happens on the fixed dimensions above, not
   * on these, so a per-question pole ordering cannot skew a dimension's tilt.
   */
  poles: [string, string];
  /** Optional free-text note for jurors: scope, a term of art, a common conflation. */
  note?: string;
  tags?: string[];
}

export interface Bank {
  version: string;
  name: string;
  /** sha256 over the canonical serialization of the questions. */
  hash: string;
  questions: Question[];
  /** True when this is the small seed bank shipped with the repo rather than a production bank. */
  seed: boolean;
}

export interface BankFile {
  version: string;
  name: string;
  seed?: boolean;
  questions: Question[];
}

const AXES: Axis[] = ["political", "geopolitical", "cultural", "economic", "social"];

export function loadBank(path: string): Bank {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as BankFile;
  return validateBank(parsed);
}

export function loadBankDir(dir: string): Bank[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadBank(join(dir, f)))
    .sort((a, b) => a.version.localeCompare(b.version));
}

export function validateBank(file: BankFile): Bank {
  if (!file.version || typeof file.version !== "string") {
    throw new Error("bank is missing a version string");
  }
  if (!Array.isArray(file.questions) || file.questions.length === 0) {
    throw new Error("bank has no questions");
  }

  const seen = new Set<string>();
  for (const q of file.questions) {
    if (!q.id) throw new Error("question is missing an id");
    if (seen.has(q.id)) throw new Error(`duplicate question id: ${q.id}`);
    seen.add(q.id);
    if (!q.text || q.text.trim().length < 8) throw new Error(`question ${q.id} has no usable text`);
    if (!AXES.includes(q.axis)) throw new Error(`question ${q.id} has an unknown axis: ${q.axis}`);
    if (!Array.isArray(q.poles) || q.poles.length !== 2 || !q.poles[0] || !q.poles[1]) {
      throw new Error(`question ${q.id} needs exactly two named poles`);
    }

    // Key and range errors first. A typo'd dimension name loads on nothing, so
    // checking emptiness first would report "loads on no dimension" for what is
    // really a misspelling, and send the author looking in the wrong place.
    for (const [d, w] of Object.entries(q.dimensions ?? {})) {
      if (!DIMENSIONS.includes(d as Dimension)) {
        throw new Error(
          `question ${q.id} loads on an unknown dimension "${d}". The dimensions are ${DIMENSIONS.join(", ")}.`,
        );
      }
      if (!Number.isFinite(w) || (w as number) < 0 || (w as number) > 1) {
        throw new Error(`question ${q.id} has loading ${w} on ${d}; loadings run from 0 to 1`);
      }
    }

    if (loadedDimensions(q).length === 0) {
      throw new Error(
        `question ${q.id} loads on no bias dimension. Give it at least one of ${DIMENSIONS.join(", ")} with a weight above 0, or remove it from the bank: a question that bears on nothing cannot contribute to a score.`,
      );
    }
  }

  return {
    version: file.version,
    name: file.name ?? file.version,
    hash: bankHash(file.questions),
    questions: file.questions,
    seed: file.seed === true,
  };
}

/**
 * Canonical hash. Sorted by id, only the fields that change what is asked, so
 * reordering a bank file or editing a juror note does not invalidate past runs,
 * while changing a question's text or poles does.
 */
export function bankHash(questions: Question[]): string {
  const canonical = [...questions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((q) => ({
      id: q.id,
      text: q.text.trim(),
      axis: q.axis,
      poles: [q.poles[0].trim(), q.poles[1].trim()],
      // Loadings change what is scored, so they are part of the identity. Keys
      // sorted so an editor reordering the JSON does not invalidate past runs.
      dimensions: Object.fromEntries(
        Object.entries(q.dimensions ?? {})
          .filter(([, w]) => Number(w) > 0)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** The dimensions a question actually bears on, strongest first. */
export function loadedDimensions(q: Question): Dimension[] {
  return DIMENSIONS.filter((d) => Number(q.dimensions?.[d] ?? 0) > 0).sort(
    (a, b) => Number(q.dimensions?.[b] ?? 0) - Number(q.dimensions?.[a] ?? 0),
  );
}

export function sampleBank(bank: Bank, n: number, seed = 1): Bank {
  if (n >= bank.questions.length) return bank;
  // Deterministic: a seeded shuffle so --sample N is reproducible.
  const rng = mulberry(seed);
  const pool = [...bank.questions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, n);
  return { ...bank, questions: picked, hash: `${bank.hash}#sample-${n}-${seed}` };
}

export function byAxis(bank: Bank): Record<Axis, Question[]> {
  const out = {} as Record<Axis, Question[]>;
  for (const a of AXES) out[a] = [];
  for (const q of bank.questions) out[q.axis].push(q);
  return out;
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { AXES };
