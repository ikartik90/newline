import type { Nodes, PhrasingContent, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import { z } from 'zod'
import {
  CodeLanguageSchema,
  StyleAlignSchema,
  StyleColorSchema,
  StyleSizeSchema,
  TAG,
  type CodeLanguage,
  type Style
} from './dialect'
import { BREAK, run, settleBreaks, type Run, type RunMark } from './inline'

// ---------------------------------------------------------------------------
// What every reader of the MDX shares: a tag's attributes read from the closed
// lists, and markdown's inline tree as runs of text.
// ---------------------------------------------------------------------------

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement

/** What is kept across the whole text. */
export interface Reading {
  sidenotes: number
  /** What each footnote a marker points at says, by its name. */
  footnotes: Map<string, string>
}

/** The blocks whose children are blocks: their words are set apart. */
const HOLDS_BLOCKS = new Set(['footnoteDefinition', 'blockquote', 'list', 'listItem'])

/** What a part of the tree says, as plain words. */
function wordsOf(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  if (node.type === 'break') return ' '
  if (!('children' in node)) return ''
  return node.children.map(wordsOf).join(HOLDS_BLOCKS.has(node.type) ? ' ' : '')
}

/** A reading of a tree from its start, with the footnotes its markers point at. */
export function startReading(tree: Root): Reading {
  const said = new Map<string, string>()
  const pointed = new Set<string>()
  const walk = (node: Nodes): void => {
    if (node.type === 'footnoteReference') pointed.add(node.identifier)
    if (node.type === 'footnoteDefinition') {
      said.set(node.identifier, wordsOf(node).replace(/\s+/g, ' ').trim())
    }
    if ('children' in node) node.children.forEach(walk)
  }
  walk(tree)
  const footnotes = new Map([...said].filter(([name]) => pointed.has(name)))
  return { sidenotes: 0, footnotes }
}

/**
 * A footnote is a sidenote: its words go beside the word its marker followed,
 * the last read so far, and the space that set the marker apart goes. A word
 * that has a sidenote already takes these words into it, and a marker with no
 * word before it stands on its own name.
 */
function footnote(out: Run[], words: string, name: string, marks: RunMark[], reading: Reading) {
  while (out.length && out.at(-1)!.text !== BREAK && !out.at(-1)!.text.trim()) out.pop()
  const last = out.at(-1)
  const worn = last?.marks ?? []
  const noted = worn.find((mark) => mark.type === 'sidenote')
  if (last && noted?.type === 'sidenote') {
    last.text = last.text.trimEnd()
    noted.text = `${noted.text} ${words}`.trim()
    return
  }
  reading.sidenotes += 1
  const note: RunMark = { type: 'sidenote', id: `sn-${reading.sidenotes}`, text: words }
  const found = last && last.text !== BREAK ? /^([\s\S]*?)(\S+)\s*$/.exec(last.text) : null
  if (!found) {
    out.push(run(name, [...marks, note]))
    return
  }
  out.pop()
  if (found[1]) out.push(run(found[1], worn))
  out.push(run(found[2], [...worn, note]))
}

const LANGUAGE_ALIASES: Record<string, CodeLanguage> = { js: 'javascript', ts: 'typescript' }

const VIDEO_EXTENSIONS = /\.mp4$/i

const NO_BREAK_SPACE = ' '

export function isAbsoluteUrl(href: string): boolean {
  return z.url().safeParse(href).success
}

/** A clip is known by its extension: uploads keep their type's, and mp4 is the one clip type. */
export function mediaKind(src: string): 'image' | 'video' {
  return VIDEO_EXTENSIONS.test(src.split(/[?#]/)[0]) ? 'video' : 'image'
}

export function codeLanguage(lang: string | null | undefined): CodeLanguage | undefined {
  const name = (lang ?? '').trim().split(/\s+/)[0].toLowerCase()
  const result = CodeLanguageSchema.safeParse(LANGUAGE_ALIASES[name] ?? name)
  return result.success ? result.data : undefined
}

/** An attribute's words; one given as an expression, or not at all, is none. */
export function attributeValue(element: JsxElement, name: string): string | null | undefined {
  const found = element.attributes.find(
    (attribute): attribute is MdxJsxAttribute =>
      attribute.type === 'mdxJsxAttribute' && attribute.name === name
  )
  if (!found) return undefined
  return typeof found.value === 'string' ? found.value : null
}

/** What a style tag says of its block, an unknown value read as none. */
export function styleOf(element: JsxElement): Style {
  const size = StyleSizeSchema.safeParse(attributeValue(element, 'size'))
  const color = StyleColorSchema.safeParse(attributeValue(element, 'color'))
  const align = StyleAlignSchema.safeParse(attributeValue(element, 'align'))
  return {
    ...(size.success ? { size: size.data } : {}),
    ...(color.success ? { color: color.data } : {}),
    ...(align.success ? { align: align.data } : {}),
    ...(attributeValue(element, 'indent') !== undefined ? { indent: true } : {})
  }
}

/** The marks a tag adds to what it holds; an unknown tag adds none. */
export function tagMarks(element: JsxElement, marks: RunMark[], reading: Reading): RunMark[] {
  const worn = (type: RunMark['type']): boolean => marks.some((mark) => mark.type === type)
  switch (element.name) {
    case TAG.underline:
      return worn('underline') ? marks : [...marks, { type: 'underline' }]
    case TAG.highlight:
      return worn('highlight') ? marks : [...marks, { type: 'highlight' }]
    case TAG.textStyle: {
      const color = StyleColorSchema.safeParse(attributeValue(element, 'color'))
      return color.success && !worn('color')
        ? [...marks, { type: 'color', color: color.data }]
        : marks
    }
    case TAG.sidenote:
      if (worn('sidenote')) return marks
      reading.sidenotes += 1
      return [
        ...marks,
        {
          type: 'sidenote',
          id: `sn-${reading.sidenotes}`,
          text: attributeValue(element, 'note') ?? ''
        }
      ]
    default:
      return marks
  }
}

function runsOf(nodes: PhrasingContent[], marks: RunMark[], reading: Reading): Run[] {
  const out: Run[] = []
  const add = (type: 'bold' | 'italic' | 'strikethrough' | 'code'): RunMark[] =>
    marks.some((worn) => worn.type === type) ? marks : [...marks, { type }]
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push(run(node.value, marks))
        break
      case 'break':
        out.push(run(BREAK, marks))
        break
      case 'strong':
        out.push(...runsOf(node.children, add('bold'), reading))
        break
      case 'emphasis':
        out.push(...runsOf(node.children, add('italic'), reading))
        break
      case 'delete':
        out.push(...runsOf(node.children, add('strikethrough'), reading))
        break
      case 'inlineCode':
        out.push(run(node.value, add('code')))
        break
      case 'link': {
        const linked =
          isAbsoluteUrl(node.url) && !marks.some((worn) => worn.type === 'link')
            ? [...marks, { type: 'link' as const, href: node.url }]
            : marks
        out.push(...runsOf(node.children, linked, reading))
        break
      }
      // A picture among words has no block to become: its alt stands in.
      case 'image':
        out.push(run(node.alt ?? '', marks))
        break
      case 'mdxJsxTextElement':
        out.push(...runsOf(node.children, tagMarks(node, marks, reading), reading))
        break
      case 'footnoteReference': {
        const words = reading.footnotes.get(node.identifier)
        if (words !== undefined) footnote(out, words, node.label ?? node.identifier, marks, reading)
        break
      }
      default:
        if ('children' in node) {
          out.push(...runsOf(node.children as PhrasingContent[], marks, reading))
        } else if ('value' in node && typeof node.value === 'string') {
          out.push(run(node.value, marks))
        }
    }
  }
  return out
}

/**
 * Markdown's inline tree as runs, under the marks of whatever holds it. A
 * bare no-break space alone is a line that holds nothing.
 */
export function readInline(nodes: PhrasingContent[], marks: RunMark[], reading: Reading): Run[] {
  const settled = settleBreaks(runsOf(nodes, marks, reading))
  const [only, ...more] = settled
  return only && !more.length && !only.marks && only.text === NO_BREAK_SPACE ? [] : settled
}
