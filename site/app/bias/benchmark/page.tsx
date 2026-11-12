import { HOSTED_RUNS_OPEN } from "@/lib/bias/api/deps";
import { BenchmarkPanel } from "@/components/bias/benchmark-panel";
import { getBenchmarkQuestions } from "@/lib/bias/questions";
import { ROSTER } from "@/lib/bias/roster";
import { measuredBoard } from "@/lib/bias/site";

export const metadata = { title: { absolute: "Benchmark · Verafy Bias Detector" } };

export default function BenchmarkPage() {
  const board = measuredBoard();
  const costs = board.map((run) => run.costUsd);
  const measuredCost = costs.length
    ? { min: Math.min(...costs), max: Math.max(...costs), runs: costs.length, jurySize: board[0].jurySize }
    : null;
  return (
    <BenchmarkPanel
      models={ROSTER.map((model) => ({ id: model.id, name: model.name }))}
      bankSize={getBenchmarkQuestions().length}
      measuredCost={measuredCost}
      hostedRuns={HOSTED_RUNS_OPEN}
    />
  );
}
