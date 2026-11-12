import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportCardView } from "@/components/bias/report-card-view";
import { ProviderLogo } from "@/components/bias/provider-logo";
import { displayName, providerIdOf, rosterById } from "@/lib/bias/roster";
import { getRunFile, measuredBoard, runsForModel } from "@/lib/bias/site";

export default async function ModelReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ modelId: string[] }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { modelId } = await params;
  const { page } = await searchParams;
  const id = modelId.map(decodeURIComponent).join("/");
  if (!id || id.length > 200) notFound();
  const listed = measuredBoard().find((run) => run.model === id);
  const runs = runsForModel(id);
  const roster = rosterById(id);
  if (!listed && !roster && runs.length === 0) notFound();

  if (listed) {
    const run = getRunFile(listed.runId)!;
    return <ReportCardView run={run} page={Number(page) || 1} basePath={`/bias/models/${id}`} listable />;
  }

  return (
    <div className="space-y-6 pt-8">
      <header className="flex items-center gap-4">
        <ProviderLogo provider={providerIdOf(id)} size={48} />
        <div>
          <p className="text-sm text-muted-foreground">Bias report card</p>
          <h1 className="text-3xl font-semibold tracking-tight">{displayName(id)}</h1>
          <p className="text-sm text-muted-foreground">{id}</p>
        </div>
      </header>
      <div className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Not yet measured</h2>
        <p className="mt-2 text-muted-foreground">
          This model has no measured report card yet, so no score is shown. Scores appear here only after a full pass over
          the bank has been run and sealed.
        </p>
        {runs.length ? (
          <p className="mt-3 text-sm">
            Incomplete runs on record:{" "}
            {runs.map((run, index) => (
              <span key={run.runId}>
                {index ? ", " : ""}
                <Link className="text-teal-600 underline dark:text-teal-300" href={`/bias/runs/${run.runId}`}>{run.runId}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
