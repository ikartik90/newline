import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  if (document.readyState === 'complete') return () => {}
  window.addEventListener('load', callback)
  return () => window.removeEventListener('load', callback)
}

function getSnapshot(): boolean {
  return document.readyState === 'complete'
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * Whether the window has fired the `load` event (all initial resources
 * fetched). `false` until then, so deferred work — decoding a poster, warming
 * a heavy component — can wait for the page itself to be done.
 */
export function usePageLoaded(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
