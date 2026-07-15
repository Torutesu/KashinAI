import os from 'node:os'
import path from 'node:path'
import type { CurrentContext } from '../shared/types'
import type { FrontmostAppInfo } from './context-reader'

export type ContextClassificationInput = {
  activeApp: string | null
  windowTitle: string | null
  pageTitle: string | null
  pageUrl: string | null
  accessibilityText: string | null
  screenText: string | null
}

export type BrowserAppMetadata = {
  scriptName: string
  family: 'safari' | 'chromium' | 'keyboard-only'
  sessionRoots: string[]
}

export function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export type SessionUrlCandidateInput = {
  urls: string[]
  frontmost: FrontmostAppInfo
}

export type ChromiumSessionPageContextPlan = {
  pageTitle: string | null
  pageUrl: string | null
  shouldFetchPublicPageText: boolean
}

export type PublicPageFetchDecision = {
  allowed: boolean
  normalizedUrl: string | null
  reason:
    | 'invalid-url'
    | 'unsupported-scheme'
    | 'private-host'
    | 'local-host'
    | 'extension-host'
    | 'allowed'
}

export type PublicPageFetchRequest = {
  shouldFetch: boolean
  url: string | null
  reason: PublicPageFetchDecision['reason']
}

export type PublicPageTextFetchExecutionPlan = {
  request: PublicPageFetchRequest
  shouldFetch: boolean
  url: string | null
}

export type BundledResourcePathCandidatesInput = {
  isPackaged: boolean
  cwd: string
  appPath: string
  resourcesPath: string
  devRelativePath: string
  packagedFileName: string
}

export type BundledResourceRuntimePathInput = {
  candidates: string[]
  existingPaths: Iterable<string>
  fallbackPath: string
}

export type CompiledHelperReuseDecisionInput = {
  binaryMtimeMs: number | null | undefined
  scriptMtimeMs: number | null | undefined
}

export type PublicPageFetchResponseDecisionInput = {
  ok: boolean
  contentType: string | null
}

const URL_LIKE_RE = /\b(?:https?:\/\/|[a-z0-9-]+\.(?:com|ai|app|dev|io|jp|co)(?:\/|\b))/i
const SOCIAL_APP_RE = /(slack|discord|teams|line|chatwork|whatsapp|messenger|telegram|mail|outlook|superhuman|spark)/i
const SOCIAL_CONTENT_RE =
  /(twitter|x\.com|tweet|repost|following|followers|for you|返信|リポスト|フォロー|slack|direct message|message to |mention someone|send now|schedule for later|discord|microsoft teams|chatwork|start a new conversation|type a new message|post a reply|delivery options|loop components|\bsubject\b|\bfrom\b|\bcc\b|\bbcc\b|draft reply|compose mail|new message)/i
const BROWSER_LIKE_APP_RE = /(dia|chrome|arc|brave|edge|chromium|safari|firefox|opera)/i
const CODE_SIGNAL_RE =
  /(visual studio code|cursor|xcode|terminal|iterm|typescript|javascript|python|swift|tsx|jsx|\.ts|\.tsx|\.py|\.swift|function |class |const |import |export |return |=>|traceback|typeerror|exception|stack trace|npm |pnpm |yarn |cargo |swiftc )/i
const CALENDAR_SIGNAL_RE =
  /(calendar|meeting|invite|attendees?|organizer|availability|zoom|google meet|agenda|meeting notes|会議|予定|参加者|開催場所|議題|打ち合わせ|ミーティング)/i
const DESIGN_SIGNAL_RE =
  /(figma|frame|layer|variant|component|auto layout|prototype|properties|fill|stroke|spacing|design system|mockup|wireframe|hero section|cta|button label|corner radius|デザイン|レイヤー|コンポーネント|フレーム|プロトタイプ)/i
