import type { MergeContext } from './types';

// Captures a merge token with an optional pipe-separated default:
//   {{user.first_name}}            → resolves to "" when missing
//   {{user.first_name|there}}      → resolves to "there" when missing
//   {{sender.name | Jack}}         → whitespace around the pipe is tolerated
const TOKEN_RE = /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

function lookup(ctx: MergeContext, token: string): string {
  switch (token) {
    case 'user.full_name':
      return ctx.recipient.full_name ?? '';
    case 'user.first_name': {
      const fn = ctx.recipient.full_name?.trim();
      if (!fn) return '';
      const parts = fn.split(/\s+/);
      return parts[0] ?? '';
    }
    case 'user.email':
      return ctx.recipient.email ?? '';
    case 'sender.name':
      return ctx.sender.full_name ?? '';
    case 'sender.email':
      return ctx.sender.email ?? '';
    case 'client.name':
      return ctx.client.name ?? '';
    default:
      return '';
  }
}

export function resolveMergeFields(template: string, ctx: MergeContext): string {
  return template.replace(TOKEN_RE, (_match, token: string, fallback?: string) => {
    const resolved = lookup(ctx, token);
    if (resolved) return resolved;
    return fallback ?? '';
  });
}
