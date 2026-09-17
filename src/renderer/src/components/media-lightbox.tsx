import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Media } from '@/components/media'
import { Typography } from '@/components/ui/typography'
import {
  MEDIA_PADDING_REFERENCE,
  mediaContainerWidth,
  mediaHeightBudgetFactor,
  mediaInsetPx,
  mediaPictureShare,
  mediaRadiusPx,
  type MediaNode
} from '@shared/domain/nodes'

// ---------------------------------------------------------------------------
// MediaLightbox — a media object enlarged.
//
// Takes a LIST and an index into it, so a gallery steps through its images
// and a standalone block hands in a list of one. Stepping wraps, which for a
// list of one is a no-op: there is no "only one image" branch, because the
// arithmetic already answers it.
//
// On the shared `Dialog` (portal, backdrop, focus trap, Escape), with the
// panel shell stripped back to nothing: the enlargement floats on the
// backdrop wearing its own corner, not a card's.
// ---------------------------------------------------------------------------

// The `mediaLightbox` recipe. The panel overrides are `!important` because
// they contradict the shell's own utilities for the same properties, and the
// stylesheet's order — not the className's — would otherwise decide.
const panelStyle =
  'bg-transparent! border-0! rounded-none! overflow-visible! w-auto! max-w-none! h-auto! shadow-none focus-visible:outline-none'

const figureStyle = 'flex flex-col items-center gap-2 m-0'

// Shrink-wraps the picture; `data-media-surface` marks it as the box a
// clip's transport pins to and reveals itself inside.
const frameStyle = 'relative flex min-w-0 overflow-hidden'

// BOTH auto, so the two maxima scale the image on its own aspect ratio; the
// component narrows `maxWidth` to the natural width once known.
const imageStyle =
  'block w-auto h-auto max-w-[85vw] max-h-[calc(85vh-40px)] object-contain border-[0.5px] border-solid border-divider relative z-[1]'

// Never wider than the showcase block the picture was enlarged FROM.
const captionStyle = 'max-w-[min(85vw,var(--size-article-showcase))] text-center'

/** What a media object is called where it needs a name: its alt, else its caption. */
function mediaAlt(item: MediaNode): string {
  return item.alt ?? item.caption ?? ''
}

export interface MediaLightboxProps {
  items: readonly MediaNode[]
  /** The open object, or `null` while the lightbox is dismissed. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}

export function MediaLightbox({ items, index, onIndexChange, onClose }: MediaLightboxProps) {
  // Stamped with the image it was measured from, so stepping to another one
  // discards it by derivation — a portrait never inherits a landscape's box.
  const [measured, setMeasured] = useState<{
    index: number
    width: number
    height: number
  } | null>(null)
  const intrinsic = measured?.index === index ? measured : null
  const intrinsicWidth = intrinsic?.width ?? null
  const item = index === null ? null : items[index]

  // The box the enlargement is composed in — what BOTH the corner and the
  // inset are shares of. Every other surface hands that to CSS (a query
  // container); here the frame is sized BY the picture, so the box is
  // measured back from the picture instead (`mediaContainerWidth`). The
  // picture's width owes the band nothing, so one measurement is final.
  const [picture, setPicture] = useState<HTMLElement | null>(null)
  const [framed, setFramed] = useState<{ index: number; width: number } | null>(null)
  useEffect(() => {
    // Absent in jsdom, where nothing is laid out anyway — both properties
    // then stay the authored pixels.
    if (index === null || !picture || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(([entry]) =>
      setFramed({ index, width: mediaContainerWidth(items[index], entry.contentRect.width) })
    )
    observer.observe(picture)
    return () => observer.disconnect()
  }, [index, items, picture])
  const boxWidth = framed?.index === index ? framed.width : null
  const corner = item ? mediaRadiusPx(item, boxWidth ?? MEDIA_PADDING_REFERENCE) : 0
  const inset = item ? mediaInsetPx(item, boxWidth ?? MEDIA_PADDING_REFERENCE) : 0
  const share = item ? mediaPictureShare(item) : 1
  // What the PICTURE may take of the viewport — its share of what the whole
  // composition may.
  const widthCap = share === 1 ? '85vw' : `calc(85vw * ${share})`
  // Both bands come out of the box's WIDTH, so how much of the height they
  // eat depends on the picture's shape.
  const heightFactor = item
    ? mediaHeightBudgetFactor(item, intrinsic?.height ? intrinsic.width / intrinsic.height : 1)
    : 1

  return (
    <Dialog
      open={index !== null}
      onClose={onClose}
      align="center"
      justify="center"
      aria-label={item ? mediaAlt(item) || `Image ${index! + 1}` : 'Image viewer'}
      className={panelStyle}
      onKeyDown={(event) => {
        if (index === null) return
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
        event.preventDefault()
        const step = event.key === 'ArrowRight' ? 1 : -1
        // Wraps: it's a gallery, and stopping dead at the ends would make the
        // last image feel like an error rather than the end of a loop.
        onIndexChange((index + step + items.length) % items.length)
      }}
    >
      {item && index !== null && (
        <figure className={figureStyle}>
          <div data-media-surface="" className={frameStyle}>
            <Media
              // Keyed so stepping swaps the element rather than mutating one
              // — for a clip it is what stops the next one inheriting the
              // last one's playhead.
              key={index}
              src={item.src}
              kind={item.kind}
              alt={mediaAlt(item)}
              className={imageStyle}
              poster={item.kind === 'video' ? item.poster : undefined}
              // ONE control here rather than the browser's strip, which would
              // lie across the foot of the very picture this surface shows.
              transport
              // No `layout`, uniquely among the surfaces that show this
              // object: it is expressed in SHARES of a box, and this is the
              // one surface with no such box — the frame is sized BY the
              // image. So inset and corner arrive as pixels of the measured
              // box instead, the inset as a MARGIN so the frame still fills.
              style={{
                margin: inset,
                borderRadius: corner,
                ...(intrinsicWidth ? { maxWidth: `min(${intrinsicWidth}px, ${widthCap})` } : {}),
                // Only when there is a band to make room for.
                ...(share === 1
                  ? {}
                  : {
                      ...(intrinsicWidth ? {} : { maxWidth: widthCap }),
                      maxHeight: `calc((85vh - 40px) / ${heightFactor})`
                    })
              }}
              elementRef={setPicture}
              onMeasure={(width, height) => setMeasured({ index, width, height })}
            />
          </div>
          {item.caption && (
            <Typography tag="figcaption" type="caption" className={captionStyle}>
              {item.caption}
            </Typography>
          )}
        </figure>
      )}
    </Dialog>
  )
}
