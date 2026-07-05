# ContextAssistant

A macOS floating assistant that combines your current screen context with company memory from GBrain.

> The product name is not finalized. `ContextAssistant` / `context-assistant` is used as a neutral internal name throughout the codebase and docs. See `docs/product.md` for the full concept.

## What it is

ContextAssistant lets you press a global shortcut anywhere on macOS, capture whatever text you have selected plus the active app/window context, search your company's long-term memory (company info, customers, projects, people, templates) stored in **GBrain**, and generate a ready-to-use reply, summary, proposal draft, translation, or next-action list — grounded in that context, with sources shown.

It is not the full SHOGUN AI product. It's a lightweight MVP: one shortcut, one floating window, selected text in, useful text out.

## Demo Flow

```txt
1. Select a customer message in Slack
2. Press Option + Space
3. A floating UI appears
4. Click "Reply with company context"
5. GBrain searches customer notes, project status, and proposal templates
6. The LLM generates a draft reply
7. The sources used are shown
8. Copy the result and paste it into Slack
```

If this flow works end-to-end, the MVP has done its job.

## Quick Start

```bash
pnpm install
pnpm dev
```

Then:

1. Grant macOS **Accessibility** permission so the app can read selected text and window info (see `docs/setup.md`).
2. Open **Settings** and configure your LLM provider/API key and GBrain endpoint.
3. Seed and import the company knowledge base:

   ```bash
   ./scripts/setup-brain.sh --embed
   ```

Full setup instructions: `docs/setup.md`.

## Stack

- Electron
- React + TypeScript
- Tailwind CSS
- GBrain (company memory layer — Markdown knowledge base + vector/hybrid search, accessed via CLI, HTTP, or a local fallback)
- LLM provider (OpenAI / Anthropic / Gemini)

## Repo Layout

```txt
Woojin/
  src/                  # Electron + React app (main + renderer)
  brain/                # Seed company knowledge base (Markdown, imported into GBrain)
    company/            # overview, mission/vision/values, services, pricing, policies, faq
    products/            # shogun_ai, ai_management_platform, count_ai, ai_crm
    customers/           # customer_a, customer_b, customer_c
    projects/            # project_x_* (overview, meetings, proposal, requirements, decisions)
    people/               # client_person_a, engineer_b, partner_c
    templates/            # sales_reply, polite_decline, proposal_followup, meeting_summary,
                          # english_reply, security_answer
  docs/
    architecture.md      # system architecture, data flow, GBrain client modes
    product.md            # concept, core UX, MVP scope
    setup.md               # install, permissions, API keys, GBrain setup
    security.md             # privacy stance and security posture
  scripts/
    setup-brain.sh        # imports brain/ into GBrain (gbrain import / gbrain embed)
  README.md
```

## Non-goals (MVP)

- Not the full SHOGUN AI product
- No continuous screen recording
- No automatic saving of all app activity
- No auto-send of generated content
- No complex multi-tenant SaaS or admin dashboard
- No full OAuth integrations (Gmail/Slack/Notion API sync is a later phase)
- No autonomous agent execution
- No mobile app

See `docs/product.md` for the full Must/Should/Later scope breakdown.

---

## 概要（日本語）

ContextAssistantは、macOS上でユーザーが今見ている画面の文脈と、GBrainに蓄積された会社の長期記憶（会社概要・顧客情報・案件情報・議事録・テンプレートなど）を組み合わせ、すぐに使える返信・要約・提案文・次アクションを生成する軽量デスクトップアプリです。

Slackで顧客メッセージを選択 → Option+Spaceを押す → フローティングUIが表示 → 「Reply with company context」をクリック → GBrainが顧客・案件・テンプレートを検索 → LLMが返信案を生成 → 参照ソースを表示 → コピーしてそのまま使う。

これがMVPとして目指す最初のデモ体験です。詳細は `docs/product.md` および `docs/setup.md` を参照してください。
