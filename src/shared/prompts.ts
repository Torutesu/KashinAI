import type { ActionType, ChatMessage, ContextPack, CurrentContext, RetrievedContext } from './types'
import { buildLiveContextDigest } from './live-context'
import { resolveOutputLanguage, type OutputLanguage } from './language'

const SYSTEM_PROMPT_JA = `あなたは社内の業務文脈を理解したAIアシスタントです。

ユーザーは現在、macOS上の別アプリで作業しています。
あなたの役割は、現在の画面・選択テキスト・Accessibility Text・スクリーンOCRを最優先で理解し、その場で使える返信・要約・提案文・次アクションを生成することです。

重要なルール:
- Current Live Context を最優先する。特に Live Context Digest、Accessibility Text、Screen OCR Text、Selected Text、Page Title、Page URL、Active App を必ず読む
- Company Context / GBrain / memory は補助情報としてのみ使う。現在画面と関係が薄い場合は使わない
- Twitter/X、SNS、コード、ターミナル、エディタ画面では、Live Context Digest だけで十分ならそれだけを使う。会社文脈に無理やり寄せない
- 不明なことは断定しない
- 顧客に送る文章と社内メモを混ぜない
- 秘密情報や内部事情を外部向け文面に含めない
- 生成物はすぐ使える形にする
- 長すぎず、自然な文章にする
- 必要なら根拠や参照ソースを簡潔に示す
- ソースにない事実は作らない
- 会社コンテキストが1件も見つからなくても、画面文脈があれば普通に生成する。ユーザーに内部状態を説明しない`

const SYSTEM_PROMPT_EN = `You are an AI assistant that understands the user's work and company context.

The user is currently working in another macOS app.
Your job is to read the current screen, selected text, Accessibility Text, and screen OCR first, and produce a ready-to-use reply, summary, proposal, or next action for that exact moment.

Key rules:
- Prioritize the Current Live Context. Always read the Live Context Digest, Accessibility Text, Screen OCR Text, Selected Text, Page Title, Page URL, and Active App
- Use Company Context / GBrain / memory only as supporting information. Ignore it when it is weakly related to the current screen
- On Twitter/X, social apps, code, terminals, and editor screens, use only the Live Context Digest when that is enough. Do not force company context in
- Do not assert things you are unsure about
- Do not mix internal notes into text meant for customers
- Never include secrets or internal details in outward-facing drafts
- Make the output immediately usable
- Keep it natural and not too long
- Cite the basis or source briefly when useful
- Never invent facts that are not in the sources
- Even if no company context is found, still generate normally from the screen context. Do not explain your internal state to the user`

function systemPrompt(language: OutputLanguage): string {
  return language === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA
}

const CHAT_RULES_JA = `チャットモードの追加ルール:
- 必ず Current Live Context を最優先で読んで回答する
- Live Context Digest、開いているページの URL/title/text、Accessibility Text、または Screen OCR Text がある場合は、それを現在の画面文脈として扱う
- Company Context と画面文脈が矛盾する、または関係が薄い場合は Company Context を無視する
- Twitter/X、SNS、コード、ターミナル、エディタ画面へのおすすめ文では Company Context や GBrain を話題に出さない
- 直近の質問だけでなく Chat History を踏まえて自然に会話する`

const CHAT_RULES_EN = `Additional rules for chat mode:
- Always answer by reading the Current Live Context first
- When a Live Context Digest, the open page's URL/title/text, Accessibility Text, or Screen OCR Text is present, treat it as the current screen context
- Ignore Company Context when it conflicts with, or is weakly related to, the screen context
- For suggestions aimed at Twitter/X, social apps, code, terminals, or editors, do not bring up Company Context or GBrain
- Hold a natural conversation using the Chat History, not just the latest message`

function chatRules(language: OutputLanguage): string {
  return language === 'en' ? CHAT_RULES_EN : CHAT_RULES_JA
}

