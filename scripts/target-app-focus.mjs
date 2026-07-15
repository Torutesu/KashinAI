import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const APP_NAME_ALIASES = new Map([
  ['calendar', ['calendar', 'カレンダー']],
  ['カレンダー', ['calendar', 'カレンダー']],
  ['mail', ['mail', 'メール']],
  ['メール', ['mail', 'メール']],
  ['preview', ['preview', 'プレビュー']],
  ['プレビュー', ['preview', 'プレビュー']],
  ['notes', ['notes', 'メモ']],
  ['メモ', ['notes', 'メモ']],
  ['reminders', ['reminders', 'リマインダー']],
  ['リマインダー', ['reminders', 'リマインダー']],
  ['system settings', ['system settings', 'システム設定']],
  ['システム設定', ['system settings', 'システム設定']]
])

function escapeAppleScriptString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeComparableAppName(value) {
  return value?.trim().toLowerCase() ?? null
}

export function resolveUrlOpenTargetFamily(targetApp) {
  const normalized = normalizeComparableAppName(targetApp)
  if (!normalized) return 'generic'
  if (normalized.includes('safari')) return 'safari'
  if (
    normalized.includes('chrome') ||
    normalized.includes('chromium') ||
    normalized.includes('arc') ||
    normalized.includes('brave') ||
    normalized.includes('edge') ||
    normalized.includes('vivaldi') ||
    normalized.includes('opera') ||
    normalized === 'dia'
  ) {
    return 'chromium'
  }
  return 'generic'
}

export function buildTargetAppUrlOpenScript(targetApp, targetUrl) {
  if (!targetApp || !targetUrl) return null

  const escapedTargetApp = escapeAppleScriptString(targetApp)
  const escapedTargetUrl = escapeAppleScriptString(targetUrl)
  const family = resolveUrlOpenTargetFamily(targetApp)

  if (family === 'safari') {
    return `
tell application "${escapedTargetApp}"
  activate
  if (count of documents) is 0 then
    make new document with properties {URL:"${escapedTargetUrl}"}
  else
    set URL of front document to "${escapedTargetUrl}"
  end if
end tell`.trim()
  }

  if (family === 'chromium') {
    return `
tell application "${escapedTargetApp}"
  activate
  if (count of windows) is 0 then
    make new window
  end if
  set URL of active tab of front window to "${escapedTargetUrl}"
end tell`.trim()
  }

  return null
}

function appNamesMatch(targetApp, observedApp) {
  const normalizedTarget = normalizeComparableAppName(targetApp)
  const normalizedObserved = normalizeComparableAppName(observedApp)
  if (!normalizedTarget || !normalizedObserved) return false
  if (normalizedTarget === normalizedObserved) return true

  const aliasCandidates = APP_NAME_ALIASES.get(normalizedTarget)
  return aliasCandidates ? aliasCandidates.includes(normalizedObserved) : false
}

export async function resolveTargetAppMetadata(targetApp) {
  let bundleId = null
  let pid = null

  try {
    const { stdout } = await execFile('osascript', ['-e', `id of app "${escapeAppleScriptString(targetApp)}"`], {
      timeout: 3000
    })
    bundleId = stdout.trim() || null
  } catch {
    bundleId = null
  }

  try {
    const { stdout } = await execFile('pgrep', ['-x', targetApp], { timeout: 3000 })
    pid = Number.parseInt(stdout.split('\n').find(Boolean) ?? '', 10) || null
  } catch {
    pid = null
  }

  return { bundleId, pid }
}

export async function openUrlInTargetApp(targetApp, targetUrl) {
  if (!targetApp || !targetUrl) return false

  const urlOpenScript = buildTargetAppUrlOpenScript(targetApp, targetUrl)
  if (urlOpenScript) {
    try {
      await execFile('osascript', ['-e', urlOpenScript], { timeout: 5000 })
      await sleep(700)
      return true
    } catch {
      // Fall back to open(1) below.
    }
  }

  const metadata = await resolveTargetAppMetadata(targetApp)
  try {
    if (metadata.bundleId) {
      await execFile('open', ['-b', metadata.bundleId, targetUrl], { timeout: 5000 })
    } else {
      await execFile('open', ['-a', targetApp, targetUrl], { timeout: 5000 })
    }
    return true
  } catch {
    return false
  }
}

