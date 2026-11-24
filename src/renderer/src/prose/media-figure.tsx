import { createPortal } from 'react-dom'
import { editorImgStyle, mediaBlockStyles } from '@/components/editor/styles'
import { MediaObject } from '@/components/media-object'
import type { MediaNode } from '@shared/domain/media-node'
import { mediaKind } from '@shared/mdx/reading'
import type { MediaSlot } from './media'

// ---------------------------------------------------------------------------
// One picture or clip of the note, drawn into its node's slot under its rail.
// A note keeps no layout for it, so the rail has no properties to open.
// ---------------------------------------------------------------------------

/** What the note does not say of a picture and the media library does. */
export interface MediaShape {
  width?: number
  height?: number
  poster?: string
}

const CLASSES = {
  root: mediaBlockStyles.root,
  frame: mediaBlockStyles.frame,
  image: editorImgStyle
}

interface MediaFigureProps {
  slot: MediaSlot
  shape?: MediaShape
  onReplace: () => void
  onRemove: () => void
}

function mediaItem(slot: MediaSlot, shape: MediaShape = {}): MediaNode {
  const { src, alt, caption } = slot.node.attrs
  const shared = {
    type: 'media' as const,
    src: src as string,
    ...(alt ? { alt: alt as string } : {}),
    ...(caption ? { caption: caption as string } : {}),
    ...(shape.width && shape.height ? { width: shape.width, height: shape.height } : {})
  }
  return mediaKind(src) === 'video'
    ? { ...shared, kind: 'video', ...(shape.poster ? { poster: shape.poster } : {}) }
    : { ...shared, kind: 'image' }
}

export function MediaFigure({ slot, shape, onReplace, onRemove }: MediaFigureProps) {
  return createPortal(
    <MediaObject
      item={mediaItem(slot, shape)}
      classes={CLASSES}
      label="Image"
      onReplace={onReplace}
      onRemove={onRemove}
      removeLabel="Delete image"
    />,
    slot.frame
  )
}
