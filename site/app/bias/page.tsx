import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeroBackdrop } from "@/components/hero/product-hero-backdrop";
import { ProviderLogo } from "@/components/bias/provider-logo";
import { Stat } from "@/components/bias/ui";
import { InfoTip } from "@/components/bias/info-tip";
import { EXPLORER_URL, HERO, INFO, LEADERBOARD, PRODUCT_LINE } from "@/lib/bias/copy";
import { getQuestionSetMeta } from "@/lib/bias/questions";
import { ROSTER } from "@/lib/bias/roster";
import { allRuns, hasRepeatRuns, measuredBoard, pct, positionRate } from "@/lib/bias/site";

export const metadata: Metadata = {
  description: PRODUCT_LINE,
  alternates: { canonical: "https://bias.verafy.ai/bias" },
  openGraph: { title: "Verafy Bias Detector", description: PRODUCT_LINE, url: "https://bias.verafy.ai/bias" },
};

const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-center text-base";

export default function BiasHomePage() {
  const meta = getQuestionSetMeta();
  const board = measuredBoard();
  const cards = allRuns().filter((run) => run.listable).length;

  return (
    <div className="space-y-10">
      <link rel="preload" as="image" href="/bias-hero.avif" type="image/avif" fetchPriority="high" />
      <section className="bias-hero product-hero product-hero--band card-entrance">
        <ProductHeroBackdrop avifSrc="/bias-hero.avif" webpSrc="/bias-hero.webp" width={1168} height={784} priority />
        <div className="product-hero__content">
          <p className="product-hero__kicker mt-1 text-base">{HERO.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight">
            {hasRepeatRuns() ? HERO.headlineTrend : HERO.headline}
          </h1>
          <div className="product-hero__lede mt-4 max-w-2xl space-y-3">
            {HERO.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/bias/benchmark" className={`${BUTTON} bg-teal-500 text-white hover:bg-teal-400`}>
              Run benchmark
            </Link>
            <Link href="/bias/leaderboard" className={`${BUTTON} product-hero__button border`}>
              Leaderboard
            </Link>
            <a href={EXPLORER_URL} className={`${BUTTON} product-hero__button border`}>
              Verafy Explorer
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Scored questions"
          value={String(meta.benchmarkCount)}
          tip="Questions from the bank that every model on the board is run against. A score is only comparable to another score from the same bank version and hash, so both travel with every report card."
        />
        <Stat
          label="Version"
          value={`v${meta.version}`}
          hint={meta.hash.slice(0, 12)}
          tip="The question bank this board was scored against, and its content hash. Change a question and the hash changes, which is what stops two incomparable runs being plotted as a trend."
        />
        <Stat
          label="Models tracked"
          value={String(ROSTER.length)}
          hint="Plus any model on OpenRouter"
          tip="The models on the standing leaderboard. Any model available on OpenRouter can be benchmarked on demand; these are the ones kept current."
        />
        <Stat
          label="Report cards"
          value={String(cards)}
          tip="Measured report cards published from full passes over the bank. Each stored run is sealed with a content hash, so a published score cannot be quietly revised."
        />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">{LEADERBOARD.heading}</h2>
          <span className="flex gap-4">
            <Link href="/bias/questions" className="text-base text-teal-600 dark:text-teal-300">
              Questions
            </Link>
            <Link href="/bias/leaderboard" className="text-base text-teal-600 dark:text-teal-300">
              Full board
            </Link>
          </span>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {board.map((row) => (
            <li key={row.model} className="card-entrance rounded-xl border bg-card p-4">
              <Link href={`/bias/models/${row.model}`} className="flex items-center gap-3">
                <ProviderLogo provider={row.provider} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.model} · answer rate {pct(positionRate(row.card))} · hedged {pct(row.card.hedgeRate)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-2xl font-semibold">{row.card.magnitude.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">magnitude</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center text-sm text-muted-foreground">
          Bias magnitude runs from 0 to 100. {LEADERBOARD.hedgeNote}
          <InfoTip label="Bias magnitude" body={INFO.magnitude} />
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["1", "The model answers", "Each question is scrambled and reworded before it reaches the model, which answers it like any other prompt."],
          ["2", "A cross-vendor jury reads it", "Models from other companies place the answer on the axes the question bears on. Same-company jurors are excluded and model names are hidden."],
          ["3", "The card is sealed", "The run is stored with its bank version, bank hash and a content hash over every answer and verdict, so it cannot be revised after publication."],
        ].map(([step, title, body]) => (
          <div key={step} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-teal-600 dark:text-teal-300">Step {step}</p>
            <h3 className="mt-1 font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
