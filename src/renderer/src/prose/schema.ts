import {
  Schema,
  type DOMOutputSpec,
  type MarkSpec,
  type Node,
  type NodeSpec
} from 'prosemirror-model'
import { sidenoteAnchorName } from '@/utils/sidenotes'

// ---------------------------------------------------------------------------
// The note as ProseMirror holds it: the blocks and marks of the MDX dialect,
// one to one. A block's style tag is the block's own attributes; there is no
// eyebrow, metric or caption, only paragraphs and headings that are styled.
// ---------------------------------------------------------------------------

/** What `<BlockStyle>` says of a block, as the block's attributes. */
const STYLE = {
  color: { default: null },
  align: { default: null },
  indent: { default: false }
}

// Every class whole, for Tailwind to find.

/** The ink of each colour a note's text can be given by name. */
const INK: Record<string, string> = {
  highlight: 'text-ink-style-highlight',
  muted: 'text-ink-style-muted',
  danger: 'text-ink-style-danger',
  warning: 'text-ink-style-warning',
  success: 'text-ink-style-success'
}

const PARAGRAPH: Record<string, string> = {
  sm: 'text-style-paragraph-sm',
  md: 'text-style-paragraph-md',
  lg: 'text-style-paragraph-lg'
}

const HEADING: Record<number, string> = {
  1: 'text-style-heading-1',
  2: 'text-style-heading-2',
  3: 'text-style-heading-3',
  4: 'text-style-heading-4'
}

/**
 * A block's element: its text style, the ink of its colour or its own where
 * it is given none, and its centring and indent as `main.css` reads them.
 */
function styled(node: Node, textStyle: string, ink: string): Record<string, string> {
  const { color, align, indent } = node.attrs
  return {
    class: `${textStyle} ${INK[color] ?? ink}`,
    ...(color ? { 'data-color': color } : {}),
    ...(align ? { 'data-align': align } : {}),
    ...(indent ? { 'data-indented': '' } : {})
  }
}

/** Whether a copied item is a task, ours or one a page draws with a checkbox of its own. */
function checkedOf(item: HTMLElement): boolean | null {
  const said = item.getAttribute('data-checked')
  if (said !== null) return said === 'true'
  const box = [...item.children]
    .flatMap((child) => (child.tagName === 'P' ? [child, ...child.children] : [child]))
    .find((child): child is HTMLInputElement => child.matches('input[type=checkbox]'))
  return box ? box.checked : null
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: { size: { default: null }, ...STYLE },
    parseDOM: [{ tag: 'p' }],
    toDOM: (node): DOMOutputSpec => [
      'p',
      styled(node, PARAGRAPH[node.attrs.size ?? 'md'], 'text-ink-paragraph'),
      0
    ]
  },

  heading: {
    group: 'block',
    content: 'inline*',
    defining: true,
    attrs: { level: { default: 2 }, ...STYLE },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level: Math.min(level, 4) }
    })),
    toDOM: (node): DOMOutputSpec => [
      `h${node.attrs.level}`,
      styled(node, HEADING[node.attrs.level], 'text-ink-body'),
      0
    ]
  },

  blockquote: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { indent: { default: false } },
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: (node): DOMOutputSpec => [
      'blockquote',
      {
        class:
          'flex flex-col gap-4 border-l-2 border-border-quote pl-3 data-indented:ml-8 [&_p:not([data-color])]:text-ink-body',
        ...(node.attrs.indent ? { 'data-indented': '' } : {})
      },
      0
    ]
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    parseDOM: [{ tag: 'ul' }],
    toDOM: (): DOMOutputSpec => ['ul', { class: 'flex flex-col gap-2' }, 0]
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { start: { default: 1 } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({ start: Number((dom as HTMLElement).getAttribute('start') ?? 1) || 1 })
      }
    ],
    toDOM: (node): DOMOutputSpec => [
      'ol',
      {
        class: 'flex flex-col gap-2',
        ...(node.attrs.start === 1 ? {} : { start: String(node.attrs.start) })
      },
      0
    ]
  },

  // An item is its own line, then whatever stands under it. In the editor an
  // item draws its own marker beside them (`list-markers.ts`). A task is an
  // item that is open or done: `checked` is null for an item that is neither.
  list_item: {
    content: 'paragraph block*',
    defining: true,
    attrs: { checked: { default: null } },
    parseDOM: [{ tag: 'li', getAttrs: (dom) => ({ checked: checkedOf(dom as HTMLElement) }) }],
    toDOM: (node): DOMOutputSpec => [
      'li',
      {
        class: 'flex flex-col gap-2',
        ...(node.attrs.checked === null ? {} : { 'data-checked': String(node.attrs.checked) })
      },
      0
    ]
  },

  code_block: {
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    attrs: { language: { default: null } },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM: (node): DOMOutputSpec => [
      'pre',
      {
        class:
          'text-style-code bg-bg-sheet rounded-md p-8 overflow-x-auto text-ink-body whitespace-pre',
        ...(node.attrs.language ? { 'data-language': node.attrs.language } : {})
      },
      ['code', 0]
    ]
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: (): DOMOutputSpec => [
      'div',
      { class: 'py-8' },
      ['hr', { class: 'border-none h-px bg-border-divider my-0' }]
    ]
  },

  // A picture or a clip, bare: its address, its alt and the caption under it.
  media: {
    group: 'block',
    atom: true,
    draggable: true,
    attrs: { src: { default: '' }, alt: { default: null }, caption: { default: null } },
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => ({
          src: (dom as HTMLElement).getAttribute('src') ?? '',
          alt: (dom as HTMLElement).getAttribute('alt') || null,
          caption: (dom as HTMLElement).getAttribute('title') || null
        })
      }
    ],
    toDOM: (node): DOMOutputSpec => [
      'figure',
      { class: 'w-full flex flex-col gap-2 items-center' },
      ['img', { src: node.attrs.src, alt: node.attrs.alt ?? '' }],
      ...(node.attrs.caption
        ? [
            [
              'figcaption',
              { class: 'text-style-caption text-ink-body' },
              node.attrs.caption
            ] as const
          ]
        : [])
    ]
  },

  text: { group: 'inline' },

  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: (): DOMOutputSpec => ['br']
  }
}

