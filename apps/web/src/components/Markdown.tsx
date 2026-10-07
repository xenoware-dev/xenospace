import { useMemo } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Markdown renderer.
 *
 * Hand-written rather than a library, for one reason: it never produces raw
 * HTML. Input is escaped first and only a known set of inline and block
 * constructs is then re-introduced, so a task description cannot inject script
 * — which a `dangerouslySetInnerHTML` of library output easily can.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) and in-app links are linkified; `javascript:` is dropped. */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return null;
}

function inline(text: string): string {
  let out = escapeHtml(text);

  // Code spans first, so their contents are not treated as markup.
  const codeSpans: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Wiki links, which the knowledge base resolves by title.
  out = out.replace(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g, (_, target: string, label?: string) => {
    const text = (label ?? target).trim();
    return `<a class="xs-wikilink" data-title="${escapeHtml(target.trim())}" href="/knowledge?title=${encodeURIComponent(target.trim())}">${escapeHtml(text)}</a>`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return label;
    const external = safe.startsWith('http');
    return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${label}</a>`;
  });

  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, index: string) => `<code>${escapeHtml(codeSpans[Number(index)] ?? '')}</code>`);

  return out;
}

function render(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inFence = false;
  let fenceBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0 && listType) {
      blocks.push(`<${listType}>${listBuffer.join('')}</${listType}>`);
      listBuffer = [];
      listType = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inFence) {
        blocks.push(`<pre><code>${escapeHtml(fenceBuffer.join('\n'))}</code></pre>`);
        fenceBuffer = [];
        inFence = false;
      } else {
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuffer.push(line);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = Math.min(6, heading[1]!.length + 1);
      blocks.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    // Task list items keep their checkbox state, read-only.
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      const checked = task[1]!.toLowerCase() === 'x';
      listBuffer.push(
        `<li class="xs-task"><input type="checkbox" disabled${checked ? ' checked' : ''} /> <span${checked ? ' class="xs-done"' : ''}>${inline(task[2]!)}</span></li>`,
      );
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(`<li>${inline(bullet[1]!)}</li>`);
      continue;
    }

    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(`<li>${inline(numbered[1]!)}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushList();
      blocks.push(`<blockquote>${inline(quote[1]!)}</blockquote>`);
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushList();
      blocks.push('<hr />');
      continue;
    }

    if (line.trim() === '') {
      flushList();
      continue;
    }

    flushList();
    blocks.push(`<p>${inline(line)}</p>`);
  }

  flushList();
  if (inFence && fenceBuffer.length > 0) {
    blocks.push(`<pre><code>${escapeHtml(fenceBuffer.join('\n'))}</code></pre>`);
  }

  return blocks.join('');
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => render(content), [content]);

  return (
    <div
      className={cn('xs-prose', className)}
      // Safe by construction: `render` escapes all input and emits only the
      // tags it builds itself. See the note at the top of this file.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
