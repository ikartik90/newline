import { useState, type Ref } from 'react'
import { PropertiesPanel, type PropertiesPanelHandle } from '@/components/ui/properties-panel'
import { SegmentedControl } from '@/components/ui/input/segmented-control'
import { Slider } from '@/components/ui/input/slider'
import {
  DEFAULT_MEDIA_FIT,
  DEFAULT_MEDIA_RADIUS,
  MEDIA_PADDING_MAX,
  MEDIA_PADDING_STEP,
  MEDIA_RADIUS_MAX,
  MEDIA_RADIUS_STEP,
  type MediaFit
} from '@shared/domain/nodes'
import EditIcon from '@/assets/icons/edit.svg'

// ---------------------------------------------------------------------------
// MediaPropertiesPanel — everything about one picture that its toolbar cannot
// say, in the docked inspector.
//
// A live editor, not a form: every control commits on change, so the picture
// on the canvas is always exactly what the panel says. The parent owns the
// values and hands back new ones.
//
// A SECTION is the property. Adding one applies it, removing one takes it
// away — so there is no third state where a section is open over a property
// that isn't there.
// ---------------------------------------------------------------------------

/**
 * The two fits the control offers. `cover` first because it is the default
 * and the one most pictures want; a screenshot with its own margins is the
 * case for `contain`.
 */
const FITS: { value: MediaFit; label: string }[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' }
]

export interface MediaPropertiesPanelProps {
  /** Absent means the default fill — see `mediaObjectStyle`. */
  objectFit: MediaFit | undefined
  onObjectFitChange: (fit: MediaFit) => void
  /** Absent means no padding. */
  padding: number | undefined
  onPaddingChange: (padding: number) => void
  /** Absent means square, as it does for the inset. See `DEFAULT_MEDIA_RADIUS`. */
  borderRadius: number | undefined
  onBorderRadiusChange: (radius: number) => void
  caption: string | undefined
  /** `undefined` clears the caption — what removing the section does. */
  onCaptionChange: (caption: string | undefined) => void
  /** Fired once the panel has finished sliding out — see PropertiesPanel. */
  onDismiss: () => void
  /** Handle for closing the panel from the control that opened it. */
  ref?: Ref<PropertiesPanelHandle>
}

export function MediaPropertiesPanel({
  objectFit,
  onObjectFitChange,
  padding,
  onPaddingChange,
  borderRadius,
  onBorderRadiusChange,
  caption,
  onCaptionChange,
  onDismiss,
  ref
}: MediaPropertiesPanelProps) {
  // A draft, because what is STORED is not what is typed: the caption is
  // trimmed on the way out and an empty one is dropped entirely, so a field
  // derived from the stored value would swallow the space between two words.
  const [draft, setDraft] = useState(caption ?? '')

  return (
    <PropertiesPanel ref={ref} ariaLabel="Media properties" onDismiss={onDismiss}>
      <PropertiesPanel.Header>Media Properties</PropertiesPanel.Header>

      {/* First, and headerless: every picture has a fit and an inset whether
          or not anyone has chosen one, so there is nothing here for an
          add/remove button to mean. `enabled` is held true, so the section
          can never be closed. */}
      <PropertiesPanel.Section enabled>
        <PropertiesPanel.ControlPanel ariaLabel="Media layout">
          <PropertiesPanel.Control label="Object Fit">
            <SegmentedControl
              options={FITS}
              value={objectFit ?? DEFAULT_MEDIA_FIT}
              onValueChange={(value) => onObjectFitChange(value as MediaFit)}
            />
          </PropertiesPanel.Control>

          {/* What the picture leaves clear around itself. */}
          <PropertiesPanel.Control label="Padding">
            <Slider
              min={0}
              max={MEDIA_PADDING_MAX}
              step={MEDIA_PADDING_STEP}
              value={padding ?? 0}
              onValueChange={onPaddingChange}
            />
          </PropertiesPanel.Control>

          {/* The OBJECT's corner — no surface adds one of its own, so this
              number IS the shape on screen. */}
          <PropertiesPanel.Control label="Radius">
            <Slider
              min={0}
              max={MEDIA_RADIUS_MAX}
              step={MEDIA_RADIUS_STEP}
              value={borderRadius ?? DEFAULT_MEDIA_RADIUS}
              onValueChange={onBorderRadiusChange}
            />
          </PropertiesPanel.Control>
        </PropertiesPanel.ControlPanel>
      </PropertiesPanel.Section>

      <PropertiesPanel.Section
        defaultEnabled={caption !== undefined}
        onEnabledChange={(enabled) => {
          if (enabled) return
          setDraft('')
          onCaptionChange(undefined)
        }}
      >
        <PropertiesPanel.SectionHeader icon={<EditIcon aria-hidden />}>
          Caption
        </PropertiesPanel.SectionHeader>
        <PropertiesPanel.ControlPanel>
          <PropertiesPanel.Text
            ariaLabel="Image caption"
            placeholder="Describe this image…"
            value={draft}
            onValueChange={(value) => {
              setDraft(value)
              onCaptionChange(value.trim() || undefined)
            }}
          />
        </PropertiesPanel.ControlPanel>
      </PropertiesPanel.Section>
    </PropertiesPanel>
  )
}
