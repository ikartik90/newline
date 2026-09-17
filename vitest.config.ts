import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'path'
import { svgrOptions } from './electron.vite.config'

/**
 * Two projects, because the app has two runtimes. The renderer is a browser
 * (jsdom), and the main process is Node with Electron mocked per test. The
 * `@` alias mirrors electron.vite.config so a test imports exactly what the
 * app does.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react(), svgr({ include: '**/*.svg', svgrOptions })],
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src/renderer/src'),
            '@shared': resolve(__dirname, 'src/shared')
          }
        },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./src/renderer/src/test-setup.ts'],
          include: ['src/renderer/src/**/__tests__/**/*.test.{ts,tsx}'],
          testTimeout: 20_000
        }
      },
      {
        resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['src/shared/**/__tests__/**/*.test.ts']
        }
      },
      {
        resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/__tests__/**/*.test.ts']
        }
      }
    ]
  }
})
