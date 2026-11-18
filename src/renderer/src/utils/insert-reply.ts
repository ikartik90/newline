import type { Document } from '@shared/domain/document'
import { markdownToDocument } from '@shared/markdown/markdown-to-document'
import { isBlockEmpty, withTrailingParagraph } from '@/components/editor/blocks'

/**
 * The note with an assistant reply added at its end. The model writes
 * Markdown, so the reply goes through the same converter old notes did and
 * arrives as real blocks rather than asterisks.
 */
export function insertReply(document: Document, markdown: string): Document {
  if (!markdown.trim()) return document
  const added = markdownToDocument(markdown).content
  const kept = [...document.content]
  while (
    kept.length > 0 &&
    kept[kept.length - 1].type === 'paragraph' &&
    isBlockEmpty(kept[kept.length - 1])
  ) {
    kept.pop()
  }
  return { ...document, content: withTrailingParagraph([...kept, ...added]) }
}
