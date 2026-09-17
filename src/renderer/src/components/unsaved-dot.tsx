// ---------------------------------------------------------------------------
// The unsaved-work mark: a 2.5px brand dot hung off the control it belongs to.
//
// What a dot IS lives here; only WHERE it hangs is the consumer's. The brand
// hue is the focus-ring token rather than `selection`: the two are inverted
// (pink/orange against orange/pink), and the dot shares a surface with
// selection rings that already use the focus-ring one.
// ---------------------------------------------------------------------------

// Centred on whatever it is hung from; the consumer supplies the block edge.
// Sized through a variable rather than a variant because different surfaces
// want different dots (2.5px under a 28px chip, larger over an 80px tile), and a
// variable settles the cascade where a second width utility would not. 50% is a
// circle only because the box is square — `rounded-full` is the pill and means
// something else. A note, not a target: it never intercepts a press aimed at
// the control it hangs from.
const dotStyle =
  'absolute start-1/2 -translate-x-1/2 w-[var(--unsaved-dot-size,2.5px)] h-[var(--unsaved-dot-size,2.5px)] rounded-[50%] bg-focus-ring pointer-events-none'

/**
 * @param className where it hangs — the consumer's own block offset, and
 * `--unsaved-dot-size` if the default 2.5px is wrong for that surface. The
 * element it is positioned against must be `position: relative` and must not
 * clip its overflow: a clipped dot is measurable in the DOM and painted nowhere.
 */
export function UnsavedDot({ className }: { className?: string }) {
  return (
    <span className={className ? `${dotStyle} ${className}` : dotStyle} data-unsaved aria-hidden />
  )
}
