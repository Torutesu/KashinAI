import { useEffect, useState } from 'react'
import type { ActionType, AppError, CurrentContext, GenerateResult } from '@shared/types'
import AssistantPanel from './components/AssistantPanel'
import ResultView from './components/ResultView'
import SettingsView from './components/SettingsView'

type View = 'assistant' | 'result'
type PanelView = 'assistant' | 'result' | 'settings'

function AssistantFlow() {
  const [context, setContext] = useState<CurrentContext | null>(null)
  const [view, setView] = useState<PanelView>('assistant')
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [userInstruction, setUserInstruction] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [result, setResult] = useState<GenerateResult | null>(null)
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
          onCustomInstructionChange={setCustomInstruction}
          onSelectAction={(type) => void triggerGenerate(type, '')}
          onGenerateCustom={() => void triggerGenerate('custom', customInstruction)}
          loading={loading}
          error={error}
          onOpenSettings={() => void window.api.openSettings()}
          onClose={() => void window.api.hideWindow()}
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
      {view === 'settings' && <SettingsView onBack={() => setView('assistant')} onClose={() => void window.api.hideWindow()} />}
    </div>
  )
}

export default function App() {
  return <AssistantFlow />
}
