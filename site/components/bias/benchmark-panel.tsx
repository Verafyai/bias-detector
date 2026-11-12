"use client";

import { useEffect, useMemo, useState } from "react";

const CREDITS_PER_FULL_PASS = 1000;
const FULL_PASS_MODELS = 20;
const STEPS = ["Queued", "Answering", "Jury reading", "Sealing the card", "Published"];

type Job = { runId: string; model: string; status: string; done: number; total: number; error?: string };

function credits(models: number) {
  return Math.round((CREDITS_PER_FULL_PASS / FULL_PASS_MODELS) * models);
}

export function BenchmarkPanel({
  models,
  bankSize,
  measuredCost,
  hostedRuns,
}: {
  models: { id: string; name: string }[];
  bankSize: number;
  measuredCost: { min: number; max: number; runs: number; jurySize: number } | null;
  hostedRuns: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [jurySize, setJurySize] = useState(5);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const total = useMemo(() => credits(selected.length), [selected.length]);

  useEffect(() => {
    const open = jobs.filter((job) => !["complete", "failed", "aborted"].includes(job.status));
    if (!open.length) return;
    const timer = setInterval(async () => {
      const next = await Promise.all(
        jobs.map(async (job) => {
          if (["complete", "failed", "aborted"].includes(job.status)) return job;
          try {
            const res = await fetch(`/api/v1/runs/${encodeURIComponent(job.runId)}`, { cache: "no-store" });
            const body = await res.json();
            const progress = body.progress ?? {};
            return { ...job, status: body.status ?? job.status, done: progress.done ?? job.done, total: progress.total ?? job.total, error: body.error };
          } catch {
            return job;
          }
        }),
      );
      setJobs(next);
    }, 4000);
    return () => clearInterval(timer);
  }, [jobs]);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const started: Job[] = [];
    for (const model of selected) {
      const res = await fetch("/api/v1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ model, bankVersion: "v1.0.0", jurySize }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status !== 202) {
        setMessage(body.message ?? body.error ?? `The run could not start (HTTP ${res.status}).`);
        break;
      }
      started.push({ runId: body.runId, model, status: "queued", done: 0, total: bankSize });
    }
    setJobs((prev) => [...started, ...prev]);
    setBusy(false);
  }

  function step(job: Job) {
    if (job.status === "complete") return STEPS[4];
    if (job.status === "queued") return STEPS[0];
    if (job.status === "running") return job.done >= job.total ? STEPS[3] : job.done > 0 ? STEPS[2] : STEPS[1];
    return job.status === "aborted" ? "Stopped at the budget cap" : "Failed";
  }

  return (
    <div className="space-y-8 pt-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Run the benchmark</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pick models from the roster and run them over all {bankSize} scored questions. Each answer is read by a jury of models
          from other companies, and the finished card is sealed and published.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Models</h2>
            <button type="button" className="text-sm text-teal-600 dark:text-teal-300" onClick={() => setSelected(selected.length === models.length ? [] : models.map((m) => m.id))}>
              {selected.length === models.length ? "Clear" : "Select all 20"}
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {models.map((model) => (
              <li key={model.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(model.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, model.id] : selected.filter((id) => id !== model.id))}
                  />
                  <span className="min-w-0">
                    <span className="block">{model.name}</span>
                    <span className="text-xs text-muted-foreground">{model.id}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Cost</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Full pass, all 20 models</dt><dd>1,000 credits</dd></div>
            <div className="flex justify-between"><dt>One model, full bank</dt><dd>50 credits</dd></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>This run, {selected.length} model{selected.length === 1 ? "" : "s"}</dt><dd>{total.toLocaleString()} credits</dd></div>
          </dl>
          <label className="block text-sm">
            Jury size
            <select value={jurySize} onChange={(e) => setJurySize(Number(e.target.value))} className="mt-1 w-full rounded-md border bg-background px-2 py-2">
              <option value={3}>3 jurors</option>
              <option value={5}>5 jurors</option>
            </select>
          </label>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">Dollar detail</summary>
            <p className="mt-2">
              Up to {(bankSize * (1 + jurySize)).toLocaleString()} model calls per model: one answer per question plus each seated juror.
              Two jurors settle most questions when they agree, so real runs use fewer.
              {measuredCost
                ? ` The ${measuredCost.runs} published cards so far cost between $${measuredCost.min.toFixed(2)} and $${measuredCost.max.toFixed(2)} each in OpenRouter usage, with a jury of ${measuredCost.jurySize}.`
                : ""}
            </p>
          </details>
          <label className="block text-sm">
            Verafy API key
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" className="mt-1 w-full rounded-md border bg-background px-2 py-2" placeholder="X-API-Key" />
          </label>
          <button
            type="button"
            disabled={!hostedRuns || !selected.length || !apiKey || busy}
            onClick={confirm}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-teal-500 px-4 text-base text-white hover:bg-teal-400 disabled:opacity-50"
          >
            Confirm run
          </button>
          {hostedRuns ? null : (
            <p className="text-sm text-muted-foreground">
              Hosted runs are not open on this site yet. The pricing above is what a run costs once they open. Every published
              card is readable now on the leaderboard and through the API.
            </p>
          )}
          {message ? <p className="text-sm text-amber-700 dark:text-amber-300">{message}</p> : null}
        </aside>
      </section>

      <section>
        <h2 className="font-semibold">Pipeline</h2>
        <ol className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
          {STEPS.map((name, index) => (
            <li key={name} className="rounded-full border px-3 py-1">{index + 1}. {name}</li>
          ))}
        </ol>
        {jobs.length ? (
          <ul className="mt-4 space-y-3">
            {jobs.map((job) => (
              <li key={job.runId} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between"><span className="font-medium">{job.model}</span><span>{step(job)}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full bg-teal-500" style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{job.done} of {job.total} questions · {job.runId}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Progress for each model appears here once a run starts.</p>
        )}
      </section>
    </div>
  );
}
