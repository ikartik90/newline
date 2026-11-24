import type { PhrasingContent, Root, RootContent } from 'mdast'
import { parseMarkdown, parseMdx } from './dialect'
import type { Run, RunMark } from './inline'
import { readInline, startReading, tagMarks, type Reading } from './reading'

// ---------------------------------------------------------------------------
// A note's words with none of its signs: what search reads, and what Gemma is
// told the note says. A block to a line, each block's sidenotes after it.
// ---------------------------------------------------------------------------

/** A line of words, then what each sidenote on them says, once. */
function say(runs: Run[], out: string[], apart = false): void {
  const words = runs.map((each) => each.text).join('')
  if (words.trim()) out.push(apart ? words.trim() : words)
  const said = new Set<string>()
  for (const each of runs) {
    for (const mark of each.marks ?? []) {
      if (mark.type !== 'sidenote' || said.has(mark.id)) continue
      said.add(mark.id)
      if (mark.text.trim()) out.push(mark.text)
    }
  }
}

/** A paragraph's line; a picture in it says its caption, between the words either side. */
function paragraph(
  nodes: PhrasingContent[],
  marks: RunMark[],
  reading: Reading,
  out: string[]
): void {
  if (!nodes.some((node) => node.type === 'image')) {
    say(readInline(nodes, marks, reading), out)
    return
  }
  let words: PhrasingContent[] = []
  const flush = (): void => {
    say(readInline(words, marks, reading), out, true)
    words = []
  }
  for (const node of nodes) {
    if (node.type !== 'image') {
      words.push(node)
      continue
    }
    flush()
    if (node.title?.trim()) out.push(node.title)
  }
  flush()
}

function flow(nodes: RootContent[], marks: RunMark[], reading: Reading, out: string[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        paragraph(node.children, marks, reading, out)
        break
      case 'heading':
        say(readInline(node.children, marks, reading), out)
        break
      case 'code':
        if (node.value.trim()) out.push(node.value)
        break
      // A footnote a marker points at is said where its marker stands.
      case 'footnoteDefinition':
        if (!reading.footnotes.has(node.identifier)) flow(node.children, marks, reading, out)
        break
      case 'mdxJsxFlowElement':
        flow(node.children, tagMarks(node, marks, reading), reading, out)
        break
      default:
        if ('children' in node) flow(node.children as RootContent[], marks, reading, out)
    }
  }
}

function read(tree: Root): string {
  const out: string[] = []
  flow(tree.children, [], startReading(tree), out)
  return out.join('\n')
}

export function mdxPlainText(text: string): string {
  try {
    return read(parseMdx(text))
  } catch {
    // A tag that cannot be read: the text is taken as words, tags and all.
    return read(parseMarkdown(text))
  }
}
