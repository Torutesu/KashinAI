import { app } from 'electron'

/**
 * Auto-update wiring (electron-updater).
 *
 * Deliberately inert unless the app is a packaged build: in dev / unpackaged / unit tests there is
 * no update feed and `autoUpdater` would throw, so we no-op. It also swallows all errors — a failed
 * update check must never crash or block the app. When packaged, it checks GitHub Releases (the
 * `build.publish` provider) on startup and, if an update is found, downloads it and installs on quit.
 *
 * Requires a published release produced by .github/workflows/release.yml to actually find updates.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  void (async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('error', () => {
        // Network/feed errors are non-fatal; try again on the next launch.
      })
      await autoUpdater.checkForUpdatesAndNotify()
    } catch {
      // electron-updater not configured (no publish provider) or offline: ignore.
    }
  })()
}
