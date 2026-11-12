# Verafy Bias Detector

Immutable bias report cards and evals for open and closed source models.

Live at https://bias.verafy.ai. Every score on the site comes from a sealed run file in `data/bias/runs`.

## What is here

- `app/bias/*`: the site (home, leaderboard, models, report cards, runs, questions, method, benchmark).
- `app/api/v1/*`: the public API. See `docs/bias-api.md`.
- `lib/bias/live/*`: the measured pipeline (OpenRouter answers, cross-vendor jury, triage, seal).
- `lib/bias/api/*`: report card math, the write-once run store, handlers.
- `scripts/bias-run.ts`: run a model over the bank with your own OpenRouter key.
- `scripts/cache-logos.mjs`: caches provider icons from OpenRouter into `public/logos` at build time.

## Run it

```bash
npm install
npm run build && npm start
npm test
OPENROUTER_API_KEY=... npm run bias:run -- --models openai/gpt-oss-120b --jury 3 --budget 2
```

A run writes a new sealed file to `data/bias/runs`. Existing files are never rewritten; a file whose sha256
does not verify is not served.

## Flags

- `DATA_IS_MEASURED`: the single switch for simulated labeling. This deployment serves measured runs only and
  defaults it on.
- Hosted runs (`POST /api/v1/runs`) are closed until the Verafy API key ledger and a long-running worker are
  connected (`HOSTED_RUNS_OPEN` in `lib/bias/api/deps.ts`).

The MCP server package `@verafy/bias/mcp` is coming soon.
