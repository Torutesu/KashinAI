# Product

## Concept

**A Goldfish-like macOS assistant with company memory.**

ContextAssistant lets a user press a global shortcut anywhere on macOS, read the currently selected text and active app/window context, search company knowledge from GBrain, and generate useful replies, summaries, proposals, translations, or next actions — without re-explaining company/customer/project background every time.

This is not the full SHOGUN AI product (see `brain/products/shogun_ai.md`) — it is a lightweight MVP scoped to: macOS app, global shortcut, selected-text capture, GBrain search, LLM generation, copy/paste, and source display.

## Core UX

```txt
Shortcut
  → Read current context (selected text, active app, window title)
  → Search company brain (GBrain)
  → Generate useful output (LLM)
  → Copy / Insert
```

Step by step:

1. User selects text in Slack, Gmail, Notion, Google Docs, Chrome, or Cursor.
2. User presses **Option + Space**.
3. A small floating window appears showing the detected app and a preview of the selected text.
4. User chooses an action: **Reply / Summarize / Next Actions / Proposal Draft / Translate to English / Custom Instruction**.
5. The app builds a Context Pack (selected text, active app, window title, user instruction).
6. The app generates a GBrain search query and retrieves relevant company/customer/project/template context.
7. The app sends the selected text + retrieved context to an LLM.
8. The result is shown in the floating UI along with the sources used.
9. User copies or inserts the result into the focused field.

## MVP Scope

### Must Have

- macOS menu-bar resident app
- Global shortcut (Option+Space)
- Floating assistant window
- Selected text capture + clipboard fallback
- Active app name capture
- Window title capture
- GBrain search integration
- LLM generation
- Source display (which brain/ files were used)
- Copy button
- Insert/paste button
- Settings screen: app display name, GBrain endpoint/token, GBrain mode (local/remote), LLM provider, LLM API key, default model

### Should Have

- Action-specific prompt templates
- "Make shorter" / "Make more polite" / "Translate to English" quick actions
- Generation history
- Editable/reviewable GBrain search query before sending
- Regenerate button

### Later

- Screen OCR / ScreenCaptureKit surrounding-context capture
- Gmail API / Slack API integration
- Google Drive / Notion / Calendar sync
- Team sharing, per-user permissions
- Full SaaS multi-tenancy
- Autonomous agent execution
- Local personal memory
- Browser extension
- Windows support

### Non-goals (initial MVP)

- The full SHOGUN AI product
- Continuous screen recording
- Automatic saving of all app activity
- Auto-send of generated content
- Complex multi-tenant SaaS
- Advanced admin dashboard
- Full OAuth integrations
- Agent-executed task completion
- Mobile app

## First Demo Goal

The first working demo (see README.md for the full walkthrough) supports:

```txt
Slack selected message
  → Option + Space
  → "Reply with company context"
  → GBrain searches customer/project/template docs
  → LLM generates a reply
  → Sources are shown
  → User copies the result
```

## Related Documents

- docs/architecture.md
- docs/setup.md
- docs/security.md
- brain/company/services.md
