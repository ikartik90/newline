import Database from 'better-sqlite3'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { runMigrations } from '../migrations'

// ---------------------------------------------------------------------------
// An in-memory database for main-process tests.
//
// `postinstall` rebuilds better-sqlite3 for Electron's ABI, which the Node
// running vitest cannot load. `npm install` had already fetched the prebuild
// for THIS Node into npm's cache before that rebuild, so we unpack that one
// under node_modules/.cache and hand better-sqlite3 its path.
//
// Unpacking it is the delicate part. Every vitest fork reaches this code at
// once, and each one that finds no unpacked binding starts its own `tar`. Left
// to write straight to the destination they overwrite the very file a sibling
// fork is busy opening, and a half-written shared library is not a readable
// error: macOS reports a __TEXT segment running past the end of the file, and
// Linux, which maps it instead, takes the whole fork down with SIGBUS. So the
// bytes land in a staging path this process owns and are moved into place with
// one rename. A reader therefore sees the file whole or not at all, and a fork
// that already opened the previous copy keeps it, because rename swaps the
// directory entry and leaves the inode alone.
//
// The binding is also chosen before anything is opened. better-sqlite3 only
// reaches for its default when no `nativeBinding` is given (it assigns
// `DEFAULT_ADDON` lazily), so resolving a path first means the Electron build
// is never opened even to discover that it cannot be.
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = join(__dirname, '..', '..', '..', '..')

/** prebuild-install's name for the build this exact runtime can load. */
function prebuildName(): string {
  const manifest = join(PACKAGE_ROOT, 'node_modules', 'better-sqlite3', 'package.json')
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }
  return `better-sqlite3-v${version}-node-v${process.versions.modules}-${process.platform}-${process.arch}`
}

/**
 * npm's cache directory, which holds the prebuild tarballs. `npm test` exports
 * the configured path, so this follows a relocated cache instead of guessing;
 * the fallback is npm's own default for a bare `npx vitest`.
 */
function npmCacheDir(): string {
  return process.env.npm_config_cache ?? join(homedir(), '.npm')
}

/**
 * The binding to hand better-sqlite3, or null to let it use its own default.
 * Decided from file names alone — nothing is loaded to find out whether it
 * works, because a failed load is not free.
 */
export function resolveNativeBinding(): string | null {
  const override = process.env.BETTER_SQLITE3_NATIVE_BINDING
  if (override) return override

  const dir = join(PACKAGE_ROOT, 'node_modules', '.cache', prebuildName())
  const binding = join(dir, 'build', 'Release', 'better_sqlite3.node')
  if (existsSync(binding)) return binding

  const prebuilds = join(npmCacheDir(), '_prebuilds')
  if (!existsSync(prebuilds)) return null
  const tarball = readdirSync(prebuilds).find((name) => name.endsWith(`${prebuildName()}.tar.gz`))
  if (!tarball) return null

  return unpackBinding(join(prebuilds, tarball), binding) ? binding : null
}

/**
 * Unpack `tarball` so that `binding` only ever exists complete. The bytes are
 * staged under a name this process owns, beside the destination so the rename
 * stays on one filesystem, and moved in one step; a tarball that turns out to
 * be unreadable leaves whatever was already there untouched.
 */
export function unpackBinding(tarball: string, binding: string): boolean {
  const staging = `${binding}.staging-${process.pid}`
  try {
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    execFileSync('tar', ['xzf', tarball, '-C', staging], { stdio: 'ignore' })

    const unpacked = join(staging, 'build', 'Release', 'better_sqlite3.node')
    if (!existsSync(unpacked)) return false

    mkdirSync(dirname(binding), { recursive: true })
    renameSync(unpacked, binding)
    return true
  } catch {
    return false
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

let nativeBinding: string | null | undefined

export function openMemoryDb(): Database.Database {
  if (nativeBinding === undefined) nativeBinding = resolveNativeBinding()
  // No prebuild to be had: better-sqlite3 uses the binding it shipped with,
  // which is right whenever postinstall has not swapped it for Electron's, and
  // fails with a readable error when it has.
  return new Database(':memory:', nativeBinding ? { nativeBinding } : {})
}

/** A fresh database at the current schema. */
export function openMigratedDb(): Database.Database {
  const db = openMemoryDb()
  runMigrations(db)
  return db
}