const GITHUB_DOC_SIGNAL_RE =
  /(github\.com|issue #\d+|pull request #\d+|discussions?|readme|wiki|docs|project board|milestone|assignees?|reviewers?)/i
const GITHUB_CODE_SIGNAL_RE =
  /(diff --git|@@ |\+\+\+ |--- |blob\/|commit [0-9a-f]{7,}|stack trace|traceback|typeerror|function |class |const |import |export |\.ts\b|\.tsx\b|\.py\b|\.swift\b)/i
const LOCAL_FILE_SIGNAL_RE =
  /(file:\/\/|\/users\/|\/src\/|\/documents\/|\/desktop\/|\/downloads\/|\.md\b|\.txt\b|\.rtf\b|\.docx?\b|\.pdf\b|\.csv\b|\.xlsx?\b|\.swift\b|\.ts\b|\.tsx\b|\.js\b|\.jsx\b|\.py\b|\.json\b)/i
const PRIVATE_FETCH_HOSTS = [
  'mail.google.com',
  'docs.google.com',
  'drive.google.com',
  'calendar.google.com',
  'app.slack.com',
  'slack.com',
  'discord.com',
  'teams.microsoft.com',
  'chat.openai.com',
  'chatgpt.com',
  'notion.so',
  'www.notion.so'
]
const TITLE_TOKEN_STOPWORDS = new Set([
  'https',
  'http',
  'www',
  'com',
  'app',
  'dev',
  'home',
  'personal',
  'profile',
  'guest',
  'work',
  'tab',
  'window',
  'new'
])

function browserishSignalCount(values: Array<string | null>): number {
  return values.filter((value) => Boolean(value && URL_LIKE_RE.test(value))).length
}

function frontmostTitleTokens(frontmost: FrontmostAppInfo): string[] {
  return (frontmost.windowTitle ?? '')
    .split(/[\s/|:：\-–—_()[\]【】「」『』,.!?&=]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !TITLE_TOKEN_STOPWORDS.has(token))
}

export type PrimaryContentSourceInput = {
  selectedText: string | null
  pageText: string | null
  pageUrl?: string | null
  pageCaptureMethod?: CurrentContext['pageCaptureMethod'] | null
  accessibilityText: string | null
  screenText: string | null
}

export type PrimaryContentSelection = {
  source: CurrentContext['primaryContentSource']
  reason:
    | 'selected-text'
    | 'page-text'
    | 'accessibility-text'
    | 'screen-ocr'
    | 'none'
    | 'selected-text-too-weak'
    | 'selected-text-url-noise'
}

export type PageContext = Pick<CurrentContext, 'pageTitle' | 'pageUrl' | 'pageText' | 'pageCaptureMethod'>

export type ResolveCaptureDecisionsInput = {
  frontmost: FrontmostAppInfo
  accessibilityContext: {
    appName: string | null
    windowTitle: string | null
    selectedText: string | null
    selectedTextSource?: Exclude<CurrentContext['selectedTextSource'], 'clipboard-selection'>
    accessibilityText: string | null
    pageTitle: string | null
    pageUrl: string | null
    pageText: string | null
  }
  accessibilityDiagnostics?: {
    lowSignal: boolean
    lowSignalReason:
      | 'missing-snapshot'
      | 'notification-center'
      | 'system-shell'
      | 'empty-ranked-lines'
      | 'title-only'
      | 'social-chrome-only'
      | 'browser-chrome-only'
      | 'weak-content'
      | null
  }
  clipboardSelectedText: string | null
}

export type ResolveCaptureDecisionsResult = {
  resolvedActiveApp: string | null
  resolvedWindowTitle: string | null
  selectedText: string | null
  selectedTextSource: CurrentContext['selectedTextSource']
  preliminaryKind: CurrentContext['contextKind']
  canSkipBrowserCapture: boolean
  canSkipOcr: boolean
}

export type ResolveContextCapturePlanInput = ResolveCaptureDecisionsInput

export type CapturePlanOverrides = {
  forceBrowserCapture?: boolean
  forceScreenCapture?: boolean
  forceNativeScreenCapture?: boolean
  suppressScreenOcr?: boolean
  suppressAccessibilityPageText?: boolean
  suppressBrowserPageText?: boolean
  suppressKeyboardPageText?: boolean
  suppressSessionPageText?: boolean
}

export type ResolveContextCapturePlanResult = ResolveCaptureDecisionsResult & {
  initialPageContext: PageContext
  browserProgress: BrowserCaptureProgress
  screenCapturePlan: ScreenCapturePlan
}

export type ClipboardSelectionCapturePolicyInput = {
  frontmost: FrontmostAppInfo
  accessibilityContext: {
    appName: string | null
    windowTitle: string | null
    selectedText: string | null
    selectedTextSource?: Exclude<CurrentContext['selectedTextSource'], 'clipboard-selection'>
    accessibilityText: string | null
    pageTitle: string | null
    pageUrl: string | null
    pageText: string | null
    accessibilityCaptureMethod?: CurrentContext['accessibilityCaptureMethod'] | null
  }
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
}

export type ClipboardSelectionCapturePolicy = {
  shouldAttemptClipboardSelection: boolean
  reason:
    | 'browser-surface'
    | 'weak-accessibility-context'
    | 'existing-selection'
    | 'strong-native-context'
}

export type ContextCapturePreparation = {
  clipboardSelectionPolicy: ClipboardSelectionCapturePolicy
  shouldAttemptClipboardSelection: boolean
  capturePlanInput: ResolveContextCapturePlanInput
}

export type AccessibilityFallbackPriority = {
  shouldTreatAccessibilityAsWeak: boolean
  shouldPreferBrowserFallback: boolean
  shouldSuppressScreenFallback: boolean
}

export type ContextCaptureRuntimeStateInput = {
  capturePlanInput: ResolveContextCapturePlanInput
  clipboardSelectedText: string | null
  overrides?: CapturePlanOverrides
}

export type ContextCaptureRuntimeState = ResolveContextCapturePlanResult & {
  browserLoopState: BrowserCaptureExecutionLoopState
}

export type ResolvedContextIdentity = {
  resolvedActiveApp: string | null
  resolvedWindowTitle: string | null
}

export type ResolvedCaptureSurface = ResolvedContextIdentity

export type ResolvedSelectedText = {
  selectedText: string | null
  selectedTextSource: CurrentContext['selectedTextSource']
}

export type RetainedSelectedTextDecision = {
  selectedText: string | null
  selectedTextSource: CurrentContext['selectedTextSource']
  reason: 'accepted' | 'missing' | 'ui-noise' | 'url-only-with-richer-context'
}

export type SharedSelectedTextCandidateDecision = {
  candidate: string | null
  reason: 'accepted' | 'missing' | 'ui-noise'
}

export type ScreenContext = Pick<CurrentContext, 'screenshotPath' | 'screenText' | 'screenCaptureMethod'>

export type AccessibilityPageContext = {
  appName: string | null
  windowTitle: string | null
  selectedText: string | null
  selectedTextSource?: Exclude<CurrentContext['selectedTextSource'], 'clipboard-selection'>
  accessibilityText: string | null
  accessibilityCaptureMethod: CurrentContext['accessibilityCaptureMethod']
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
}

export type BrowserCapturePlanInput = {
  activeApp: string | null
  canSkipBrowserCapture: boolean
  pageContext: PageContext
}

export type BrowserCapturePlan = {
  shouldCaptureBrowserPage: boolean
  shouldTryKeyboardFallback: boolean
  shouldTrySessionFallback: boolean
}

export type BrowserCaptureExecutionStateInput = {
  activeApp: string | null
  canSkipBrowserCapture: boolean
  pageContext: PageContext
  browserContext?: PageContext | null
  keyboardContext?: PageContext | null
}

export type BrowserCaptureExecutionState = {
  shouldCaptureBrowserPage: boolean
  shouldTryKeyboardFallback: boolean
  shouldTrySessionFallback: boolean
}

export type BrowserCaptureNextStep = 'none' | 'browser' | 'keyboard' | 'session'
export type BrowserCaptureStep = Exclude<BrowserCaptureNextStep, 'none'>

export type BrowserCaptureProgressInput = {
  activeApp: string | null
  canSkipBrowserCapture: boolean
  pageContext: PageContext
  browserContext?: PageContext | null
  keyboardContext?: PageContext | null
}

export type BrowserCaptureProgress = {
  state: BrowserCaptureExecutionState
  nextStep: BrowserCaptureNextStep
}

export type BrowserCaptureActionPlanInput = {
  activeApp: string | null
  canSkipBrowserCapture: boolean
  pageContext: PageContext
  browserContext?: PageContext | null
  keyboardContext?: PageContext | null
}

export type BrowserCaptureActionPlan = {
  shouldRunBrowserCapture: boolean
  shouldRunKeyboardFallback: boolean
  shouldRunSessionFallback: boolean
  initialNextStep: BrowserCaptureNextStep
  afterBrowserNextStep: BrowserCaptureNextStep
  afterKeyboardNextStep: BrowserCaptureNextStep
}

export type ResolveBrowserCaptureOutcomeInput = {
  activeApp: string | null
  canSkipBrowserCapture: boolean
  pageContext: PageContext
  browserContext?: PageContext | null
  keyboardContext?: PageContext | null
  sessionContext?: PageContext | null
}

export type ResolveBrowserCaptureOutcomeResult = {
  state: BrowserCaptureExecutionState
  initialNextStep: BrowserCaptureNextStep
  afterBrowserNextStep: BrowserCaptureNextStep
  afterKeyboardNextStep: BrowserCaptureNextStep
  attemptedSteps: Array<'browser' | 'keyboard' | 'session'>
  pageContext: PageContext
  browserCaptureMethod: CurrentContext['pageCaptureMethod'] | null
  keyboardCaptureMethod: CurrentContext['pageCaptureMethod'] | null
  sessionCaptureMethod: CurrentContext['pageCaptureMethod'] | null
}

export type BrowserCaptureStepPlan = {
  steps: BrowserCaptureStep[]
  outcome: ResolveBrowserCaptureOutcomeResult
}

export type BrowserCaptureExecutionPlan = {
  initial: BrowserCaptureStepPlan
  afterBrowser: BrowserCaptureStepPlan
  afterKeyboard: BrowserCaptureStepPlan
  final: BrowserCaptureStepPlan
}

export type BrowserCaptureRuntimeState = {
  actionPlan: BrowserCaptureActionPlan
  outcome: ResolveBrowserCaptureOutcomeResult
}

export type BrowserCaptureCollectionStateInput = ResolveBrowserCaptureOutcomeInput

export type BrowserCaptureCollectionState = {
  actionPlan: BrowserCaptureActionPlan
  outcome: ResolveBrowserCaptureOutcomeResult
  nextStep: BrowserCaptureNextStep
  shouldCollectBrowserContext: boolean
  shouldCollectKeyboardContext: boolean
  shouldCollectSessionContext: boolean
  finalPageContext: PageContext
}

export type BrowserCaptureCollectionPlan = {
  initial: BrowserCaptureCollectionState
  afterBrowser: BrowserCaptureCollectionState
  afterKeyboard: BrowserCaptureCollectionState
  final: BrowserCaptureCollectionState
  steps: BrowserCaptureStep[]
}

export type BrowserCaptureStepExecutionPlan =
  | {
      step: 'browser'
      strategy: 'browser-automation'
      activeApp: string | null
      requiresClipboardRestore: false
    }
  | {
      step: 'keyboard'
      strategy: 'keyboard-copy'
      frontmost: FrontmostAppInfo
      requiresClipboardRestore: true
    }
  | {
      step: 'session'
      strategy: 'chromium-session'
      frontmost: FrontmostAppInfo
      requiresClipboardRestore: false
    }

export type BrowserCaptureRuntimeInvocation =
  | {
      kind: 'capture-browser-page-context'
      activeApp: string | null
      usesOriginalClipboard: false
    }
  | {
      kind: 'capture-browser-page-via-keyboard'
      frontmost: FrontmostAppInfo
      usesOriginalClipboard: true
    }
  | {
      kind: 'capture-chromium-page-via-session'
      frontmost: FrontmostAppInfo
      usesOriginalClipboard: false
    }

export type BrowserCaptureLoopIteration =
  | {
      hasRequest: false
      request: null
      executionPlan: null
      invocation: null
    }
  | {
      hasRequest: true
      request: BrowserCaptureStepRequest
      executionPlan: BrowserCaptureStepExecutionPlan
      invocation: BrowserCaptureRuntimeInvocation
    }

export type BrowserCaptureStepRequest =
  | {
      step: 'browser'
      activeApp: string | null
    }
  | {
      step: 'keyboard' | 'session'
      frontmost: FrontmostAppInfo
    }

export type BrowserCaptureExecutionRequestsInput = BrowserCaptureCollectionStateInput & {
  resolvedWindowTitle: string | null
}

export type BrowserCaptureExecutionRequests = {
  plan: BrowserCaptureCollectionPlan
  requests: BrowserCaptureStepRequest[]
}

export type BrowserCaptureExecutionLoopStateInput = BrowserCaptureExecutionRequestsInput & {
  overrides?: CapturePlanOverrides
}

export type BrowserCaptureCollectedContexts = {
  browserContext: PageContext | null
  keyboardContext: PageContext | null
  sessionContext: PageContext | null
}

export type BrowserCaptureStepResult = {
  step: BrowserCaptureStep
  context: PageContext | null
}

export type AdvanceBrowserCaptureLoopStateInput = BrowserCaptureExecutionLoopStateInput & {
  stepResult?: BrowserCaptureStepResult | null
}

export type BrowserCaptureExecutionLoopState = {
  browserContext: PageContext | null
  keyboardContext: PageContext | null
  sessionContext: PageContext | null
  execution: BrowserCaptureExecutionRequests
}

export type CaptureTrace = NonNullable<import('../shared/types').BackendDiagnostics['captureTrace']>

export type BrowserCaptureTrace = CaptureTrace['browser']

export type BuildCaptureTraceInput = {
  resolvedActiveApp: string | null
  resolvedWindowTitle: string | null
  canSkipBrowserCapture: boolean
  canSkipOcr: boolean
  browserTrace: BrowserCaptureTrace
  finalPageCaptureMethod: CurrentContext['pageCaptureMethod']
  shouldCaptureScreen: boolean
  screenReason: 'strong-accessibility-context' | 'needs-screen-signal'
  finalScreenCaptureMethod: CurrentContext['screenCaptureMethod']
  screenSourceSelection?: ScreenSourceSelection | null
}

export type ResolveBrowserCaptureTraceInput = {
  browserExecutionPlan: BrowserCaptureCollectionPlan['final']
  finalPageCaptureMethod: CurrentContext['pageCaptureMethod']
}

export type BrowserAutomationTarget = {
  scriptName: string | null
  family: BrowserAppMetadata['family'] | null
}

export type BrowserPageCaptureDispatch = {
  scriptName: string | null
  mode: 'chromium' | 'safari' | 'none'
}

export type BrowserPageCaptureRuntimeInvocation =
  | {
      kind: 'skip-browser-page-capture'
      scriptName: null
    }
  | {
      kind: 'capture-safari-page'
      scriptName: string
    }
  | {
      kind: 'capture-chromium-page'
      scriptName: string
    }

export type BrowserFallbackDecisionInput = {
  plan: Pick<BrowserCapturePlan, 'shouldTryKeyboardFallback' | 'shouldTrySessionFallback'>
  browserContext: PageContext
  keyboardContext?: PageContext | null
}

export type BrowserFallbackExecutionPlan = {
  shouldTryKeyboardFallback: boolean
  shouldTrySessionFallback: boolean
}

export type MergeBrowserPageContextsInput = {
  base: PageContext
  browserContext: PageContext
  keyboardContext?: PageContext | null
  sessionContext?: PageContext | null
  plan: Pick<BrowserCapturePlan, 'shouldTryKeyboardFallback' | 'shouldTrySessionFallback'>
}

export type BuildCurrentContextInput = {
  resolvedActiveApp: string | null
  resolvedWindowTitle: string | null
  selectedText: string | null
  selectedTextSource: CurrentContext['selectedTextSource']
  pageContext: PageContext
  accessibilityContext: AccessibilityPageContext
  screenContext: ScreenContext
  timestamp: string
}

export type FinalizeContextCaptureResultInput = {
  resolvedActiveApp: string | null
  resolvedWindowTitle: string | null
  selectedText: string | null
  selectedTextSource: CurrentContext['selectedTextSource']
  accessibilityContext: AccessibilityPageContext
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
  screenContext: ScreenContext
  browserExecutionPlan: BrowserCaptureCollectionPlan['final']
  canSkipBrowserCapture: boolean
  canSkipOcr: boolean
  screenCapturePlan: ScreenCapturePlan
  screenSourceSelection?: ScreenSourceSelection | null
  timestamp: string
}

export type FinalizeContextCaptureResult = {
  context: CurrentContext
  captureTrace: CaptureTrace
}

export type ScreenContextCaptureRequestInput = {
  accessibilityText: string | null
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
  pageContext: PageContext
  canSkipOcr: boolean
  overrides?: CapturePlanOverrides
}

export type ScreenContextCaptureRequest = {
  plan: ScreenCapturePlan
  options:
    | {
        skipOcr: boolean
        suppressScreenOcr?: boolean
        forceNativeScreenCapture?: boolean
      }
    | null
}

export type ScreenContextExecutionPlan = {
  plan: ScreenCapturePlan
  shouldCapture: boolean
  options: ScreenContextCaptureRequest['options']
  skippedResult: {
    screenContext: Pick<CurrentContext, 'screenshotPath' | 'screenText' | 'screenCaptureMethod'>
    sourceSelection: null
  }
}

export type BrowserCaptureDebugOverrideInput = {
  browserContext?: PageContext | null
  keyboardContext?: PageContext | null
  sessionContext?: PageContext | null
  overrides?: Pick<
    CapturePlanOverrides,
    'suppressBrowserPageText' | 'suppressKeyboardPageText' | 'suppressSessionPageText'
  >
}

export type NativeScreenRetryDecisionInput = {
  skipOcr: boolean
  sourceKind: 'window' | 'screen'
  screenText: string | null
}

export type ScreenOcrDecisionInput = {
  skipOcr: boolean
  suppressScreenOcr?: boolean
}

export type InitialScreenCaptureMode = 'desktop-source' | 'native-screen'

export type InitialScreenCaptureDecisionInput = {
  overrides?: Pick<CapturePlanOverrides, 'forceNativeScreenCapture'>
}

export type ScreenCaptureExecutionDecisionInput = {
  skipOcr: boolean
  suppressScreenOcr?: boolean
  sourceKind: 'window' | 'screen'
  screenText: string | null
}

export type ScreenCaptureExecutionDecision = {
  shouldRunOcr: boolean
  shouldRetryWithNativeFallback: boolean
}

export type ScreenCaptureAttemptPlanInput = {
  skipOcr: boolean
  suppressScreenOcr?: boolean
  initialSourceKind: 'window' | 'screen'
  initialScreenText: string | null
}

export type ScreenCaptureAttemptPlan = {
  initialAttempt: ScreenCaptureExecutionDecision
  fallbackAttempt: ScreenCaptureExecutionDecision | null
}

export type ScreenCaptureRetryPlanInput = {
  executionDecision: ScreenCaptureExecutionDecision
  fallbackAttempt: ScreenCaptureExecutionDecision | null
}

export type ScreenCaptureRetryPlan = {
  shouldRetryWithNativeFallback: boolean
  retryAttempt: ScreenCaptureExecutionDecision | null
}

export type ScreenCaptureRuntimeStateInput = {
  skipOcr: boolean
  suppressScreenOcr?: boolean
  screenshotPath: string | null
  sourceKind: 'window' | 'screen' | null
  screenText: string | null
}

export type ScreenCaptureRuntimeState = {
  screenshotPath: string | null
  sourceKind: 'window' | 'screen' | null
  screenText: string | null
  executionDecision: ScreenCaptureExecutionDecision | null
  retryPlan: ScreenCaptureRetryPlan | null
}

export type CapturedScreenshotRuntimeInput = {
  skipOcr: boolean
  suppressScreenOcr?: boolean
  currentSelection: ScreenSourceSelection | null
  screenshot:
    | {
        screenshotPath: string
        sourceKind: 'window' | 'screen'
        sourceSelection?: ScreenSourceSelection | null
      }
    | null
  usedNativeRetryFallback?: boolean
}

export type ScreenCaptureAttemptOutcomeInput = CapturedScreenshotRuntimeInput & {
  screenText: string | null
}

export type CapturedScreenshotRuntimeResult = {
  sourceSelection: ScreenSourceSelection | null
  runtimeState: ScreenCaptureRuntimeState
  ocrInvocation: ScreenCaptureRuntimeInvocation
}

export type ScreenCaptureAttemptOutcome = {
  sourceSelection: ScreenSourceSelection | null
  runtimeState: ScreenCaptureRuntimeState
}

export type ScreenCaptureAttemptExecutionInput = ScreenCaptureAttemptOutcomeInput

export type ScreenCaptureAttemptExecutionResult = {
  sourceSelection: ScreenSourceSelection | null
  runtimeState: ScreenCaptureRuntimeState
  ocrInvocation: ScreenCaptureRuntimeInvocation
}

export type ScreenCaptureRuntimeInvocation =
  | {
      kind: 'capture-screen-screenshot'
      mode: InitialScreenCaptureMode
    }
  | {
      kind: 'recognize-screenshot-text'
      screenshotPath: string
    }
  | {
      kind: 'no-screen-ocr'
    }

export type InitialScreenCaptureRuntimeInvocation = Extract<
  ScreenCaptureRuntimeInvocation,
  { kind: 'capture-screen-screenshot' }
>

export type InitialScreenSourceSelectionInput = {
  initialCaptureMode: InitialScreenCaptureMode
}

export type ScreenSourceSelectionResolutionInput = {
  currentSelection: ScreenSourceSelection | null
  screenshotSelection?: ScreenSourceSelection | null
  usedNativeRetryFallback?: boolean
}

export type ScreenCapturePlanInput = {
  canSkipOcr: boolean
  overrides?: CapturePlanOverrides
}

export type ScreenCapturePlan = {
  shouldCaptureScreen: boolean
  reason: 'strong-accessibility-context' | 'needs-screen-signal'
}

export type FinalScreenCapturePlanInput = {
  accessibilityText: string | null
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
  pageContext: PageContext
  overrides?: CapturePlanOverrides
}

export type ScreenCaptureDecisionReasonInput = {
  accessibilityText: string | null
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
  pageContext: Pick<PageContext, 'pageTitle' | 'pageUrl' | 'pageText'>
  overrides?: CapturePlanOverrides
}

export type FinalizeScreenContextInput = {
  screenshotPath: string | null
  sourceKind: 'window' | 'screen' | null
  screenText: string | null
}

export type DesktopCaptureSourceCandidate = {
  id: string
  name: string
  hasThumbnail: boolean
}

export type PickDesktopCaptureSourceResult = {
  source: DesktopCaptureSourceCandidate | null
  sourceKind: 'window' | 'screen' | null
}

export type DesktopCaptureFallbackReason =
  | 'matched-window'
  | 'screen-fallback-no-window-match'
  | 'screen-fallback-no-window-candidates'
  | 'screen-fallback-no-viable-window-thumbnails'
  | 'no-viable-sources'

export type ScreenSourceSelection = {
  fallbackReason: DesktopCaptureFallbackReason
  preferredCaptureMode: 'desktop-source' | 'native-screen'
}

export type DesktopCaptureSourceSelectionSummary = PickDesktopCaptureSourceResult & {
  fallbackReason: DesktopCaptureFallbackReason
  shouldPreferNativeScreenCapture: boolean
}

export type DesktopCaptureRuntimePlan = {
  captureMode: 'desktop-source' | 'native-screen' | 'unavailable'
  sourceId: string | null
  sourceKind: 'window' | 'screen' | null
  sourceSelection: ScreenSourceSelection | null
}

export type BrowserAutomationCapture = {
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
}

export type ChromiumTabMetadata = Pick<PageContext, 'pageTitle' | 'pageUrl'>

export type BrowserPageContextMethod = 'browser-automation' | 'keyboard-copy' | 'chrome-session'

export type LsAppInfoFrontRecord = {
  asn: string | null
  displayName: string | null
  bundleId: string | null
}

export type BrowserPageTextFetchPlan = {
  normalizedCapture: BrowserAutomationCapture
  shouldFetchPublicPageText: boolean
}

export type BrowserPageContextResolutionPlanInput = {
  capture: BrowserAutomationCapture
  pageCaptureMethod: BrowserPageContextMethod
}

export type BrowserPageContextResolutionPlan = BrowserPageTextFetchPlan & {
  pageCaptureMethod: BrowserPageContextMethod
}

export type BrowserPageContextFetchExecutionPlan = BrowserPageContextResolutionPlan & {
  fetchRequest: PublicPageFetchRequest
}

export type ResolvedFetchedBrowserPageContextInput = {
  capture: BrowserAutomationCapture
  fetchedPageText?: string | null
  pageCaptureMethod: BrowserPageContextMethod
}

export type FrontmostNormalizationInput = {
  scriptActiveApp: string | null
  scriptWindowTitle: string | null
  accessibilityAppName: string | null
  accessibilityWindowTitle: string | null
}

export type FrontmostNormalizationResult = {
  activeApp: string | null
  windowTitle: string | null
}

export type FrontmostAppResolutionInput = {
  systemEventsAppName: string | null
  lsappinfoAppName: string | null
}

export type FrontmostAppResolutionResult = {
  activeApp: string | null
  source: 'system-events' | 'lsappinfo' | 'none'
}

export type ChromiumSessionFileCandidate = {
  filePath: string
  mtimeMs: number
}

const SESSION_URL_RE = /https?:\/\/[^\s"'<>\\\u0000]+/g
const FRONTMOST_NOISE_APP_RE =
  /^(loginwindow|usernotificationcenter|notificationcenter|controlcenter|window server|windowserver)$/i

export const EMPTY_PAGE_CONTEXT: PageContext = {
  pageTitle: null,
  pageUrl: null,
  pageText: null,
  pageCaptureMethod: 'none'
}

export function hasSubstantialText(value: string | null, minLength = 240): boolean {
  return Boolean(value && value.replace(/\s+/g, '').length > minLength)
}

export function isLikelyFrontmostNoiseApp(appName: string | null): boolean {
  return Boolean(appName && FRONTMOST_NOISE_APP_RE.test(appName.trim()))
}

export function normalizeFrontmostAppInfo(params: FrontmostNormalizationInput): FrontmostNormalizationResult {
  const normalizedScriptApp = isLikelyFrontmostNoiseApp(params.scriptActiveApp) ? null : params.scriptActiveApp
  const normalizedAccessibilityApp = isLikelyFrontmostNoiseApp(params.accessibilityAppName)
    ? null
    : params.accessibilityAppName

  return {
    activeApp: normalizedScriptApp || normalizedAccessibilityApp,
    windowTitle: params.scriptWindowTitle || params.accessibilityWindowTitle
  }
}

export function resolveFrontmostAppName(params: FrontmostAppResolutionInput): FrontmostAppResolutionResult {
  const normalizedSystemEventsApp = isLikelyFrontmostNoiseApp(params.systemEventsAppName)
    ? null
    : params.systemEventsAppName
  const normalizedLsAppInfoApp = isLikelyFrontmostNoiseApp(params.lsappinfoAppName) ? null : params.lsappinfoAppName

  if (normalizedSystemEventsApp) {
    return {
      activeApp: normalizedSystemEventsApp,
      source: 'system-events'
    }
  }

  if (normalizedLsAppInfoApp) {
    return {
      activeApp: normalizedLsAppInfoApp,
      source: 'lsappinfo'
    }
  }

  return {
    activeApp: params.systemEventsAppName || params.lsappinfoAppName,
    source: params.systemEventsAppName ? 'system-events' : params.lsappinfoAppName ? 'lsappinfo' : 'none'
  }
}

export function parseLsAppInfoFrontRecord(raw: string): LsAppInfoFrontRecord {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { asn: null, displayName: null, bundleId: null }
  }

  const asnMatch = trimmed.match(/(ASN:[^\s]+:)/)
  const displayNameMatch = trimmed.match(/"LSDisplayName"="([^"]+)"/)
  const bundleIdMatch = trimmed.match(/bundleID="([^"]+)"/)

  return {
    asn: asnMatch?.[1] ?? null,
    displayName: displayNameMatch?.[1] ?? null,
    bundleId: bundleIdMatch?.[1] ?? null
  }
}

