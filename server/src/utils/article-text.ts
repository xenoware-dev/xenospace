import { WORDS_READ_PER_MINUTE } from '@/types/enums'

/**
 * Markdown stripped back to the prose inside it, so a word count is not
 * inflated by fences, link targets and table pipes. This is a reading-time
 * approximation, not a parser — it only has to be close.
 */
function toPlainText(markdown: string) {
  return markdown
    // Fenced code blocks are skipped whole; nobody reads them at prose speed.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // Images carry no prose; links keep their label and lose their target.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, ' ')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordCountOf(markdown: string) {
  const text = toPlainText(markdown)
  return text ? text.split(' ').length : 0
}

/** Reading time in whole minutes, never zero — "1 min read" reads better. */
export function readingMinutesOf(wordCount: number) {
  return Math.max(1, Math.round(wordCount / WORDS_READ_PER_MINUTE))
}

/**
 * The blurb on a card when the author did not write one: the opening prose,
 * cut at a word boundary so it does not end mid-syllable.
 */
export function excerptFrom(markdown: string, limit = 220) {
  const text = toPlainText(markdown)
  if (text.length <= limit) return text

  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * A URL-safe handle for a title. Accents are folded rather than dropped, so
 * "Déploiement" becomes "deploiement" instead of losing half its letters.
 */
export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** The `## Heading` lines of a body, for the table of contents beside it. */
export interface ArticleHeading {
  /** Matches the id the client gives the rendered heading, so anchors line up. */
  id: string
  text: string
  level: number
}

export function headingsOf(markdown: string): ArticleHeading[] {
  const headings: ArticleHeading[] = []
  const seen = new Map<string, number>()
  let inFence = false

  for (const line of markdown.split('\n')) {
    // A `#` inside a code fence is a comment, not a heading.
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue

    const text = match[2].replace(/[*_`]/g, '').trim()
    const base = slugify(text) || 'section'
    // Two sections with the same name must not share an anchor.
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)

    headings.push({ id: count ? `${base}-${count + 1}` : base, text, level: match[1].length })
  }

  return headings
}

/** One `[[wiki link]]` found in a body, with its optional `|display text`. */
export interface WikiLink {
  /** What was written inside the brackets: a slug, or an article's title. */
  target: string
  label: string | null
}

/**
 * The `[[wiki links]]` an article points out through. Code is stripped first —
 * a `[[` inside a fence is sample text, not a link — and the list is deduped
 * on the target, since what matters to the graph is that an edge exists, not
 * how many times the body mentions it.
 */
export function wikiLinksOf(markdown: string): WikiLink[] {
  const prose = (markdown ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')

  const links: WikiLink[] = []
  const seen = new Set<string>()

  for (const match of prose.matchAll(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g)) {
    const target = match[1].trim()
    if (!target) continue

    const key = target.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    links.push({ target, label: match[2]?.trim() || null })
  }

  return links
}
