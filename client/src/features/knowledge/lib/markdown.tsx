import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

/**
 * A small Markdown renderer for knowledge base articles.
 *
 * It produces React elements rather than an HTML string, so nothing an author
 * types can ever reach `dangerouslySetInnerHTML` — a wiki anyone on the team
 * can edit is exactly where stored XSS lives, and the surest way to rule it out
 * is never to have an HTML string in the first place. The cost is a smaller
 * dialect than a full parser: headings, lists, quotes, fenced code, tables,
 * rules, links, images and the usual inline marks. That is what people write.
 */

/** What a `[[target]]` points at, once the server has resolved it. */
export interface WikiLinkTarget {
  slug: string | null
  title: string | null
  exists: boolean
}

export interface MarkdownOptions {
  /**
   * Resolves a `[[target]]` to the article behind it. Left out — in the
   * editor's preview, where nothing has been saved yet — a wiki link is drawn
   * as a plain link to the slug the target would have, rather than guessing
   * at whether it exists.
   */
  resolveWikiLink?: (target: string) => WikiLinkTarget | null
}

/** Matches the server's slug rule, so a table-of-contents anchor lands. */
export function slugifyHeading(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Only schemes a reader can safely be sent to. `javascript:` and `data:` are
 * the two that turn a link into script, so anything not on this list is
 * rendered as plain text instead of becoming an anchor.
 */
function safeHref(href: string) {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  // In-app and in-page links, which have no scheme at all.
  if (/^[#/]/.test(value)) return value
  return null
}

function isExternal(href: string) {
  return /^https?:/i.test(href)
}

// Inline marks, in precedence order. Code spans come first so the contents of
// `**a**` inside backticks stay literal.
const INLINE = new RegExp(
  [
    '(`[^`\\n]+`)',
    '(\\[\\[[^\\]|\\n]+(?:\\|[^\\]\\n]+)?\\]\\])',
    '(!\\[[^\\]]*\\]\\([^)\\s]+\\))',
    '(\\[[^\\]]+\\]\\([^)\\s]+\\))',
    '(\\*\\*\\*[^*\\n]+\\*\\*\\*)',
    '(\\*\\*[^*\\n]+\\*\\*)',
    '(__[^_\\n]+__)',
    '(\\*[^*\\n]+\\*)',
    '(~~[^~\\n]+~~)',
    '(<?https?://[^\\s<>()]+>?)',
  ].join('|'),
  'g'
)

function renderInline(
  text: string,
  keyBase: string,
  options: MarkdownOptions
): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let index = 0

  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const start = match.index

    if (start > cursor) nodes.push(text.slice(cursor, start))
    cursor = start + token.length

    const key = `${keyBase}-${index}`
    index += 1

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="glass-control rounded-md px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>
      )
      continue
    }

    // A wiki link. An article that is not there yet still renders — as a
    // muted, dashed link to where it would live — because that is the cue
    // people act on when they go to fill a gap in the wiki.
    if (token.startsWith('[[')) {
      const [rawTarget, rawLabel] = token.slice(2, -2).split('|')
      const target = rawTarget.trim()
      const resolved = options.resolveWikiLink?.(target) ?? null
      const label = rawLabel?.trim() || resolved?.title || target
      const slug = resolved?.slug ?? slugifyHeading(target)
      const missing = !!options.resolveWikiLink && !resolved?.exists

      nodes.push(
        <Link
          key={key}
          to={`/knowledge-base/${slug}`}
          data-wiki-link={missing ? 'missing' : 'resolved'}
          title={missing ? `${target} — not written yet` : target}
          className={cn(
            'underline-offset-4 transition-colors duration-[var(--motion-control)]',
            missing
              ? 'text-muted-foreground/70 hover:text-muted-foreground decoration-dashed underline'
              : 'text-data decoration-data/40 hover:decoration-data underline'
          )}
        >
          {label}
        </Link>
      )
      continue
    }

    if (token.startsWith('![')) {
      const [, alt, src] = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token) ?? []
      const href = src ? safeHref(src) : null
      // An image from an unsafe scheme degrades to its alt text.
      nodes.push(
        href ? (
          <img
            key={key}
            src={href}
            alt={alt ?? ''}
            loading="lazy"
            className="glass-tile my-4 block w-full rounded-xl"
          />
        ) : (
          (alt ?? '')
        )
      )
      continue
    }

    if (token.startsWith('[')) {
      const [, label, target] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? []
      const href = target ? safeHref(target) : null
      const linkClass =
        'decoration-muted-foreground/50 hover:decoration-foreground underline underline-offset-4 transition-colors duration-[var(--motion-control)]'

      if (!href) {
        nodes.push(label ?? token)
        continue
      }

      nodes.push(
        href.startsWith('/') ? (
          <Link key={key} to={href} className={linkClass}>
            {renderInline(label ?? '', key, options)}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            {...(isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className={linkClass}
          >
            {renderInline(label ?? '', key, options)}
          </a>
        )
      )
      continue
    }

    if (token.startsWith('***')) {
      nodes.push(
        <strong key={key} className="font-semibold italic">
          {token.slice(3, -3)}
        </strong>
      )
      continue
    }
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      )
      continue
    }
    if (token.startsWith('~~')) {
      nodes.push(
        <s key={key} className="text-muted-foreground">
          {token.slice(2, -2)}
        </s>
      )
      continue
    }
    if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
      continue
    }

    // A bare URL, optionally wrapped in angle brackets.
    const bare = token.replace(/^<|>$/g, '')
    nodes.push(
      <a
        key={key}
        href={bare}
        target="_blank"
        rel="noopener noreferrer"
        className="decoration-muted-foreground/50 hover:decoration-foreground underline underline-offset-4"
      >
        {bare}
      </a>
    )
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

