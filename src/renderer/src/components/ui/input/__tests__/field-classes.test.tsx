import { render } from '@testing-library/react'
import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'
import { Field } from '../field'
import { ImageInput } from '../image-input'
import { Slider } from '../slider'

// Tailwind emits a rule only for a class its scanner reads whole out of the
// source, so a class a field builds at runtime renders with no style behind it.
// A field's focus look went missing this way.
const HERE = decodeURIComponent(new URL(import.meta.url).pathname)
const RENDERER_SRC = HERE.slice(0, HERE.indexOf('/components/ui/input/__tests__/'))

const scanned = new Set(
  new Scanner({
    sources: [
      { base: RENDERER_SRC, pattern: '**/*.tsx', negated: false },
      { base: RENDERER_SRC, pattern: '**/*.ts', negated: false }
    ]
  }).scan()
)

function unscanned(root: Element): string[] {
  const classes = [root, ...root.querySelectorAll('*')].flatMap((el) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
  )
  return [...new Set(classes)].filter((c) => !scanned.has(c))
}

describe('a field’s classes are ones Tailwind can see in the source', () => {
  it('a text field: its label, frame and control', () => {
    const { container } = render(
      <Field>
        <Field.Label>Title</Field.Label>
        <Field.Frame>
          <Field.Control placeholder="Untitled" />
        </Field.Frame>
      </Field>
    )
    expect(unscanned(container)).toEqual([])
  })

  it('an image input', () => {
    const { container } = render(
      <Field size="sm">
        <Field.Label>Image</Field.Label>
        <ImageInput noun="picture" onPick={() => {}} />
      </Field>
    )
    expect(unscanned(container)).toEqual([])
  })

  it('a slider, its ticks and its separator', () => {
    const { container } = render(
      <Field size="sm">
        <Field.Label>Width</Field.Label>
        <Slider ticks={3} defaultValue={0} />
      </Field>
    )
    expect(container.querySelector('[data-slider-tick]')).not.toBeNull()
    expect(unscanned(container)).toEqual([])
  })
})
