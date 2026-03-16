/**
 * Slash command registry for The Nerd.
 *
 * Two types of commands:
 * - "direct": Runs an API call immediately, returns structured result (no AI)
 * - "ai": Expands into a prompt that gets sent to The Nerd as a message
 */

export interface SlashCommandResult {
  /** Formatted text to display as an assistant message */
  content: string;
  /** Optional tool-result-style cards to show */
  toolResults?: Array<{ toolName: string; result: { success: boolean; data?: unknown; error?: string; link?: { href: string; label: string }; cardType?: string } }>;
}

export interface SlashCommand {
  name: string;
  description: string;
  /** How to handle: direct = run handler, ai = expand to prompt */
  type: 'direct' | 'ai';
  /** For direct commands: runs the command and returns a result */
  handler?: (args: string, userId: string) => Promise<SlashCommandResult>;
  /** For AI commands: expands the slash command + args into a prompt for The Nerd */
  expandPrompt?: (args: string) => string;
  /** Whether this command requires an @mention argument */
  requiresMention?: boolean;
  /** Example usage shown in autocomplete */
  example?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const commands: Map<string, SlashCommand> = new Map();

export function registerCommand(cmd: SlashCommand) {
  commands.set(cmd.name, cmd);
}

export function getCommand(name: string): SlashCommand | undefined {
  return commands.get(name);
}

export function getAllCommands(): SlashCommand[] {
  return Array.from(commands.values());
}

export function matchCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return getAllCommands().filter((c) => c.name.startsWith(q));
}

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------

// ── Direct commands (no AI, just API calls) ──

registerCommand({
  name: 'tasks',
  description: 'Show your tasks for today',
  type: 'direct',
  example: '/tasks',
  async handler(_args, userId) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data: teamMember } = await admin
      .from('team_members')
      .select('id')
      .eq('user_id', userId)
      .single();

    const { data: tasks } = await admin
      .from('tasks')
      .select('id, title, status, priority, due_date')
      .eq('assignee_id', teamMember?.id ?? '')
      .neq('status', 'done')
      .lte('due_date', today)
      .is('archived_at', null)
      .order('priority', { ascending: false });

    const list = (tasks ?? []).map((t) => `- **${t.title}** (${t.priority})`).join('\n');
    return {
      content: tasks?.length
        ? `**${tasks.length} tasks for today:**\n\n${list}`
        : 'No tasks due today. Enjoy the break!',
    };
  },
});

registerCommand({
  name: 'pipeline',
  description: 'Show pipeline status summary',
  type: 'direct',
  example: '/pipeline',
  async handler() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data: items } = await admin
      .from('content_pipeline')
      .select('client_name, editing_status, client_approval_status')
      .eq('month_date', currentMonth);

    const all = items ?? [];
    const total = all.length;
    const done = all.filter((i) => i.editing_status === 'done' || i.editing_status === 'scheduled').length;
    const editing = all.filter((i) => i.editing_status === 'editing').length;
    const edited = all.filter((i) => i.editing_status === 'edited').length;
    const blocked = all.filter((i) => i.editing_status === 'blocked').length;

    const lines = [
      `**Pipeline — ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}**`,
      `${done}/${total} complete`,
      editing > 0 ? `${editing} currently editing` : null,
      edited > 0 ? `${edited} edited, awaiting review` : null,
      blocked > 0 ? `${blocked} blocked` : null,
    ].filter(Boolean);

    return { content: lines.join('\n') };
  },
});

registerCommand({
  name: 'clients',
  description: 'List all active clients',
  type: 'direct',
  example: '/clients',
  async handler() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();

    const { data: clients } = await admin
      .from('clients')
      .select('name, agency')
      .eq('is_active', true)
      .order('name');

    const list = (clients ?? []).map((c) => `- ${c.name}${c.agency ? ` (${c.agency})` : ''}`).join('\n');
    return { content: `**${clients?.length ?? 0} active clients:**\n\n${list}` };
  },
});

registerCommand({
  name: 'team',
  description: 'Show team members and roles',
  type: 'direct',
  example: '/team',
  async handler() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();

    const { data: members } = await admin
      .from('team_members')
      .select('full_name, role')
      .eq('is_active', true)
      .order('full_name');

    const list = (members ?? []).map((m) => `- **${m.full_name}** — ${m.role ?? 'team member'}`).join('\n');
    return { content: `**Team (${members?.length ?? 0} members):**\n\n${list}` };
  },
});

// ── AI-powered commands (expand to prompt for The Nerd) ──

registerCommand({
  name: 'analyze',
  description: 'Run analytics review for a client',
  type: 'ai',
  requiresMention: true,
  example: '/analyze @ClientName',
  expandPrompt: (args) => `Run a full analytics review and performance breakdown for ${args || 'all clients'}. Include engagement rates, top performing content, and strategic recommendations.`,
});

registerCommand({
  name: 'hooks',
  description: 'Generate scroll-stopping hook ideas',
  type: 'ai',
  requiresMention: true,
  example: '/hooks @ClientName',
  expandPrompt: (args) => `Give me 10 scroll-stopping hooks for ${args || 'a client'}. Mix negative hooks, curiosity gaps, hot takes, and story-based openers. Make them specific to the brand.`,
});

registerCommand({
  name: 'strategy',
  description: 'Deep dive on content pillars',
  type: 'ai',
  requiresMention: true,
  example: '/strategy @ClientName',
  expandPrompt: (args) => `Do a deep content pillar analysis for ${args || 'a client'}. Review their current pillars, suggest improvements, and recommend posting frequency per pillar.`,
});

registerCommand({
  name: 'brief',
  description: 'Generate a content brief',
  type: 'ai',
  requiresMention: true,
  example: '/brief @ClientName',
  expandPrompt: (args) => `Create a detailed content brief for ${args || 'a client'} for this week. Include video topics, hooks, key talking points, and CTAs.`,
});

registerCommand({
  name: 'search',
  description: 'Research a topic',
  type: 'ai',
  example: '/search trending fitness topics',
  expandPrompt: (args) => `Research this topic and give me insights: ${args || 'trending topics'}. Look for what people are talking about, common questions, and content angles.`,
});

registerCommand({
  name: 'schedule',
  description: 'Help schedule a shoot',
  type: 'ai',
  requiresMention: true,
  example: '/schedule @ClientName next week',
  expandPrompt: (args) => `Help me schedule a shoot for ${args || 'a client'}. Check availability and suggest time slots.`,
});
