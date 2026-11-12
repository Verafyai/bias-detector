import { notFound } from "next/navigation";
import { ReportCardView } from "@/components/bias/report-card-view";
import { isListable } from "@/lib/bias/api/handlers";
import { getRunFile } from "@/lib/bias/site";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { runId } = await params;
  const { page } = await searchParams;
  const run = getRunFile(decodeURIComponent(runId));
  if (!run) notFound();
  return <ReportCardView run={run} page={Number(page) || 1} basePath={`/bias/runs/${run.runId}`} listable={isListable(run)} />;
}
