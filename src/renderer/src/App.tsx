import { useEffect, useState } from 'react'
import type { ActionType, AppError, ChatMessage, ContextSource, CurrentContext, GenerateResult } from '@shared/types'
import AssistantPanel from './components/AssistantPanel'
import ResultView from './components/ResultView'
import SettingsView from './components/SettingsView'

type PanelView = 'assistant' | 'result' | 'settings'

function AssistantFlow() {
  const [context, setContext] = useState<CurrentContext | null>(null)
  const [view, setView] = useState<PanelView>('assistant')
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [userInstruction, setUserInstruction] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastContextSource, setLastContextSource] = useState<ContextSource | null>(null)
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [appDisplayName, setAppDisplayName] = useState('KashinAI')
  const [showSources, setShowSources] = useState(true)
  const [accessibilityGranted, setAccessibilityGranted] = useState<boolean | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onContextPushed((ctx) => {
      setContext(ctx)
      setView('assistant')
      setResult(null)
      setError(null)
    })

    const unsubscribeNavigate = window.api.onNavigate((nextView) => {
      setView(nextView)
    })

    window.api.getSettings().then((settings) => {
      setAppDisplayName(settings.appDisplayName)
      setShowSources(settings.privacy.showSources)
    })

    window.api.checkAccessibility().then(setAccessibilityGranted)

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        void window.api.hideWindow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      unsubscribe()
      unsubscribeNavigate()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function triggerGenerate(nextActionType: ActionType, nextInstruction: string): Promise<void> {
    if (!context) return
    setActionType(nextActionType)
    setUserInstruction(nextInstruction)
    setLoading(true)
    setError(null)

    const res = await window.api.generate({
      currentContext: context,
      actionType: nextActionType,
      userInstruction: nextInstruction,
      modifier: null
    })

    setLoading(false)
    if (res.ok) {
      setResult(res.data)
      setView('result')
    } else {
      setError(res.error)
    }
  }

  async function triggerChat(nextInstruction: string): Promise<void> {
    if (!context || !nextInstruction.trim()) return

    const userMessage: ChatMessage = { role: 'user', content: nextInstruction.trim() }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setLoading(true)
    setError(null)

    const res = await window.api.chat({
      currentContext: context,
      messages: nextMessages
    })

    setLoading(false)
    if (res.ok) {
      setMessages((prev) => [...prev, res.data.message])
      setLastContextSource(res.data.contextSource)
      setLastSearchQuery(res.data.searchQuery)
      setCustomInstruction('')
    } else {
      setError(res.error)
    }
  }

  async function refreshContext(): Promise<void> {
    const ctx = await window.api.captureContext()
    setContext(ctx)
    setView('assistant')
    setResult(null)
    setError(null)
  }

  async function requestAccessibility(): Promise<void> {
    const granted = await window.api.requestAccessibility()
    setAccessibilityGranted(granted)
  }

  async function regenerate(modifier: 'shorter' | 'more_polite' | null): Promise<void> {
    if (!context || !actionType) return
    setLoading(true)
    setError(null)

    const res = await window.api.generate({
      currentContext: context,
      actionType,
      userInstruction,
      modifier
    })

    setLoading(false)
    if (res.ok) {
      setResult(res.data)
    } else {
      setError(res.error)
      setView('assistant')
    }
  }

  async function handleCopy(): Promise<void> {
    if (!result) return
    await window.api.copyOutput(result.output)
    setCopyState('copied')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  async function handleInsert(): Promise<void> {
    if (!result) return
    await window.api.insertOutput(result.output, context?.activeApp ?? null)
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      {view === 'assistant' && (
        <AssistantPanel
          appDisplayName={appDisplayName}
          context={context}
          customInstruction={customInstruction}
          messages={messages}
          lastContextSource={lastContextSource}
          lastSearchQuery={lastSearchQuery}
          onCustomInstructionChange={setCustomInstruction}
          onSelectAction={(type) => {
            const instructionByAction: Record<ActionType, string> = {
              reply: 'Find loose ends and suggest the best reply using the current page and GBrain context.',
              proposal: 'Draft an update using the current page and GBrain context.',
              summarize: 'Catch me up on the current page using GBrain context.',
              next_actions: 'Extract next actions from the current page using GBrain context.',
              translate: 'Translate the current page context using GBrain terminology.',
              custom: customInstruction
            }
            void triggerChat(instructionByAction[type])
          }}
          onGenerateCustom={() => void triggerChat(customInstruction)}
          onRefreshContext={() => void refreshContext()}
          loading={loading}
          error={error}
          onOpenSettings={() => void window.api.openSettings()}
          onClose={() => void window.api.hideWindow()}
          onRequestAccessibility={() => void requestAccessibility()}
          accessibilityGranted={accessibilityGranted}
        />
      )}
      {view === 'result' && result && (
        <ResultView
          result={result}
          loading={loading}
          showSources={showSources}
          onBack={() => setView('assistant')}
          onClose={() => void window.api.hideWindow()}
          onCopy={() => void handleCopy()}
          onInsert={() => void handleInsert()}
          onRegenerate={() => void regenerate(null)}
          onShorter={() => void regenerate('shorter')}
          onMorePolite={() => void regenerate('more_polite')}
          copyState={copyState}
        />
      )}
      {view === 'settings' && (
        <SettingsView
          accessibilityGranted={accessibilityGranted}
          onRequestAccessibility={() => void requestAccessibility()}
          onBack={() => setView('assistant')}
          onClose={() => void window.api.hideWindow()}
        />
      )}
    </div>
  )
}

export default function App() {
  return <AssistantFlow />
}
