import Link from "next/link";
import { allRuns, pct, positionRate } from "@/lib/bias/site";

export const metadata = { title: { absolute: "Runs · Verafy Bias Detector" } };

export default function RunsPage() {
  const runs = allRuns();
  return (
    <div className="space-y-6 pt-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Runs</h1>
        <p className="mt-2 text-muted-foreground">
          Every stored run, newest first. Each file is sealed with a sha256 over every answer and verdict and is never rewritten.
          Incomplete runs stay on record but are not listed on the leaderboard.
        </p>
      </header>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Magnitude</th>
              <th className="px-3 py-2 font-medium">Answer rate</th>
              <th className="px-3 py-2 font-medium">Calls</th>
              <th className="px-3 py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId} className="border-t">
                <td className="px-3 py-2"><Link className="text-teal-600 dark:text-teal-300" href={`/bias/runs/${run.runId}`}>{run.runId}</Link></td>
                <td className="px-3 py-2">{run.name}</td>
                <td className="px-3 py-2">{run.listable ? "Listed" : `Incomplete, ${run.card.nFailed} failed`}</td>
                <td className="px-3 py-2">{run.listable ? run.card.magnitude.toFixed(1) : <span className="text-muted-foreground">not listed</span>}</td>
                <td className="px-3 py-2">{run.listable ? pct(positionRate(run.card)) : <span className="text-muted-foreground">not listed</span>}</td>
                <td className="px-3 py-2">{run.calls}</td>
                <td className="px-3 py-2">${run.costUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