// Outermost first, the order the MDX nests them in.
const marks: Record<string, MarkSpec> = {
  // A margin note on a run of text: `id` keeps two notes that touch apart.
  sidenote: {
    attrs: { id: {}, note: { default: '' } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'span[data-sidenote-id]',
        getAttrs: (dom) => ({
          id: (dom as HTMLElement).getAttribute('data-sidenote-id'),
          note: (dom as HTMLElement).getAttribute('data-note') ?? ''
        })
      }
    ],
    toDOM: (mark): DOMOutputSpec => [
      'span',
      {
        class: 'article-sidenote',
        'data-sidenote-id': mark.attrs.id,
        'data-note': mark.attrs.note,
        // What its card beside the prose is placed against.
        style: `anchor-name: ${sidenoteAnchorName(mark.attrs.id)}`
      },
      // The dotted underline is the words' own, so the number stands clear of it.
      ['span', { class: 'article-sidenote-text' }, 0]
    ]
  },

  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [
      { tag: 'a[href]', getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href') }) }
    ],
    toDOM: (mark): DOMOutputSpec => ['a', { class: 'article-link', href: mark.attrs.href }, 0]
  },

  /** `<TextStyle>`: a run's colour, by the name of its role. */
  text_style: {
    attrs: { color: {} },
    parseDOM: [
      {
        tag: 'span[data-color]',
        getAttrs: (dom) => ({ color: (dom as HTMLElement).getAttribute('data-color') })
      }
    ],
    toDOM: (mark): DOMOutputSpec => [
      'span',
      { class: INK[mark.attrs.color] ?? '', 'data-color': mark.attrs.color },
      0
    ]
  },

  highlight: {
    parseDOM: [{ tag: 'mark' }],
    toDOM: (): DOMOutputSpec => ['mark', { class: 'article-highlight' }, 0]
  },
  underline: {
    parseDOM: [{ tag: 'u' }],
    toDOM: (): DOMOutputSpec => ['u', { class: 'article-underline' }, 0]
  },
  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }],
    toDOM: (): DOMOutputSpec => ['s', { class: 'article-strikethrough' }, 0]
  },
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: (): DOMOutputSpec => ['strong', 0]
  },
  em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: (): DOMOutputSpec => ['em', 0] },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: (): DOMOutputSpec => ['code', { class: 'inline-code' }, 0]
  }
}

export const noteSchema = new Schema({ nodes, marks })
