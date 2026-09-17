import { useRef, useState } from 'react'
import type { MediaPropertiesPanelProps } from '@/components/media-properties-panel'
import type { PropertiesPanelHandle } from '@/components/ui/properties-panel'
import { DEFAULT_MEDIA_FIT, type MediaLayout, type MediaNode } from '@shared/domain/nodes'

// ---------------------------------------------------------------------------
// Which media object the docked inspector is addressing, and what it writes.
//
// The panel is ONE surface shared by every media object on the page, so
// "which one is open" is a question about the page rather than about any
// object, and it is answered here rather than once per surface. A standalone
// media block is a list of ONE — the same item algebra applies untouched.
// ---------------------------------------------------------------------------

/** How the media sits in its frame — the panel's top section. */
export type MediaLayoutPatch = Partial<MediaLayout>

function inRange(items: readonly MediaNode[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < items.length
}

/**
 * Patches one object's fit, inset and corner. A PATCH rather than a wholesale
 * write: the three controls commit separately and each other's value has to
 * survive. A value equal to the default DROPS its key, so a picture set to
 * `contain` and back serialises as it did before the control existed.
 */
export function setItemLayout(
  items: readonly MediaNode[],
  index: number,
  patch: MediaLayoutPatch
): MediaNode[] {
  if (!inRange(items, index)) return [...items]
  return items.map((item, i) => {
    if (i !== index) return item
    const objectFit = patch.objectFit ?? item.objectFit
    const padding = patch.padding ?? item.padding
    const borderRadius = patch.borderRadius ?? item.borderRadius
    // Rebuilt from a copy with the three keys taken off, so a default lands
    // as an ABSENT key rather than an explicit one.
    const next: MediaNode = { ...item }
    delete next.objectFit
    delete next.padding
    delete next.borderRadius
    if (objectFit && objectFit !== DEFAULT_MEDIA_FIT) next.objectFit = objectFit
    if (padding) next.padding = padding
    if (borderRadius) next.borderRadius = borderRadius
    return next
  })
}

/** Writes one object's caption; a blank one is dropped rather than stored. */
export function setItemCaption(
  items: readonly MediaNode[],
  index: number,
  caption: string | undefined
): MediaNode[] {
  if (!inRange(items, index)) return [...items]
  const trimmed = caption?.trim()
  return items.map((item, i) => {
    if (i !== index) return item
    const next: MediaNode = { ...item }
    if (trimmed) next.caption = trimmed
    else delete next.caption
    return next
  })
}

export interface MediaPropertiesController {
  /** The object whose panel is open, or -1 when none is. */
  openIndex: number
  isOpen: (index: number) => boolean
  /** Opens this object's panel — or closes it, if it is the one already open. */
  toggle: (index: number) => void
  /**
   * The panel to render, or null when nothing is open. `key` is separate from
   * `props` because React reads it off the element: the panel is remounted
   * per object, so one reopened on another picture starts from that
   * picture's values rather than the previous one's drafts.
   */
  panel: { key: string; props: MediaPropertiesPanelProps } | null
}

export function useMediaProperties(
  items: readonly MediaNode[],
  onItemsChange: (next: MediaNode[]) => void
): MediaPropertiesController {
  // Keyed on the OBJECT and not on the slot: featuring moves an image and
  // removing one slides its neighbours along, so a stored index would strand
  // the open panel on whatever took that slot. Pinning to `src` makes "the
  // panel follows its image" and "the panel closes when its image is gone"
  // fall out of a plain lookup.
  const [openSrc, setOpenSrc] = useState<string | null>(null)
  // Closing goes through the PANEL, never through this state directly.
  const panelRef = useRef<PropertiesPanelHandle>(null)

  const openIndex = openSrc ? items.findIndex((item) => item.src === openSrc) : -1
  const item = openIndex === -1 ? null : items[openIndex]

  /**
   * Opening applies NOTHING: reaching for the button is a request to SEE the
   * properties. Closing ASKS the panel rather than dropping it from the tree,
   * which would take its closing slide with it; it calls back when it has
   * finished leaving.
   */
  function toggle(index: number) {
    const target = items[index]
    if (!target) return
    if (openSrc === target.src) {
      panelRef.current?.dismiss()
      return
    }
    setOpenSrc(target.src)
  }

  return {
    openIndex,
    isOpen: (index) => index === openIndex,
    toggle,
    panel: item
      ? {
          key: item.src,
          props: {
            ref: panelRef,
            objectFit: item.objectFit,
            onObjectFitChange: (objectFit) =>
              onItemsChange(setItemLayout(items, openIndex, { objectFit })),
            padding: item.padding,
            onPaddingChange: (padding) =>
              onItemsChange(setItemLayout(items, openIndex, { padding })),
            borderRadius: item.borderRadius,
            onBorderRadiusChange: (borderRadius) =>
              onItemsChange(setItemLayout(items, openIndex, { borderRadius })),
            caption: item.caption,
            onCaptionChange: (caption) => onItemsChange(setItemCaption(items, openIndex, caption)),
            onDismiss: () => setOpenSrc(null)
          }
        }
      : null
  }
}
