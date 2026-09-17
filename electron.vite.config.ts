import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'path'

/**
 * Every `*.svg` under the renderer imports as a React component. Colours
 * authored as white become `currentColor` so an icon takes the ink of the
 * control it sits in, and the viewBox is kept so a CSS-sized icon scales.
 */
export const svgrOptions = {
  replaceAttrValues: { '#fff': 'currentColor', '#ffffff': 'currentColor' },
  svgoConfig: {
    plugins: [
      {
        name: 'preset-default',
        params: { overrides: { removeViewBox: false } }
      }
    ]
  }
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      externalizeDeps: {
        // ESM-only packages must be bundled: the main process is CommonJS
        // and cannot `require()` them.
        exclude: ['uuid', 'marked']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss(), svgr({ include: '**/*.svg', svgrOptions })]
  }
})
