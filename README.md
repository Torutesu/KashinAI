# KashinAI

KashinAI is a macOS assistant that reads the app you are currently using
and suggests text you can paste right away.

It is meant for quick writing support while you are looking at Twitter/X, a web
page, a coding editor, docs, or any other work screen. The app tries to read the
visible context first, then creates a short recommendation that fits that screen.
It can also combine the original company information, counterpart/customer
context, saved memory, and previously captured context to choose the best
response for the moment.

## What It Does

- Reads the current macOS app and window context
- Uses Accessibility API first to collect visible text
- Falls back to screenshot/OCR or browser context when needed
- Creates a short ready-to-paste suggestion
- Pastes the suggestion with a single `Option` key press
- Shows the floating assistant with `Option + Space`
- Can use local Markdown memory / GBrain when the current screen actually needs it
- Uses company, counterpart, and saved context to make recommendations more relevant
- Saves useful context and feedback so the recommendation loop can improve over time

For Twitter/X, SNS, code editors, and terminal-style screens, KashinAI avoids
forcing company memory into the answer. It should use the visible screen context
first.

## Keyboard Flow

```txt
Focus another app
  -> Press Option
  -> KashinAI reads the current visible context
  -> It creates one short suggestion
  -> It pastes the suggestion back into the active app
```

```txt
Press Option + Space
  -> Show the KashinAI floating panel
```

If KashinAI cannot read useful context, it should avoid pasting a random or
irrelevant sentence.

## Context Capture

KashinAI currently tries these sources:

- Accessibility Tree first: structured snapshot of the focused element, window
  title, selected text, visible value text, URL/document fields, and visible
  children
- Selected text / clipboard-safe capture
- Browser page context when available
- Chromium session fallback for Chrome, Chrome Canary, Arc, Brave, Edge,
  Vivaldi, Opera, Dia, and Chromium when
  direct browser automation cannot read the page body
- Keyboard-copy fallback for browser surfaces that are visible but do not expose
  usable automation hooks yet, such as Firefox
- Screenshot and OCR fallback
- Local Markdown memory under `brain/`
- Optional GBrain CLI / HTTP search

Accessibility permission and Screen Recording permission let KashinAI capture
the current screen more reliably on macOS.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run in development:

```bash
pnpm dev
```

Build the app:

```bash
pnpm build
pnpm package:mac
```

Full setup instructions: `docs/setup.md`.

`pnpm-workspace.yaml` pins the postinstall build policy for native dependencies
used by the Electron app. The checked-in `allowBuilds` values are intentional,
so `pnpm install` does not stop on first-run approval prompts for `electron`
and `esbuild`, while `electron-winstaller` stays disabled because this macOS
app does not need the Windows packaging helper in normal development.

## Useful Scripts

```bash
pnpm dev                 # Run the desktop app in development
pnpm build               # Build Electron + renderer
pnpm package:mac         # Build a local macOS app bundle
pnpm test:unit           # Run unit tests for main-process context, IPC, and boot flow
pnpm debug:ax            # Dump raw Accessibility helper output, ranked lines, and extracted AX context
pnpm debug:ax:fixture my-case  # Save the current AX snapshot into tests/fixtures/accessibility/
pnpm debug:context       # Dump a native context-capture snapshot for the current frontmost app
pnpm debug:context:fixture my-case  # Save the merged CurrentContext into tests/fixtures/context/
pnpm debug:context:coverage  # Show which capture methods already have context fixtures and which are still missing
pnpm debug:context:next  # Print the next recommended live fixture command to run
pnpm debug:desktop-sources  # Inspect Electron desktopCapturer candidates and the current source-ranking decision
pnpm typecheck           # Typecheck main and renderer code
pnpm smoke:live-context  # Check live-context extraction behavior
pnpm smoke:fusion        # Check GBrain/local context fusion
```

### AX Investigation Loop

When a specific macOS app is not yielding good context, use this loop:

```bash
pnpm debug:ax
TARGET_APP="Slack" pnpm debug:ax
pnpm debug:ax:fixture slack-compose
TARGET_APP="Cursor" pnpm debug:ax:fixture cursor-editor
TARGET_APP="Dia" pnpm debug:context:fixture dia-issue-page
TARGET_APP="Dia" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE=summarize pnpm debug:context:fixture dia-issue-page
TARGET_APP="Dia" EXPECT_PAGE_CAPTURE_METHOD=browser-automation pnpm debug:context:fixture dia-browser-automation
```

