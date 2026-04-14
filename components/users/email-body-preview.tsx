'use client';

import React from 'react';

/**
 * XSS-safe Markdown preview. Renders the body as React elements (p/br) so admin
 * input can never inject HTML. Mirrors markdownToHtml's logic in
 * lib/email/templates/user-email.ts — double newlines become paragraphs,
 * single newlines become <br/>.
 */
export function EmailBodyPreview({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.length > 0);
  return (
    <div className="rounded-lg border border-nativz-border bg-background/40 p-6 text-base">
      {paragraphs.length === 0 ? (
        <p className="italic text-text-muted">No body yet.</p>
      ) : (
        paragraphs.map((p, i) => {
          const lines = p.split('\n');
          return (
            <p key={i} className="mb-4 leading-relaxed text-text-secondary last:mb-0">
              {lines.map((line, j) => (
                <React.Fragment key={j}>
                  {line}
                  {j < lines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </p>
          );
        })
      )}
    </div>
  );
}