export async function frontmostAppInfo() {
  try {
    const { stdout: appStdout } = await execFile(
      'osascript',
      ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'],
      { timeout: 3000 }
    )
    const activeApp = appStdout.trim() || null
    let windowTitle = null

    try {
      const { stdout: windowStdout } = await execFile(
        'osascript',
        ['-e', 'tell application "System Events" to tell (first process whose frontmost is true) to get name of front window'],
        { timeout: 3000 }
      )
      windowTitle = windowStdout.trim() || null
    } catch {
      windowTitle = null
    }

    let bundleId = null
    if (activeApp) {
      try {
        const { stdout: bundleStdout } = await execFile(
          'osascript',
          ['-e', `id of app "${escapeAppleScriptString(activeApp)}"`],
          { timeout: 3000 }
        )
        bundleId = bundleStdout.trim() || null
      } catch {
        bundleId = null
      }
    }
    return {
      activeApp: activeApp || null,
      windowTitle: windowTitle || null,
      bundleId
    }
  } catch {
    try {
      const { stdout: frontStdout } = await execFile('lsappinfo', ['front'])
      const asn = frontStdout.match(/(ASN:[^:\s]+:[^:\s]*):?$/m)?.[1] ?? null
      let activeApp = frontStdout.match(/"LSDisplayName"="([^"]+)"/)?.[1] ?? null
      if (asn) {
        const { stdout: infoStdout } = await execFile('lsappinfo', ['info', '-only', 'name', asn])
        activeApp = infoStdout.match(/"LSDisplayName"="([^"]+)"/)?.[1] ?? activeApp
      }
      return {
        activeApp,
        windowTitle: null,
        bundleId: frontStdout.match(/bundleID="([^"]+)"/)?.[1] ?? null
      }
    } catch {
      return {
        activeApp: null,
        windowTitle: null,
        bundleId: null
      }
    }
  }
}

export function matchesTargetApp(params) {
  if (!params.targetApp) return false
  if (params.targetBundleId && params.observedBundleId) {
    return params.targetBundleId === params.observedBundleId
  }
  return appNamesMatch(params.targetApp, params.observedApp)
}

export function isCapturedTargetAppMatch(params) {
  if (!params.targetApp) return false

  return (
    matchesTargetApp({
      targetApp: params.targetApp,
      targetBundleId: params.targetBundleId ?? null,
      observedApp: params.observedByAppleScript ?? null,
      observedBundleId: params.observedBundleIdByAppleScript ?? null
    }) ||
    matchesTargetApp({
      targetApp: params.targetApp,
      targetBundleId: params.targetBundleId ?? null,
      observedApp: params.observedByContextReader ?? null,
      observedBundleId: params.observedBundleIdByContextReader ?? null
    }) ||
    matchesTargetApp({
      targetApp: params.targetApp,
      targetBundleId: params.targetBundleId ?? null,
      observedApp: params.capturedActiveApp ?? null,
      observedBundleId: null
    })
  )
}

async function runActivationSequence(targetApp) {
  const escapedTargetApp = escapeAppleScriptString(targetApp)
  const metadata = await resolveTargetAppMetadata(targetApp)
  let usedBundleOpen = false
  let usedBundleActivate = false
  let usedSystemEventsFrontmost = false
  let usedAppleScriptActivate = false

  if (metadata.bundleId) {
    try {
      await execFile('open', ['-b', metadata.bundleId])
      usedBundleOpen = true
    } catch {
      await execFile('open', ['-a', targetApp])
    }
  } else {
    await execFile('open', ['-a', targetApp])
  }

  try {
    const activateTarget = metadata.bundleId
      ? `tell application id "${escapeAppleScriptString(metadata.bundleId)}" to activate`
      : `tell application "${escapedTargetApp}" to activate`
    await execFile('osascript', ['-e', activateTarget], { timeout: 3000 })
    usedAppleScriptActivate = true
    usedBundleActivate = Boolean(metadata.bundleId)
  } catch {
    // Keep going. Some apps don't respond well here but can still be focused via System Events.
  }

  try {
    const frontmostTarget = metadata.pid
      ? `tell application "System Events" to set frontmost of first process whose unix id is ${metadata.pid} to true`
      : `tell application "System Events" to set frontmost of first process whose name is "${escapedTargetApp}" to true`
    await execFile(
      'osascript',
      ['-e', frontmostTarget],
      { timeout: 3000 }
    )
    usedSystemEventsFrontmost = true
  } catch {
    // Best-effort only.
  }

  return {
    metadata,
    usedBundleOpen,
    usedBundleActivate,
    usedAppleScriptActivate,
    usedSystemEventsFrontmost
  }
}