`pnpm debug:ax` prints:

- raw helper JSON
- parsed AX snapshot
- extraction result
- diagnostics with `lowSignalReason`, `selectedTextSource`, and ranked lines

`pnpm debug:ax:fixture <name>` stores only the captured `snapshot` under
`tests/fixtures/accessibility/<name>.json` and also creates
`tests/fixtures/accessibility/<name>.expected.json` with a starter expectation
template, so the exact live failure can be turned into a regression case
immediately.
When `TARGET_APP` is set, the helper now retries bringing that app to the front
and records whether it actually won focus; fixture-save commands fail fast if a
different app stayed frontmost, so you do not accidentally save a regression
case from the wrong window.

`pnpm debug:context:fixture <name>` stores the final merged `CurrentContext`
under `tests/fixtures/context/<name>.json` after redacting unstable values such
as `screenshotPath` and `timestamp`. Use this when AX looked fine but the merged
browser/AX/OCR result was still wrong. It also creates
`tests/fixtures/context/<name>.expected.json` with a starter expectation template
based on the current digest and capture provenance, so the regression case is
mostly ready immediately. The command output also echoes the detected
`pageCaptureMethod`, `screenCaptureMethod`, and `selectedTextSource` so you can
see which capture path actually won before editing the expectation. When you are
trying to prove a specific capture path, you can also set
`EXPECT_PAGE_CAPTURE_METHOD` and/or `EXPECT_SCREEN_CAPTURE_METHOD` to make the
command fail fast if a different path wins. `pnpm debug:context` and in-app
diagnostics now also include a small browser/screen capture trace so you can see
which fallback steps were attempted. When a capture trace is present, the fixture
save command also writes `tests/fixtures/context/<name>.trace.json` so the exact
browser fallback sequence from the live app can be compared later.
When accessibility diagnostics are present, the same save command also writes
`tests/fixtures/context/<name>.diagnostics.json`, so low-signal AX reasons and
ranked visible lines can be compared without checking unstable raw helper output
into git.
When a matching accessibility fixture already exists, the starter expectation can
also carry `linkedAccessibilityFixture` automatically, and you can override it
explicitly with `LINKED_ACCESSIBILITY_FIXTURE=<fixture-name>` when the intended
AX regression pair is known ahead of time.
The saved command output now also echoes `screenSourceSelection`, so you can see
whether screen capture used a matched window thumbnail, fell back because no
window candidates existed, or switched to native whole-screen capture because
the frontmost app window was missing from Electron's window-source list.

Saved fixtures under both `tests/fixtures/accessibility/` and
`tests/fixtures/context/` can then be asserted directly from unit tests, so a
live app failure can become a permanent regression case without depending on the
app at test time. These fixture pairs are intended to be checked into git once
the unstable fields have been redacted. The `tests/` tree is now meant to be a
checked-in regression suite only: fixture pairs, generic expectation tests, and
main-process unit tests. Temporary scratch captures should stay outside `tests/`.
If you need to inspect a live failure before turning it into a regression, save
the raw dump somewhere under `/tmp`, `artifacts/`, or another scratch location
first, then move only the redacted fixture pair into `tests/`.

