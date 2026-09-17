import { z } from 'zod'
import { MediaNodeSchema, type MediaNode } from './media-node'
import { LinkCardConfigSchema } from './link-card'

export * from './media-node'

// ---------------------------------------------------------------------------
// Marks — inline formatting annotations attached to text nodes
// ---------------------------------------------------------------------------

export const MarkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('code') }),
  z.object({ type: z.literal('underline') }),
  z.object({ type: z.literal('strikethrough') }),
  z.object({ type: z.literal('highlight') }),
  z.object({ type: z.literal('link'), href: z.url() }),
  // A margin annotation. `id` groups the run and gives it a stable anchor
  // name; `text` is the note body shown in the aside card. The visible
  // ordinal is derived from document order, not stored.
  z.object({ type: z.literal('sidenote'), id: z.string().min(1), text: z.string() })
])

export type Mark = z.infer<typeof MarkSchema>

// ---------------------------------------------------------------------------
// Inline nodes — valid inside block children arrays
// ---------------------------------------------------------------------------

export const TextNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  marks: z.array(MarkSchema).optional()
})

export type TextNode = z.infer<typeof TextNodeSchema>

export const InlineNodeSchema = TextNodeSchema
export type InlineNode = TextNode

// ---------------------------------------------------------------------------
// Block nodes — top-level document elements
// ---------------------------------------------------------------------------

// `indent` marks a block as shifted one list-level to the right (Tab in the
// editor) so its content aligns with list-item text.
export const ParagraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  children: z.array(InlineNodeSchema),
  indent: z.boolean().optional(),
  // Only "center" exists because left IS the absence of this field.
  align: z.literal('center').optional()
})

export const HeadingNodeSchema = z.object({
  type: z.literal('heading'),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6)
  ]),
  children: z.array(InlineNodeSchema),
  caption: z.string().optional(),
  indent: z.boolean().optional()
})

export const BlockquoteNodeSchema = z.object({
  type: z.literal('blockquote'),
  children: z.array(InlineNodeSchema),
  caption: z.string().optional(),
  indent: z.boolean().optional()
})

// A single ordered-list entry. Numbered lists are runs of consecutive
// `list_item` blocks; the renderer groups them and computes each ordinal.
//   • `marker`   — run style, read from the run's first item ("alpha" ⇒ a,b,c…).
//   • `continued`— on the run's first item: begin one past the previous list.
//   • `start`    — explicit ordinal for THIS item.
export const ListItemNodeSchema = z.object({
  type: z.literal('list_item'),
  children: z.array(InlineNodeSchema),
  marker: z.enum(['decimal', 'alpha']).optional(),
  continued: z.boolean().optional(),
  start: z.number().int().positive().optional()
})

// A single unordered-list entry. `marker` swaps the bullet glyph between the
// default dot, a check, or a cross (per item, so a list can mix them).
export const BulletListItemNodeSchema = z.object({
  type: z.literal('bullet_list_item'),
  children: z.array(InlineNodeSchema),
  marker: z.enum(['check', 'cross']).optional()
})

export const CodeLanguageSchema = z.enum([
  'html',
  'css',
  'json',
  'javascript',
  'jsx',
  'typescript',
  'tsx'
])

export type CodeLanguage = z.infer<typeof CodeLanguageSchema>

export const CodeBlockNodeSchema = z.object({
  type: z.literal('code_block'),
  language: CodeLanguageSchema.optional(),
  children: z.array(TextNodeSchema)
})

export const HorizontalRuleNodeSchema = z.object({
  type: z.literal('horizontal_rule')
})

// A metric callout — a large brand-gradient `value` (the children) with an
// optional eyebrow `caption` above it and a `subtext` line below.
export const MetricNodeSchema = z.object({
  type: z.literal('metric'),
  children: z.array(InlineNodeSchema),
  caption: z.string().optional(),
  subtext: z.string().optional(),
  indent: z.boolean().optional()
})

// A link card — a picture, some words and a destination, authored in the
// properties rail. In kartik.to this is a published component; here it is a
// block of its own.
export const LinkCardNodeSchema = z.object({
  type: z.literal('link_card'),
  config: LinkCardConfigSchema
})

// ---------------------------------------------------------------------------
// BlockNode union — the single source of truth for all valid block types.
// ---------------------------------------------------------------------------

export type ParagraphNode = z.infer<typeof ParagraphNodeSchema>
export type HeadingNode = z.infer<typeof HeadingNodeSchema>
export type BlockquoteNode = z.infer<typeof BlockquoteNodeSchema>
export type ListItemNode = z.infer<typeof ListItemNodeSchema>
export type BulletListItemNode = z.infer<typeof BulletListItemNodeSchema>
export type CodeBlockNode = z.infer<typeof CodeBlockNodeSchema>
export type HorizontalRuleNode = z.infer<typeof HorizontalRuleNodeSchema>
export type MetricNode = z.infer<typeof MetricNodeSchema>
export type LinkCardNode = z.infer<typeof LinkCardNodeSchema>

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BlockquoteNode
  | ListItemNode
  | BulletListItemNode
  | CodeBlockNode
  | HorizontalRuleNode
  | MediaNode
  | MetricNode
  | LinkCardNode

export const BlockNodeSchema: z.ZodType<BlockNode> = z.union([
  ParagraphNodeSchema,
  HeadingNodeSchema,
  BlockquoteNodeSchema,
  ListItemNodeSchema,
  BulletListItemNodeSchema,
  CodeBlockNodeSchema,
  HorizontalRuleNodeSchema,
  MediaNodeSchema,
  MetricNodeSchema,
  LinkCardNodeSchema
])

/** The block types whose `children` are inline text the caret can sit in. */
export type TextBlockNode = Extract<BlockNode, { children: InlineNode[] }>

export function hasInlineChildren(block: BlockNode): block is TextBlockNode {
  return 'children' in block
}
