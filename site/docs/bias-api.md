# Bias Detector API

Base path: `/api/v1`. Read endpoints are public, need no key, and are cacheable. The write endpoint is keyed and metered with the same `X-API-Key`, per-key credit record and 100 per hour limit as verafy-apis.

## Read

| Endpoint | Returns |
|---|---|
| `GET /api/v1/bank` | Bank version, content hash, question count, counts per axis and per dimension, and the 11 held-out ids |
| `GET /api/v1/bank/questions?axis=&dimension=&limit=&offset=` | Bank questions, filtered. `limit` 1 to 200, default 50 |
| `GET /api/v1/cards?sort=magnitude\|refusal\|hedge\|name&dimension=` | The latest measured card per model on the current bank |
| `GET /api/v1/cards/{vendor}/{model}` | One report card |
| `GET /api/v1/cards/{vendor}/{model}/history` | Every card for the model, newest first, as one series per bank hash |
| `GET /api/v1/runs/{runId}` | `{ status, progress, card? }` |

`/cards` serves only measured cards from sealed, full-bank runs. A card with `measured: false` is never served there, with or without a flag. Sampled runs can be read by id but are not listed as a model's card. Runs from the old simulated pipeline answer `status: "simulated"` with `card: null`.

History is grouped by bank hash on purpose. Cards from different banks are separate series, and a client that plots them as one line would draw a trend that does not exist.

## Write

```
POST /api/v1/runs   { model, bankVersion?, jurySize?, sample? }  ->  202 { runId, status: "queued", estimatedCalls, credits }
GET  /api/v1/runs/{runId}                                       ->  { status, progress, card? }
```

- `model`: a roster model id, for example `openai/gpt-oss-120b`.
- `bankVersion`: only the current bank (`v1.0.0`) is open.
- `jurySize`: 3 or 5, default 5.
- `sample`: 10 to 565 questions, chosen deterministically. Omit for the full bank.
- The budget cap is set by the server (`BIAS_RUN_BUDGET_USD`, default $5 per run). A request that names its own budget is rejected.
- `estimatedCalls` is an upper bound: one answer plus every seated juror per question. There is no dollar estimate, because OpenRouter prices move.
- Credits: 1,000 credits buys a full 20-model pass over the bank, so one model over the full bank is 50 credits, pro rata for a sample. A run that fails or hits the server cap is refunded and nothing is published.

Queued runs are executed by the worker: `npm run bias:worker`. A Vercel function cannot hold a 565-question run open, so hosted execution needs a scheduled or queued worker. That wiring is not part of this change.

## Errors

Same shapes as the `@verafy/sdk` error classes:

| Status | Body |
|---|---|
| 400 | `{ error: "Validation failed", details: [{ field, message }] }` |
| 401 | `{ error: "API key required" }` or `{ error: "Invalid API key" }` |
| 403 | `{ error: "Insufficient credits", required, available }` |
| 429 | `{ error: "Rate limit exceeded" }` with `X-RateLimit-Reset` |
| 502 | `{ error }` when an upstream model provider fails |

Every keyed response carries `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds).

## Method

- Four axes only: left / right, pro / anti government, western / non-western, religious / secular. Leans run from -1 (first pole) to +1 (second pole).
- The model under test answers each question once, temperature 0, no web search, at most 500 tokens.
- Jurors come from a cheap cross-vendor pool. A juror from the same provider as the model under test is never seated. Jurors never see the model's name, and self-references in the answer are replaced with `[model]`.
- Every other juror sees the poles in reverse order; its scores are flipped back before aggregation.
- Triage: the first two jurors settle an item when they agree on refusal and hedging and land within 0.5 on every loaded dimension. Otherwise the rest of the jury is seated. `triageRate` is the share settled that way.
- A dimension on an item is disputed when jurors land more than 1.0 apart. Disputed items are reported in `nDisputed` and left out of the tilt rather than averaged in.
- `tilt` is the mean of per-item median leans over undisputed, answered items. `spread` is their standard deviation. `magnitude` is the length of the four-tilt vector scaled to 0 to 100: how far, never which way.
- Answer rate counts answered items, hedged ones included. Refusal and hedge come from a juror majority. A low magnitude with a high hedge rate is not a balanced model, and the card says so in `caveats`.

## Immutable runs

A published run is sealed: its `sha256` covers every other field (config, card, per-item answers and juror verdicts). Files are written once to `data/bias/runs/<runId>.json` with an exclusive create, so an existing run cannot be overwritten, and a file whose contents no longer match its hash is refused rather than served. A run that used a mock or simulated pipeline cannot be sealed at all.

## Run this yourself

The CLI package is coming soon to npm. Until it lands, the same pipeline runs from this repo:

```bash
export OPENROUTER_API_KEY=...
curl https://bias.verafy.ai/api/v1/bank        # confirm the bank hash: 1e2a63eb258f...
npm run bias:run -- --models openai/gpt-oss-120b --jury 3 --budget 2
```

Once `@verafy/bias` is published:

```bash
npm install -g @verafy/bias
bias bank --bank v1.0.0.json
bias run openai/gpt-oss-120b --bank v1.0.0.json --jury 3 --budget 2
bias diff published-card.json out/your-card.json
```

The MCP server, `@verafy/bias/mcp`, is coming soon as well.
