import Database from 'better-sqlite3'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { runMigrations } from '../migrations'

// ---------------------------------------------------------------------------
// An in-memory database for main-process tests.
//
// `postinstall` rebuilds better-sqlite3 for Electron's ABI, which the Node
// running vitest cannot load. `npm install` had already fetched the prebuild
// for THIS Node into npm's cache before that rebuild, so when the default
// binding fails we unpack that one under node_modules/.cache and load it by
// path. `BETTER_SQLITE3_NATIVE_BINDING` overrides the lookup.
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = join(__dirname, '..', '..', '..', '..')

function prebuildName(): string {
  const manifest = join(PACKAGE_ROOT, 'node_modules', 'better-sqlite3', 'package.json')
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }
  return `better-sqlite3-v${version}-node-v${process.versions.modules}-${process.platform}-${process.arch}`
}

function cachedNativeBinding(): string | null {
  const dir = join(PACKAGE_ROOT, 'node_modules', '.cache', prebuildName())
  const binding = join(dir, 'build', 'Release', 'better_sqlite3.node')
  if (existsSync(binding)) return binding

  const prebuilds = join(homedir(), '.npm', '_prebuilds')
  if (!existsSync(prebuilds)) return null
  const tarball = readdirSync(prebuilds).find((name) => name.endsWith(`${prebuildName()}.tar.gz`))
  if (!tarball) return null

  mkdirSync(dir, { recursive: true })
  execFileSync('tar', ['xzf', join(prebuilds, tarball), '-C', dir])
  return existsSync(binding) ? binding : null
}

let nativeBinding: string | undefined

export function openMemoryDb(): Database.Database {
  if (nativeBinding === undefined) {
    nativeBinding = process.env.BETTER_SQLITE3_NATIVE_BINDING ?? ''
    if (!nativeBinding) {
      try {
        new Database(':memory:').close()
      } catch (error) {
        nativeBinding = cachedNativeBinding() ?? ''
        if (!nativeBinding) throw error
      }
    }
  }
  return new Database(':memory:', nativeBinding ? { nativeBinding } : {})
}

/** A fresh database at the current schema. */
export function openMigratedDb(): Database.Database {
  const db = openMemoryDb()
  runMigrations(db)
  return db
}
