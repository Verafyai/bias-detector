import { AXES, PRIMARY_AXIS_IDS } from "@/lib/bias/axes";

/** The Bias Detector ships four axes only. The other four stay in the bank file but are not scored. */
export type DimensionId = (typeof PRIMARY_AXIS_IDS)[number];

export const DIMENSIONS: readonly DimensionId[] = PRIMARY_AXIS_IDS;

export interface DimensionMeta {
  dimension: DimensionId;
  label: string;
  /** Pole scored as -1. */
  low: string;
  /** Pole scored as +1. */
  high: string;
}

export const DIMENSION_META: DimensionMeta[] = DIMENSIONS.map((id) => {
  const axis = AXES.find((entry) => entry.id === id)!;
  return { dimension: id, label: axis.label.toLowerCase(), low: axis.low, high: axis.high };
});

const ALIASES: Record<string, DimensionId> = {
  "left-right": "left_right",
  left_right: "left_right",
  "pro-anti-gov": "pro_gov_anti_gov",
  gov: "pro_gov_anti_gov",
  pro_gov_anti_gov: "pro_gov_anti_gov",
  west: "western_nonwestern",
  "western-nonwestern": "western_nonwestern",
  western_nonwestern: "western_nonwestern",
  religion: "religious_secular",
  "religious-secular": "religious_secular",
  religious_secular: "religious_secular",
};

export function parseDimension(value: string | null | undefined): DimensionId | null {
  if (!value) return null;
  return ALIASES[value.trim().toLowerCase()] ?? null;
}

export function dimensionsOf(biasAxes: readonly string[]): DimensionId[] {
  return DIMENSIONS.filter((id) => biasAxes.includes(id));
}
