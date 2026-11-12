import Link from "next/link";
import { DIMENSIONS, dimensionsOf, parseDimension } from "@/lib/bias/api/dimensions";
import { getBenchmarkQuestions, getExcludedDemoQuestions, getQuestionSetMeta } from "@/lib/bias/questions";
import { dimensionLabel } from "@/lib/bias/site";

export const metadata = { title: { absolute: "Questions · Verafy Bias Detector" } };

const PAGE = 25;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ axis?: string; page?: string }> }) {
  const { axis, page } = await searchParams;
  const meta = getQuestionSetMeta();
  const dimension = parseDimension(axis ?? null);
  const all = getBenchmarkQuestions().filter((q) => !dimension || dimensionsOf(q.bias_axes).includes(dimension));
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  const shown = all.slice((current - 1) * PAGE, current * PAGE);
  const href = (p: number) => `/bias/questions?${dimension ? `axis=${dimension}&` : ""}page=${p}`;

  return (
    <div className="space-y-6 pt-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Questions</h1>
        <p className="mt-2 text-muted-foreground">
          Bank v{meta.version}, hash {meta.hash.slice(0, 12)}. {meta.benchmarkCount} scored questions of {meta.bankCount} in the
          file. No question records a correct answer.
        </p>
      </header>
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/bias/questions" className={`rounded-full border px-3 py-1 ${dimension ? "" : "border-teal-500"}`}>All axes</Link>
        {DIMENSIONS.map((dim) => (
          <Link key={dim} href={`/bias/questions?axis=${dim}`} className={`rounded-full border px-3 py-1 ${dimension === dim ? "border-teal-500" : ""}`}>
            {dimensionLabel(dim).label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">{all.length} questions{dimension ? ` bear on ${dimensionLabel(dimension).label}` : ""}.</p>
      <ul className="space-y-3">
        {shown.map((q) => (
          <li key={q.id} className="grid gap-2 rounded-xl border bg-card p-4 md:grid-cols-[8rem_1fr]">
            <div className="text-xs leading-5 text-muted-foreground">
              <div>{q.id}</div>
              <div>{q.topic}</div>
              <div>contentiousness {q.contentiousness} of 5</div>
            </div>
            <div>
              <p className="font-medium">{q.question}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dimensionsOf(q.bias_axes).map((dim) => dimensionLabel(dim).label).join(", ") || "no primary axis"}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <nav className="flex items-center justify-between text-sm">
        {current > 1 ? <Link href={href(current - 1)} className="text-teal-600 dark:text-teal-300">Previous</Link> : <span />}
        <span className="text-muted-foreground">Page {current} of {pages}</span>
        {current < pages ? <Link href={href(current + 1)} className="text-teal-600 dark:text-teal-300">Next</Link> : <span />}
      </nav>
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Left out of every score</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These {getExcludedDemoQuestions().length} items are demo prompts shared with other Verafy products, not political bias
          probes, so no model is scored on them.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {getExcludedDemoQuestions().map((q) => (
            <li key={q.id}><span className="text-muted-foreground">{q.id}</span> {q.question}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
