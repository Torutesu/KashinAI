# Architecture

## Overview

ContextAssistant is a macOS floating assistant that combines the user's current on-screen context with long-term company memory stored in GBrain, then generates ready-to-use text (replies, summaries, proposals, next actions) via an LLM.

This document describes the component layout, data flow, and the GBrain client's three connection modes, per the technical brief (sections 9 and 19).

## Component Diagram

```txt
[macOS Desktop App]
  ├─ Global Shortcut Listener        (Option+Space)
  ├─ Floating Assistant UI            (React)
  ├─ Current Context Reader
  │    ├─ Selected Text
  │    ├─ Clipboard Fallback
  │    ├─ Active App Name
  │    └─ Window Title
  │
  ├─ Context Pack Builder
  │    ├─ Current Screen Context
  │    ├─ User Instruction / Action Type
  │    ├─ Detected Entities (customer / project / person / topic)
  │    └─ Search Query Generation
  │
  ├─ GBrain Client                    (a dedicated module in the app, e.g.
  │                                     src/lib/gbrain-client)
  │    ├─ Mode: cli    -> shells out to the `gbrain` binary
  │    ├─ Mode: http    -> calls a local/remote GBrain HTTP endpoint
  │    ├─ Mode: local-fallback -> naive markdown grep over brain/ if
  │    │                          neither cli nor http is reachable
  │    └─ Source Attribution (file path + score per result)
  │
  ├─ LLM Orchestrator                 (a dedicated module, e.g. src/lib/llm-client)
  │    ├─ Action-specific Prompt Templates (reply / summarize / next_actions /
  │    │   proposal / translate / custom)
  │    ├─ Provider Selection (OpenAI / Anthropic / Gemini)
  │    └─ Response Generation + Error Fallback
  │
  └─ Output Layer
       ├─ Copy to Clipboard
       ├─ Insert into Focused Field
       └─ Show Sources (from GBrain retrieval)

[GBrain]
  ├─ Markdown Knowledge Base   (brain/company, /products, /customers, /projects, /people, /templates)
  ├─ Local (pglite) or Remote (Postgres/Supabase) storage
  ├─ Vector / Hybrid Search
  ├─ MCP Server or HTTP Interface
  └─ Source Attribution per retrieved chunk

[LLM Provider]
  ├─ OpenAI
  ├─ Anthropic
  └─ Gemini
```

## Data Flow

```txt
1. User selects text in Slack / Gmail / Notion / Docs / Chrome / Cursor
2. User presses Option+Space
3. Current Context Reader captures: selected text, clipboard fallback,
   active app name, window title
4. User picks an action in the Floating UI: Reply / Summarize / Next Actions /
   Proposal / Translate / Custom
5. Context Pack Builder:
     - detects entities (customer / project / person / topic) from the
       current context
     - generates a GBrain search query
6. GBrain Client searches the brain (cli, http, or local-fallback mode)
7. Retrieved context is attached with source paths (e.g. customers/customer_a.md)
8. LLM Orchestrator assembles a prompt (system + action prompt + context pack)
   and calls the selected LLM provider
9. Generated output + sources are rendered in the Result View
10. User copies or inserts the result into the focused field
```

## GBrain Client: Three Modes

The GBrain client (a dedicated module inside the app, isolated from UI code so it can be extracted into its own package later) is designed to work across three environments without changing the rest of the app:

### 1. `cli` mode

Shells out to the local `gbrain` binary (e.g. `gbrain search "..."`) and parses its output. Used when GBrain is installed locally and the user has run `scripts/setup-brain.sh`. This is the default for solo/local MVP usage.

### 2. `http` mode

Calls a GBrain HTTP endpoint (local `http://localhost:3000` or a remote/team GBrain server), matching the `gbrain.endpoint` / `gbrain.token` settings described in the brief's config file (section 24). Used for team setups where GBrain runs as a shared service.

### 3. `local-fallback` mode

If neither the `gbrain` binary nor an HTTP endpoint is reachable, the client falls back to a naive local search directly over the `brain/` markdown tree (simple keyword/heading match, no embeddings). This keeps the app demoable even with zero GBrain setup, at reduced search quality — every result is still returned with its source file path so downstream behavior (source display) stays consistent.

The client always returns results in the same shape (a `RetrievedContext[]` type — see the app's shared type definitions) regardless of mode, so the Context Pack Builder and LLM Orchestrator don't need to know which mode is active.

## Context Pack

The Context Pack is the structured object passed to the LLM Orchestrator. Its shape follows the brief's JSON Schema (section 12.1): `active_app`, `window_title`, `selected_text`, `clipboard_text`, `user_instruction`, `detected_entities`, `search_query`, `retrieved_context[]`, `output_preferences`.

## Related Documents

- docs/product.md — MVP scope and core UX
- docs/setup.md — install and GBrain setup
- docs/security.md — privacy and security stance
