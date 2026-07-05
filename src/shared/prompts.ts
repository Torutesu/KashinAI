import type { ActionType, ChatMessage, ContextPack, CurrentContext, RetrievedContext } from './types'
import { buildLiveContextDigest } from './live-context'

const NO_CONTEXT_NOTICE_JA =
  '関連する会社コンテキストは見つかりませんでした。現在選択されているテキストのみを元に作成します。'
const NO_CONTEXT_NOTICE_EN =
  'No relevant company context was found. This was generated using only the currently selected text.'

export const SYSTEM_PROMPT = `あなたは社内の業務文脈を理解したAIアシスタントです。

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

function formatRetrievedContext(items: RetrievedContext[]): string {
  if (items.length === 0) return '(none found)'
  return items
    .map((item) => `[${item.source}] ${item.title}\n${item.content}`)
    .join('\n\n---\n\n')
}

function formatCurrentContext(currentContext: CurrentContext): string {
  return `Live Context Digest:
${buildLiveContextDigest(currentContext) || '(none)'}

Active App:
${currentContext.activeApp ?? '(unknown)'}

Window Title:
${currentContext.windowTitle ?? '(unknown)'}

Context Kind:
${currentContext.contextKind}

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

const ACTION_INSTRUCTIONS: Record<ActionType, string> = {
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
}

export function buildActionPrompt(pack: ContextPack, modifier?: 'shorter' | 'more_polite' | null): string {
  const { currentContext, userInstruction, actionType, retrievedContext, outputPreferences } = pack

  const instructionBlock = ACTION_INSTRUCTIONS[actionType].replace(
    '{{user_instruction}}',
    userInstruction || '(none provided)'
  )

  const modifierLine =
    modifier === 'shorter'
      ? '\n\n追加指示: 前回よりも大幅に短く、要点だけにしてください。'
      : modifier === 'more_polite'
        ? '\n\n追加指示: 前回よりも丁寧で、フォーマルな敬語表現にしてください。'
        : ''

  return `${instructionBlock}${modifierLine}

Current Live Context:
${formatCurrentContext(currentContext)}

User Instruction:
${userInstruction || '(none provided)'}

Company Context:
${formatRetrievedContext(retrievedContext)}

出力条件:
- 言語: ${outputPreferences.language === 'en' ? 'English' : '日本語'}
- トーン: ${outputPreferences.tone}
- 長さ: ${outputPreferences.length}`
}

export function buildPrompt(pack: ContextPack, modifier?: 'shorter' | 'more_polite' | null): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
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

  return {
    system: `${SYSTEM_PROMPT}

チャットモードの追加ルール:
- 必ず Current Live Context を最優先で読んで回答する
- Live Context Digest、開いているページの URL/title/text、Accessibility Text、または Screen OCR Text がある場合は、それを現在の画面文脈として扱う
- Company Context と画面文脈が矛盾する、または関係が薄い場合は Company Context を無視する
- Twitter/X、SNS、コード、ターミナル、エディタ画面へのおすすめ文では Company Context や GBrain を話題に出さない
- 直近の質問だけでなく Chat History を踏まえて自然に会話する`,
    user: `Latest User Message:
${latestUserMessage || '(none)'}

Chat History:
${formatChatHistory(params.messages)}

Current Live Context:
${formatCurrentContext(params.currentContext)}

Company Context from GBrain:
${formatRetrievedContext(params.retrievedContext)}

GBrain Search Query:
${params.searchQuery || '(empty)'}

出力条件:
- 言語: ${params.outputPreferences.language === 'en' ? 'English' : '日本語'}
- トーン: ${params.outputPreferences.tone}
- 長さ: ${params.outputPreferences.length}`
  }
}