export function browserScriptName(activeApp: string | null): string | null {
  return browserMetadata(activeApp)?.scriptName ?? null
}

export function resolveBrowserAutomationTarget(activeApp: string | null): BrowserAutomationTarget {
  const metadata = browserMetadata(activeApp)
  return {
    scriptName: metadata?.scriptName ?? null,
    family: metadata?.family ?? null
  }
}

export function resolveBrowserPageCaptureDispatch(activeApp: string | null): BrowserPageCaptureDispatch {
  const target = resolveBrowserAutomationTarget(activeApp)

  if (!target.scriptName) {
    return {
      scriptName: null,
      mode: 'none'
    }
  }

  if (target.family === 'safari' || target.family === 'chromium') {
    return {
      scriptName: target.scriptName,
      mode: target.family
    }
  }

  return {
    scriptName: null,
    mode: 'none'
  }
}

export function resolveBrowserPageCaptureRuntimeInvocation(
  activeApp: string | null
): BrowserPageCaptureRuntimeInvocation {
  const dispatch = resolveBrowserPageCaptureDispatch(activeApp)

  if (!dispatch.scriptName || dispatch.mode === 'none') {
    return {
      kind: 'skip-browser-page-capture',
      scriptName: null
    }
  }

  if (dispatch.mode === 'safari') {
    return {
      kind: 'capture-safari-page',
      scriptName: dispatch.scriptName
    }
  }

  return {
    kind: 'capture-chromium-page',
    scriptName: dispatch.scriptName
  }
}

export function buildBrowserBodyExtractionJavaScript(): string {
  return [
    '(function () {',
    '  try {',
    '    const candidates = [document.body, document.querySelector("main"), document.querySelector("article"), document.documentElement].filter(Boolean);',
    '    for (const node of candidates) {',
    '      const text = (node.innerText || node.textContent || "").replace(/\\s+\\n/g, "\\n").trim();',
    '      if (text.length >= 120) return text.slice(0, 12000);',
    '    }',
    '    const fallback = (document.body?.innerText || document.documentElement?.innerText || document.body?.textContent || "").replace(/\\s+\\n/g, "\\n").trim();',
    '    return fallback.slice(0, 12000);',
    '  } catch (error) {',
    '    return "";',
    '  }',
    '})()'
  ].join(' ')
}

export function buildChromiumTabMetadataAppleScript(appName: string): string {
  const escapedApp = escapeAppleScriptString(appName)
  return `
tell application "${escapedApp}"
  if not (exists front window) then return ""
  set tabTitle to get title of active tab of front window
  set tabUrl to get URL of active tab of front window
  return tabTitle & linefeed & tabUrl
end tell`
}

export function buildChromiumTabBodyTextAppleScript(appName: string): string {
  const escapedApp = escapeAppleScriptString(appName)
  const bodyScript = buildBrowserBodyExtractionJavaScript()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return `
tell application "${escapedApp}"
  if not (exists front window) then return ""
  try
    return execute active tab of front window javascript "${bodyScript}"
  end try
  return ""
end tell`
}

export function buildSafariPageCaptureAppleScript(appName: string): string {
  const escapedApp = escapeAppleScriptString(appName)
  return `
tell application "${escapedApp}"
  if not (exists front document) then return ""
  set tabTitle to name of front document
  set tabUrl to URL of front document
  set tabText to ""
  try
    set tabText to do JavaScript "document.body ? document.body.innerText.slice(0, 12000) : ''" in front document
end try
  return tabTitle & linefeed & tabUrl & linefeed & tabText
end tell`
}

export function browserMetadata(activeApp: string | null): BrowserAppMetadata | null {
  if (!activeApp) return null
  const normalized = activeApp.toLowerCase()
  const chromeSupportRoot = path.join(os.homedir(), 'Library/Application Support')
  if (normalized.includes('chrome canary')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Google/Chrome Canary')]
    }
  }
  if (normalized.includes('chrome')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Google/Chrome')]
    }
  }
  if (normalized.includes('arc')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Arc')]
    }
  }
  if (normalized.includes('brave')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'BraveSoftware/Brave-Browser')]
    }
  }
  if (normalized.includes('edge')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Microsoft Edge')]
    }
  }
  if (normalized.includes('vivaldi')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Vivaldi')]
    }
  }
  if (normalized.includes('opera')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'com.operasoftware.Opera')]
    }
  }
  if (normalized.includes('firefox')) {
    return {
      scriptName: activeApp,
      family: 'keyboard-only',
      sessionRoots: []
    }
  }
  if (normalized.includes('chromium')) {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Chromium')]
    }
  }
  if (normalized === 'dia') {
    return {
      scriptName: activeApp,
      family: 'chromium',
      sessionRoots: [path.join(chromeSupportRoot, 'Dia')]
    }
  }
  if (normalized.includes('safari')) {
    return {
      scriptName: activeApp,
      family: 'safari',
      sessionRoots: []
    }
  }
  return null
}

export function resolveBundledResourcePathCandidates(
  params: BundledResourcePathCandidatesInput
): string[] {
  if (params.isPackaged) {
    return [path.join(params.resourcesPath, params.packagedFileName)]
  }

  return [
    path.join(params.cwd, params.devRelativePath),
    path.join(params.appPath, params.devRelativePath),
    path.join(params.resourcesPath, params.packagedFileName)
  ]
}

export function resolveBundledResourceRuntimePath(params: BundledResourceRuntimePathInput): string {
  const existingPaths = new Set(params.existingPaths)

  for (const candidate of params.candidates) {
    if (existingPaths.has(candidate)) return candidate
  }

  return params.candidates[0] ?? params.fallbackPath
}

export function shouldReuseCompiledHelperBinary(params: CompiledHelperReuseDecisionInput): boolean {
  return typeof params.binaryMtimeMs === 'number' &&
    typeof params.scriptMtimeMs === 'number' &&
    params.binaryMtimeMs >= params.scriptMtimeMs
}

