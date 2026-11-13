// ---------------------------------------------------------------------------
// For the tests only: reads the tokens out of a stylesheet's own text, the
// top-level `@theme`, `@theme inline`, `:root` and `.dark` blocks and every
// `@utility`, so tokens.test.ts can hold main.css to its scales.
// ---------------------------------------------------------------------------

export interface TokenDecl {
  name: string
  value: string
}

export interface ParsedTokens {
  /** `@theme { … }` — the raw palette, radii, fonts, breakpoints. */
  theme: TokenDecl[]
  /** Every top-level `:root { … }`, in order — the light semantic values. */
  light: TokenDecl[]
  /** `.dark { … }` — the dark semantic values. */
  dark: TokenDecl[]
  /** `@theme inline { … }` — the utility names over the semantic values. */
  inline: TokenDecl[]
  /** The names of every `@utility`. */
  utilities: string[]
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The bodies of every top-level block whose header matches `header`. */
function blocks(css: string, header: RegExp): string[] {
  const out: string[] = []
  const pattern = new RegExp(`^${header.source}\\s*\\{`, 'gm')
  for (const match of css.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[0].length
    let depth = 1
    let i = start
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push(css.slice(start, i - 1))
  }
  return out
}

/** The custom-property declarations of a block, nested at-rules skipped. */
function declarations(body: string): TokenDecl[] {
  let flat = ''
  let depth = 0
  for (const char of body) {
    if (char === '{') depth++
    if (depth === 0) flat += char
    if (char === '}') depth--
  }
  return [...flat.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => ({
    name,
    value: value.replace(/\s+/g, ' ').trim()
  }))
}

export function parseTokens(source: string): ParsedTokens {
  const css = stripComments(source)
  const read = (header: RegExp) => blocks(css, header).flatMap(declarations)
  return {
    theme: read(/@theme/),
    light: read(/:root/),
    dark: read(/\.dark/),
    inline: read(/@theme inline/),
    utilities: [...css.matchAll(/^@utility\s+([\w-]+)/gm)].map(([, name]) => name)
  }
}

export interface UtilityRule {
  name: string
  declarations: { property: string; value: string }[]
}

/** Every `@utility` with its own declarations; nested rules (`&:hover`) skipped. */
export function utilityRules(source: string): UtilityRule[] {
  const css = stripComments(source)
  return [...css.matchAll(/^@utility\s+([\w-]+)\s*\{/gm)].map((match) => {
    const [body] = blocks(css.slice(match.index), /@utility\s+[\w-]+/)
    let flat = ''
    let depth = 0
    for (const char of body) {
      if (char === '{') depth++
      if (depth === 0) flat += char
      if (char === '}') depth--
    }
    const declarations = [...flat.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map(
      ([, property, value]) => ({ property, value: value.replace(/\s+/g, ' ').trim() })
    )
    return { name: match[1], declarations }
  })
}
