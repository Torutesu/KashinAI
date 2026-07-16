# Performance: measuring capture & generation latency

KashinAI's felt speed is dominated by **context capture** (the native Accessibility / browser /
screenshot+OCR pipeline that runs before any tokens are generated). This doc is how we turn that
from a guess into numbers on a real Mac, and the budgets we hold ourselves to before shipping.

Streaming already makes generation *feel* instant (first token arrives quickly), so the risk is the
capture stage that runs up front. That's what the harness measures.

## What to measure

| Metric | Where it comes from | How to read it |
| --- | --- | --- |
| Per-stage capture latency (accessibility, clipboard-selection, browser, screen, total) | `pnpm bench:capture` | P50/P95 table + JSON |
| GBrain retrieval time (`gbrain_ms`) | live `generation_completed` telemetry, or Settings → Backend diagnostics | per request |
| LLM time (`llm_ms`) and end-to-end (`latency_ms`) | live `generation_completed` telemetry | per request |

Capture latency is the harness's job (it needs many samples to get a stable tail). GBrain and LLM
latency are already recorded per request in `GenerationTimings` and emitted with the
`generation_completed` telemetry event (`gbrain_ms`, `llm_ms`, `latency_ms`) — so aggregate those
from your analytics rather than re-measuring them here.

## Running the capture benchmark (macOS only)

The capture stages call native helpers, so numbers are only meaningful on macOS with **Accessibility**
granted (and **Screen Recording** granted if you're exercising the screenshot/OCR path).

```bash
pnpm build            # once — puts the Swift helpers in place
pnpm bench:capture    # 30 measured captures against the frontmost app
```

Point it at a specific app/page and force a path:

```bash
# Heavy browser path against a real page
TARGET_APP="Google Chrome" TARGET_URL="https://news.ycombinator.com" \
  FORCE_BROWSER_CAPTURE=1 BENCH_ITERATIONS=50 pnpm bench:capture

# Screenshot + OCR path
FORCE_SCREEN_CAPTURE=1 pnpm bench:capture
```

Env vars: `BENCH_ITERATIONS` (default 30), `BENCH_WARMUP` (default 2), `TARGET_APP`, `TARGET_URL`,
`FORCE_BROWSER_CAPTURE`, `FORCE_SCREEN_CAPTURE`, `FORCE_NATIVE_SCREEN_CAPTURE`, `BENCH_OUT` (JSON path).

Sample output:

```
Per-stage latency (ms):
  stage                        n       min       p50       p95       max      mean
  accessibilityMs             30       120       210       540       690       255
  clipboardSelectionMs        30         8        15        40        62        19
  browserMs                   30       320      1100      3800      4900      1420
  screenMs                     0         0         0         0         0         0
  totalMs                     30       470      1350      4100      5200      1710

Capture paths exercised:
  page:    {"accessibility":22,"browser-automation":8}
  screen:  {"none":30}
  primary: {"accessibility-text":22,"page-text":8}
```

Run it three ways — a text field (Notes/Slack), a browser page, and a screenshot-only app — since
each exercises a different, differently-priced path. The "Capture paths exercised" line tells you
which one you actually hit.

## Budgets (the gate before shipping)

These are the P95 targets. If a run blows past them, that stage is the thing to optimize (or skip
more aggressively) before release — not something to discover from a user.

| Stage | P50 target | P95 target |
| --- | --- | --- |
| Accessibility capture | ≤ 300 ms | ≤ 800 ms |
| Clipboard selection | ≤ 50 ms | ≤ 150 ms |
| Browser capture (automation) | ≤ 1500 ms | ≤ 3500 ms |
| Screen (screenshot + OCR) | ≤ 3000 ms | ≤ 6000 ms |
| **Total capture** | **≤ 1500 ms** | **≤ 4000 ms** |
| GBrain retrieval | ≤ 400 ms | ≤ 1500 ms |
| End-to-end to first token | ≤ 2500 ms | ≤ 5000 ms |

The capture pipeline already short-circuits: strong accessibility context skips the browser and
screen stages entirely (see `captureTrace.canSkipBrowserCapture` / `canSkipOcr`). The benchmark's
"Capture paths exercised" line confirms how often the expensive paths were actually taken — if the
common case is accessibility-only, total P95 should sit well under budget even when the browser/OCR
tails are large.

## Recording results

Paste a run here per release candidate so we can see regressions over time.

| Date | Machine | Scenario | total P50 | total P95 | Notes |
| --- | --- | --- | --- | --- | --- |
| _tbd_ | _e.g. M2 Air_ | text field | | | |
| _tbd_ | | browser page | | | |
| _tbd_ | | screenshot-only | | | |
