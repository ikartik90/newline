import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { platform } from 'node:os'
import process from 'node:process'
import { dirname, join } from 'node:path'

// ---------------------------------------------------------------------------
// Builds the macOS sidebar-glass add-on (src/main/native/sidebar-glass.mm)
// into out/native/, where src/main/sidebar-glass.ts loads it. It speaks Node-API
// alone, so one build serves Node and Electron alike, and it is built for both
// Mac architectures, as the universal app needs. Elsewhere there is nothing to
// build: other platforms paint their own sidebar.
//
// Runs from `predev` and `build`. Needs Xcode's command-line tools and the
// running Node's headers (an official Node install ships them in include/node).
// ---------------------------------------------------------------------------

const SOURCE = 'src/main/native/sidebar-glass.mm'
const OUTPUT = 'out/native/sidebar-glass.node'

if (platform() === 'darwin') {
  const headers = join(dirname(process.execPath), '..', 'include', 'node')
  if (!existsSync(join(headers, 'node_api.h'))) {
    throw new Error(`build-native: no Node-API headers at ${headers}`)
  }
  mkdirSync(dirname(OUTPUT), { recursive: true })
  execFileSync(
    'xcrun',
    [
      '--sdk',
      'macosx',
      'clang++',
      '-std=c++17',
      '-ObjC++',
      '-fobjc-arc',
      '-Wall',
      '-Werror',
      '-O2',
      '-arch',
      'arm64',
      '-arch',
      'x86_64',
      '-mmacosx-version-min=11.0',
      '-bundle',
      '-undefined',
      'dynamic_lookup',
      '-framework',
      'AppKit',
      '-I',
      headers,
      '-o',
      OUTPUT,
      SOURCE
    ],
    { stdio: 'inherit' }
  )
}