const ACTION_INSTRUCTIONS: Record<OutputLanguage, Record<ActionType, string>> = {
  ja: {
    reply: `以下の現在文脈と会社コンテキストを踏まえて、相手に送れる返信文を作成してください。

出力条件:
- 丁寧だが長すぎない
- 顧客にそのまま送れる
- 内部情報は出さない
- 必要なら次の確認事項を自然に入れる`,
    summarize: `以下のテキストを、会社コンテキストを踏まえて要約してください。

出力形式:
- 要点
- 背景
- 論点
- 次アクション
- 注意点`,
    next_actions: `以下の現在文脈と会社コンテキストを踏まえて、次に取るべきアクションを箇条書きで抽出してください。

出力条件:
- 具体的で実行可能なタスクにする
- 優先度が分かる順序で並べる
- 不明確な点は「要確認」として明示する`,
    proposal: `以下の顧客要望と会社コンテキストを踏まえて、提案書に使える文章を作成してください。

条件:
- 顧客課題に紐づける
- 自社サービスの価値を明確にする
- PoCとして実行しやすい範囲にする
- 価格や条件は断定しすぎない
- 営業資料に貼れる文章にする`,
    translate: `以下のテキストを英語に翻訳してください。会社コンテキストは、専門用語や固有名詞の訳を正確にするための参考として使ってください。

出力条件:
- 自然な英語にする
- 原文のトーンとニュアンスを保つ
- 固有名詞（会社名・製品名・人名）は正確に扱う`,
    custom: `以下の現在文脈と会社コンテキストを踏まえて、ユーザーの指示に従って文章を生成してください。

User Instruction:
{{user_instruction}}`
  },
  en: {
    reply: `Using the current context and company context below, write a reply the user can send.

Requirements:
- Polite but not too long
- Ready to send to the counterpart as-is
- Do not reveal internal information
- Naturally include a next question to confirm when appropriate`,
    summarize: `Summarize the text below, taking the company context into account.

Format:
- Key points
- Background
- Open questions
- Next actions
- Things to watch out for`,
    next_actions: `Using the current context and company context below, extract the next actions to take as a bullet list.

Requirements:
- Make them concrete, actionable tasks
- Order them so priority is clear
- Mark anything unclear as "needs confirmation"`,
    proposal: `Using the customer request and company context below, write text usable in a proposal.

Requirements:
- Tie it to the customer's problem
- Make the value of our services clear
- Keep it to a scope that is easy to run as a PoC
- Do not over-commit on price or terms
- Make it text that can be pasted into a sales deck`,
    translate: `Translate the text below into English. Use the company context as a reference to translate technical terms and proper nouns accurately.

Requirements:
- Make it natural English
- Preserve the tone and nuance of the original
- Handle proper nouns (company, product, and person names) accurately`,
    custom: `Using the current context and company context below, generate text following the user's instruction.

User Instruction:
{{user_instruction}}`
  }
}

const MODIFIER_LINES: Record<OutputLanguage, { shorter: string; more_polite: string }> = {
  ja: {
    shorter: '\n\n追加指示: 前回よりも大幅に短く、要点だけにしてください。',
    more_polite: '\n\n追加指示: 前回よりも丁寧で、フォーマルな敬語表現にしてください。'
  },
  en: {
    shorter: '\n\nAdditional instruction: make it much shorter than before — just the key points.',
    more_polite: '\n\nAdditional instruction: make it more polite and formal than before.'
  }
}

const LANGUAGE_LABEL: Record<OutputLanguage, string> = { ja: '日本語', en: 'English' }

function outputConditions(language: OutputLanguage, pref: ContextPack['outputPreferences']): string {
  if (language === 'en') {
    return `Output requirements:
- Language: ${LANGUAGE_LABEL[language]}
- Tone: ${pref.tone}
- Length: ${pref.length}`
  }
  return `出力条件:
- 言語: ${LANGUAGE_LABEL[language]}
- トーン: ${pref.tone}
- 長さ: ${pref.length}`
}

function formatRetrievedContext(items: RetrievedContext[]): string {
  if (items.length === 0) return '(none found)'
  return items
    .map((item) => `[${item.source}] ${item.title}\n${item.content}`)
    .join('\n\n---\n\n')
}

