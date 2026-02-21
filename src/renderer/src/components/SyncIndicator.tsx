export type SaveState = 'idle' | 'saving' | 'syncing' | 'saved' | 'offline' | 'error'

interface SyncIndicatorProps {
  saveState: SaveState
}

export default function SyncIndicator({ saveState }: SyncIndicatorProps) {
  if (saveState === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-600">
        <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
        Saving…
      </div>
    )
  }

  if (saveState === 'syncing') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-600">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Syncing…
      </div>
    )
  }

  if (saveState === 'saved') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-600">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Saved
      </div>
    )
  }

  if (saveState === 'offline') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-500">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Offline
      </div>
    )
  }

  if (saveState === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-500">
        <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Sync failed
      </div>
    )
  }

  return null
}
