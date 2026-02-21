import TurndownService from 'turndown'
import { marked } from 'marked'

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
})

turndown.addRule('taskList', {
  filter: (node) =>
    node.nodeName === 'LI' &&
    node.parentElement?.getAttribute('data-type') === 'taskList',
  replacement: (_content, node) => {
    const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]')
    const checked = checkbox?.hasAttribute('checked') ? 'x' : ' '
    const text = (node as HTMLElement).textContent?.trim() ?? ''
    return `- [${checked}] ${text}\n`
  }
})

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim()
}

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string
}

const TAG_PATTERN = /(?<![`\\])#([a-zA-Z][\w-]*)/g
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`]+`/g

export function extractTags(markdown: string): string[] {
  const stripped = markdown.replace(CODE_BLOCK_PATTERN, '')
  const tags = new Set<string>()

  let match: RegExpExecArray | null
  while ((match = TAG_PATTERN.exec(stripped)) !== null) {
    tags.add(match[1].toLowerCase())
  }

  return [...tags]
}

export function deriveTitle(title: string, body: string): string {
  if (title.trim()) return title.trim()
  const plain = body.replace(/^#+\s*/, '').trim()
  return plain.slice(0, 40) || 'Untitled'
}
