import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'

// ---------------------------------------------------------------------------
// macOS names a running app after the BUNDLE it launched, not after whatever
// the app calls itself: `productName` reaches `app.name`, but the menu bar,
// the Dock and the app switcher read `Electron.app`'s own Info.plist, so from
// source they all said "Electron". Renaming that bundle is safe — its ad-hoc
// signature is linker-signed, binding neither Info.plist nor resources
// (`codesign -dv` reports `Info.plist=not bound`), so nothing needs re-signing.
//
// Runs from `predev`, and is idempotent: a reinstall restores the stock
// bundle, the next `npm run dev` renames it again. Packaged builds get the
// name from electron-builder's `productName` and never come through here.
// ---------------------------------------------------------------------------

const APP_NAME = 'Newline'
const INFO_PLIST = 'node_modules/electron/dist/Electron.app/Contents/Info.plist'

const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

if (platform() === 'darwin' && existsSync(INFO_PLIST)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', APP_NAME, INFO_PLIST])
  }
  // LaunchServices caches the old name against the bundle's path, and the Dock
  // reads it from there rather than from the bundle. Best effort: a refresh
  // that fails is not worth failing `npm run dev` over.
  try {
    execFileSync(LSREGISTER, ['-f', INFO_PLIST.replace('/Contents/Info.plist', '')])
  } catch {
    // Nothing to do — the name still holds everywhere but a stale Dock tile.
  }
}
