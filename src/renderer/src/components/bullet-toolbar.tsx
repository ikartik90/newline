import type { FC, SVGProps } from 'react'
import { Popover, type PopoverRect } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import ContinueBulletingIcon from '@/assets/icons/continue-bulleting.svg'
import ResetBulletingIcon from '@/assets/icons/reset-bulleting.svg'
import BulletedListIcon from '@/assets/icons/bulleted-list.svg'
import CheckedListIcon from '@/assets/icons/checked-list.svg'
import CrossedListIcon from '@/assets/icons/crossed-list.svg'

// ---------------------------------------------------------------------------
// Bullet styles — the default dot, or a per-item check / cross glyph.
// ---------------------------------------------------------------------------

export type BulletStyle = 'dot' | 'check' | 'cross'

interface BulletToolbarProps {
  /** Article-relative rect of the clicked bullet marker. */
  rect: PopoverRect
  /** The clicked item's current bullet style (drives the selected state). */
  style: BulletStyle
  onSelect: (style: BulletStyle) => void
  /** Carry the previous bulleted list's style forward onto this run. */
  onContinue: () => void
  /** Reset this run back to the default dot bullet. */
  onReset: () => void
  onDismiss: () => void
}

// The shared `toolbar` rail (40px, 6px inset, 4px gap); the Popover shell
// supplies the hairline, elevation and clip.
const railStyle = 'flex items-center gap-1 h-10 px-1.5 w-max'
// Pairs with a stylesheet that positions against the same target.
const selectionAnchor = '--selection-popover'

const OPTIONS: { style: BulletStyle; label: string; Icon: FC<SVGProps<SVGSVGElement>> }[] = [
  { style: 'dot', label: 'Bulleted list', Icon: BulletedListIcon },
  { style: 'check', label: 'Checked list', Icon: CheckedListIcon },
  { style: 'cross', label: 'Crossed list', Icon: CrossedListIcon }
]

export function BulletToolbar({
  rect,
  style,
  onSelect,
  onContinue,
  onReset,
  onDismiss
}: BulletToolbarProps) {
  return (
    <Popover
      rect={rect}
      anchorName={selectionAnchor}
      align="start"
      className={railStyle}
      // The rect was captured at the click; a scroll or resize leaves it stale.
      dismissOnReflow
      onDismiss={onDismiss}
    >
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label="List bullet options">
          <OptionList.Option aria-label="Continue bullets from previous list" onClick={onContinue}>
            <ContinueBulletingIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Option aria-label="Reset bullets to the default style" onClick={onReset}>
            <ResetBulletingIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Divider />
          {OPTIONS.map(({ style: optStyle, label, Icon }) => (
            <OptionList.Option
              key={optStyle}
              aria-label={label}
              pressed={style === optStyle}
              onClick={() => onSelect(optStyle)}
            >
              <Icon aria-hidden />
            </OptionList.Option>
          ))}
        </OptionList.Toolbar>
      </OptionList>
    </Popover>
  )
}
