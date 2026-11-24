import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'

// What a block's style tag says of where it stands, as the stylesheet draws it.
describe("a block's alignment", () => {
  it('sets a block to the centre or the right its `data-align` names, the left being its own', () => {
    expect(css).toMatch(/article \[data-align='center'\] \{\s*text-align: center;\s*\}/)
    expect(css).toMatch(/article \[data-align='right'\] \{\s*text-align: right;\s*\}/)
    expect(css).not.toContain("[data-align='left']")
  })
})
