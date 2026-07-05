# KashinAI

KashinAI is a macOS floating AI workspace for people who live across Slack,
email, docs, browser tabs, and internal notes.

It sits in the menu bar, opens from a global shortcut, reads the current
working context, searches a local/company knowledge base, and generates a
ready-to-use answer, update, summary, or follow-up. The goal is not to be a
generic chatbot. The goal is to answer with the context your company already
knows.

## What KashinAI Does

KashinAI combines three inputs:

- Current macOS context: active app, window title, selected text, and clipboard
  fallback
- Company memory: Markdown files under `brain/`, optionally searched through
  GBrain CLI or HTTP
- An LLM: Anthropic, OpenAI, or Gemini

From those inputs, it creates output such as:

- Customer or internal replies
- Status updates
- Summaries and catch-up notes
- Proposal or follow-up drafts
- Shorter or more polite rewrites

The current UI is a top-of-screen floating panel with an inbox-like composer.
It can show generated sources, copy the answer, or insert the answer back into
the app you were using.

## Core Flow

```txt
Select or focus on work in another macOS app
  -> Press Option+[
  -> KashinAI opens as a floating top sheet
  -> It captures the active app, window title, selection, and clipboard fallback
  -> You choose an action or type a custom instruction
  -> KashinAI searches company memory
  -> The selected LLM generates an answer with source context
  -> Copy or insert the result back into your workflow
```

Default shortcut: `Option+[`

Older installs that still have `Option+Space` saved are migrated to
`Option+[` at runtime.

## Current Product Shape

KashinAI is currently a local-first desktop MVP.

It is implemented as:

- Electron main process for macOS windowing, global shortcut, tray/menu-bar
  behavior, clipboard capture, AppleScript-assisted paste, and settings
- React + TypeScript renderer for the floating assistant, result view, and
  settings view
- `brain/` Markdown knowledge base for seed company, product, customer,
  project, people, and template context
- GBrain search adapter with three modes:
  - `local`: keyword search over `brain/**/*.md`
  - `cli`: call a local `gbrain` binary
  - `http`: call a GBrain HTTP endpoint
- LLM adapter for Anthropic, OpenAI, and Gemini

The app is not a full SaaS product yet. There is no team account system,
cloud sync, OAuth integration, background screen recording, or autonomous task
execution in this repo.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development:

```bash
pnpm dev
```

Then open Settings inside the app and configure:

- LLM provider
- LLM API key
- Default model
- GBrain mode (`local`, `cli`, or `http`)
- GBrain CLI path or HTTP endpoint if needed
- Default language, tone, length, and source display preference

For the best macOS capture/paste experience, grant Accessibility permission to
the process launching the app. In development this is usually your terminal or
Electron.

## Company Memory

Seed memory lives in `brain/`:

```txt
brain/
  company/      company overview, pricing, sales, security, contract policies
  products/     product descriptions
  customers/    customer notes
  projects/     project overview, meetings, requirements, proposals, decisions
  people/       people and stakeholder notes
  templates/    reusable reply, proposal, meeting, and security templates
```

KashinAI can work without a GBrain install by using local keyword search over
these Markdown files.

If you have GBrain installed, import and embed the seed brain:

```bash
./scripts/setup-brain.sh
./scripts/setup-brain.sh --embed
```

## Scripts

```bash
pnpm dev             # Run Electron + React in development
pnpm build           # Build the Electron app
pnpm start           # Preview the built app
pnpm typecheck       # Typecheck main and renderer projects
pnpm typecheck:node  # Typecheck Electron/main code
pnpm typecheck:web   # Typecheck renderer code
```

## Repo Layout

```txt
src/
  main/              Electron main process, IPC, settings, context capture,
                     GBrain search, LLM calls, shortcut, window management
  preload/           Safe renderer API exposed through contextBridge
  renderer/          React UI for assistant, results, and settings
  shared/            Shared types and prompts
brain/               Local seed knowledge base
docs/                Product, setup, architecture, and security notes
scripts/             Brain import/setup scripts
```

## Privacy And Safety Model

KashinAI is explicit-action-first:

- It captures context when opened or invoked, not continuously
- It uses selected text and clipboard fallback instead of screen recording
- It restores the previous clipboard after capture/insert flows
- API keys and GBrain tokens are stored in local app settings and encrypted
  with Electron `safeStorage` when the OS supports it
- Generated output is never auto-sent; the user must copy or insert it

## Known Gaps

- The current inbox items in the assistant panel are demo/mock items mixed with
  live captured context
- The settings UI has navigation labels for future sections, but the active
  implemented settings are still concentrated in one view
- GBrain local fallback is keyword-based, not vector search
- Accessibility permission is required for reliable global capture and paste
- Docs under `docs/` may still use older `ContextAssistant` wording

## More Detail

- `docs/product.md`
- `docs/setup.md`
- `docs/architecture.md`
- `docs/security.md`
