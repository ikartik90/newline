import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { BLOCK_GRIP_GAP, BLOCK_GRIP_SIZE } from '@/components/block-grip'

// The article holds its own children to the text measure and lets a picture
// or a rule run its whole width. Under ProseMirror the note's blocks stand
// one level down, in the editor's own element, so that element says the same.
describe("the note's body under ProseMirror", () => {
  it('holds its blocks to the text measure, as the article holds its own children', () => {
    const measure = /\{\s*width: min\(100%, var\(--size-article-content\)\);\s*\}/
    expect(css).toMatch(new RegExp(`article > \\* ${measure.source}`))
    expect(css).toMatch(new RegExp(`\\[data-note-body\\] > \\* ${measure.source}`))
  })

  // Today's items stand 8px apart whichever list they are in; here one list
  // follows another as two blocks, so the second is drawn up by the difference.
  it('stands a list that follows a list half a gap under it, as items stand', () => {
    expect(css).toMatch(
      /\[data-note-body\] > :is\(ul, ol\) \+ :is\(ul, ol\) \{\s*margin-block-start: -8px;\s*\}/
    )
  })

  // A utility outranks the base layer, which is how a picture's `w-full` runs the whole width.
  it('says so in the base layer, under the utilities', () => {
    const base = css.slice(css.indexOf('@layer base {'))
    expect(base).toContain('[data-note-body] > *')
  })
})

// The grip a block is moved by stands in the margin beside it. A note that
// fills its pane has no margin but what the pane keeps clear on either side.
describe("the note's safe space", () => {
  it('holds the grip, as clear of the wall as the grip is of its block', () => {
    expect(css).toContain(`--size-toolbar-button: ${BLOCK_GRIP_SIZE}px;`)
    expect(css).toContain(
      `--size-note-inset: calc(var(--size-toolbar-button) + 2 * ${BLOCK_GRIP_GAP}px);`
    )
  })
})
