/**
 * Slash-command parser for the Ad Generator chat. Returns a structured
 * command descriptor or null if the input isn't a command.
 *
 * Supported:
 *   /approve <slug>          → approve one concept
 *   /approve all             → approve all pending concepts
 *   /approve all <pattern>   → approve all concepts whose template_name or slug matches pattern
 *   /reject <slug>           → reject one
 *   /reject all              → reject all pending
 *   /reject all <pattern>    → reject all matching pattern
 *   /delete <slug>           → delete one
 *   /delete rejected         → delete all rejected
 *   /delete all <pattern>    → delete all matching pattern
 *   /regen <slug>            → re-render image for one concept
 *   /list                    → no-op: returns the current status breakdown
 *   /help                    → returns the supported commands
 */

export type AdChatCommand =
  | { kind: 'approve'; target: CommandTarget }
  | { kind: 'reject'; target: CommandTarget }
  | { kind: 'delete'; target: DeleteTarget }
  | { kind: 'regen'; slug: string }
  | { kind: 'list' }
  | { kind: 'help' };

export type CommandTarget =
  | { scope: 'slug'; slug: string }
  | { scope: 'all'; pattern: string | null };

export type DeleteTarget =
  | { scope: 'slug'; slug: string }
  | { scope: 'rejected' }
  | { scope: 'all'; pattern: string | null };

export function parseChatCommand(input: string): AdChatCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const [rawCmd, ...rest] = trimmed.slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const args = rest.join(' ').trim();

  if (cmd === 'help') return { kind: 'help' };
  if (cmd === 'list') return { kind: 'list' };

  if (cmd === 'approve' || cmd === 'reject') {
    if (!args) return null;
    if (args.startsWith('all')) {
      const pattern = args.slice(3).trim() || null;
      return { kind: cmd, target: { scope: 'all', pattern } };
    }
    return { kind: cmd, target: { scope: 'slug', slug: args } };
  }

  if (cmd === 'delete') {
    if (!args) return null;
    if (args === 'rejected') return { kind: 'delete', target: { scope: 'rejected' } };
    if (args.startsWith('all')) {
      const pattern = args.slice(3).trim() || null;
      return { kind: 'delete', target: { scope: 'all', pattern } };
    }
    return { kind: 'delete', target: { scope: 'slug', slug: args } };
  }

  if (cmd === 'regen') {
    if (!args) return null;
    return { kind: 'regen', slug: args };
  }

  return null;
}

export const CHAT_COMMAND_HELP = `Available commands:
  /approve <slug>            Approve one concept (e.g. /approve concept-003)
  /approve all [pattern]     Approve all pending (optionally filtered by template or slug pattern)
  /reject <slug>             Reject one
  /reject all [pattern]      Reject all pending (optional filter)
  /delete <slug>             Delete one
  /delete rejected           Delete every rejected concept
  /delete all [pattern]      Delete all matching a template/slug pattern
  /regen <slug>              Re-render the image for a concept
  /list                      Show the current status breakdown
  /help                      Show this list`;
