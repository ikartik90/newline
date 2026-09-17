import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const here = new URL('.', import.meta.url).pathname

export default defineConfig(async () => {
  const migrations = await readD1Migrations(`${here}migrations`)

  return {
    resolve: {
      alias: { '@shared': new URL('../src/shared', import.meta.url).pathname }
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Test-only binding: the setup file applies these to `env.DB` before the tests run.
          bindings: { TEST_MIGRATIONS: migrations }
        }
      })
    ],
    test: {
      include: ['src/__tests__/**/*.test.ts'],
      setupFiles: ['./src/__tests__/setup.ts']
    }
  }
})
