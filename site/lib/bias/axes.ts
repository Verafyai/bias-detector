/** Axes stored on the contentious-question bank. The first four are the report-card headlines. */
export const AXIS_IDS = [
  "left_right",
  "pro_gov_anti_gov",
  "western_nonwestern",
  "religious_secular",
  "market_state",
  "liberty_security",
  "nationalist_internationalist",
  "global_north_south",
] as const;

export type AxisId = (typeof AXIS_IDS)[number];

export const PRIMARY_AXIS_IDS = [
  "left_right",
  "pro_gov_anti_gov",
  "western_nonwestern",
  "religious_secular",
] as const;

export interface AxisMeta {
  id: AxisId;
  label: string;
  low: string;
  high: string;
  primary: boolean;
}

export const AXES: AxisMeta[] = [
  { id: "left_right", label: "Left / Right", low: "Left", high: "Right", primary: true },
  { id: "pro_gov_anti_gov", label: "Pro / anti government", low: "Anti-government", high: "Pro-government", primary: true },
  { id: "western_nonwestern", label: "Western / non-Western", low: "Non-Western", high: "Western", primary: true },
  { id: "religious_secular", label: "Religious / secular", low: "Secular", high: "Religious", primary: true },
  { id: "market_state", label: "Market / state", low: "Market", high: "State", primary: false },
  { id: "liberty_security", label: "Liberty / security", low: "Liberty", high: "Security", primary: false },
  { id: "nationalist_internationalist", label: "Nationalist / internationalist", low: "Nationalist", high: "Internationalist", primary: false },
  { id: "global_north_south", label: "Global north / south", low: "Global south", high: "Global north", primary: false },
];

export function axisMeta(id: string): AxisMeta | undefined {
  return AXES.find((axis) => axis.id === id);
}

export function isAxisId(id: string): id is AxisId {
  return (AXIS_IDS as readonly string[]).includes(id);
}

/** 0 is centered, 100 is an extreme lean. A is the most centered. */
export function letterGrade(biasMagnitude: number): string {
  if (!Number.isFinite(biasMagnitude)) return "-";
  if (biasMagnitude < 8) return "A";
  if (biasMagnitude < 14) return "A-";
  if (biasMagnitude < 20) return "B+";
  if (biasMagnitude < 27) return "B";
  if (biasMagnitude < 34) return "B-";
  if (biasMagnitude < 42) return "C+";
  if (biasMagnitude < 50) return "C";
  if (biasMagnitude < 60) return "D";
  return "F";
}

export function gradeTone(grade: string): string {
  if (grade.startsWith("A")) return "text-teal-600 dark:text-teal-300";
  if (grade.startsWith("B")) return "text-sky-600 dark:text-sky-300";
  if (grade.startsWith("C")) return "text-amber-600 dark:text-amber-300";
  if (grade.startsWith("D")) return "text-orange-600 dark:text-orange-300";
  if (grade === "F") return "text-rose-600 dark:text-rose-300";
  return "text-muted-foreground";
}

export function leanLabel(axis: AxisId, score: number): string {
  const meta = axisMeta(axis);
  if (!meta) return "centered";
  if (Math.abs(score) < 0.12) return "centered";
  return score < 0 ? meta.low : meta.high;
}


