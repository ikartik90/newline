import { execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// The helper must decide WHICH native binding to use before it opens anything.
//
// The shape it used to have — construct a Database, catch the failure, then
// load a known-good binding by path — mapped a library this Node cannot run
// into the process before giving up. macOS never showed it; on Linux the suite
// died with SIGBUS partway through whichever file leaned on the database
// hardest. So the rule under test is narrow and mechanical: opening a database
// constructs exactly one, with no trial run in front of it.
// ---------------------------------------------------------------------------

const { constructions } = vi.hoisted(() => ({
  constructions: [] as Array<Record<string, unknown> | undefined>
}))

vi.mock('better-sqlite3', () => {
  class FakeDatabase {
    constructor(_filename: string, options?: Record<string, unknown>) {
      constructions.push(options)
    }
    close(): void {}
  }
  return { default: FakeDatabase }
})

beforeEach(() => {
  constructions.length = 0
  vi.resetModules()
})

afterEach(() => {
  delete process.env.BETTER_SQLITE3_NATIVE_BINDING
})

describe('the test database picks its binding before opening anything', () => {
  it('opens exactly one database, with no trial construction in front of it', async () => {
    const { openMemoryDb } = await import('./test-db')
    openMemoryDb()
    expect(constructions).toHaveLength(1)
  })

  it('hands over an explicit binding rather than falling through to the default', async () => {
    process.env.BETTER_SQLITE3_NATIVE_BINDING = '/tmp/pinned-binding.node'
    const { openMemoryDb } = await import('./test-db')
    openMemoryDb()
    expect(constructions).toEqual([{ nativeBinding: '/tmp/pinned-binding.node' }])
  })

  it('resolves a binding built for this Node, chosen by name and never by trial', async () => {
    const { resolveNativeBinding } = await import('./test-db')
    const binding = resolveNativeBinding()

    // Nothing was constructed: the decision is made from file names alone.
    expect(constructions).toHaveLength(0)

    // A machine with no prebuild to find legitimately resolves nothing and
    // lets better-sqlite3 use its own default — but whatever it does return
    // must be a file built for exactly this runtime.
    if (binding !== null) {
      expect(existsSync(binding)).toBe(true)
      expect(binding).toContain(
        `node-v${process.versions.modules}-${process.platform}-${process.arch}`
      )
    }
  })
})

describe('unpacking a prebuild never leaves a half-written binding behind', () => {
  // A shared library that is still being written is not a readable error. macOS
  // reports a __TEXT segment running past the end of the file; Linux maps it
  // and kills the process with SIGBUS. Since every vitest fork races to unpack
  // the same prebuild, the destination has to appear whole or not at all.

  // Incompressible, and big enough that a gzip stream cut in half still
  // decompresses far enough for tar to write part of the file before it fails.
  // A small or repetitive payload would let tar give up before writing a byte,
  // and the truncation tests below would pass without proving anything.
  const BYTES = randomBytes(2 * 1024 * 1024)

  function tarballOf(content: Buffer): { dir: string; tarball: string } {
    const dir = mkdtempSync(join(tmpdir(), 'prebuild-'))
    mkdirSync(join(dir, 'src', 'build', 'Release'), { recursive: true })
    writeFileSync(join(dir, 'src', 'build', 'Release', 'better_sqlite3.node'), content)
    const tarball = join(dir, 'prebuild.tar.gz')
    execFileSync('tar', ['czf', tarball, '-C', join(dir, 'src'), 'build'])
    return { dir, tarball }
  }

  it('puts the whole file in place and reports success', async () => {
    const { unpackBinding } = await import('./test-db')
    const { dir, tarball } = tarballOf(BYTES)
    const binding = join(dir, 'out', 'build', 'Release', 'better_sqlite3.node')

    expect(unpackBinding(tarball, binding)).toBe(true)
    expect(readFileSync(binding).equals(BYTES)).toBe(true)
  })

  it('leaves no destination at all when the tarball cannot be read', async () => {
    const { unpackBinding } = await import('./test-db')
    const { dir, tarball } = tarballOf(BYTES)
    // Half a gzip stream: tar fails partway, exactly as a reader would catch a
    // sibling fork mid-write.
    const whole = readFileSync(tarball)
    writeFileSync(tarball, whole.subarray(0, Math.floor(whole.length / 2)))
    const binding = join(dir, 'out', 'build', 'Release', 'better_sqlite3.node')

    expect(unpackBinding(tarball, binding)).toBe(false)
    expect(existsSync(binding)).toBe(false)
  })

  it('leaves a binding another fork is already using untouched', async () => {
    const { unpackBinding } = await import('./test-db')
    const { dir, tarball } = tarballOf(BYTES)
    const binding = join(dir, 'out', 'build', 'Release', 'better_sqlite3.node')
    expect(unpackBinding(tarball, binding)).toBe(true)

    const whole = readFileSync(tarball)
    writeFileSync(tarball, whole.subarray(0, Math.floor(whole.length / 2)))

    expect(unpackBinding(tarball, binding)).toBe(false)
    expect(readFileSync(binding).equals(BYTES)).toBe(true)
  })

  it('clears its staging directory away afterwards', async () => {
    const { unpackBinding } = await import('./test-db')
    const { dir, tarball } = tarballOf(BYTES)
    const outDir = join(dir, 'out', 'build', 'Release')
    unpackBinding(tarball, join(outDir, 'better_sqlite3.node'))

    expect(readdirSync(outDir)).toEqual(['better_sqlite3.node'])
  })
})
