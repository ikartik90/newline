import { compile } from '@tailwindcss/node'
import css from '@/assets/main.css?raw'

// ---------------------------------------------------------------------------
// For the tests only: main.css as Tailwind builds it, to hold a utility to the
// rules it compiles to, @supports fallbacks and all.
// ---------------------------------------------------------------------------

// `src/renderer/src`, cut from this file's own URL: the renderer's tsconfig
// has no Node types.
const HERE = decodeURIComponent(new URL(import.meta.url).pathname)
export const RENDERER_SRC = HERE.slice(0, HERE.indexOf('/__tests__/'))

/** main.css as Tailwind builds it, for `candidates`. */
export async function buildMainCss(candidates: string[]): Promise<string> {
  const compiler = await compile(css, { base: `${RENDERER_SRC}/assets`, onDependency: () => {} })
  return compiler.build(candidates)
}

/** Every declaration of `.<className>` across the built rules, one string. */
export function declarationsOf(built: string, className: string): string {
  const selector = `.${className.replace(/[[\]%]/g, (c) => `\\${c}`)} {`
  let out = ''
  let at = built.indexOf(selector)
  while (at !== -1) {
    const open = at + selector.length
    out += built.slice(open, built.indexOf('}', open))
    at = built.indexOf(selector, open)
  }
  return out
}
