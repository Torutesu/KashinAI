# KashinAI

KashinAI is a macOS assistant that reads the app you are currently using
and suggests text you can paste right away.

It is meant for quick writing support while you are looking at Twitter/X, a web
page, a coding editor, docs, or any other work screen. The app tries to read the
visible context first, then creates a short recommendation that fits that screen.

## What It Does

- Reads the current macOS app and window context
- Uses Accessibility API first to collect visible text
- Falls back to screenshot/OCR or browser context when needed
- Creates a short ready-to-paste suggestion
- Pastes the suggestion with a single Option key press
- Shows the floating assistant with Option + Space
- Can use local Markdown memory / GBrain when the current screen actually needs it

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

- Accessibility Tree: visible app text, selected text, web document attributes,
  URL/document fields, and visible children
- Selected text / clipboard-safe capture
- Browser page context when available
- Screenshot and OCR fallback
- Local Markdown memory under `brain/`
- Optional GBrain CLI / HTTP search

Accessibility permission and Screen Recording permission are recommended on
macOS. Without them, context capture may be partial.

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

## Useful Scripts

```bash
pnpm dev                 # Run the desktop app in development
pnpm build               # Build Electron + renderer
pnpm package:mac         # Build a local macOS app bundle
pnpm typecheck           # Typecheck main and renderer code
pnpm smoke:live-context  # Check live-context extraction behavior
pnpm smoke:fusion        # Check GBrain/local context fusion
```

## Repo Layout

```txt
src/main/       Electron main process, context capture, paste, IPC, LLM/GBrain
src/renderer/   React UI for the floating assistant and settings
src/shared/     Shared types, prompts, and live-context filtering
scripts/        macOS helper scripts and smoke checks
brain/          Local Markdown memory examples
docs/           Extra product/setup/architecture notes
```

## Current Status

This is still a local-first MVP. The main focus is making the app read the
current screen quickly and generate useful paste-ready text. Some websites or
apps may not expose good Accessibility text; those cases need OCR fallback or a
prepared demo/scenario flow.
