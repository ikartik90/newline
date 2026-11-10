import { useCallback, useState, type UIEvent } from 'react'

/**
 * Whether a scrolling box has left its top. Give the box `ref` and `onScroll`.
 * The ref reads the box as it mounts, so one that opens already scrolled is
 * known at once, and forgets it when the box goes.
 */
export function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  const ref = useCallback((el: HTMLElement | null) => setScrolled((el?.scrollTop ?? 0) > 0), [])
  const onScroll = useCallback(
    (event: UIEvent<HTMLElement>) => setScrolled(event.currentTarget.scrollTop > 0),
    []
  )
  return { scrolled, ref, onScroll }
}