export function classifyContext(params: ContextClassificationInput): CurrentContext['contextKind'] {
  const browserishCount = browserishSignalCount([
    params.pageUrl,
    params.pageTitle,
    params.windowTitle,
    params.accessibilityText?.slice(0, 1500) ?? null,
    params.screenText?.slice(0, 1500) ?? null
  ])
  const haystack = [
    params.activeApp,
    params.windowTitle,
    params.pageTitle,
    params.pageUrl,
    params.accessibilityText?.slice(0, 3000),
    params.screenText?.slice(0, 2000)
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()

  if (
    SOCIAL_APP_RE.test(params.activeApp ?? '') &&
    /(channel|direct message|message to |composer|slack|discord|teams|chat|start a new conversation|type a new message|post a reply|delivery options|\bsubject\b|\bfrom\b|\bcc\b|\bbcc\b|draft reply|compose mail|new message)/i.test(
      haystack
    )
  ) {
    return 'social'
  }
  if (
    SOCIAL_CONTENT_RE.test(haystack) &&
      (/(twitter|x\.com|tweet|repost|following|followers|for you|返信|リポスト|フォロー)/i.test(haystack) ||
      SOCIAL_APP_RE.test(params.activeApp ?? '') ||
      /(direct message|message to |mention someone|send now|schedule for later|slack|discord|microsoft teams|chatwork|start a new conversation|type a new message|post a reply|delivery options|loop components|\bsubject\b|\bfrom\b|\bcc\b|\bbcc\b|draft reply|compose mail|new message)/i.test(
        haystack
      ))
  ) {
    return 'social'
  }
  if (CODE_SIGNAL_RE.test(haystack)) {
    return 'coding'
  }
  if (LOCAL_FILE_SIGNAL_RE.test(haystack)) {
    return browserScriptName(params.activeApp) || BROWSER_LIKE_APP_RE.test(params.activeApp ?? '') ? 'browser' : 'document'
  }
  if (GITHUB_DOC_SIGNAL_RE.test(haystack) && !GITHUB_CODE_SIGNAL_RE.test(haystack)) {
    return browserScriptName(params.activeApp) || BROWSER_LIKE_APP_RE.test(params.activeApp ?? '') ? 'browser' : 'document'
  }
  if (
    /(google docs|notion|obsidian|markdown|document|docs\.google)/i.test(haystack) ||
    CALENDAR_SIGNAL_RE.test(haystack) ||
    DESIGN_SIGNAL_RE.test(haystack)
  ) {
    return 'document'
  }
  if (
    BROWSER_LIKE_APP_RE.test(params.activeApp ?? '') &&
    (browserishCount >= 2 || /(meet\.google\.com|cloudflare dashboard|issue #\d+|github\.com)/i.test(haystack))
  ) {
    return 'browser'
  }
  if (params.pageUrl || browserScriptName(params.activeApp)) {
    return 'browser'
  }
  return 'general'
}

export function resolvePrimaryContentSelection(params: PrimaryContentSourceInput): PrimaryContentSelection {
  if (shouldPreferSelectedTextAsPrimary(params)) {
    return {
      source: 'selected-text',
      reason: 'selected-text'
    }
  }

  if (hasSubstantialText(params.pageText, 40)) {
    const pageSource = params.pageCaptureMethod === 'accessibility' ? 'accessibility-text' : 'page-text'
    return {
      source: pageSource,
      reason: hasSubstantialText(params.selectedText, 20)
        ? 'selected-text-url-noise'
        : pageSource === 'accessibility-text'
          ? 'accessibility-text'
          : 'page-text'
    }
  }

  if (hasSubstantialText(params.accessibilityText, 40)) {
    return {
      source: 'accessibility-text',
      reason: hasSubstantialText(params.selectedText, 20) ? 'selected-text-url-noise' : 'accessibility-text'
    }
  }

  if (hasSubstantialText(params.screenText, 40)) {
    return {
      source: 'screen-ocr',
      reason: hasSubstantialText(params.selectedText, 20) ? 'selected-text-too-weak' : 'screen-ocr'
    }
  }

  return {
    source: 'none',
    reason: hasSubstantialText(params.selectedText, 20) ? 'selected-text-too-weak' : 'none'
  }
}

export function primaryContentSource(params: PrimaryContentSourceInput): CurrentContext['primaryContentSource'] {
  return resolvePrimaryContentSelection(params).source
}

function normalizePrimarySourceText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  return normalized || null
}

function isUrlLikeSelection(value: string | null | undefined): boolean {
  const normalized = normalizePrimarySourceText(value)
  if (!normalized) return false
  if (/^(?:https?:\/\/|file:\/\/)/i.test(normalized)) return true

  try {
    const parsed = new URL(normalized.startsWith('www.') ? `https://${normalized}` : normalized)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:'
  } catch {
    return false
  }
}

export function shouldPreferSelectedTextAsPrimary(params: PrimaryContentSourceInput): boolean {
  if (!hasSubstantialText(params.selectedText, 20)) return false

  const hasRicherPageText = hasSubstantialText(params.pageText, 40)
  const hasRicherAccessibilityText = hasSubstantialText(params.accessibilityText, 40)
  const hasRicherStructuredContext = hasRicherPageText || hasRicherAccessibilityText

  if (!hasRicherStructuredContext) return true

  const normalizedSelected = normalizePrimarySourceText(params.selectedText)
  const normalizedPageUrl = normalizePrimarySourceText(params.pageUrl)
  if (!normalizedSelected) return false

  if (isUrlLikeSelection(normalizedSelected)) {
    if (!normalizedPageUrl) return false
    return normalizedSelected !== normalizedPageUrl && normalizedSelected !== normalizedPageUrl.replace(/\/$/, '')
  }

  return true
}

export function pageContextFromAccessibility(params: {
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
}): PageContext {
  if (params.pageUrl || params.pageText) {
    return {
      pageTitle: params.pageTitle,
      pageUrl: params.pageUrl,
      pageText: params.pageText,
      pageCaptureMethod: 'accessibility'
    }
  }

  return EMPTY_PAGE_CONTEXT
}

export function applyAccessibilityPageContextDebugOverrides(
  pageContext: PageContext,
  overrides?: CapturePlanOverrides
): PageContext {
  if (!overrides?.suppressAccessibilityPageText) return pageContext
  if (pageContext.pageCaptureMethod !== 'accessibility') return pageContext

  return {
    ...pageContext,
    pageText: null
  }
}

export function mergePageContext(base: PageContext, incoming: PageContext): PageContext {
  const shouldPreferIncomingText =
    Boolean(incoming.pageText) &&
    (!base.pageText ||
      (base.pageCaptureMethod === 'accessibility' && incoming.pageCaptureMethod !== 'accessibility'))

  return {
    pageTitle: incoming.pageTitle || base.pageTitle,
    pageUrl: incoming.pageUrl || base.pageUrl,
    pageText: shouldPreferIncomingText ? incoming.pageText : incoming.pageText || base.pageText,
    pageCaptureMethod: shouldPreferIncomingText ? incoming.pageCaptureMethod : base.pageCaptureMethod
  }
}

export function hasCapturedBrowserPageSignal(pageContext: PageContext): boolean {
  return Boolean(pageContext.pageText || pageContext.pageUrl)
}

export function hasCapturedBrowserPageText(pageContext: PageContext): boolean {
  return Boolean(pageContext.pageText)
}

export function mergeBrowserPageContexts(params: MergeBrowserPageContextsInput): PageContext {
  let pageContext = mergePageContext(
    params.base,
    hasCapturedBrowserPageSignal(params.browserContext) ? params.browserContext : EMPTY_PAGE_CONTEXT
  )

  if (params.plan.shouldTryKeyboardFallback && !hasCapturedBrowserPageText(pageContext) && params.keyboardContext) {
    pageContext = mergePageContext(pageContext, params.keyboardContext)
  }

  if (params.plan.shouldTrySessionFallback && !hasCapturedBrowserPageText(pageContext) && params.sessionContext) {
    pageContext = mergePageContext(pageContext, params.sessionContext)
  }

  return pageContext
}

function suppressPageText(pageContext: PageContext | null | undefined): PageContext | null {
  if (!pageContext) return pageContext ?? null
  return {
    ...pageContext,
    pageText: null
  }
}

export function applyBrowserCaptureDebugOverrides(
  params: BrowserCaptureDebugOverrideInput
): Pick<Required<BrowserCaptureDebugOverrideInput>, 'browserContext' | 'keyboardContext' | 'sessionContext'> {
  return {
    browserContext: params.overrides?.suppressBrowserPageText ? suppressPageText(params.browserContext) : params.browserContext ?? null,
    keyboardContext: params.overrides?.suppressKeyboardPageText ? suppressPageText(params.keyboardContext) : params.keyboardContext ?? null,
    sessionContext: params.overrides?.suppressSessionPageText ? suppressPageText(params.sessionContext) : params.sessionContext ?? null
  }
}

export function shouldTryKeyboardFallback(params: BrowserFallbackDecisionInput): boolean {
  return params.plan.shouldTryKeyboardFallback && !hasCapturedBrowserPageText(params.browserContext)
}

export function shouldTrySessionFallback(params: BrowserFallbackDecisionInput): boolean {
  if (!params.plan.shouldTrySessionFallback) return false
  if (hasCapturedBrowserPageText(params.browserContext)) return false
  return !hasCapturedBrowserPageText(params.keyboardContext ?? EMPTY_PAGE_CONTEXT)
}

export function resolveBrowserFallbackExecutionPlan(
  params: BrowserFallbackDecisionInput
): BrowserFallbackExecutionPlan {
  const shouldTryKeyboard = shouldTryKeyboardFallback(params)
  return {
    shouldTryKeyboardFallback: shouldTryKeyboard,
    shouldTrySessionFallback: shouldTrySessionFallback({
      ...params,
      keyboardContext: shouldTryKeyboard ? params.keyboardContext ?? EMPTY_PAGE_CONTEXT : params.keyboardContext
    })
  }
}

export function resolveAccessibilityFallbackPriority(params: {
  contextKind: CurrentContext['contextKind']
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
}): AccessibilityFallbackPriority {
  const reason = params.accessibilityDiagnostics?.lowSignalReason ?? null

  if (reason === 'system-shell' || reason === 'notification-center' || reason === 'missing-snapshot') {
    return {
      shouldTreatAccessibilityAsWeak: true,
      shouldPreferBrowserFallback: false,
      shouldSuppressScreenFallback: false
    }
  }

  if (reason === 'browser-chrome-only' || reason === 'title-only' || reason === 'empty-ranked-lines') {
    return {
      shouldTreatAccessibilityAsWeak: true,
      shouldPreferBrowserFallback: params.contextKind === 'browser' || params.contextKind === 'document',
      shouldSuppressScreenFallback: false
    }
  }

  if (reason === 'social-chrome-only') {
    return {
      shouldTreatAccessibilityAsWeak: true,
      shouldPreferBrowserFallback: params.contextKind === 'browser',
      shouldSuppressScreenFallback: false
    }
  }

  return {
    shouldTreatAccessibilityAsWeak: false,
    shouldPreferBrowserFallback: false,
    shouldSuppressScreenFallback: false
  }
}

export function shouldSkipBrowserCapture(params: {
  contextKind: CurrentContext['contextKind']
  selectedText: string | null
  accessibilityText: string | null
  pageTitle?: string | null
  pageUrl?: string | null
  pageText?: string | null
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
}): boolean {
  const fallbackPriority = resolveAccessibilityFallbackPriority({
    contextKind: params.contextKind,
    accessibilityDiagnostics: params.accessibilityDiagnostics
  })

  if (fallbackPriority.shouldPreferBrowserFallback) return false

  if ((params.contextKind === 'browser' || params.contextKind === 'document') && hasStrongAccessibilityPageContext(params)) {
    return true
  }

  if (params.contextKind !== 'social' && params.contextKind !== 'coding') return false
  const highSignalText = [params.selectedText, params.accessibilityText].filter(Boolean).join('\n') || null
  return hasSubstantialText(highSignalText, 120)
}

export function shouldSkipOcr(params: {
  accessibilityText: string | null
  pageTitle?: string | null
  pageUrl?: string | null
  pageText?: string | null
  accessibilityDiagnostics?: ResolveCaptureDecisionsInput['accessibilityDiagnostics']
}): boolean {
  const fallbackPriority = resolveAccessibilityFallbackPriority({
    contextKind: 'general',
    accessibilityDiagnostics: params.accessibilityDiagnostics
  })

  if (fallbackPriority.shouldTreatAccessibilityAsWeak) {
    return false
  }

  if (hasStrongAccessibilityPageContext(params)) return true

  return hasSubstantialText(params.accessibilityText)
}

export function hasStrongAccessibilityPageContext(params: {
  pageTitle?: string | null
  pageUrl?: string | null
  pageText?: string | null
}): boolean {
  return hasSubstantialText(params.pageText ?? null, 120) && Boolean(params.pageUrl ?? params.pageTitle)
}

export function resolveBrowserCapturePlan(params: BrowserCapturePlanInput): BrowserCapturePlan {
  const browserApp = browserScriptName(params.activeApp)
  const hasPageText =
    Boolean(params.pageContext.pageText) && params.pageContext.pageCaptureMethod !== 'accessibility'

  if (params.canSkipBrowserCapture) {
    return {
      shouldCaptureBrowserPage: false,
      shouldTryKeyboardFallback: false,
      shouldTrySessionFallback: false
    }
  }

  return {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: Boolean(browserApp && !hasPageText),
    shouldTrySessionFallback: Boolean(browserMetadata(params.activeApp)?.family === 'chromium' && !hasPageText)
  }
}

export function resolveBrowserCaptureExecutionState(
  params: BrowserCaptureExecutionStateInput
): BrowserCaptureExecutionState {
  const plan = resolveBrowserCapturePlan({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext
  })

  if (!plan.shouldCaptureBrowserPage) {
    return {
      shouldCaptureBrowserPage: false,
      shouldTryKeyboardFallback: false,
      shouldTrySessionFallback: false
    }
  }

  const fallbackPlan = resolveBrowserFallbackExecutionPlan({
    plan,
    browserContext: params.browserContext ?? EMPTY_PAGE_CONTEXT,
    keyboardContext: params.keyboardContext
  })

  return {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: fallbackPlan.shouldTryKeyboardFallback,
    shouldTrySessionFallback: fallbackPlan.shouldTrySessionFallback
  }
}

export function resolveBrowserCaptureProgress(params: BrowserCaptureProgressInput): BrowserCaptureProgress {
  const state = resolveBrowserCaptureExecutionState({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: params.browserContext,
    keyboardContext: params.keyboardContext
  })

  let nextStep: BrowserCaptureNextStep = 'none'
  if (state.shouldCaptureBrowserPage && !params.browserContext) {
    nextStep = 'browser'
  } else if (state.shouldTryKeyboardFallback && !params.keyboardContext) {
    nextStep = 'keyboard'
  } else if (state.shouldTrySessionFallback) {
    nextStep = 'session'
  }

  return { state, nextStep }
}

export function resolveBrowserCaptureOutcome(
  params: ResolveBrowserCaptureOutcomeInput
): ResolveBrowserCaptureOutcomeResult {
  const initialProgress = resolveBrowserCaptureProgress({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext
  })

  let afterBrowserNextStep = initialProgress.nextStep
  let afterKeyboardNextStep = initialProgress.nextStep
  const attemptedSteps: Array<'browser' | 'keyboard' | 'session'> = []

  if (initialProgress.nextStep === 'browser' && params.browserContext) {
    attemptedSteps.push('browser')
    const progressAfterBrowser = resolveBrowserCaptureProgress({
      activeApp: params.activeApp,
      canSkipBrowserCapture: params.canSkipBrowserCapture,
      pageContext: params.pageContext,
      browserContext: params.browserContext
    })
    afterBrowserNextStep = progressAfterBrowser.nextStep

    if (progressAfterBrowser.nextStep === 'keyboard' && params.keyboardContext) {
      attemptedSteps.push('keyboard')
    }

    const progressAfterKeyboard = resolveBrowserCaptureProgress({
      activeApp: params.activeApp,
      canSkipBrowserCapture: params.canSkipBrowserCapture,
      pageContext: params.pageContext,
      browserContext: params.browserContext,
      keyboardContext: params.keyboardContext
    })
    afterKeyboardNextStep = progressAfterKeyboard.nextStep

    if (progressAfterKeyboard.nextStep === 'session' && params.sessionContext) {
      attemptedSteps.push('session')
    }
  }

  const pageContext =
    initialProgress.nextStep === 'browser'
      ? mergeBrowserPageContexts({
          base: params.pageContext,
          browserContext: params.browserContext ?? EMPTY_PAGE_CONTEXT,
          keyboardContext: params.keyboardContext,
          sessionContext: params.sessionContext,
          plan: initialProgress.state
        })
      : params.pageContext

  return {
    state: initialProgress.state,
    initialNextStep: initialProgress.nextStep,
    afterBrowserNextStep,
    afterKeyboardNextStep,
    attemptedSteps,
    pageContext,
    browserCaptureMethod: params.browserContext?.pageCaptureMethod ?? null,
    keyboardCaptureMethod: params.keyboardContext?.pageCaptureMethod ?? null,
    sessionCaptureMethod: params.sessionContext?.pageCaptureMethod ?? null
  }
}

export function resolveBrowserCaptureActionPlan(
  params: BrowserCaptureActionPlanInput
): BrowserCaptureActionPlan {
  const outcome = resolveBrowserCaptureOutcome({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: params.browserContext,
    keyboardContext: params.keyboardContext
  })

  return {
    shouldRunBrowserCapture: outcome.initialNextStep === 'browser' && !params.browserContext,
    shouldRunKeyboardFallback: outcome.afterBrowserNextStep === 'keyboard' && !params.keyboardContext,
    shouldRunSessionFallback: outcome.afterKeyboardNextStep === 'session',
    initialNextStep: outcome.initialNextStep,
    afterBrowserNextStep: outcome.afterBrowserNextStep,
    afterKeyboardNextStep: outcome.afterKeyboardNextStep
  }
}

export function resolveBrowserCaptureStepPlan(
  params: ResolveBrowserCaptureOutcomeInput
): BrowserCaptureStepPlan {
  const outcome = resolveBrowserCaptureOutcome(params)
  const steps: BrowserCaptureStep[] = []

  if (!params.browserContext && outcome.initialNextStep === 'browser') {
    steps.push('browser')
  }
  if (params.browserContext && !params.keyboardContext && outcome.afterBrowserNextStep === 'keyboard') {
    steps.push('keyboard')
  }
  if (params.browserContext && !params.sessionContext && outcome.afterKeyboardNextStep === 'session') {
    steps.push('session')
  }

  return { steps, outcome }
}

export function resolveBrowserCaptureExecutionPlan(
  params: ResolveBrowserCaptureOutcomeInput
): BrowserCaptureExecutionPlan {
  const initial = resolveBrowserCaptureStepPlan({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext
  })
  const afterBrowser = resolveBrowserCaptureStepPlan({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: params.browserContext
  })
  const afterKeyboard = resolveBrowserCaptureStepPlan({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: params.browserContext,
    keyboardContext: params.keyboardContext
  })
  const final = resolveBrowserCaptureStepPlan(params)

  return {
    initial,
    afterBrowser,
    afterKeyboard,
    final
  }
}

export function resolveBrowserCaptureRuntimeState(
  params: ResolveBrowserCaptureOutcomeInput
): BrowserCaptureRuntimeState {
  const outcome = resolveBrowserCaptureOutcome(params)

  return {
    actionPlan: {
      shouldRunBrowserCapture: outcome.initialNextStep === 'browser' && !params.browserContext,
      shouldRunKeyboardFallback: outcome.afterBrowserNextStep === 'keyboard' && !params.keyboardContext,
      shouldRunSessionFallback: outcome.afterKeyboardNextStep === 'session' && !params.sessionContext,
      initialNextStep: outcome.initialNextStep,
      afterBrowserNextStep: outcome.afterBrowserNextStep,
      afterKeyboardNextStep: outcome.afterKeyboardNextStep
    },
    outcome
  }
}

export function resolveBrowserCaptureCollectionState(
  params: BrowserCaptureCollectionStateInput
): BrowserCaptureCollectionState {
  const runtimeState = resolveBrowserCaptureRuntimeState(params)

  return {
    actionPlan: runtimeState.actionPlan,
    outcome: runtimeState.outcome,
    nextStep: runtimeState.actionPlan.shouldRunBrowserCapture
      ? 'browser'
      : runtimeState.actionPlan.shouldRunKeyboardFallback
        ? 'keyboard'
        : runtimeState.actionPlan.shouldRunSessionFallback
          ? 'session'
          : 'none',
    shouldCollectBrowserContext: runtimeState.actionPlan.shouldRunBrowserCapture,
    shouldCollectKeyboardContext: runtimeState.actionPlan.shouldRunKeyboardFallback,
    shouldCollectSessionContext: runtimeState.actionPlan.shouldRunSessionFallback,
    finalPageContext: runtimeState.outcome.pageContext
  }
}

export function resolveBrowserCaptureCollectionPlan(
  params: BrowserCaptureCollectionStateInput
): BrowserCaptureCollectionPlan {
  const initial = resolveBrowserCaptureCollectionState({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext
  })
  const afterBrowser = resolveBrowserCaptureCollectionState({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: params.browserContext
  })
  const afterKeyboard = resolveBrowserCaptureCollectionState({
    activeApp: params.activeApp,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: params.browserContext,
    keyboardContext: params.keyboardContext
  })
  const final = resolveBrowserCaptureCollectionState(params)
  const steps: BrowserCaptureStep[] = []

  if (initial.shouldCollectBrowserContext && !params.browserContext) {
    steps.push('browser')
  }
  if (afterBrowser.shouldCollectKeyboardContext && params.browserContext && !params.keyboardContext) {
    steps.push('keyboard')
  }
  if (afterKeyboard.shouldCollectSessionContext && params.browserContext && !params.sessionContext) {
    steps.push('session')
  }

  return {
    initial,
    afterBrowser,
    afterKeyboard,
    final,
    steps
  }
}

export function resolveBrowserCaptureExecutionRequests(
  params: BrowserCaptureExecutionRequestsInput
): BrowserCaptureExecutionRequests {
  const plan = resolveBrowserCaptureCollectionPlan(params)

  return {
    plan,
    requests: plan.steps.map((step) =>
      step === 'browser'
        ? {
            step,
            activeApp: params.activeApp
          }
        : {
            step,
            frontmost: {
              activeApp: params.activeApp,
              windowTitle: params.resolvedWindowTitle
            }
          }
    )
  }
}

export function resolveBrowserCaptureStepExecutionPlan(
  request: BrowserCaptureExecutionRequests['requests'][number]
): BrowserCaptureStepExecutionPlan {
  if (request.step === 'browser') {
    return {
      step: 'browser',
      strategy: 'browser-automation',
      activeApp: request.activeApp,
      requiresClipboardRestore: false
    }
  }

  if (request.step === 'keyboard') {
    return {
      step: 'keyboard',
      strategy: 'keyboard-copy',
      frontmost: request.frontmost,
      requiresClipboardRestore: true
    }
  }

  return {
    step: 'session',
    strategy: 'chromium-session',
    frontmost: request.frontmost,
    requiresClipboardRestore: false
  }
}

export function resolveBrowserCaptureRuntimeInvocation(
  executionPlan: BrowserCaptureStepExecutionPlan
): BrowserCaptureRuntimeInvocation {
  if (executionPlan.strategy === 'browser-automation') {
    return {
      kind: 'capture-browser-page-context',
      activeApp: executionPlan.activeApp,
      usesOriginalClipboard: false
    }
  }

  if (executionPlan.strategy === 'keyboard-copy') {
    return {
      kind: 'capture-browser-page-via-keyboard',
      frontmost: executionPlan.frontmost,
      usesOriginalClipboard: true
    }
  }

  return {
    kind: 'capture-chromium-page-via-session',
    frontmost: executionPlan.frontmost,
    usesOriginalClipboard: false
  }
}

export function resolveBrowserCaptureLoopIteration(
  loopState: Pick<BrowserCaptureExecutionLoopState, 'execution'>
): BrowserCaptureLoopIteration {
  const request = loopState.execution.requests[0] ?? null
  if (!request) {
    return {
      hasRequest: false,
      request: null,
      executionPlan: null,
      invocation: null
    }
  }

  const executionPlan = resolveBrowserCaptureStepExecutionPlan(request)
  return {
    hasRequest: true,
    request,
    executionPlan,
    invocation: resolveBrowserCaptureRuntimeInvocation(executionPlan)
  }
}

export function resolveBrowserCaptureExecutionLoopState(
  params: BrowserCaptureExecutionLoopStateInput
): BrowserCaptureExecutionLoopState {
  const contexts = applyBrowserCaptureDebugOverrides({
    browserContext: params.browserContext,
    keyboardContext: params.keyboardContext,
    sessionContext: params.sessionContext,
    overrides: params.overrides
  })

  return {
    ...contexts,
    execution: resolveBrowserCaptureExecutionRequests({
      activeApp: params.activeApp,
      resolvedWindowTitle: params.resolvedWindowTitle,
      canSkipBrowserCapture: params.canSkipBrowserCapture,
      pageContext: params.pageContext,
      browserContext: contexts.browserContext,
      keyboardContext: contexts.keyboardContext,
      sessionContext: contexts.sessionContext
    })
  }
}

export function applyBrowserCaptureStepResult(
  contexts: BrowserCaptureCollectedContexts,
  stepResult?: BrowserCaptureStepResult | null
): BrowserCaptureCollectedContexts {
  if (!stepResult) {
    return {
      browserContext: contexts.browserContext ?? null,
      keyboardContext: contexts.keyboardContext ?? null,
      sessionContext: contexts.sessionContext ?? null
    }
  }

  if (stepResult.step === 'browser') {
    return {
      browserContext: stepResult.context,
      keyboardContext: contexts.keyboardContext ?? null,
      sessionContext: contexts.sessionContext ?? null
    }
  }

  if (stepResult.step === 'keyboard') {
    return {
      browserContext: contexts.browserContext ?? null,
      keyboardContext: stepResult.context,
      sessionContext: contexts.sessionContext ?? null
    }
  }

  return {
    browserContext: contexts.browserContext ?? null,
    keyboardContext: contexts.keyboardContext ?? null,
    sessionContext: stepResult.context
  }
}

export function advanceBrowserCaptureExecutionLoopState(
  params: AdvanceBrowserCaptureLoopStateInput
): BrowserCaptureExecutionLoopState {
  const contexts = applyBrowserCaptureStepResult(
    {
      browserContext: params.browserContext ?? null,
      keyboardContext: params.keyboardContext ?? null,
      sessionContext: params.sessionContext ?? null
    },
    params.stepResult
  )

  return resolveBrowserCaptureExecutionLoopState({
    activeApp: params.activeApp,
    resolvedWindowTitle: params.resolvedWindowTitle,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    pageContext: params.pageContext,
    browserContext: contexts.browserContext,
    keyboardContext: contexts.keyboardContext,
    sessionContext: contexts.sessionContext,
    overrides: params.overrides
  })
}

export function resolveBrowserCaptureTrace(params: ResolveBrowserCaptureTraceInput): BrowserCaptureTrace {
  return {
    initialNextStep: params.browserExecutionPlan.outcome.initialNextStep,
    afterBrowserNextStep: params.browserExecutionPlan.outcome.afterBrowserNextStep,
    afterKeyboardNextStep: params.browserExecutionPlan.outcome.afterKeyboardNextStep,
    attemptedSteps: params.browserExecutionPlan.outcome.attemptedSteps,
    browserCaptureMethod: params.browserExecutionPlan.outcome.browserCaptureMethod,
    keyboardCaptureMethod: params.browserExecutionPlan.outcome.keyboardCaptureMethod,
    sessionCaptureMethod: params.browserExecutionPlan.outcome.sessionCaptureMethod,
    finalPageCaptureMethod: params.finalPageCaptureMethod
  }
}

export function buildCaptureTrace(params: BuildCaptureTraceInput): CaptureTrace {
  return {
    resolvedActiveApp: params.resolvedActiveApp,
    resolvedWindowTitle: params.resolvedWindowTitle,
    canSkipBrowserCapture: params.canSkipBrowserCapture,
    canSkipOcr: params.canSkipOcr,
    browser: params.browserTrace,
    screen: {
      shouldCaptureScreen: params.shouldCaptureScreen,
      reason: params.screenReason,
      finalScreenCaptureMethod: params.finalScreenCaptureMethod,
      sourceSelection: params.screenSourceSelection ?? null
    }
  }
}

export function shouldRetryWithNativeScreenCapture(params: NativeScreenRetryDecisionInput): boolean {
  return !params.skipOcr && !params.screenText && params.sourceKind === 'window'
}

export function shouldRunScreenOcr(params: ScreenOcrDecisionInput): boolean {
  return !params.skipOcr && !params.suppressScreenOcr
}

export function resolveInitialScreenCaptureMode(
  params: InitialScreenCaptureDecisionInput
): InitialScreenCaptureMode {
  return params.overrides?.forceNativeScreenCapture ? 'native-screen' : 'desktop-source'
}

export function resolveInitialScreenCaptureRuntimeInvocation(
  params: InitialScreenCaptureDecisionInput
): InitialScreenCaptureRuntimeInvocation {
  return {
    kind: 'capture-screen-screenshot',
    mode: resolveInitialScreenCaptureMode(params)
  }
}

export function resolveInitialScreenSourceSelection(
  params: InitialScreenSourceSelectionInput
): ScreenSourceSelection | null {
  return params.initialCaptureMode === 'native-screen'
    ? {
        fallbackReason: 'screen-fallback-no-window-candidates',
        preferredCaptureMode: 'native-screen'
      }
    : null
}

export function resolveScreenSourceSelection(
  params: ScreenSourceSelectionResolutionInput
): ScreenSourceSelection | null {
  if (params.usedNativeRetryFallback) {
    return {
      fallbackReason: 'screen-fallback-no-window-match',
      preferredCaptureMode: 'native-screen'
    }
  }

  return params.screenshotSelection ?? params.currentSelection
}

export function resolveScreenCaptureExecutionDecision(
  params: ScreenCaptureExecutionDecisionInput
): ScreenCaptureExecutionDecision {
  const shouldRunOcr = shouldRunScreenOcr({
    skipOcr: params.skipOcr,
    suppressScreenOcr: params.suppressScreenOcr
  })

  return {
    shouldRunOcr,
    shouldRetryWithNativeFallback: shouldRetryWithNativeScreenCapture({
      skipOcr: !shouldRunOcr,
      sourceKind: params.sourceKind,
      screenText: params.screenText
    })
  }
}

export function resolveScreenCaptureAttemptPlan(
  params: ScreenCaptureAttemptPlanInput
): ScreenCaptureAttemptPlan {
  const initialAttempt = resolveScreenCaptureExecutionDecision({
    skipOcr: params.skipOcr,
    suppressScreenOcr: params.suppressScreenOcr,
    sourceKind: params.initialSourceKind,
    screenText: params.initialScreenText
  })

  return {
    initialAttempt,
    fallbackAttempt: initialAttempt.shouldRetryWithNativeFallback
      ? resolveScreenCaptureExecutionDecision({
          skipOcr: params.skipOcr,
          suppressScreenOcr: params.suppressScreenOcr,
          sourceKind: 'screen',
          screenText: null
        })
      : null
  }
}

export function resolveScreenCaptureRetryPlan(
  params: ScreenCaptureRetryPlanInput
): ScreenCaptureRetryPlan {
  if (!params.executionDecision.shouldRetryWithNativeFallback) {
    return {
      shouldRetryWithNativeFallback: false,
      retryAttempt: null
    }
  }

  return {
    shouldRetryWithNativeFallback: true,
    retryAttempt: params.fallbackAttempt
  }
}

export function resolveScreenCaptureRuntimeState(
  params: ScreenCaptureRuntimeStateInput
): ScreenCaptureRuntimeState {
  if (!params.screenshotPath || !params.sourceKind) {
    return {
      screenshotPath: null,
      sourceKind: null,
      screenText: null,
      executionDecision: null,
      retryPlan: null
    }
  }

  const attemptPlan = resolveScreenCaptureAttemptPlan({
    skipOcr: params.skipOcr,
    suppressScreenOcr: params.suppressScreenOcr,
    initialSourceKind: params.sourceKind,
    initialScreenText: params.screenText
  })
  const executionDecision = resolveScreenCaptureExecutionDecision({
    skipOcr: params.skipOcr,
    suppressScreenOcr: params.suppressScreenOcr,
    sourceKind: params.sourceKind,
    screenText: params.screenText
  })

  return {
    screenshotPath: params.screenshotPath,
    sourceKind: params.sourceKind,
    screenText: params.screenText,
    executionDecision,
    retryPlan: resolveScreenCaptureRetryPlan({
      executionDecision,
      fallbackAttempt: attemptPlan.fallbackAttempt
    })
  }
}

export function resolveScreenOcrRuntimeInvocation(
  params: Pick<ScreenCaptureRuntimeState, 'screenshotPath' | 'executionDecision'>
): ScreenCaptureRuntimeInvocation {
  if (!params.screenshotPath || !params.executionDecision?.shouldRunOcr) {
    return {
      kind: 'no-screen-ocr'
    }
  }

  return {
    kind: 'recognize-screenshot-text',
    screenshotPath: params.screenshotPath
  }
}

export function resolveCapturedScreenshotRuntime(
  params: CapturedScreenshotRuntimeInput
): CapturedScreenshotRuntimeResult {
  const sourceSelection = resolveScreenSourceSelection({
    currentSelection: params.currentSelection,
    screenshotSelection: params.screenshot?.sourceSelection ?? null,
    usedNativeRetryFallback: params.usedNativeRetryFallback
  })
  const runtimeState = resolveScreenCaptureRuntimeState({
    skipOcr: params.skipOcr,
    suppressScreenOcr: params.suppressScreenOcr,
    screenshotPath: params.screenshot?.screenshotPath ?? null,
    sourceKind: params.screenshot?.sourceKind ?? null,
    screenText: null
  })

  return {
    sourceSelection,
    runtimeState,
    ocrInvocation: resolveScreenOcrRuntimeInvocation(runtimeState)
  }
}

export function resolveScreenCaptureAttemptOutcome(
  params: ScreenCaptureAttemptOutcomeInput
): ScreenCaptureAttemptOutcome {
  return {
    sourceSelection: resolveScreenSourceSelection({
      currentSelection: params.currentSelection,
      screenshotSelection: params.screenshot?.sourceSelection ?? null,
      usedNativeRetryFallback: params.usedNativeRetryFallback
    }),
    runtimeState: resolveScreenCaptureRuntimeState({
      skipOcr: params.skipOcr,
      suppressScreenOcr: params.suppressScreenOcr,
      screenshotPath: params.screenshot?.screenshotPath ?? null,
      sourceKind: params.screenshot?.sourceKind ?? null,
      screenText: params.screenText
    })
  }
}

export function resolveScreenCaptureAttemptExecution(
  params: ScreenCaptureAttemptExecutionInput
): ScreenCaptureAttemptExecutionResult {
  const outcome = resolveScreenCaptureAttemptOutcome(params)

  return {
    sourceSelection: outcome.sourceSelection,
    runtimeState: outcome.runtimeState,
    ocrInvocation: resolveScreenOcrRuntimeInvocation(outcome.runtimeState)
  }
}

export function shouldCaptureScreenContext(params: ScreenCapturePlanInput): boolean {
  return resolveScreenCapturePlan(params).shouldCaptureScreen
}

export function resolveScreenCapturePlan(params: ScreenCapturePlanInput): ScreenCapturePlan {
  if (params.overrides?.forceScreenCapture) {
    return {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal'
    }
  }

  if (params.canSkipOcr) {
    return {
      shouldCaptureScreen: false,
      reason: 'strong-accessibility-context'
    }
  }

  return {
    shouldCaptureScreen: true,
    reason: 'needs-screen-signal'
  }
}

export function resolveFinalScreenCapturePlan(params: FinalScreenCapturePlanInput): ScreenCapturePlan {
  const canSkipOcr = shouldSkipOcr({
    accessibilityText: params.accessibilityText,
    accessibilityDiagnostics: params.accessibilityDiagnostics,
    pageTitle: params.pageContext.pageTitle,
    pageUrl: params.pageContext.pageUrl,
    pageText: params.pageContext.pageText
  })

  return resolveScreenCapturePlan({
    canSkipOcr,
    overrides: params.overrides
  })
}

export function resolveScreenCaptureDecisionReason(params: ScreenCaptureDecisionReasonInput): ScreenCapturePlan['reason'] {
  return resolveFinalScreenCapturePlan({
    accessibilityText: params.accessibilityText,
    accessibilityDiagnostics: params.accessibilityDiagnostics,
    pageContext: {
      pageTitle: params.pageContext.pageTitle ?? null,
      pageUrl: params.pageContext.pageUrl ?? null,
      pageText: params.pageContext.pageText ?? null,
      pageCaptureMethod: 'none'
    },
    overrides: params.overrides
  }).reason
}

export function resolveScreenContextCaptureRequest(
  params: ScreenContextCaptureRequestInput
): ScreenContextCaptureRequest {
  const plan = resolveFinalScreenCapturePlan({
    accessibilityText: params.accessibilityText,
    accessibilityDiagnostics: params.accessibilityDiagnostics,
    pageContext: params.pageContext,
    overrides: params.overrides
  })

  return {
    plan,
    options: plan.shouldCaptureScreen
      ? {
          skipOcr: params.canSkipOcr,
          suppressScreenOcr: params.overrides?.suppressScreenOcr,
          forceNativeScreenCapture: params.overrides?.forceNativeScreenCapture
        }
      : null
  }
}

export function resolveScreenContextExecutionPlan(
  request: ScreenContextCaptureRequest
): ScreenContextExecutionPlan {
  return {
    plan: request.plan,
    shouldCapture: Boolean(request.options),
    options: request.options,
    skippedResult: {
      screenContext: { screenshotPath: null, screenText: null, screenCaptureMethod: 'none' },
      sourceSelection: null
    }
  }
}

export function buildScreenCaptureMethod(
  sourceKind: 'window' | 'screen',
  screenText: string | null
): CurrentContext['screenCaptureMethod'] {
  const prefix = sourceKind === 'window' ? 'window' : 'screen'
  return screenText ? `${prefix}-ocr` : `${prefix}-screenshot-only`
}

export function finalizeScreenContext(
  params: FinalizeScreenContextInput
): Pick<CurrentContext, 'screenshotPath' | 'screenText' | 'screenCaptureMethod'> {
  if (!params.screenshotPath || !params.sourceKind) {
    return {
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none'
    }
  }

  return {
    screenshotPath: params.screenshotPath,
    screenText: params.screenText,
    screenCaptureMethod: buildScreenCaptureMethod(params.sourceKind, params.screenText)
  }
}

export function isChromiumSessionFileName(entry: string): boolean {
  return entry.startsWith('Session_') || entry.startsWith('Tabs_')
}

export function pickRecentChromiumSessionFiles(
  files: ChromiumSessionFileCandidate[],
  limit = 6
): string[] {
  return files
    .filter((file) => isChromiumSessionFileName(path.basename(file.filePath)))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((file) => file.filePath)
}

export function pickDesktopCaptureSource(
  candidates: DesktopCaptureSourceCandidate[],
  frontmost: FrontmostAppInfo
): PickDesktopCaptureSourceResult {
  const selection = analyzeDesktopCaptureSourceSelection(candidates, frontmost)
  return {
    source: selection.source,
    sourceKind: selection.sourceKind
  }
}

export function analyzeDesktopCaptureSourceSelection(
  candidates: DesktopCaptureSourceCandidate[],
  frontmost: FrontmostAppInfo
): DesktopCaptureSourceSelectionSummary {
  const viableSources = candidates.filter((candidate) => candidate.hasThumbnail)
  const windowSources = viableSources.filter((candidate) => candidate.id.startsWith('window:'))
  const rankedWindow = windowSources
    .map((source) => ({ source, score: sourceScore(source.name, frontmost) }))
    .sort((a, b) => b.score - a.score)[0]

  if (rankedWindow && rankedWindow.score > 0) {
    return {
      source: rankedWindow.source,
      sourceKind: 'window',
      fallbackReason: 'matched-window',
      shouldPreferNativeScreenCapture: false
    }
  }

  const screenSource = viableSources.find((candidate) => candidate.id.startsWith('screen:')) ?? null
  if (screenSource) {
    const fallbackReason: DesktopCaptureFallbackReason =
      windowSources.length === 0
        ? candidates.some((candidate) => candidate.id.startsWith('window:'))
          ? 'screen-fallback-no-viable-window-thumbnails'
          : 'screen-fallback-no-window-candidates'
        : 'screen-fallback-no-window-match'
    return {
      source: screenSource,
      sourceKind: 'screen',
      fallbackReason,
      shouldPreferNativeScreenCapture: fallbackReason === 'screen-fallback-no-window-match'
    }
  }

  return {
    source: null,
    sourceKind: null,
    fallbackReason: 'no-viable-sources',
    shouldPreferNativeScreenCapture: false
  }
}

export function resolveDesktopCaptureRuntimePlan(
  selection: DesktopCaptureSourceSelectionSummary,
  availableSourceIds: Iterable<string>
): DesktopCaptureRuntimePlan {
  if (selection.shouldPreferNativeScreenCapture) {
    return {
      captureMode: 'native-screen',
      sourceId: null,
      sourceKind: null,
      sourceSelection: {
        fallbackReason: selection.fallbackReason,
        preferredCaptureMode: 'native-screen'
      }
    }
  }

  if (selection.source && selection.sourceKind && new Set(availableSourceIds).has(selection.source.id)) {
    return {
      captureMode: 'desktop-source',
      sourceId: selection.source.id,
      sourceKind: selection.sourceKind,
      sourceSelection: {
        fallbackReason: selection.fallbackReason,
        preferredCaptureMode: 'desktop-source'
      }
    }
  }

  return {
    captureMode: 'unavailable',
    sourceId: null,
    sourceKind: null,
    sourceSelection: null
  }
}

export function sourceScore(sourceName: string, frontmost: FrontmostAppInfo): number {
  const source = sourceName.toLowerCase()
  const title = frontmost.windowTitle?.toLowerCase() ?? ''
  const appName = frontmost.activeApp?.toLowerCase() ?? ''
  if (source.includes('kashinai')) return -100
  let score = 0
  if (title && source.includes(title.slice(0, Math.min(title.length, 60)))) score += 8
  for (const part of title.split(/[\s\-–—|/]+/).filter((value) => value.length > 3)) {
    if (source.includes(part)) score += 2
  }
  if (appName && source.includes(appName)) score += 3
  return score
}

export function cleanSessionUrl(raw: string): string | null {
  try {
    const withoutNulls = raw.replace(/\u0000/g, '').replace(/[)\]}>,.;:'"(`]+$/g, '')
    const parsed = new URL(withoutNulls)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.hostname === 'contacts.google.com') return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function decidePublicPageFetch(url: string): PublicPageFetchDecision {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { allowed: false, normalizedUrl: null, reason: 'invalid-url' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, normalizedUrl: null, reason: 'unsupported-scheme' }
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
    return { allowed: false, normalizedUrl: null, reason: 'local-host' }
  }

  if (hostname.endsWith('.chrome-extension') || hostname.endsWith('.extension')) {
    return { allowed: false, normalizedUrl: null, reason: 'extension-host' }
  }

  if (PRIVATE_FETCH_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return { allowed: false, normalizedUrl: null, reason: 'private-host' }
  }

  return {
    allowed: true,
    normalizedUrl: parsed.toString(),
    reason: 'allowed'
  }
}

export function shouldAcceptPublicPageFetchResponse(
  params: PublicPageFetchResponseDecisionInput
): boolean {
  return params.ok && Boolean(params.contentType?.toLowerCase().includes('text/html'))
}

export function resolvePublicPageFetchRequest(url: string | null): PublicPageFetchRequest {
  if (!url) {
    return {
      shouldFetch: false,
      url: null,
      reason: 'invalid-url'
    }
  }

  const decision = decidePublicPageFetch(url)
  return {
    shouldFetch: Boolean(decision.allowed && decision.normalizedUrl),
    url: decision.normalizedUrl,
    reason: decision.reason
  }
}

export function resolvePublicPageTextFetchExecutionPlan(
  request: PublicPageFetchRequest
): PublicPageTextFetchExecutionPlan {
  return {
    request,
    shouldFetch: Boolean(request.shouldFetch && request.url),
    url: request.shouldFetch ? request.url : null
  }
}

export function extractTextFromHtml(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)

  return text || null
}