`pnpm debug:context:coverage` summarizes which `pageCaptureMethod` and
`screenCaptureMethod` values are already represented by saved context fixtures,
so the next live capture target is explicit instead of guesswork. It also prints
suggested `pnpm debug:context:fixture ...` command lines for the still-uncovered
capture methods. Coverage only counts the primary `<name>.json` fixture files,
so `.expected.json` and `.trace.json` sidecars do not skew the report.
The suggestions now try to match the intended capture family: for example
`browser-automation` and `chrome-session` suggest Chrome-family targets, while
`keyboard-copy` prefers a non-Chromium browser target when one is installed and
otherwise falls back to whichever supported browser app is actually available on
the current Mac, so live fixture guidance still stays runnable instead of
pointing at a missing app. When an uncovered fallback path would normally be
short-circuited by stronger accessibility or browser capture on the current
page, the suggested live command can also include `FORCE_BROWSER_CAPTURE=1` and
`SUPPRESS_*_PAGE_TEXT=1` overrides so the deeper fallback step can be proven on
purpose instead of by accident. Browser-fallback proof commands can also set
`TARGET_URL` so the app opens a predictable public page before capture, which
helps avoid proving fallback behavior against an empty browser start page.
Safari and Chromium-family targets are opened inside the app first so frontmost
verification and accessibility capture stay aligned with the actual browser
surface under test.
For screen-only fallback proof, the suggested command can also include
`FORCE_NATIVE_SCREEN_CAPTURE=1` to bypass window-thumbnail selection and force
the native whole-screen capture path when the regression under test is
specifically `screen-ocr` or `screen-screenshot-only`.
When a `.trace.json` sidecar is present, the fixture expectation test also
checks that its final page/screen capture methods still match the saved
`CurrentContext`, so provenance cannot silently drift away from the fixture body.
Browser capture summaries are derived during tests and coverage checks, so
`.summary.json` sidecars do not need to be checked into `tests/fixtures/context/`.
The checked-in `tests/` tree should stay limited to stable fixture pairs,
`.trace.json` / `.diagnostics.json` provenance sidecars, and executable
test/support files only; do not leave scratch dumps, draft files, or temporary
captures there.

`pnpm debug:context:next` is a lighter wrapper around that coverage report and
prints just the next uncovered `pageCaptureMethod`, the next uncovered
`screenCaptureMethod`, the recommended command to run first, and the immediate
follow-up command for the other family when one is still uncovered. It now also
includes a short rationale and intended target app for each recommendation, so
you can tell whether the next step is trying to prove browser automation,
keyboard-copy fallback, Chromium session fallback, or a screen-capture path.
The output also includes ordered `actionSteps`, so the next page-capture and
screen-capture tasks can be followed as a tiny two-step runbook during live
fixture collection.
The coverage JSON now also includes `nextRecommendation`, which bundles the
current priority, the single best next command to run, and the same ordered
`actionSteps` in one place. This makes it easier to drive fixture collection
from one command without manually cross-reading the uncovered method lists.

For merged context fixtures, add:

- `tests/fixtures/context/<name>.json`
- `tests/fixtures/context/<name>.expected.json`

The expectation file drives the generic regression test and can assert:

- expected `contextKind`
- expected `primaryContentSource`
- expected `pageCaptureMethod` / `screenCaptureMethod`
- strings that must appear / must not appear in the live-context digest
- strings that must appear / must not appear in the generated search query

Accessibility fixtures also support the same pattern:

- `tests/fixtures/accessibility/<name>.json`
- `tests/fixtures/accessibility/<name>.expected.json`

Those expectations can assert:

- expected AX diagnostics such as `lowSignalReason`
- expected recovered `selectedText`
- ranked lines that should appear / not appear
- extracted page/accessibility text that should appear / not appear

Useful `lowSignalReason` examples now covered in fixture-backed tests:

- `social-chrome-only` for Slack/Teams/Discord style composer chrome
- `browser-chrome-only` for tab-strip / browser-controls only snapshots
- `title-only` when the helper only saw the app/window title

### Memory / GBrain Setup

```bash
./scripts/setup-brain.sh         # import brain/ into GBrain
./scripts/setup-brain.sh --embed # import and embed stale documents
./scripts/setup-brain.sh --help  # show options
```

```bash
gbrain init --pglite
gbrain import ./brain --no-embed
gbrain embed --stale
gbrain search "customer_a project status"
```

The setup script is safe to re-run after editing files under `brain/`.

## Repo Layout

```txt
src/main/       Electron main process, context capture, paste, IPC, LLM/GBrain
src/renderer/   React UI for the floating assistant and settings
src/shared/     Shared types, prompts, and live-context filtering
scripts/        macOS helper scripts and smoke checks
tests/unit/     Node test runner + Electron/main-process unit tests
tests/fixtures/ Redacted accessibility/context regression fixtures and expectations
brain/          Local Markdown memory examples
docs/           Extra product/setup/architecture notes
```

## Current Status

KashinAI is a local-first macOS assistant focused on fast context capture and
paste-ready writing. It is designed to work directly with the app you are using,
so suggestions stay tied to the visible screen instead of a generic chat flow.
As it collects saved context and feedback, KashinAI can keep refining the
recommendation loop around the user's actual workflow.
