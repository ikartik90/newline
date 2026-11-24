import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { numberingKey } from '../numbering'
import { MOD, lines, mount, press, standInLayout, type } from './support/editor'

beforeAll(standInLayout)
afterEach(cleanup)

const TWO_LISTS = lines('1. One', '2. Two', '', 'Between', '', '1. Three', '2. Four')

const numbers = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-numbering-marker]')].map((marker) => marker.textContent!)

/** Open the numbering options from the number of the item holding these words. */
function openFrom(container: HTMLElement, words: string): HTMLElement {
  const item = [...container.querySelectorAll('li')].find((li) => li.textContent?.includes(words))!
  fireEvent.click(item.querySelector('[data-numbering-marker]')!)
  return screen.getByRole('toolbar', { name: 'List numbering options' })
}

const option = (toolbar: HTMLElement, name: RegExp): HTMLElement =>
  within(toolbar).getByRole('button', { name })

function caretAfter(view: EditorView, words: string): void {
  let at = -1
  view.state.doc.descendants((node, position) => {
    if (node.isText && node.text!.includes(words)) at = position + node.text!.length
  })
  act(() => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at))))
}

describe("a list's number", () => {
  it("is a button that opens today's numbering options, less the lettering", () => {
    const { container } = mount(TWO_LISTS)
    const marker = container.querySelector('[data-numbering-marker]')!
    expect(marker.tagName).toBe('BUTTON')
    expect(marker.getAttribute('aria-label')).toBe('List numbering options')
    expect(marker.classList).toContain('list-marker-box')
    const toolbar = openFrom(container, 'One')
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Continue numbering from previous list', 'Reset numbering at this item'])
  })

  it('puts the options away when pressed again, and moves them to another number pressed', () => {
    const { container, view } = mount(TWO_LISTS)
    const options = (): HTMLElement | null =>
      screen.queryByRole('toolbar', { name: 'List numbering options' })
    /** A press as a pointer makes it: down on the number, then the click. */
    const pressOn = (words: string): void => {
      const item = [...container.querySelectorAll('li')].find((li) =>
        li.textContent?.includes(words)
      )!
      const number = item.querySelector('[data-numbering-marker]')!
      fireEvent.pointerDown(number)
      fireEvent.click(number)
    }
    const asked = (): string | undefined => {
      const at = numberingKey.getState(view.state)?.asked
      return at == null ? undefined : view.state.doc.nodeAt(at)?.textContent
    }
    pressOn('One')
    expect(options()).not.toBeNull()
    pressOn('One')
    expect(options()).toBeNull()
    pressOn('One')
    pressOn('Two')
    expect(options()).not.toBeNull()
    expect(asked()).toBe('Two')
  })

  it('has no options on a bullet', () => {
    const { container } = mount(lines('- One', '- Two'))
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('.list-bullet')).not.toBeNull()
  })

  it('counts a list on from the one before it, and from one again when asked twice', () => {
    const { container, written } = mount(TWO_LISTS)
    fireEvent.click(option(openFrom(container, 'Four'), /^Continue/))
    expect(written()).toBe(lines('1. One', '2. Two', '', 'Between', '', '3. Three', '4. Four'))
    expect(numbers(container)).toEqual(['1.', '2.', '3.', '4.'])
    expect(screen.queryByRole('toolbar', { name: 'List numbering options' })).toBeNull()

    const toolbar = openFrom(container, 'Three')
    expect(option(toolbar, /^Continue/).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(option(toolbar, /^Continue/))
    expect(written()).toBe(TWO_LISTS)
  })

  it('shows Continue as off, and does nothing, with no numbered list before it', () => {
    const { container, onChange } = mount(TWO_LISTS)
    const toolbar = openFrom(container, 'Two')
    expect(option(toolbar, /^Continue/).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(option(toolbar, /^Continue/))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a list that counts on one past the list before it as that list grows', () => {
    const { view, container, written } = mount(TWO_LISTS)
    fireEvent.click(option(openFrom(container, 'Three'), /^Continue/))
    caretAfter(view, 'Two')
    press(view, 'Enter')
    type(view, 'More')
    expect(written()).toBe(
      lines('1. One', '2. Two', '3. More', '', 'Between', '', '4. Three', '5. Four')
    )
    // And back as it shrinks: undoing the item takes the count back with it.
    while (numbers(container).length > 4) press(view, 'z', MOD)
    expect(numbers(container)).toEqual(['1.', '2.', '3.', '4.'])
  })

  it('leaves a list alone that was set to count from one again', () => {
    const { view, container, written } = mount(TWO_LISTS)
    fireEvent.click(option(openFrom(container, 'Three'), /^Continue/))
    fireEvent.click(option(openFrom(container, 'Three'), /^Continue/))
    caretAfter(view, 'Two')
    press(view, 'Enter')
    type(view, 'More')
    expect(written()).toBe(
      lines('1. One', '2. Two', '3. More', '', 'Between', '', '1. Three', '2. Four')
    )
  })

  it('starts the count again at the item, and counts it on again when asked twice', () => {
    const { container, written } = mount(lines('1. One', '2. Two', '3. Three'))
    fireEvent.click(option(openFrom(container, 'Two'), /^Reset/))
    expect(written()).toBe(lines('1. One', '', '1) Two', '2) Three'))
    expect(numbers(container)).toEqual(['1.', '1.', '2.'])

    fireEvent.click(option(openFrom(container, 'Two'), /^Reset/))
    expect(written()).toBe(lines('1. One', '2. Two', '3. Three'))
  })

  it("starts a list's first item at one when the list starts elsewhere", () => {
    const { container, written } = mount(lines('3. Three', '4. Four'))
    fireEvent.click(option(openFrom(container, 'Three'), /^Reset/))
    expect(written()).toBe(lines('1. Three', '2. Four'))
  })

  it('takes one undo to take back', () => {
    const { view, container, written } = mount(lines('1. One', '2. Two', '3. Three'))
    fireEvent.click(option(openFrom(container, 'Two'), /^Reset/))
    press(view, 'z', MOD)
    expect(written()).toBe(lines('1. One', '2. Two', '3. Three'))
  })
})
