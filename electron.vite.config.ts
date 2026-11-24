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
  // `white` is the spelling the icons actually use (317 of 318 attributes);
  // the hex forms are kept so a future icon authored either way still maps.
  replaceAttrValues: {
    white: 'currentColor',
    '#fff': 'currentColor',
    '#ffffff': 'currentColor'
  },
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
        // and cannot `require()` them. All but the first read a note's MDX.
        exclude: [
          'uuid',
          'mdast-util-from-markdown',
          'mdast-util-gfm-autolink-literal',
          'mdast-util-gfm-footnote',
          'mdast-util-gfm-strikethrough',
          'mdast-util-gfm-task-list-item',
          'mdast-util-mdx-jsx',
          'mdast-util-to-markdown',
          'micromark-extension-gfm-autolink-literal',
          'micromark-extension-gfm-footnote',
          'micromark-extension-gfm-strikethrough',
          'micromark-extension-gfm-task-list-item',
          'micromark-extension-mdx-jsx',
          'micromark-extension-mdx-md'
        ]
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
    plugins: [react(), tailwindcss(), svgr({ include: '**/*.svg', svgrOptions })],
    build: {
      rollupOptions: {
        // The app's window, and the glass command palette's and glass menu's own.
        input: {
          index: resolve('src/renderer/index.html'),
          'command-palette': resolve('src/renderer/command-palette.html'),
          'glass-menu': resolve('src/renderer/glass-menu.html')
        }
      }
    }
  }
})