function formatCurrentContext(currentContext: CurrentContext, digest: string): string {
  return `Live Context Digest:
${digest || '(none)'}

Active App:
${currentContext.activeApp ?? '(unknown)'}

Window Title:
${currentContext.windowTitle ?? '(unknown)'}

Context Kind:
${currentContext.contextKind}

Primary Content Source:
${currentContext.primaryContentSource}

Page Title:
${currentContext.pageTitle ?? '(none)'}

Page URL:
${currentContext.pageUrl ?? '(none)'}

Page Capture Method:
${currentContext.pageCaptureMethod}

Accessibility Capture Method:
${currentContext.accessibilityCaptureMethod}

Screen Capture Method:
${currentContext.screenCaptureMethod}

Screenshot Path:
${currentContext.screenshotPath ?? '(none)'}

Selected Text:
${currentContext.selectedText ?? '(none)'}

Open Page Text:
${currentContext.pageText ?? '(none)'}

Accessibility Text:
${currentContext.accessibilityText ?? '(none)'}

Screen OCR Text:
${currentContext.screenText ?? '(none)'}

Clipboard Fallback:
${currentContext.clipboardText ?? '(none)'}`
}

function formatChatHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) return '(none)'
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n')
}

/**
 * The translate action always targets English; otherwise the output language honors the user's
 * preference, or is auto-detected from the on-screen context digest when the preference is `auto`.
 */
function resolvePromptLanguage(
  actionType: ActionType | 'chat',
  pref: ContextPack['outputPreferences'],
  digest: string
): OutputLanguage {
  if (actionType === 'translate') return 'en'
  return resolveOutputLanguage(pref.language, digest)
}

export function buildActionPrompt(pack: ContextPack, modifier?: 'shorter' | 'more_polite' | null): string {
  const { currentContext, userInstruction, actionType, retrievedContext, outputPreferences } = pack
  const digest = buildLiveContextDigest(currentContext)
  const language = resolvePromptLanguage(actionType, outputPreferences, digest)

  const instructionBlock = ACTION_INSTRUCTIONS[language][actionType].replace(
    '{{user_instruction}}',
    userInstruction || '(none provided)'
  )

  const modifierLine =
    modifier === 'shorter'
      ? MODIFIER_LINES[language].shorter
      : modifier === 'more_polite'
        ? MODIFIER_LINES[language].more_polite
        : ''

  return `${instructionBlock}${modifierLine}

Current Live Context:
${formatCurrentContext(currentContext, digest)}

User Instruction:
${userInstruction || '(none provided)'}

Company Context:
${formatRetrievedContext(retrievedContext)}

${outputConditions(language, outputPreferences)}`
}

export function buildPrompt(pack: ContextPack, modifier?: 'shorter' | 'more_polite' | null): { system: string; user: string } {
  const digest = buildLiveContextDigest(pack.currentContext)
  const language = resolvePromptLanguage(pack.actionType, pack.outputPreferences, digest)
  return {
    system: systemPrompt(language),
    user: buildActionPrompt(pack, modifier)
  }
}

export function buildChatPrompt(params: {
  currentContext: CurrentContext
  messages: ChatMessage[]
  retrievedContext: RetrievedContext[]
  searchQuery: string
  outputPreferences: ContextPack['outputPreferences']
}): { system: string; user: string } {
  const latestUserMessage = [...params.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const digest = buildLiveContextDigest(params.currentContext)
  const language = resolvePromptLanguage('chat', params.outputPreferences, digest)

  return {
    system: `${systemPrompt(language)}

${chatRules(language)}`,
    user: `Latest User Message:
${latestUserMessage || '(none)'}

Chat History:
${formatChatHistory(params.messages)}

Current Live Context:
${formatCurrentContext(params.currentContext, digest)}

Company Context from GBrain:
${formatRetrievedContext(params.retrievedContext)}

GBrain Search Query:
${params.searchQuery || '(empty)'}

${outputConditions(language, params.outputPreferences)}`
  }
}