export function parseBrowserAutomationCapture(raw: string): BrowserAutomationCapture {
  const [pageTitle, pageUrl, ...textLines] = raw.split('\n')
  const normalizedText = textLines.join('\n').trim()

  return normalizeBrowserPageCapture({
    pageTitle: pageTitle || null,
    pageUrl: pageUrl || null,
    pageText: normalizedText || null
  })
}

export function parseChromiumTabMetadata(raw: string): ChromiumTabMetadata {
  const [pageTitle, pageUrl] = raw.split('\n')
  return {
    pageTitle: pageTitle?.trim() || null,
    pageUrl: pageUrl?.trim() || null
  }
}

export function shouldFetchPublicPageTextForBrowserCapture(params: {
  pageText: string | null
  pageUrl: string | null
}): boolean {
  return !params.pageText && Boolean(params.pageUrl)
}

export function resolveBrowserPageTextFetchPlan(capture: BrowserAutomationCapture): BrowserPageTextFetchPlan {
  const normalizedCapture = normalizeBrowserPageCapture(capture)

  return {
    normalizedCapture,
    shouldFetchPublicPageText: shouldFetchPublicPageTextForBrowserCapture({
      pageText: normalizedCapture.pageText,
      pageUrl: normalizedCapture.pageUrl
    })
  }
}

