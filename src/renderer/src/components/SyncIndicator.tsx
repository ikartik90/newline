export type SaveState = 'idle' | 'saving' | 'syncing' | 'saved' | 'offline' | 'error'

interface SyncIndicatorProps {
  saveState: SaveState
}

// The row is one shape — a 6px dot and a caption — and only the dot's ink and
// the words change. The ink comes from the status tokens rather than Tailwind's
// stock palette: every stock hue is tuned for a dark ground and sits between
// 1.5:1 and 3.4:1 on the light canvas, where these clear 4.5:1 on both.
const ROW = 'flex items-center gap-1.5 text-style-caption'
const DOT = 'w-1.5 h-1.5 rounded-full'

export default function SyncIndicator({ saveState }: SyncIndicatorProps) {
  if (saveState === 'saving') {
    return (
      <div className={`${ROW} text-fg-body`}>
        <div className={`${DOT} bg-fg-body animate-pulse`} />
        Saving…
      </div>
    )
  }

  if (saveState === 'syncing') {
    return (
      <div className={`${ROW} text-fg-body`}>
        <div className={`${DOT} bg-info animate-pulse`} />
        Syncing…
      </div>
    )
  }

  if (saveState === 'saved') {
    return (
      <div className={`${ROW} text-fg-body`}>
        <div className={`${DOT} bg-success`} />
        Saved
      </div>
    )
  }

  if (saveState === 'offline') {
    return (
      <div className={`${ROW} text-warning`}>
        <div className={`${DOT} bg-warning`} />
        Offline
      </div>
    )
  }

  if (saveState === 'error') {
    return (
      <div className={`${ROW} text-danger`}>
        <div className={`${DOT} bg-danger`} />
        Sync failed
      </div>
    )
  }

  return null
}
