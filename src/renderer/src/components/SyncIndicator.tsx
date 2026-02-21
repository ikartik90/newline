import { useState, useEffect } from 'react'

export default function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await window.api.sync.status()
        setStatus(s)
      } catch {
        /* noop if not available */
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!status) return null

  if (status.pendingCount === 0 && status.failedCount === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-600">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Saved
      </div>
    )
  }

  if (status.failedCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-500">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        {status.failedCount} failed
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-600">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      {status.pendingCount} pending
    </div>
  )
}