const HEADING_CLASSES: Record<number, string> = {
  1: 'mt-10 mb-4 scroll-mt-24 text-2xl font-semibold tracking-tight first:mt-0 md:text-3xl',
  2: 'mt-10 mb-3 scroll-mt-24 border-b border-border/60 pb-2 text-xl font-semibold tracking-tight first:mt-0 md:text-2xl',
  3: 'mt-8 mb-2 scroll-mt-24 text-lg font-semibold tracking-tight first:mt-0',
  4: 'mt-6 mb-2 scroll-mt-24 text-base font-semibold first:mt-0',
  5: 'mt-6 mb-2 scroll-mt-24 text-sm font-semibold first:mt-0',
  6: 'text-muted-foreground mt-6 mb-2 scroll-mt-24 text-sm font-semibold first:mt-0',
}

/** Splits a table row on unescaped pipes, dropping the leading and trailing one. */
function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)
}

export function renderMarkdown(markdown: string, options: MarkdownOptions = {}): ReactNode {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  // Heading anchors have to be unique, and have to agree with the ids the
  // server derived for the table of contents, so both count repeats the same way.
  const headingCounts = new Map<string, number>()
  let i = 0

  const flushParagraph = (buffer: string[], key: string) => {
    if (!buffer.length) return
    blocks.push(
      <p key={key} className="my-4 leading-7 first:mt-0">
        {renderInline(buffer.join(' '), key, options)}
      </p>
    )
    buffer.length = 0
  }

  const paragraph: string[] = []

  while (i < lines.length) {
    const line = lines[i]
    const key = `b${i}`

    // Fenced code. An unterminated fence runs to the end of the article rather
    // than swallowing the rest of it into a paragraph.
    const fence = /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/.exec(line)
    if (fence) {
      flushParagraph(paragraph, `${key}-p`)
      const marker = fence[1]
      const language = fence[2]
      const body: string[] = []
      i += 1
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker}\\s*$`).test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1

      blocks.push(
        <figure key={key} className="glass-tile my-5 overflow-hidden rounded-xl">
          {language && (
            <figcaption className="text-muted-foreground border-border/60 border-b px-4 py-1.5 font-mono text-xs">
              {language}
            </figcaption>
          )}
          <pre className="scrollbar-slim overflow-x-auto p-4 font-mono text-sm leading-6">
            <code>{body.join('\n')}</code>
          </pre>
        </figure>
      )
      continue
    }

    if (!line.trim()) {
      flushParagraph(paragraph, `${key}-p`)
      i += 1
      continue
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      flushParagraph(paragraph, `${key}-p`)
      const level = heading[1].length
      const text = heading[2].replace(/[*_`]/g, '').trim()
      const base = slugifyHeading(text) || 'section'
      const seen = headingCounts.get(base) ?? 0
      headingCounts.set(base, seen + 1)
      const id = seen ? `${base}-${seen + 1}` : base

      const Tag = `h${Math.min(level, 6)}` as 'h1'
      blocks.push(
        <Tag key={key} id={id} className={HEADING_CLASSES[level]}>
          {renderInline(text, key, options)}
        </Tag>
      )
      i += 1
      continue
    }

    if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushParagraph(paragraph, `${key}-p`)
      blocks.push(<hr key={key} className="border-border/60 my-8" />)
      i += 1
      continue
    }

    // Blockquote: consecutive `>` lines read as one quote.
    if (/^\s{0,3}>/.test(line)) {
      flushParagraph(paragraph, `${key}-p`)
      const quoted: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ''))
        i += 1
      }
      blocks.push(
        <blockquote
          key={key}
          className="border-border text-muted-foreground my-5 border-l-2 py-1 pl-4 italic"
        >
          {renderInline(quoted.join(' ').trim(), key, options)}
        </blockquote>
      )
      continue
    }

    // A table needs its header row and the divider under it to be adjacent.
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushParagraph(paragraph, `${key}-p`)
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i += 1
      }

      blocks.push(
        <div key={key} className="glass-tile scrollbar-slim my-5 overflow-x-auto rounded-xl">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border/60 border-b">
                {header.map((cell, index) => (
                  <th key={index} className="px-4 py-2.5 text-left font-semibold">
                    {renderInline(cell, `${key}-h${index}`, options)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-border/40 border-b last:border-0">
                  {header.map((_, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-2.5 align-top">
                      {renderInline(
                        row[cellIndex] ?? '',
                        `${key}-r${rowIndex}c${cellIndex}`,
                        options
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Lists. A run of bullets or numbers becomes one list; a `- [ ]` item
    // becomes a checkbox, since that is how task lists get written down.
    const bullet = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      flushParagraph(paragraph, `${key}-p`)
      const ordered = /\d/.test(bullet[2])
      const items: { text: string; checked: boolean | null }[] = []

      while (i < lines.length) {
        const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (!item || /\d/.test(item[2]) !== ordered) break

        const task = /^\[([ xX])\]\s+(.*)$/.exec(item[3])
        items.push(
          task
            ? { text: task[2], checked: task[1].toLowerCase() === 'x' }
            : { text: item[3], checked: null }
        )
        i += 1

        // A plain following line continues the item it is under.
        while (i < lines.length && lines[i].trim() && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) {
          if (/^\s{0,3}(#|>|```|~~~)/.test(lines[i])) break
          items[items.length - 1].text += ` ${lines[i].trim()}`
          i += 1
        }
      }

      const isTaskList = items.every((item) => item.checked !== null)
      const Tag = ordered ? 'ol' : 'ul'

      blocks.push(
        <Tag
          key={key}
          className={
            isTaskList
              ? 'my-4 space-y-2'
              : ordered
                ? 'my-4 list-decimal space-y-2 pl-6 marker:text-muted-foreground'
                : 'my-4 list-disc space-y-2 pl-6 marker:text-muted-foreground'
          }
        >
          {items.map((item, index) => (
            <li
              key={index}
              className={isTaskList ? 'flex items-start gap-2.5 leading-7' : 'leading-7'}
            >
              {item.checked !== null && (
                <span
                  aria-hidden
                  className={`mt-1.5 grid size-4 shrink-0 place-items-center rounded-[5px] border text-[10px] leading-none ${
                    item.checked
                      ? 'border-transparent bg-success text-success-foreground'
                      : 'border-border'
                  }`}
                >
                  {item.checked ? '✓' : ''}
                </span>
              )}
              <span className={item.checked ? 'text-muted-foreground line-through' : undefined}>
                {renderInline(item.text, `${key}-i${index}`, options)}
              </span>
            </li>
          ))}
        </Tag>
      )
      continue
    }

    paragraph.push(line.trim())
    i += 1
  }

  flushParagraph(paragraph, 'b-last')

  return blocks
}