export function resolveBrowserPageContextResolutionPlan(
  params: BrowserPageContextResolutionPlanInput
): BrowserPageContextResolutionPlan {
  return {
    ...resolveBrowserPageTextFetchPlan(params.capture),
    pageCaptureMethod: params.pageCaptureMethod
  }
}

export function resolveBrowserPageContextFetchExecutionPlan(
  params: BrowserPageContextResolutionPlanInput
): BrowserPageContextFetchExecutionPlan {
  const resolutionPlan = resolveBrowserPageContextResolutionPlan(params)

  return {
    ...resolutionPlan,
    fetchRequest: resolvePublicPageFetchRequest(
      resolutionPlan.shouldFetchPublicPageText ? resolutionPlan.normalizedCapture.pageUrl : null
    )
  }
}

export function resolveKeyboardCopyBrowserPageContext(
  params: BrowserAutomationCapture & { fetchedPageText?: string | null }
): PageContext {
  return resolveFetchedBrowserPageContext({
    capture: params,
    fetchedPageText: params.fetchedPageText ?? null,
    pageCaptureMethod: 'keyboard-copy'
  })
}

export function resolveFetchedBrowserPageContext(params: ResolvedFetchedBrowserPageContextInput): PageContext {
  const normalizedCapture = normalizeBrowserPageCapture(params.capture)

  return buildBrowserPageContext(
    {
      pageTitle: normalizedCapture.pageTitle,
      pageUrl: normalizedCapture.pageUrl,
      pageText: normalizedCapture.pageText || params.fetchedPageText || null
    },
    params.pageCaptureMethod
  )
}

