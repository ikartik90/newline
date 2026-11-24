import type { List, Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Mark, Node } from 'prosemirror-model'
import { TAG, parseMarkdown, parseMdx, type Style } from '@shared/mdx/dialect'
import { BREAK, type Run, type RunMark } from '@shared/mdx/inline'
import {
  codeLanguage,
  readInline,
  startReading,
  styleOf,
  tagMarks,
  type Reading
} from '@shared/mdx/reading'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// MDX text → the note ProseMirror edits. Never throwing: what the schema has
// no place for keeps its words, and a text whose tags cannot be read at all
// is read as plain markdown.
// ---------------------------------------------------------------------------

const { nodes, marks: markTypes } = noteSchema

function proseMark(mark: RunMark): Mark {
  switch (mark.type) {
    case 'bold':
      return markTypes.strong.create()
    case 'italic':
      return markTypes.em.create()
    case 'code':
      return markTypes.code.create()
    case 'strikethrough':
      return markTypes.strikethrough.create()
    case 'underline':
      return markTypes.underline.create()
    case 'highlight':
      return markTypes.highlight.create()
    case 'link':
      return markTypes.link.create({ href: mark.href })
    case 'sidenote':
      return markTypes.sidenote.create({ id: mark.id, note: mark.text })
    case 'color':
      return markTypes.text_style.create({ color: mark.color })
  }
}

/** Runs as inline nodes: words as text, each line break a break of its own. */
function inline(runs: Run[]): Node[] {
  return runs.flatMap((each) => {
    const worn = (each.marks ?? []).map(proseMark)
    return each.text
      .split(/(\n)/)
      .filter(Boolean)
      .map((part) =>
        part === BREAK ? nodes.hard_break.create(null, null, worn) : noteSchema.text(part, worn)
      )
  })
}

/** The words either side of a picture, less the space that set them apart from it. */
function trimmed(runs: Run[]): Run[] {
  const out = runs.map((each) => ({ ...each }))
  if (out[0]) out[0].text = out[0].text.replace(/^\s+/, '')
  const last = out.at(-1)
  if (last) last.text = last.text.replace(/\s+$/, '')
  return out.filter((each) => each.text)
}

/**
 * A paragraph, or the media it held with the words around them as paragraphs
 * of their own. A picture on a line by itself is the common case.
 */
function paragraphs(children: PhrasingContent[], carried: RunMark[], reading: Reading): Node[] {
  if (!children.some((child) => child.type === 'image')) {
    return [nodes.paragraph.create(null, inline(readInline(children, carried, reading)))]
  }
  const out: Node[] = []
  let words: PhrasingContent[] = []
  const flush = (): void => {
    const runs = trimmed(readInline(words, carried, reading))
    if (runs.length) out.push(nodes.paragraph.create(null, inline(runs)))
    words = []
  }
  for (const child of children) {
    if (child.type !== 'image') {
      words.push(child)
      continue
    }
    flush()
    out.push(
      nodes.media.create({ src: child.url, alt: child.alt || null, caption: child.title || null })
    )
  }
  flush()
  return out
}

/**
 * A task's own line. Its box needs something after it to be read as one, so a
 * line of nothing is written as a space; and the box opens the line, so the
 * line's style tag is written inside it.
 */
function taskLine(line: Paragraph, carried: RunMark[], reading: Reading): Node[] {
  const held = line.children.filter((child) => child.type !== 'text' || child.value.trim())
  const [only] = held
  if (held.length === 1 && only.type === 'mdxJsxTextElement' && only.name === TAG.blockStyle) {
    const style = styleOf(only)
    return paragraphs(only.children, carried, reading).map((block) => wearing(block, style))
  }
  return paragraphs(held.length ? line.children : [], carried, reading)
}

function list(node: List, carried: RunMark[], reading: Reading): Node {
  const items = node.children.map((item) => {
    const checked = typeof item.checked === 'boolean' ? item.checked : null
    const [line, ...under] = item.children
    const content =
      checked !== null && line?.type === 'paragraph'
        ? [...taskLine(line, carried, reading), ...flow(under, carried, reading)]
        : flow(item.children, carried, reading)
    // An item opens with its own line, even one that holds nothing.
    if (content[0]?.type !== nodes.paragraph) content.unshift(nodes.paragraph.create())
    return nodes.list_item.create({ checked }, content)
  })
  return node.ordered
    ? nodes.ordered_list.create({ start: Math.max(1, node.start ?? 1) }, items)
    : nodes.bullet_list.create(null, items)
}

/** A block wearing what its style tag says, where it has a place for it. */
function wearing(block: Node, style: Style): Node {
  const { size, color, align, indent } = style
  const worn =
    block.type === nodes.paragraph
      ? { size, color, align, indent }
      : block.type === nodes.heading
        ? { color, align, indent }
        : block.type === nodes.blockquote
          ? { indent }
          : null
  if (!worn) return block
  const said = Object.fromEntries(Object.entries(worn).filter(([, value]) => value !== undefined))
  return block.type.create({ ...block.attrs, ...said }, block.content, block.marks)
}

function styled(element: MdxJsxFlowElement, carried: RunMark[], reading: Reading): Node[] {
  const within = flow(element.children, carried, reading)
  // A style tag that holds nothing is a styled line that holds nothing.
  const blocks = within.length ? within : [nodes.paragraph.create()]
  return blocks.map((block) => wearing(block, styleOf(element)))
}

function flow(children: RootContent[], carried: RunMark[], reading: Reading): Node[] {
  const out: Node[] = []
  for (const node of children) {
    switch (node.type) {
      case 'paragraph':
        out.push(...paragraphs(node.children, carried, reading))
        break
      case 'heading':
        out.push(
          nodes.heading.create(
            { level: Math.min(node.depth, 4) },
            inline(readInline(node.children, carried, reading))
          )
        )
        break
      case 'blockquote': {
        const within = flow(node.children, carried, reading)
        out.push(nodes.blockquote.create(null, within.length ? within : [nodes.paragraph.create()]))
        break
      }
      case 'list':
        out.push(list(node, carried, reading))
        break
      case 'code':
        out.push(
          nodes.code_block.create(
            { language: codeLanguage(node.lang) ?? null },
            node.value ? [noteSchema.text(node.value)] : []
          )
        )
        break
      case 'thematicBreak':
        out.push(nodes.horizontal_rule.create())
        break
      // A footnote a marker points at is that marker's sidenote; any other keeps its words.
      case 'footnoteDefinition':
        if (!reading.footnotes.has(node.identifier)) {
          out.push(...flow(node.children, carried, reading))
        }
        break
      case 'mdxJsxFlowElement':
        if (node.name === TAG.blockStyle) out.push(...styled(node, carried, reading))
        // MDX reads a tag alone on its line as a block around the words in it.
        else out.push(...flow(node.children, tagMarks(node, carried, reading), reading))
        break
      default:
        if ('children' in node) out.push(...flow(node.children as RootContent[], carried, reading))
    }
  }
  return out
}

function read(tree: Root): Node {
  const content = flow(tree.children, [], startReading(tree))
  const doc = nodes.doc.create(null, content.length ? content : [nodes.paragraph.create()])
  doc.check()
  return doc
}

export function mdxToProse(text: string): Node {
  try {
    return read(parseMdx(text))
  } catch {
    // A tag that cannot be read: the text is taken as words, tags and all.
    try {
      return read(parseMarkdown(text))
    } catch {
      return nodes.doc.create(null, [
        nodes.paragraph.create(null, text ? [noteSchema.text(text)] : [])
      ])
    }
  }
}
