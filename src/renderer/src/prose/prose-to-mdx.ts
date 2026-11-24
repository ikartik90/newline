import type { BlockContent, ListItem, Paragraph, Root } from 'mdast'
import type { Mark, Node } from 'prosemirror-model'
import { TAG, writeMdx, type Style } from '@shared/mdx/dialect'
import { BREAK, run, type Run, type RunMark } from '@shared/mdx/inline'
import { dress, styleAttributes, writeInline, writeParagraph } from '@shared/mdx/writing'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// The note ProseMirror edits → MDX text, in the one style every note is
// written in: what `mdxToProse` reads, this writes back as it was.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

function runMark(mark: Mark): RunMark {
  switch (mark.type.name) {
    case 'strong':
      return { type: 'bold' }
    case 'em':
      return { type: 'italic' }
    case 'link':
      return { type: 'link', href: mark.attrs.href }
    case 'sidenote':
      return { type: 'sidenote', id: mark.attrs.id, text: mark.attrs.note }
    case 'text_style':
      return { type: 'color', color: mark.attrs.color }
    default:
      return { type: mark.type.name } as RunMark
  }
}

/** A block's inline content as runs, a break as the line break it is. */
function runsOf(block: Node): Run[] {
  const runs: Run[] = []
  block.forEach((child) => {
    runs.push(run(child.isText ? (child.text ?? '') : BREAK, child.marks.map(runMark)))
  })
  return runs
}

function styleOf(block: Node): Style {
  const { size, color, align, indent } = block.attrs
  return {
    ...(size ? { size } : {}),
    ...(color ? { color } : {}),
    ...(align ? { align } : {}),
    ...(indent ? { indent: true } : {})
  }
}

/** A paragraph that holds nothing and wears nothing. */
const isBlank = (node: Node | null): boolean =>
  !!node &&
  node.type === nodes.paragraph &&
  node.childCount === 0 &&
  !Object.keys(styleOf(node)).length

/**
 * A task's own line: its box opens it, so the line is written even where it
 * holds nothing, and its style inside it, where a tag around it would hide the box.
 */
function taskLine(line: Node): Paragraph {
  const children = writeInline(runsOf(line))
  const attributes = styleAttributes(styleOf(line))
  if (!attributes.length) return { type: 'paragraph', children }
  return {
    type: 'paragraph',
    children: [{ type: 'mdxJsxTextElement', name: TAG.blockStyle, attributes, children }]
  }
}

function item(node: Node): ListItem {
  const checked: boolean | null = node.attrs.checked
  if (checked !== null && node.firstChild) {
    const children = [taskLine(node.firstChild), ...flow(node).slice(1)]
    return { type: 'listItem', checked, spread: children.length > 1, children }
  }
  // An item that is its own empty line alone is written as the bare marker.
  const alone = node.childCount === 1 && isBlank(node.firstChild)
  const children = alone ? [] : flow(node)
  return { type: 'listItem', spread: children.length > 1, children }
}

function block(node: Node): BlockContent {
  switch (node.type) {
    case nodes.heading:
      return dress(
        { type: 'heading', depth: node.attrs.level, children: writeInline(runsOf(node), false) },
        styleOf(node)
      )
    case nodes.blockquote: {
      const alone = node.childCount === 1 && isBlank(node.firstChild)
      return dress({ type: 'blockquote', children: alone ? [] : flow(node) }, styleOf(node))
    }
    case nodes.bullet_list:
    case nodes.ordered_list: {
      const ordered = node.type === nodes.ordered_list
      const items: ListItem[] = []
      node.forEach((child) => items.push(item(child)))
      return {
        type: 'list',
        ordered,
        start: ordered ? node.attrs.start : null,
        spread: false,
        children: items
      }
    }
    case nodes.code_block:
      return { type: 'code', lang: node.attrs.language ?? null, value: node.textContent }
    case nodes.horizontal_rule:
      return { type: 'thematicBreak' }
    case nodes.media:
      return {
        type: 'paragraph',
        children: [
          {
            type: 'image',
            url: node.attrs.src,
            alt: node.attrs.alt ?? '',
            title: node.attrs.caption || null
          }
        ]
      }
    default:
      return dress(writeParagraph(runsOf(node)), styleOf(node))
  }
}

function flow(parent: Node): BlockContent[] {
  const out: BlockContent[] = []
  parent.forEach((child) => out.push(block(child)))
  return out
}

export function proseToMdx(doc: Node): string {
  const root: Root = { type: 'root', children: flow(doc) }
  return writeMdx(root)
}