export function resolveChromiumBrowserPageContext(params: {
  metadata: ChromiumTabMetadata
  bodyText: string | null
  fetchedPageText?: string | null
}): PageContext {
  return resolveFetchedBrowserPageContext({
    capture: {
      pageTitle: params.metadata.pageTitle,
      pageUrl: params.metadata.pageUrl,
      pageText: params.bodyText
    },
    fetchedPageText: params.fetchedPageText,
    pageCaptureMethod: 'browser-automation'
  })
}

export function resolveChromiumSessionBrowserPageContext(params: {
  pageTitle: string | null
  pageUrl: string | null
  fetchedPageText?: string | null
}): PageContext {
  return resolveFetchedBrowserPageContext({
    capture: {
      pageTitle: params.pageTitle,
      pageUrl: params.pageUrl,
      pageText: null
    },
    fetchedPageText: params.fetchedPageText ?? null,
    pageCaptureMethod: 'chrome-session'
  })
}

export function normalizeBrowserPageCapture(capture: BrowserAutomationCapture): BrowserAutomationCapture {
  const pageTitle = capture.pageTitle?.trim() || null
  const pageUrl = capture.pageUrl?.trim() || null
  const rawLines = (capture.pageText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const filteredLines = rawLines.filter((line, index, lines) => {
    const normalized = line.toLowerCase()
    if (pageTitle && normalized === pageTitle.toLowerCase() && lines.length > 1) return false
    if (pageUrl && normalized === pageUrl.toLowerCase() && lines.length > 1) return false
    return true
  })

  const candidateText = (filteredLines.length > 0 ? filteredLines : rawLines).join('\n').trim() || null
  const collapsedText = candidateText?.replace(/\s+/g, ' ').trim() || null
  const textMatchesTitle = Boolean(pageTitle && collapsedText && collapsedText.toLowerCase() === pageTitle.toLowerCase())
  const textMatchesUrl = Boolean(pageUrl && collapsedText && collapsedText.toLowerCase() === pageUrl.toLowerCase())

  return {
    pageTitle,
    pageUrl,
    pageText: textMatchesTitle || textMatchesUrl ? null : candidateText
  }
}

export function buildBrowserPageContext(
  capture: BrowserAutomationCapture,
  captureMethod: BrowserPageContextMethod
): PageContext {
  const normalizedCapture = normalizeBrowserPageCapture(capture)
  const hasMeaningfulBrowserCapture = Boolean(normalizedCapture.pageUrl || normalizedCapture.pageText)

  return {
    ...normalizedCapture,
    pageCaptureMethod: hasMeaningfulBrowserCapture ? captureMethod : 'none'
  }
}

export function normalizeCopiedText(value: string, maxLength = 12000): string | null {
  const normalized = value.trim().slice(0, maxLength)
  return normalized || null
}

export function extractSessionUrls(raw: string): string[] {
  const matches = raw.match(SESSION_URL_RE) ?? []
  const urls: string[] = []

  for (const match of matches) {
    const cleaned = cleanSessionUrl(match)
    if (cleaned) urls.push(cleaned)
  }

  return urls
}

export function pickBestSessionUrlCandidate(params: SessionUrlCandidateInput): string | null {
  const cleanedCandidates = params.urls
    .map((url, index) => ({ url: cleanSessionUrl(url), index }))
    .filter((entry): entry is { url: string; index: number } => Boolean(entry.url))

  if (cleanedCandidates.length === 0) return null

  const titleTokens = frontmostTitleTokens(params.frontmost)
  const scored = cleanedCandidates.map(({ url, index }) => {
    let score = index * 0.01
    let parsed: URL | null = null
    const fetchDecision = decidePublicPageFetch(url)

    try {
      parsed = new URL(url)
    } catch {
      parsed = null
    }

    const decodedUrl = parsed
      ? `${parsed.hostname}${decodeURIComponent(parsed.pathname)}${decodeURIComponent(parsed.search)}`
      : url
    const normalizedUrl = decodedUrl.toLowerCase()

    for (const token of titleTokens) {
      if (normalizedUrl.includes(token)) score += 4
      if (parsed?.hostname.toLowerCase().includes(token)) score += 2
    }

    if (fetchDecision.allowed) {
      score += 3
    } else if (fetchDecision.reason === 'private-host' || fetchDecision.reason === 'local-host') {
      score -= 5
    }

    if (parsed) {
      if (parsed.hostname === 'news.ycombinator.com' && !titleTokens.some((token) => normalizedUrl.includes(token))) {
        score -= 6
      }
      if (/^\/(newtab|startpages?|tabs?)/i.test(parsed.pathname)) score -= 8
    }

    return { url, index, score }
  })

  scored.sort((a, b) => b.score - a.score || b.index - a.index)
  return scored[0]?.url ?? null
}

export function resolveChromiumSessionPageContextPlan(params: SessionUrlCandidateInput): ChromiumSessionPageContextPlan {
  const pageUrl = pickBestSessionUrlCandidate(params)
  const fetchRequest = resolvePublicPageFetchRequest(pageUrl)

  return {
    pageTitle: params.frontmost.windowTitle ?? null,
    pageUrl,
    shouldFetchPublicPageText: fetchRequest.shouldFetch
  }
}

export function resolveContextIdentity(params: ResolveCaptureDecisionsInput): ResolvedContextIdentity {
  return resolveCaptureSurface({
    frontmost: params.frontmost,
    accessibilityContext: params.accessibilityContext
  })
}

export function resolveCaptureSurface(params: {
  frontmost: Pick<FrontmostAppInfo, 'activeApp' | 'windowTitle'>
  accessibilityContext: Pick<ResolveCaptureDecisionsInput['accessibilityContext'], 'appName' | 'windowTitle'>
}): ResolvedCaptureSurface {
  const normalized = normalizeFrontmostAppInfo({
    scriptActiveApp: params.frontmost.activeApp,
    scriptWindowTitle: params.frontmost.windowTitle,
    accessibilityAppName: params.accessibilityContext.appName,
    accessibilityWindowTitle: params.accessibilityContext.windowTitle
  })

  return {
    resolvedActiveApp: normalized.activeApp,
    resolvedWindowTitle: normalized.windowTitle
  }
}

export function resolveClipboardSelectionCapturePolicy(
  params: ClipboardSelectionCapturePolicyInput
): ClipboardSelectionCapturePolicy {
  const resolvedSurface = resolveCaptureSurface({
    frontmost: params.frontmost,
    accessibilityContext: params.accessibilityContext
  })
  const resolvedApp = resolvedSurface.resolvedActiveApp ?? params.frontmost.activeApp

  if (browserScriptName(resolvedApp) || BROWSER_LIKE_APP_RE.test(resolvedApp ?? '')) {
    return {
      shouldAttemptClipboardSelection: true,
      reason: 'browser-surface'
    }
  }

  if (params.accessibilityContext.selectedText) {
    return {
      shouldAttemptClipboardSelection: false,
      reason: 'existing-selection'
    }
  }

  if (
    hasStrongAccessibilityPageContext({
      pageTitle: params.accessibilityContext.pageTitle,
      pageUrl: params.accessibilityContext.pageUrl,
      pageText: params.accessibilityContext.pageText
    }) ||
    hasSubstantialText(params.accessibilityContext.accessibilityText, 40)
  ) {
    return {
      shouldAttemptClipboardSelection: false,
      reason: 'strong-native-context'
    }
  }

  return {
    shouldAttemptClipboardSelection: true,
    reason: 'weak-accessibility-context'
  }
}

const SELECTED_TEXT_UI_NOISE_RE =
  /^(message #[\w.-]+|message to [\w.-]+|bold|italic|underline|strikethrough|link|ordered list|bulleted list|blockquote|code block?|show formatting|formatting|composer actions|send now|schedule for later|attach|emoji|mention someone|record video clip|record audio clip|start a new conversation|type a new message|post a reply|delivery options|loop components|reply|reply all|forward|archive|trash|flag|junk|send later|mailboxes?|back|forward|reload|refresh|new tab|tab search|bookmark|bookmarks|extensions?|address bar|omnibox|profile|レビューする|元に戻す|新しいタスク|プラグイン|ピン留め|コミットまたはプッシュ)$/i

export function normalizeSelectionText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  return normalized || null
}

export function isSelectedTextUiNoise(value: string | null | undefined): boolean {
  const normalized = normalizeSelectionText(value)
  return normalized ? SELECTED_TEXT_UI_NOISE_RE.test(normalized) : false
}

export function resolveSharedSelectedTextCandidate(value: string | null | undefined): SharedSelectedTextCandidateDecision {
  const candidate = normalizeSelectionText(value)
  if (!candidate) {
    return {
      candidate: null,
      reason: 'missing'
    }
  }

  if (isSelectedTextUiNoise(candidate)) {
    return {
      candidate: null,
      reason: 'ui-noise'
    }
  }

  return {
    candidate,
    reason: 'accepted'
  }
}

export function resolveRetainedSelectedText(params: {
  candidate: string | null
  source: CurrentContext['selectedTextSource']
  accessibilityText: string | null
  pageUrl: string | null
  pageText: string | null
}): RetainedSelectedTextDecision {
  const sharedCandidate = resolveSharedSelectedTextCandidate(params.candidate)
  if (sharedCandidate.reason === 'missing') {
    return {
      selectedText: null,
      selectedTextSource: 'none',
      reason: 'missing'
    }
  }

  if (sharedCandidate.reason === 'ui-noise') {
    return {
      selectedText: null,
      selectedTextSource: 'none',
      reason: 'ui-noise'
    }
  }

  const candidate = sharedCandidate.candidate

  const keepAsPrimary = shouldPreferSelectedTextAsPrimary({
    selectedText: candidate,
    pageText: params.pageText,
    pageUrl: params.pageUrl,
    accessibilityText: params.accessibilityText,
    screenText: null
  })

  const normalizedCandidate = normalizeSelectionText(candidate)
  const isUrlOnlySelection = isUrlLikeSelection(normalizedCandidate)
  const hasRicherStructuredContext =
    hasSubstantialText(params.pageText, 40) ||
    hasSubstantialText(params.accessibilityText, 40)

  if (!keepAsPrimary && isUrlOnlySelection && hasRicherStructuredContext) {
    return {
      selectedText: null,
      selectedTextSource: 'none',
      reason: 'url-only-with-richer-context'
    }
  }

  return {
    selectedText: normalizedCandidate,
    selectedTextSource: params.source,
    reason: 'accepted'
  }
}

export function resolveSelectedText(params: ResolveCaptureDecisionsInput): ResolvedSelectedText {
  const candidate = params.clipboardSelectedText || params.accessibilityContext.selectedText
  const source = params.clipboardSelectedText
    ? 'clipboard-selection'
    : (params.accessibilityContext.selectedTextSource ?? 'none')

  const retained = resolveRetainedSelectedText({
    candidate,
    source,
    accessibilityText: params.accessibilityContext.accessibilityText,
    pageUrl: params.accessibilityContext.pageUrl,
    pageText: params.accessibilityContext.pageText
  })

  return {
    selectedText: retained.selectedText,
    selectedTextSource: retained.selectedTextSource
  }
}

export function buildPreliminaryContextClassificationInput(
  params: ResolveCaptureDecisionsInput & ResolvedContextIdentity & ResolvedSelectedText
): ContextClassificationInput {
  return {
    activeApp: params.resolvedActiveApp,
    windowTitle: params.resolvedWindowTitle,
    pageTitle: params.accessibilityContext.pageTitle,
    pageUrl: params.accessibilityContext.pageUrl,
    accessibilityText:
      [params.selectedText, params.accessibilityContext.accessibilityText].filter(Boolean).join('\n') || null,
    screenText: null
  }
}

export function resolveCaptureDecisions(params: ResolveCaptureDecisionsInput): ResolveCaptureDecisionsResult {
  const identity = resolveContextIdentity(params)
  const selected = resolveSelectedText(params)
  const preliminaryKind = classifyContext(
    buildPreliminaryContextClassificationInput({
      ...params,
      ...identity,
      ...selected
    })
  )

  return {
    ...identity,
    ...selected,
    preliminaryKind,
    canSkipBrowserCapture: shouldSkipBrowserCapture({
      contextKind: preliminaryKind,
      selectedText: selected.selectedText,
      accessibilityText: params.accessibilityContext.accessibilityText,
      pageTitle: params.accessibilityContext.pageTitle,
      pageUrl: params.accessibilityContext.pageUrl,
      pageText: params.accessibilityContext.pageText,
      accessibilityDiagnostics: params.accessibilityDiagnostics
    }),
    canSkipOcr: shouldSkipOcr({
      accessibilityText: params.accessibilityContext.accessibilityText,
      pageTitle: params.accessibilityContext.pageTitle,
      pageUrl: params.accessibilityContext.pageUrl,
      pageText: params.accessibilityContext.pageText,
      accessibilityDiagnostics: params.accessibilityDiagnostics
    })
  }
}

export function resolveContextCapturePreparation(
  params: ResolveContextCapturePlanInput
): ContextCapturePreparation {
  const clipboardSelectionPolicy = resolveClipboardSelectionCapturePolicy({
    frontmost: params.frontmost,
    accessibilityContext: params.accessibilityContext
  })

  return {
    clipboardSelectionPolicy,
    shouldAttemptClipboardSelection: clipboardSelectionPolicy.shouldAttemptClipboardSelection,
    capturePlanInput: params
  }
}

export function resolveContextCapturePlan(
  params: ResolveContextCapturePlanInput,
  overrides: CapturePlanOverrides = {}
): ResolveContextCapturePlanResult {
  const decisions = resolveCaptureDecisions(params)
  const adjustedDecisions = {
    ...decisions,
    canSkipBrowserCapture: overrides.forceBrowserCapture ? false : decisions.canSkipBrowserCapture,
    canSkipOcr: overrides.forceScreenCapture ? false : decisions.canSkipOcr
  }
  const initialPageContext = applyAccessibilityPageContextDebugOverrides(
    pageContextFromAccessibility(params.accessibilityContext),
    overrides
  )
  const browserProgress = resolveBrowserCaptureProgress({
    activeApp: adjustedDecisions.resolvedActiveApp,
    canSkipBrowserCapture: adjustedDecisions.canSkipBrowserCapture,
    pageContext: initialPageContext
  })
  const screenCapturePlan = resolveScreenCapturePlan({
    canSkipOcr: adjustedDecisions.canSkipOcr,
    overrides
  })

  return {
    ...adjustedDecisions,
    initialPageContext,
    browserProgress,
    screenCapturePlan
  }
}

export function resolveContextCaptureRuntimeState(
  params: ContextCaptureRuntimeStateInput
): ContextCaptureRuntimeState {
  const capturePlan = resolveContextCapturePlan(
    {
      ...params.capturePlanInput,
      clipboardSelectedText: params.clipboardSelectedText
    },
    params.overrides
  )

  return {
    ...capturePlan,
    browserLoopState: resolveBrowserCaptureExecutionLoopState({
      activeApp: capturePlan.resolvedActiveApp,
      resolvedWindowTitle: capturePlan.resolvedWindowTitle,
      canSkipBrowserCapture: capturePlan.canSkipBrowserCapture,
      pageContext: capturePlan.initialPageContext,
      overrides: params.overrides
    })
  }
}

export function buildCurrentContext(params: BuildCurrentContextInput): CurrentContext {
  return {
    activeApp: params.resolvedActiveApp,
    windowTitle: params.resolvedWindowTitle,
    contextKind: classifyContext({
      activeApp: params.resolvedActiveApp,
      windowTitle: params.resolvedWindowTitle,
      pageTitle: params.pageContext.pageTitle,
      pageUrl: params.pageContext.pageUrl,
      accessibilityText: params.accessibilityContext.accessibilityText,
      screenText: params.screenContext.screenText
    }),
    primaryContentSource: primaryContentSource({
      selectedText: params.selectedText,
      pageText: params.pageContext.pageText,
      pageUrl: params.pageContext.pageUrl,
      pageCaptureMethod: params.pageContext.pageCaptureMethod,
      accessibilityText: params.accessibilityContext.accessibilityText,
      screenText: params.screenContext.screenText
    }),
    pageTitle: params.pageContext.pageTitle,
    pageUrl: params.pageContext.pageUrl,
    pageText: params.pageContext.pageText,
    pageCaptureMethod: params.pageContext.pageCaptureMethod,
    accessibilityText: params.accessibilityContext.accessibilityText,
    accessibilityCaptureMethod: params.accessibilityContext.accessibilityCaptureMethod,
    screenshotPath: params.screenContext.screenshotPath,
    screenText: params.screenContext.screenText,
    screenCaptureMethod: params.screenContext.screenCaptureMethod,
    selectedText: params.selectedText,
    selectedTextSource: params.selectedTextSource,
    clipboardText: null,
    timestamp: params.timestamp
  }
}

export function finalizeContextCaptureResult(params: FinalizeContextCaptureResultInput): FinalizeContextCaptureResult {
  const context = buildCurrentContext({
    resolvedActiveApp: params.resolvedActiveApp,
    resolvedWindowTitle: params.resolvedWindowTitle,
    selectedText: params.selectedText,
    selectedTextSource: params.selectedTextSource,
    pageContext: params.browserExecutionPlan.finalPageContext,
    accessibilityContext: params.accessibilityContext,
    screenContext: params.screenContext,
    timestamp: params.timestamp
  })
  const browserTrace = resolveBrowserCaptureTrace({
    browserExecutionPlan: params.browserExecutionPlan,
    finalPageCaptureMethod: context.pageCaptureMethod
  })

  return {
    context,
    captureTrace: buildCaptureTrace({
      resolvedActiveApp: params.resolvedActiveApp,
      resolvedWindowTitle: params.resolvedWindowTitle,
      canSkipBrowserCapture: params.canSkipBrowserCapture,
      canSkipOcr: params.canSkipOcr,
      browserTrace,
      finalPageCaptureMethod: context.pageCaptureMethod,
      shouldCaptureScreen: params.screenCapturePlan.shouldCaptureScreen,
      screenReason: params.screenCapturePlan.reason,
      finalScreenCaptureMethod: context.screenCaptureMethod,
      screenSourceSelection: params.screenSourceSelection ?? null
    })
  }
}
