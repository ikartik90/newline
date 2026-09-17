import type { BlockNode, MediaNode } from '@shared/domain/nodes'
import type { Document } from '@shared/domain/document'
import type { ImageInsertPayload } from '@/hooks/use-image-insert'

// ---------------------------------------------------------------------------
// Block-level helpers shared by the editor and its blocks
// ---------------------------------------------------------------------------

/** Numbered and bulleted list entries share editing behaviour — only the marker differs. */
export type ListItemType = 'list_item' | 'bullet_list_item'

export function isListItemType(type: BlockNode['type']): type is ListItemType {
  return type === 'list_item' || type === 'bullet_list_item'
}

/** The blocks that hold no caret: focusable as a whole, deleted as a whole. */
export function isCaretlessBlock(block: BlockNode): boolean {
  return block.type === 'horizontal_rule' || block.type === 'media' || block.type === 'link_card'
}

/** The blocks that stand on the showcase column and carry a caption below. */
export function isShowcaseBlock(block: BlockNode): boolean {
  return block.type === 'media' || block.type === 'link_card'
}

/** True if a block carries no text content. */
export function isBlockEmpty(block: BlockNode): boolean {
  if (isCaretlessBlock(block)) return false
  return 'children' in block && block.children.every((c) => !c.text.trim())
}

/**
 * The dialog's answer, as the document records it. The payload is what the
 * media LIBRARY knows about a file; a node is that plus everything an author
 * does to it in a frame. `alt` is dropped rather than stored empty.
 */
export function mediaNodeFrom(payload: ImageInsertPayload): MediaNode {
  const shared = {
    type: 'media' as const,
    src: payload.src,
    ...(payload.alt ? { alt: payload.alt } : {}),
    // Both or neither: a node carrying one dimension is a record of something
    // that went wrong.
    ...(payload.width && payload.height ? { width: payload.width, height: payload.height } : {})
  }
  // The still belongs to ONE arm — `poster` is a field of the video arm alone.
  return payload.kind === 'video'
    ? { ...shared, kind: 'video', ...(payload.poster ? { poster: payload.poster } : {}) }
    : { ...shared, kind: 'image' }
}

export function emptyParagraphBlock(): BlockNode {
  return { type: 'paragraph', children: [{ type: 'text', text: '' }] }
}

/**
 * Ensure an editable paragraph trails certain terminal blocks so the author
 * can always continue typing after them: caret-less blocks, lists (a trailing
 * list item would trap the author in the list), and code blocks (where Enter
 * inserts a newline rather than a block).
 */
export function withTrailingParagraph(blocks: BlockNode[]): BlockNode[] {
  if (blocks.length === 0) return [emptyParagraphBlock()]
  const last = blocks[blocks.length - 1]
  if (isCaretlessBlock(last) || last.type === 'code_block' || isListItemType(last.type)) {
    return [...blocks, emptyParagraphBlock()]
  }
  return blocks
}

export function ensureBlocks(doc: Document): BlockNode[] {
  if (doc.content.length > 0) return doc.content
  return [emptyParagraphBlock()]
}

/** True when the figure is second-to-last and followed by a synthetic trailing paragraph. */
export function hasSyntheticTrailingParagraph(blocks: BlockNode[], index: number): boolean {
  const block = blocks[index]
  if (!isShowcaseBlock(block)) return false
  if (index !== blocks.length - 2) return false
  return isBlockEmpty(blocks[index + 1])
}
