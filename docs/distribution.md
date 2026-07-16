# Distribution (macOS)

This document covers building a **distributable** KashinAI: a signed and notarized
macOS app that launches on other people's Macs without Gatekeeper blocking it.

> Status: the packaging config, entitlements, and release workflow are in place. Producing an
> actually-shippable artifact requires an Apple Developer account and the secrets below — those
> cannot live in the repo. Auto-update (see the bottom) is scaffolded as a follow-up, not yet wired.

## Local unsigned build (no account needed)

```bash
pnpm package:mac
```

This runs `electron-vite build` then `electron-builder --mac dir`, producing an **unsigned**
`.app` under `release/`. Good for local testing on your own machine (you may need to right-click →
Open the first time). It is NOT distributable — other Macs will refuse to open it.

## What "distributable" requires

macOS will not run a downloaded app unless it is:

1. **Code-signed** with an Apple *Developer ID Application* certificate, and
2. **Notarized** by Apple (the app is uploaded to Apple, scanned, and stapled).

Both need a paid **Apple Developer Program** membership.

### One-time setup

1. Enroll in the Apple Developer Program.
2. Create a **Developer ID Application** certificate in the Apple Developer portal and export it
   from Keychain Access as a `.p12` (set a password).
3. Create an **app-specific password** for your Apple ID (appleid.apple.com → Sign-In & Security).
4. Find your **Team ID** (Apple Developer → Membership).

### Configuration already in the repo

- `package.json` → `build.mac`: `hardenedRuntime: true`, `entitlements`, dmg/zip targets.
- `build/entitlements.mac.plist`: the Hardened Runtime entitlements Electron needs, plus Apple
  Events / screen-capture access KashinAI uses.
- `notarize` defaults to `false` so local/dir builds never attempt it; the release workflow turns
  it on when Apple secrets are present.

## Building signed + notarized

### Via CI (recommended): `.github/workflows/release.yml`

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | What it is |
| --- | --- |
| `MAC_CSC_LINK` | base64 of your Developer ID `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `MAC_CSC_KEY_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 3 |
| `APPLE_TEAM_ID` | your Team ID |

Then either push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

or run the **Release (macOS)** workflow manually. It builds on `macos-14`, signs, notarizes (when
the secrets are present), uploads `.dmg`/`.zip` artifacts, and — for a `v*` tag — attaches them to a
**draft** GitHub Release for you to review and publish.

If the Apple secrets are absent the workflow still runs but emits a warning and produces UNSIGNED
artifacts.

### Locally (on a Mac with the certificate installed)

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="XXXXXXXXXX"
# Signing cert must be in your login keychain (or set CSC_LINK/CSC_KEY_PASSWORD).
pnpm build
pnpm exec electron-builder --mac -c.mac.notarize=true
```

## Auto-update

Auto-update is wired via `electron-updater`:

- `src/main/updater.ts` initializes `autoUpdater` on startup, but only when `app.isPackaged` — in
  dev / tests it is a no-op, and all errors are swallowed so a failed check never blocks the app.
- `package.json` → `build.publish` points at the GitHub Releases provider (owner `Torutesu`, repo
  `KashinAI`).
- `.github/workflows/release.yml` runs `electron-builder --publish always` on `v*` tags, which
  uploads the `.dmg`/`.zip` **and** the `latest-mac.yml` feed that `electron-updater` reads.

So once a `v*` tag has been released through the workflow, packaged installs check GitHub Releases
on launch and self-update. Auto-update only works for **signed** builds (macOS refuses to swap in an
unsigned update), so the Apple secrets above are required for it to function end-to-end.

## Still to do

- **App icon**: add `build/icon.icns` (1024×1024 source) so the packaged app and Dock use a real
  icon instead of the default Electron icon. The menu-bar tray icon is currently empty
  (`nativeImage.createEmpty()` in `src/main/index.ts`) — ship a template PNG there too. (Requires a
  designed asset; best added on a Mac where `iconutil` can generate the `.icns`.)
