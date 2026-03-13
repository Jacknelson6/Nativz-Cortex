'use client';

interface MarkdownPreviewProps {
  content: string;
  onWikilinkClick?: (title: string) => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(content: string): string {
  const lines = content.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let inList = false;

  for (const line of lines) {
    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        html.push(
          `<pre class="bg-background rounded-lg p-3 my-2 overflow-x-auto"><code class="text-xs font-mono text-text-primary">${codeContent.join('\n')}</code></pre>`
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(escapeHtml(line));
      continue;
    }

    // Close list if needed
    if (inList && !line.match(/^\s*[-*]\s/)) {
      html.push('</ul>');
      inList = false;
    }

    // Empty line
    if (line.trim() === '') {
      html.push('<br />');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = renderInline(headingMatch[2]);
      const sizes: Record<number, string> = {
        1: 'text-lg font-bold',
        2: 'text-base font-semibold',
        3: 'text-sm font-semibold',
        4: 'text-sm font-medium',
        5: 'text-xs font-medium',
        6: 'text-xs font-medium',
      };
      html.push(
        `<h${level} class="${sizes[level]} text-text-primary mt-4 mb-1.5">${text}</h${level}>`
      );
      continue;
    }

    // List items
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        html.push('<ul class="list-disc list-inside space-y-0.5 my-1">');
        inList = true;
      }
      html.push(
        `<li class="text-sm text-text-primary">${renderInline(listMatch[1])}</li>`
      );
      continue;
    }

    // Paragraph
    html.push(
      `<p class="text-sm text-text-primary leading-relaxed my-0.5">${renderInline(line)}</p>`
    );
  }

  if (inCodeBlock && codeContent.length > 0) {
    html.push(
      `<pre class="bg-background rounded-lg p-3 my-2 overflow-x-auto"><code class="text-xs font-mono text-text-primary">${codeContent.join('\n')}</code></pre>`
    );
  }
  if (inList) {
    html.push('</ul>');
  }

  return html.join('\n');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');

  // Inline code
  result = result.replace(
    /`(.+?)`/g,
    '<code class="bg-background rounded px-1 py-0.5 text-xs font-mono text-accent-text">$1</code>'
  );

  // Links
  result = result.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent-text underline underline-offset-2 hover:opacity-80">$1</a>'
  );

  // Wikilinks
  result = result.replace(
    /\[\[(.+?)\]\]/g,
    '<span class="text-accent-text font-medium cursor-pointer wikilink-target" data-wikilink="$1">$1</span>'
  );

  return result;
}

export function MarkdownPreview({ content, onWikilinkClick }: MarkdownPreviewProps) {
  const html = renderMarkdown(content);

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wikilink-target')) {
      const title = target.getAttribute('data-wikilink');
      if (title && onWikilinkClick) {
        onWikilinkClick(title);
      }
    }
  };

  return (
    <div
      className="prose-dark px-6 py-4"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
