// ---------------------------------------------------------------------------
// The note window's glass over the whole of it, held by whatever stands on it:
// the glass palette, or a dialog in the page. Laid at once for the first, it
// is lifted once the last has gone and the page has had time to fade its note
// back in over it, or the clear window shows through meanwhile.
// ---------------------------------------------------------------------------

export interface WindowGlass {
  /** `holder` now stands on the glass, or has gone. */
  hold(holder: string, on: boolean): void
}

export function createWindowGlass(
  /** Lays the glass over the window, or lifts it. */
  lay: (on: boolean) => void,
  liftAfterMs: number
): WindowGlass {
  const holders = new Set<string>()
  let lifting: ReturnType<typeof setTimeout> | undefined
  return {
    hold(holder, on) {
      const held = holders.size > 0
      if (on) holders.add(holder)
      else holders.delete(holder)
      if (holders.size > 0) {
        if (held) return
        // Stood on again before the lift: the glass never went.
        if (lifting !== undefined) {
          clearTimeout(lifting)
          lifting = undefined
        } else lay(true)
        return
      }
      if (!held) return
      lifting = setTimeout(() => {
        lifting = undefined
        lay(false)
      }, liftAfterMs)
    }
  }
}
