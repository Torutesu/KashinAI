# Setup

## 1. Install dependencies

```bash
pnpm install
```

## 2. Run the app in development

```bash
pnpm dev
```

This starts the Electron app (React/TypeScript/Tailwind UI + Electron main process) in development mode.

## 3. Grant macOS Accessibility permission

ContextAssistant needs Accessibility access to read the currently selected text and the active app/window info system-wide. Without it, the app falls back to clipboard-only capture.

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Click the **+** button (you may need to unlock with your password first).
3. Add the ContextAssistant app (during development this may be your terminal, Electron, or the packaged app — grant access to whichever process is actually launching the app).
4. Toggle the switch **on** for the app.
5. Restart ContextAssistant so the new permission takes effect.

If the global shortcut (**Option + Space**) doesn't trigger the floating window, re-check this permission first — it's the most common cause.

## 4. Configure API keys

Open the app's Settings screen and set:

- **LLM Provider** — OpenAI, Anthropic, or Gemini
- **LLM API Key** — stored locally/securely on the machine (never committed to the repo)
- **Default Model** — a lightweight model for everyday replies/summaries; switch to a stronger model for high-stakes proposal text
- **GBrain Endpoint / Token** — see step 5 below
- **GBrain Mode** — `local` (recommended for MVP/demo) or `remote`

Never commit API keys or tokens to source control. Local `.env` files and app-level secure storage are the intended homes for these values.

## 5. Set up GBrain (the company knowledge base)

The seed company knowledge lives in `brain/` at the repo root. To make it searchable:

```bash
./scripts/setup-brain.sh          # import only
./scripts/setup-brain.sh --embed  # import, then embed for search
```

This script:

- Verifies the `gbrain` binary is installed and on your `PATH`
- Runs `gbrain import ./brain --no-embed`
- Optionally runs `gbrain embed --stale` when `--embed` is passed
- Prints guidance if `gbrain` is missing, or if the import fails because another `gbrain` session (e.g. an editor's GBrain MCP server) is holding a lock — close that other session and re-run

The script is idempotent: re-running it after adding or editing files under `brain/` is safe and expected as you iterate on the knowledge base.

If you don't have `gbrain` installed yet, install/initialize it first (e.g. `gbrain init --pglite` for a local-only setup), then re-run the script.

## Quick Start Summary

```bash
pnpm install
pnpm dev
# Grant Accessibility permission (see step 3)
# Set API keys + GBrain settings in the app's Settings screen
./scripts/setup-brain.sh --embed
```

## Related Documents

- docs/architecture.md
- docs/security.md
- README.md
