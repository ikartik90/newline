import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Storage is isolated per test file, and this runs once per file: every file
// starts from the schema in `migrations/` with empty tables.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
