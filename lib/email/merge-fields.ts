import type { MergeContext } from './types';

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function resolveMergeFields(template: string, ctx: MergeContext): string {
  return template.replace(TOKEN_RE, (_match, token: string) => {
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
  });
}
