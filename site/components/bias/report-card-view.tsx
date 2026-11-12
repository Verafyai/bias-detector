import Link from "next/link";
import { InfoTip } from "@/components/bias/info-tip";
import { ProviderLogo } from "@/components/bias/provider-logo";
import { AnswerBreakdown, LeanBars, SectionTitle, Stat } from "@/components/bias/ui";
import { INFO } from "@/lib/bias/copy";
import type { DimensionId } from "@/lib/bias/api/dimensions";
import type { ItemResult } from "@/lib/bias/api/report-card";
import type { PublishedRun } from "@/lib/bias/api/store";
import { LIVE_JURY_POOL } from "@/lib/bias/live/run";
import { displayName, providerIdOf, providerName } from "@/lib/bias/roster";
import { contentiousness, dimensionLabel, pct, positionRate, questionText, signed } from "@/lib/bias/site";

export const PAGE_SIZE = 6;

function itemAgreement(item: ItemResult): number | null {
  const values: number[] = [];
  for (const dim of item.dimensions) {
    const scores = item.jurors.map((j) => j.scores[dim]).filter((v): v is number => typeof v === "number");
    if (scores.length) values.push(1 - (Math.max(...scores) - Math.min(...scores)) / 2);
  }
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function readOf(scores: Partial<Record<DimensionId, number>>, refused: boolean, hedged: boolean): string {
  if (refused) return "refused";
  const parts = Object.entries(scores).map(([dim, value]) => `${dimensionLabel(dim as DimensionId).label} ${signed(value as number)}`);
  return `${hedged ? "hedged · " : ""}${parts.join(" · ") || "no score"}`;
}

export function ReportCardView({ run, page, basePath, listable }: { run: PublishedRun; page: number; basePath: string; listable: boolean }) {
  const card = run.card;
  const provider = providerIdOf(run.model);
  const excluded = LIVE_JURY_POOL.filter((id) => providerIdOf(id) === provider || id === run.model);
  const pageCount = Math.max(1, Math.ceil(run.items.length / PAGE_SIZE));
  const current = Math.min(pageCount, Math.max(1, page));
  const items = run.items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-8 pt-8">
      <header className="flex flex-wrap items-start gap-4">
        <ProviderLogo provider={provider} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Bias report card</p>
          <h1 className="text-3xl font-semibold tracking-tight">{displayName(run.model)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.model} · bank {run.bankVersion} · hash {run.bankHash.slice(0, 12)} · scored {run.completedAt.slice(0, 10)}
          </p>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Run <Link className="underline" href={`/bias/runs/${run.runId}`}>{run.runId}</Link> · sealed sha256 {run.sha256}
          </p>
        </div>
      </header>

      {!listable ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          This run is incomplete: {card.nFailed} of {card.n + card.nFailed} questions failed to return an answer or a verdict, more
          than the 5% the leaderboard allows. It is kept as a sealed record and is not this model&rsquo;s listed card.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Bias magnitude" value={card.magnitude.toFixed(1)} hint="0 to 100" tip={INFO.magnitude} />
        <Stat label="Answer rate" value={pct(positionRate(card))} hint={`${card.answered - card.hedged} of ${card.n} took a position`} tip={INFO.answerRate} />
        <Stat label="Hedging" value={pct(card.hedgeRate)} hint={`${card.hedged} of ${card.n}`} tip={INFO.hedging} />
        <Stat label="Refusal" value={pct(card.refusalRate)} hint={`${card.refused} of ${card.n}`} tip={INFO.refusal} />
      </section>

      <section className="grid gap-6 rounded-xl border bg-card p-5 md:grid-cols-2">
        <div className="flex flex-col justify-center">
          <SectionTitle icon="⇆" tip={INFO.leanByAxis} tipLabel="Lean by axis">Lean by axis</SectionTitle>
          <div className="mt-4 flex-1">
            <LeanBars dims={card.byDimension} />
          </div>
        </div>
        <div className="flex flex-col justify-center gap-5">
          <div>
            <h3 className="flex items-center font-semibold">Answer rate<InfoTip label="Answer rate" body={INFO.answerRate} /></h3>
            <div className="mt-3"><AnswerBreakdown card={card} /></div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Jury agreement</dt><dd className="text-lg font-semibold">{pct(card.juryAgreement)}</dd></div>
            <div><dt className="text-muted-foreground">Disputed items</dt><dd className="text-lg font-semibold">{card.nDisputed}</dd></div>
            <div><dt className="text-muted-foreground">Run cost</dt><dd className="text-lg font-semibold">${run.costUsd.toFixed(2)}</dd></div>
          </dl>
          {card.caveats.length ? (
            <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
              {card.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle icon="?" tip={INFO.perQuestion} tipLabel="Per-question results">Per-question results</SectionTitle>
        <p className="rounded-lg border-l-4 border-teal-500 bg-teal-500/10 px-4 py-3 text-base">
          Same-provider jurors excluded: {excluded.length ? excluded.map((id) => displayName(id)).join(", ") : "none in the pool"}
          {" "}({providerName(provider)} models never read {displayName(run.model)}).
        </p>
        <ol className="space-y-4">
          {items.map((item) => {
            const agreement = itemAgreement(item);
            const level = contentiousness(item.questionId);
            return (
              <li key={item.questionId} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[8rem_1fr]">
                <div className="text-xs leading-5 text-muted-foreground">
                  <div>{item.questionId}</div>
                  <div className="">{item.dimensions.map((dim) => dimensionLabel(dim).label).join(", ") || "no axis"}</div>
                  {level ? <div>contentiousness {level} of 5</div> : null}
                </div>
                <div className="min-w-0 space-y-3">
                  <p className="text-lg font-semibold leading-snug">{questionText(item.questionId)}</p>
                  {item.failed || !item.answer ? (
                    <p className="text-sm text-muted-foreground">No scored answer: {item.error ?? "the call failed"}.</p>
                  ) : (
                    <>
                      <details className="text-sm text-muted-foreground">
                        <summary className="cursor-pointer">The model&rsquo;s answer</summary>
                        <p className="mt-2 whitespace-pre-line">{item.answer.text}</p>
                      </details>
                      <ul className="divide-y rounded-lg border text-sm">
                        {item.jurors.map((juror) => (
                          <li key={juror.jurorId}>
                            <details>
                              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 px-3 py-2">
                                <span className="font-medium">{displayName(juror.jurorId)}</span>
                                <span className="text-muted-foreground">1 of {item.jurors.length} votes</span>
                                <span className="tabular-nums">
                                  {readOf(juror.scores, juror.refused, juror.hedged)}
                                  {juror.hedged && !juror.refused ? <InfoTip label="Hedged" body={INFO.hedging} /> : null}
                                </span>
                              </summary>
                              <p className="px-3 pb-3 text-muted-foreground">{juror.rationale}</p>
                            </details>
                          </li>
                        ))}
                      </ul>
                      <p className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold">{agreement === null ? "n/a" : pct(agreement)}</span>
                        <span className="text-xs text-muted-foreground">jury agreement{item.triaged ? " · settled by the first two jurors" : ""}</span>
                      </p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <nav className="flex items-center justify-between text-sm">
          {current > 1 ? <Link href={`${basePath}?page=${current - 1}`} className="text-teal-600 dark:text-teal-300">Previous</Link> : <span />}
          <span className="text-muted-foreground">Page {current} of {pageCount}</span>
          {current < pageCount ? <Link href={`${basePath}?page=${current + 1}`} className="text-teal-600 dark:text-teal-300">Next</Link> : <span />}
        </nav>
      </section>
    </div>
  );
}
