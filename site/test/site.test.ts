import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { allRuns, measuredBoard, positionRate, rosterStatus } from "@/lib/bias/site";
import { dataIsMeasured } from "@/lib/bias/api/flags";
import { HERO, INFO, METHOD } from "@/lib/bias/copy";

test("every stored run verifies its seal and is measured", () => {
  const files = readdirSync(path.join(process.cwd(), "data/bias/runs")).filter((f) => f.endsWith(".json"));
  assert.equal(allRuns().length, files.length, "a run file failed its seal check");
  for (const run of allRuns()) assert.equal(run.card.measured, true);
});

test("the board lists only complete runs, closest to center first", () => {
  const board = measuredBoard();
  assert.ok(board.length >= 1);
  for (let i = 1; i < board.length; i++) assert.ok(board[i - 1].card.magnitude <= board[i].card.magnitude);
  for (const run of board) assert.ok(run.card.nFailed / (run.card.n + run.card.nFailed) <= 0.05);
});

test("roster models without a listed run carry no card", () => {
  for (const row of rosterStatus()) {
    if (!row.card) assert.ok(!measuredBoard().some((run) => run.model === row.model.id));
  }
});

test("answer rate, hedged and refused sum to 100%", () => {
  for (const run of measuredBoard()) {
    const c = run.card;
    const sum = positionRate(c) + c.hedged / c.n + c.refused / c.n;
    assert.ok(Math.abs(sum - 1) < 1e-9);
  }
});

test("the single flag accepts both spellings", () => {
  assert.equal(dataIsMeasured({ DATA_IS_MEASURED: "true" }), true);
  assert.equal(dataIsMeasured({ BIAS_DATA_IS_MEASURED: "true" }), true);
  assert.equal(dataIsMeasured({}), false);
});

test("no em-dashes, no simulated copy, no Swarm Explorer on any page", () => {
  const roots = ["app", "components", "lib/bias/copy.ts"];
  const files: string[] = [];
  const walk = (p: string) => {
    const full = path.join(process.cwd(), p);
    try {
      for (const entry of readdirSync(full, { withFileTypes: true })) walk(path.join(p, entry.name));
    } catch {
      if (/\.(tsx?|css)$/.test(p)) files.push(full);
    }
  };
  roots.forEach(walk);
  for (const file of files) {
    if (file.includes("verafy-header/links.ts")) continue;
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes("\u2014"), `em-dash in ${file}`);
    assert.ok(!/Swarm Explorer/.test(text), `Swarm Explorer in ${file}`);
    assert.ok(!/All results and scores are simulated/.test(text), `simulated band in ${file}`);
  }
  const copy = JSON.stringify({ HERO, INFO, METHOD });
  assert.ok(!copy.includes("\u2014"));
});
