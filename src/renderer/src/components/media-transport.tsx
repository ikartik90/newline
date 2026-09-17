import { useCallback, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import PlayIcon from '@/assets/icons/play.svg'
import PauseIcon from '@/assets/icons/pause.svg'

// ---------------------------------------------------------------------------
// The house transport for a clip: ONE play/pause chip in the bottom-right
// corner of the surface showing it, instead of the browser's strip across the
// foot of the picture.
//
// It takes the ELEMENT rather than rendering it, because the two are not
// always siblings — a surface that is itself a button cannot hold a second
// control, and renders the chip beside that button instead.
//
// Positioned against whatever positioned box the surface provides, marked
// `data-media-surface`: the chip stays down until the surface is hovered or
// holds focus, so a clip shown to be watched is not wearing permanent chrome.
// ---------------------------------------------------------------------------

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// The `mediaTransport` recipe: 12px into the frame's corner, over the clip,
// revealed by the surface and always up where there is no pointer to hover.
const boxStyle = cx(
  'absolute right-3 bottom-3 z-[2] opacity-0 transition-opacity duration-150',
  '[[data-media-surface]:hover_&]:opacity-100 [[data-media-surface]:focus-within_&]:opacity-100',
  '[@media(hover:none)]:opacity-100'
)

export interface MediaTransportProps {
  /**
   * The clip this works. Null until it mounts — which is why the surface holds
   * it as STATE rather than in a ref: the chip re-renders when it arrives.
   */
  clip: HTMLVideoElement | null
  className?: string
}

export function MediaTransport({ clip, className }: MediaTransportProps) {
  // The element is the "external system": the clip is started and stopped by
  // things this button never hears about — the autoplay policy, the
  // reduced-motion pause, a backgrounded tab — so the answer is READ from it
  // and re-read whenever it announces a change. (`ended` is not subscribed:
  // every clip loops.)
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!clip) return () => {}
      clip.addEventListener('play', onChange)
      clip.addEventListener('pause', onChange)
      return () => {
        clip.removeEventListener('play', onChange)
        clip.removeEventListener('pause', onChange)
      }
    },
    [clip]
  )
  const playing = useSyncExternalStore(
    subscribe,
    () => Boolean(clip) && !clip!.paused,
    () => false
  )

  // Reads its own state rather than the element's `paused`, so the press does
  // exactly what the label offered.
  const toggle = useCallback(() => {
    if (!clip) return
    if (playing) clip.pause()
    else void clip.play()?.catch(() => {})
  }, [clip, playing])

  // Nothing to work yet — or the surface handed over a photograph.
  if (!clip) return null

  const label = playing ? 'Pause video' : 'Play video'

  // The corner is held by a box of its own rather than by the button, which
  // is `position: relative` in its own right.
  return (
    <span data-media-transport="" className={cx(boxStyle, className)}>
      <Button
        variant="icon"
        // A chip on a picture, not on a surface of the app's own.
        emphasis="glass"
        // Named for what the press will DO, which is the opposite of what
        // the clip is doing.
        aria-label={label}
        onClick={toggle}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
        <Button.Tooltip>
          <Tooltip.Text>{label}</Tooltip.Text>
        </Button.Tooltip>
      </Button>
    </span>
  )
}
