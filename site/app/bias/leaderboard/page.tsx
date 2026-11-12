import Link from "next/link";
import { InfoTip } from "@/components/bias/info-tip";
import { ProviderLogo } from "@/components/bias/provider-logo";
import { letterGrade } from "@/lib/bias/axes";
import { DIMENSIONS } from "@/lib/bias/api/dimensions";
import { INFO, LEADERBOARD } from "@/lib/bias/copy";
import { getQuestionSetMeta } from "@/lib/bias/questions";
import { dimensionLabel, gradesSeparate, measuredBoard, pct, positionRate, rosterStatus, signed } from "@/lib/bias/site";

export const metadata = { title: { absolute: "Leaderboard · Verafy Bias Detector" } };

export default function LeaderboardPage() {
  const meta = getQuestionSetMeta();
  const board = measuredBoard();
  const showGrades = gradesSeparate(board, letterGrade);
  const pending = rosterStatus().filter((row) => !row.card);
  const sharedAxes = board.length < 2 ? [] : DIMENSIONS.filter((dim) => {
    const tilts = board.map((row) => row.card.byDimension.find((entry) => entry.dimension === dim)?.tilt ?? 0);
    return tilts.every((tilt) => tilt < 0) || tilts.every((tilt) => tilt > 0);
  }).map((dim) => dimensionLabel(dim).label);

  return (
    <div className="space-y-8 pt-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{LEADERBOARD.heading}</h1>
        <p className="mt-2 text-muted-foreground">
          Measured report cards from full passes over bank v{meta.version}, hash {meta.hash.slice(0, 12)}. Ranked by bias
          magnitude, closest to center first.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center">Bias magnitude<InfoTip label="Bias magnitude" body={INFO.magnitude} /></span>
              </th>
              {showGrades ? <th className="px-3 py-2 font-medium">Grade</th> : null}
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center">Answer rate<InfoTip label="Answer rate" body={INFO.answerRate} /></span>
              </th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center">Hedged<InfoTip label="Hedging" body={INFO.hedging} /></span>
              </th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center">Refused<InfoTip label="Refusal" body={INFO.refusal} /></span>
              </th>
              {DIMENSIONS.map((dim) => (
                <th key={dim} className="px-3 py-2 font-medium">{dimensionLabel(dim).label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.map((row, index) => (
              <tr key={row.model} className="border-t">
                <td className="px-3 py-3">
                  <Link href={`/bias/models/${row.model}`} className="flex items-center gap-2 hover:text-teal-600 dark:hover:text-teal-300">
                    <span className="w-5 text-muted-foreground">{index + 1}</span>
                    <ProviderLogo provider={row.provider} size={26} />
                    <span>
                      <span className="block font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground">{row.model}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-base font-semibold">{row.card.magnitude.toFixed(1)}</td>
                {showGrades ? <td className="px-3 py-3">{letterGrade(row.card.magnitude)}</td> : null}
                <td className="px-3 py-3">{pct(positionRate(row.card))}</td>
                <td className="px-3 py-3">{pct(row.card.hedgeRate)}</td>
                <td className="px-3 py-3">{pct(row.card.refusalRate)}</td>
                {DIMENSIONS.map((dim) => {
                  const score = row.card.byDimension.find((entry) => entry.dimension === dim);
                  return (
                    <td key={dim} className="px-3 py-3 tabular-nums">
                      {score && score.n > 0 ? signed(score.tilt) : <span className="text-muted-foreground">no data</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        {LEADERBOARD.hedgeNote} Axis columns run from -1 (first position) to +1 (second position): left to right,
        anti-government to pro-government, non-Western to Western, secular to religious.
        {showGrades ? null : " Letter grades are not shown because they do not separate these models; the magnitude and the axis breakdown carry the ranking."}
      </p>
      {sharedAxes.length ? (
        <p className="text-sm text-muted-foreground">
          On {sharedAxes.join(" and ")}, every measured model leans the same way. Every juror reads a model from a different
          company, but the jury pool is drawn from the same industry, so a shared lean may say as much about the jury as about
          the models. Read the per-question rationales on each card before quoting a lean.
        </p>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Not yet measured</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These roster models have no measured report card yet, so no score is shown for them. A model with a stored run
          that did not meet the listing bar (more than 5% of questions failed) links to that run.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map(({ model, unlisted }) => (
            <li key={model.id} className="flex items-center gap-3 rounded-lg border p-3">
              <ProviderLogo provider={model.provider} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.id}</span>
              </span>
              {unlisted[0] ? (
                <Link href={`/bias/runs/${unlisted[0].runId}`} className="text-xs text-teal-600 dark:text-teal-300">
                  Incomplete run
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">No run yet</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
