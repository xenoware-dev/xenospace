import { renderMarkdown, type MarkdownOptions } from '@/features/knowledge/lib/markdown'
import { cn } from '@/lib/utils'

interface MarkdownViewProps extends MarkdownOptions {
  markdown: string
  className?: string
}

/**
 * The rendered body of an article. The measure is capped a little under the
 * panel width — long-form prose stops being readable past roughly 80 characters
 * a line, however much room the window has.
 */
export function MarkdownView({ markdown, className, resolveWikiLink }: MarkdownViewProps) {
  return (
    <div className={cn('max-w-[72ch] text-[15px] leading-7', className)}>
      {renderMarkdown(markdown, { resolveWikiLink })}
    </div>
  )
}
