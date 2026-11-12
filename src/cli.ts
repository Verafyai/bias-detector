#!/usr/bin/env node
/**
 * bias — run, score and compare eval passes.
 *
 *   bias bank                                   show the bank and its hash
 *   bias run <model> [--sample N] [--jury 5]    run a pass
 *   bias score <run.json>                       print a report card
 *   bias board <card.json...>                   rank report cards from one bank
 *   bias diff <before.json> <after.json>        movement between two passes
 *   bias estimate <model> [--sample N]          price a pass before running it
 *
 * --provider mock runs the whole pipeline deterministically and for nothing. Use
 * it to check a change to the harness. Anything it produces is stamped as
 * unmeasured and the report refuses to be published.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { providerFor } from "./openrouter.js";
import { loadBank, sampleBank, byAxis, DIMENSIONS, DIMENSION_LABELS } from "./bank.js";
import { DEFAULT_JURY } from "./jury.js";
import { runPass, type Run } from "./run.js";
import { score, compare, roster as rank, type ReportCard } from "./score.js";
import { subjectFor, panelOf, ROSTER } from "./roster.js";

const DEFAULT_BANK = "data/bank/seed-v0.1.0.json";
const OUT = "out";

interface Args {
  cmd: string;
  rest: string[];
  flags: Record<string, string | boolean>;
}

function parse(argv: string[]): Args {
  const [cmd = "help", ...tail] = argv;
  const rest: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < tail.length; i++) {
    const a = tail[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = tail[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { cmd, rest, flags };
}

const num = (v: string | boolean | undefined, d: number) =>
  typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : d;

async function main() {
  const { cmd, rest, flags } = parse(process.argv.slice(2));
  const bankPath = resolve(String(flags.bank ?? DEFAULT_BANK));

  switch (cmd) {
    case "bank": {
      const bank = loadBank(bankPath);
      const axes = byAxis(bank);
      console.log(`${bank.name} (${bank.version})`);
      console.log(`hash      ${bank.hash}`);
      console.log(`questions ${bank.questions.length}${bank.seed ? "  [seed bank, not a production bank]" : ""}`);
      console.log("");
      console.log("by subject");
      for (const [axis, qs] of Object.entries(axes)) {
        if (qs.length) console.log(`  ${axis.padEnd(14)} ${qs.length}`);
      }
      console.log("");
      console.log("by bias dimension (a question can load on several)");
      for (const d of DIMENSIONS) {
        const n = bank.questions.filter((q) => Number(q.dimensions?.[d] ?? 0) > 0).length;
        console.log(`  ${DIMENSION_LABELS[d].padEnd(24)} ${n}`);
      }
      return;
    }

    case "roster": {
      for (const r of ROSTER) console.log(`${r.model.padEnd(42)} ${r.vendor.padEnd(10)} ${r.label}`);
      return;
    }

    case "estimate": {
      const model = rest[0];
      if (!model) die("usage: bias estimate <model> [--sample N] [--jury 5]");
      const full = loadBank(bankPath);
      const bank = flags.sample ? sampleBank(full, num(flags.sample, 30)) : full;
      const jurySize = num(flags.jury, 5);
      const subject = subjectFor(model);
      const panel = panelOf(jurySize).filter((j) => j.vendor !== subject.vendor);
      const q = bank.questions.length;
      console.log(`model     ${subject.label} (${subject.vendor})`);
      console.log(`questions ${q}`);
      console.log(`panel     ${panel.length} eligible of ${jurySize} configured`);
      console.log(`calls     ${q} answers + up to ${q} triage + up to ${q * panel.length} juror = ${q * (2 + panel.length)} worst case`);
      console.log("");
      console.log("Cost depends on live OpenRouter prices, so this prints the call count, not a dollar figure.");
      console.log("Run with --provider mock first to confirm the call count, then set BIAS_BUDGET_USD as the hard cap.");
      return;
    }

    case "run": {
      const model = rest[0];
      if (!model) die("usage: bias run <model> [--sample N] [--jury 5] [--provider mock]");

      const kind = flags.provider === "mock" ? "mock" : "openrouter";
      const full = loadBank(bankPath);
      const bank = flags.sample ? sampleBank(full, num(flags.sample, 30)) : full;
      const subject = subjectFor(model, typeof flags.label === "string" ? flags.label : undefined);
      const jurySize = num(flags.jury, 5);

      const provider = providerFor(kind, { budgetUsd: num(flags.budget, 25) });
      const jury = { ...DEFAULT_JURY, jurors: panelOf(jurySize) };

      mkdirSync(OUT, { recursive: true });
      const outPath = join(OUT, `${subject.model.replace(/[^a-z0-9]+/gi, "-")}-${bank.version}.jsonl`);

      console.error(`bank      ${bank.name} (${bank.version}) ${bank.hash.slice(0, 12)}`);
      console.error(`model     ${subject.label}`);
      console.error(`provider  ${kind}${kind === "mock" ? "  [NOT A MEASUREMENT]" : ""}`);
      console.error(`panel     ${jury.jurors.filter((j) => j.vendor !== subject.vendor).length} jurors, ${subject.vendor} excluded`);
      console.error(`questions ${bank.questions.length}`);
      console.error("");

      const run = await runPass({
        subject,
        bank,
        provider,
        jury,
        concurrency: num(flags.concurrency, 4),
        outPath,
        onProgress: (done, total, last) => {
          const mark = last.error ? "!" : last.panel?.disputed ? "?" : last.panel?.triaged ? "." : "+";
          process.stderr.write(mark);
          if (done % 60 === 0 || done === total) {
            process.stderr.write(`  ${done}/${total}  $${provider.spentUsd().toFixed(4)}\n`);
          }
        },
      });

      console.error("");
      const card = score(run);
      const cardPath = join(OUT, `${run.meta.runId}.card.json`);
      writeFileSync(cardPath, `${JSON.stringify(card, null, 2)}\n`);
      printCard(card);
      console.error(`\nrun   ${outPath}.run.json\ncard  ${cardPath}`);
      return;
    }

    case "score": {
      const path = rest[0];
      if (!path) die("usage: bias score <run.json>");
      const run = JSON.parse(readFileSync(path, "utf8")) as Run;
      printCard(score(run));
      return;
    }

    case "board": {
      if (!rest.length) die("usage: bias board <card.json...>");
      const cards = rest.map((p) => JSON.parse(readFileSync(p, "utf8")) as ReportCard);
      const rows = rank(cards);
      console.log(`  #  ${"model".padEnd(26)}  magn  L/R    gov   west    rel  refuse     n`);
      for (const r of rows) {
        const g = (k: string) => fmt(r.tilts[k] ?? 0, 5);
        console.log(
          `${String(r.rank).padStart(3)}  ${r.label.padEnd(26)} ${r.magnitude.toFixed(1).padStart(5)} ${g("left-right")} ${g("gov")} ${g("west")} ${g("religion")}  ${pct(r.refusalRate)}  ${String(r.n).padStart(4)}${r.measured ? "" : "  [mock]"}`,
        );
      }
      console.log("\nMagnitude is how far a model leans overall, 0 to 100. The four columns say which way:\nnegative is left, anti-government, non-Western, secular. Read them next to the refusal rate.");
      return;
    }

    case "diff": {
      const [a, b] = rest;
      if (!a || !b) die("usage: bias diff <before.card.json> <after.card.json>");
      const before = JSON.parse(readFileSync(a, "utf8")) as ReportCard;
      const after = JSON.parse(readFileSync(b, "utf8")) as ReportCard;
      const d = compare(before, after);
      console.log(`${d.model} on ${d.bankVersion}${d.measured ? "" : "  [mock]"}`);
      console.log(`magnitude  ${sign(d.magnitudeDelta)}`);
      console.log(`refusal    ${sign(d.refusalDelta * 100)} points`);
      console.log(`hedge      ${sign(d.hedgeDelta * 100)} points`);
      console.log("");
      for (const dd of d.byDimension) console.log(`  ${dd.label.padEnd(24)} ${sign(dd.tiltDelta)}`);
      return;
    }

    default:
      console.log(
        [
          "bias — the Verafy Bias Detector eval harness",
          "",
          "  bias bank [--bank path]                       the bank and its hash",
          "  bias roster                                   the standing roster",
          "  bias estimate <model> [--sample N]            call count for a pass",
          "  bias run <model> [--sample N] [--jury 5]      run a pass",
          "  bias score <run.json>                         report card from a run",
          "  bias board <card.json...>                     rank cards from one bank",
          "  bias diff <before> <after>                    movement between passes",
          "",
          "  --provider mock    deterministic, free, never a measurement",
          "  --budget N         hard spend cap in USD (default 25)",
          "  --concurrency N    questions in flight (default 4)",
          "",
          "OPENROUTER_API_KEY must be set unless --provider mock is passed.",
        ].join("\n"),
      );
  }
}

function printCard(c: ReportCard) {
  console.log("");
  console.log(`${c.label}  (${c.model})`);
  console.log(`bank ${c.bankVersion} ${c.bankHash.slice(0, 12)}   run ${c.runId}`);
  if (!c.measured) console.log(`\n  NOT A MEASUREMENT: this pass used the mock provider.`);
  console.log("");
  console.log(`  magnitude       ${c.magnitude.toFixed(1).padStart(6)}   how far it leans, 0 to 100`);
  console.log(`  refusal rate    ${pct(c.refusalRate)}   read the magnitude next to this`);
  console.log(`  hedge rate      ${pct(c.hedgeRate)}`);
  console.log(`  jury agreement  ${pct(c.juryAgreement)}   a read on the bank, not the model`);
  console.log(`  triage rate     ${pct(c.triageRate)}   share resolved without the panel`);
  console.log(`  questions       ${c.nUndisputed} scored, ${c.nDisputed} disputed, ${c.nFailed} failed`);
  console.log(`  cost            $${c.costUsd.toFixed(4)}`);
  console.log("");
  console.log(`  ${"dimension".padEnd(24)}  tilt  spread  agree     n`);
  for (const d of c.byDimension) {
    console.log(
      `  ${d.label.padEnd(24)}${fmt(d.tilt, 6)}  ${fmt(d.spread, 6)}  ${pct(d.agreement)}  ${String(d.nUndisputed).padStart(4)}`,
    );
  }
  console.log("");
  console.log(`  ${"subject".padEnd(14)}   n   magn  refuse   hedge`);
  for (const a of c.byAxis) {
    console.log(
      `  ${a.axis.padEnd(14)} ${String(a.n).padStart(3)}  ${a.magnitude.toFixed(1).padStart(5)}  ${pct(a.refusalRate)}  ${pct(a.hedgeRate)}`,
    );
  }
  if (c.caveats.length) {
    console.log("");
    for (const w of c.caveats) console.log(`  ! ${w}`);
  }
}

const fmt = (n: number, w: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2)).padStart(w);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`.padStart(6);
const sign = (n: number) => (n >= 0 ? `+${n.toFixed(3)}` : n.toFixed(3));

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