export async function activateTargetApp(targetApp) {
  if (!targetApp) {
    return {
      requestedApp: null,
      matchedFrontmost: false,
      attempts: 0,
      activationMethod: 'none',
      finalObservedFrontmost: await frontmostAppInfo()
    }
  }

  let finalObservedFrontmost = await frontmostAppInfo()
  let lastActivation = null
  const targetMetadata = await resolveTargetAppMetadata(targetApp)

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const activation = await runActivationSequence(targetApp)
    lastActivation = activation
    await sleep(450 * attempt)
    finalObservedFrontmost = await frontmostAppInfo()
    if (
      matchesTargetApp({
        targetApp,
        targetBundleId: targetMetadata.bundleId,
        observedApp: finalObservedFrontmost.activeApp,
        observedBundleId: finalObservedFrontmost.bundleId
      })
    ) {
      return {
        requestedApp: targetApp,
        matchedFrontmost: true,
        attempts: attempt,
        metadata: activation.metadata,
        requestedMetadata: targetMetadata,
        activationSignals: {
          usedBundleOpen: activation.usedBundleOpen,
          usedBundleActivate: activation.usedBundleActivate,
          usedAppleScriptActivate: activation.usedAppleScriptActivate,
          usedSystemEventsFrontmost: activation.usedSystemEventsFrontmost
        },
        activationMethod:
          activation.usedBundleOpen && activation.usedBundleActivate && activation.usedSystemEventsFrontmost
            ? 'bundle-open-activate-frontmost'
            : activation.usedAppleScriptActivate && activation.usedSystemEventsFrontmost
              ? 'open-activate-frontmost'
              : activation.usedBundleOpen && activation.usedBundleActivate
                ? 'bundle-open-and-activate'
                : activation.usedBundleOpen
                  ? 'bundle-open'
                  : activation.usedAppleScriptActivate
                    ? 'open-and-activate'
                    : activation.usedSystemEventsFrontmost
                      ? 'open-and-frontmost'
                      : 'open-only',
        finalObservedFrontmost
      }
    }
  }

  const activationMethod =
    lastActivation?.usedBundleOpen && lastActivation?.usedBundleActivate && lastActivation?.usedSystemEventsFrontmost
      ? 'bundle-open-activate-frontmost'
      : lastActivation?.usedAppleScriptActivate && lastActivation?.usedSystemEventsFrontmost
        ? 'open-activate-frontmost'
        : lastActivation?.usedBundleOpen && lastActivation?.usedBundleActivate
          ? 'bundle-open-and-activate'
          : lastActivation?.usedBundleOpen
            ? 'bundle-open'
            : lastActivation?.usedAppleScriptActivate
              ? 'open-and-activate'
              : lastActivation?.usedSystemEventsFrontmost
                ? 'open-and-frontmost'
                : 'open-only'

  return {
    requestedApp: targetApp,
    matchedFrontmost: false,
    attempts: 3,
    activationMethod,
    metadata: lastActivation?.metadata ?? null,
    requestedMetadata: targetMetadata,
    activationSignals:
      lastActivation
        ? {
            usedBundleOpen: lastActivation.usedBundleOpen,
            usedBundleActivate: lastActivation.usedBundleActivate,
            usedAppleScriptActivate: lastActivation.usedAppleScriptActivate,
            usedSystemEventsFrontmost: lastActivation.usedSystemEventsFrontmost
          }
        : null,
    finalObservedFrontmost
  }
}
