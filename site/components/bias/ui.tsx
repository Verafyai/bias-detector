import type { ReactNode } from "react";
import { InfoTip } from "@/components/bias/info-tip";
import { INFO } from "@/lib/bias/copy";
import type { DimensionScore, ReportCard } from "@/lib/bias/api/report-card";
import { dimensionLabel, pct, signed } from "@/lib/bias/site";

export function Stat({ label, value, hint, tip }: { label: string; value: string; hint?: string; tip?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center text-sm text-muted-foreground">
        {label}
        {tip ? <InfoTip label={label} body={tip} /> : null}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ icon, children, tip, tipLabel }: { icon: ReactNode; children: ReactNode; tip?: string; tipLabel?: string }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-semibold">
      <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-teal-600 dark:text-teal-300">
        {icon}
      </span>
      <span>{children}</span>
      {tip ? <InfoTip label={tipLabel ?? String(children)} body={tip} /> : null}
    </h2>
  );
}

/** Minimum questions behind an axis before the bar is read as more than indicative. */
export const THIN_AXIS = 40;

export function LeanBars({ dims }: { dims: DimensionScore[] }) {
  const shown = dims.filter((dim) => dim.n > 0);
  return (
    <div className="flex flex-col justify-center gap-4">
      {shown.map((dim) => {
        const { low, high } = dimensionLabel(dim.dimension);
        const position = 50 + dim.tilt * 50;
        return (
          <div key={dim.dimension}>
            <div className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>{low}</span>
              <span className="text-xs">
                {signed(dim.tilt)} · {dim.n} questions{dim.n < THIN_AXIS ? " · indicative" : ""}
              </span>
              <span>{high}</span>
            </div>
            <div className="relative h-3 rounded-full bg-muted">
              <span className="absolute left-1/2 top-[-3px] h-[18px] w-px bg-muted-foreground/60" aria-hidden />
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-teal-500"
                style={{ left: `${Math.min(98, Math.max(2, position))}%` }}
                aria-label={`${low} / ${high}: ${signed(dim.tilt)}`}
              />
            </div>
          </div>
        );
      })}
      <p className="text-center text-xs text-muted-foreground">Distance from center, -1 to +1</p>
    </div>
  );
}

export function AnswerBreakdown({ card }: { card: ReportCard }) {
  const total = card.n || 1;
  const tookPosition = card.answered - card.hedged;
  const rows: [string, number, string][] = [
    ["Answered", tookPosition, "Took a position."],
    ["Hedged", card.hedged, INFO.hedging],
    ["Refused", card.refused, INFO.refusal],
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="bg-teal-500" style={{ width: `${(tookPosition / total) * 100}%` }} />
        <span className="bg-sky-400" style={{ width: `${(card.hedged / total) * 100}%` }} />
        <span className="bg-zinc-400" style={{ width: `${(card.refused / total) * 100}%` }} />
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {rows.map(([label, count, tip]) => (
          <li key={label}>
            <span className="flex items-center text-muted-foreground">
              {label}
              {label === "Answered" ? null : <InfoTip label={label} body={tip} />}
            </span>
            <span className="text-lg font-semibold">{pct(count / total)}</span>
            <span className="block text-xs text-muted-foreground">{count} of {card.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
