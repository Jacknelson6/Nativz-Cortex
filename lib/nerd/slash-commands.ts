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
  name: 'affiliates',
  description: 'Review affiliate performance for a client',
  type: 'ai',
  requiresMention: true,
  example: '/affiliates @ClientName',
  expandPrompt: (args) => `Review affiliate performance for ${args || 'a client'}. Use affiliate tools to summarize revenue, referrals, active affiliates, and strategic opportunities.`,
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

// ── Strategy Lab commands (research-grounded scripting workbench) ──

registerCommand({
  name: 'ideas',
  description: 'Generate research-grounded video ideas',
  type: 'ai',
  example: '/ideas',
  expandPrompt: () => `Generate 10 short-form video ideas for this client using ONLY signals from the topic searches I have attached in this chat plus the client's Brand DNA. No generic best practices — every idea must trace back to a specific trending topic, video idea, or sentiment from the attached research.

Before drafting, call search_agency_knowledge with a query like "short form video hooks" or "hook composition patterns" if you have not already loaded those frameworks in this session.

Output each idea in this exact format:

**#N — [Title]**
- **Hook**: [the exact first 3 seconds — opening words or visual beat, said verbatim the way the creator would say it]
- **Angle**: [specific trending topic or sentiment from the attached research]
- **Concept**: [one-sentence video description]
- **Why it works**: [reference the research signal AND the brand positioning]

Rules:
- Mix hook types across the 10 — negative, curiosity gap, hot take, story, pattern interrupt. Do not lean on one type.
- Specific beats generic. "My 7-year-old outsold my sales team" beats "sales tip that changed my life".
- Respect the brand voice — do NOT drift into generic social media patter.
- First three words of each hook should earn the fourth. No "Hey guys" / "So today" / "Here's the thing".
- No hashtags, no stage directions, no camera notes.`,
});

registerCommand({
  name: 'script',
  description: 'Turn an idea into a full spoken-word script',
  type: 'ai',
  example: '/script <paste an idea or describe it>',
  expandPrompt: (args) => `Write a full spoken-word script for this video idea${args?.trim() ? `:\n\n${args.trim()}` : ' (paste or describe the idea in your next message if needed)'}

Before drafting, call search_agency_knowledge with a query like "video script skill" or "short form video creative methodology" if you have not already loaded Nativz's scripting frameworks in this session.

Output rules:
- Numbered beats, one sentence per beat, written the way a person would actually say it on camera
- Start with the hook VERBATIM as beat #1 — no narrator voice, no "in this video I will"
- Include a pattern interrupt around 30-50% of the way through (new camera angle, cut to a prop, a line that contradicts what came before — call it out inline as *[pattern interrupt]*)
- End with a CTA that fits this specific brand voice. Never "follow for more". Reference a specific piece of brand value instead.
- Respect the client's Brand DNA: tone, vocabulary patterns, avoidance patterns, messaging pillars
- Ground the angle in whichever attached topic search result inspired this idea — mention which one you drew from in a trailing "Research signal:" line
- Do NOT include shot descriptions, camera directions, music cues, or hashtags unless I explicitly ask
- Target length: 25-45 seconds of spoken content (roughly 8-14 beats)`,
});

registerCommand({
  name: 'pillars',
  description: 'Draft content pillars from attached research',
  type: 'ai',
  example: '/pillars',
  expandPrompt: () => `Draft a set of 3-5 content pillars for this client, grounded in the attached topic searches and the client's Brand DNA. Do NOT fall back to generic pillar frameworks — every pillar must be traceable to either (a) trending topics surfacing in the attached research or (b) the client's own messaging pillars / positioning from the Brand DNA.

Call search_agency_knowledge for "content pillar framework" or "content strategy playbook" before drafting if you have not already loaded those in this session.

For each pillar:
- **Name** (2-3 words, punchy)
- **What** (one-sentence description of the pillar's purpose)
- **Why this pillar for this brand** (reference the research signal or brand positioning that justifies it)
- **Posting cadence** (how often per week, with reasoning)
- **Example video concept** (one idea that would live under this pillar, with a hook)

Close with a one-paragraph "How these pillars work together" summary that explains the portfolio effect.`,
});
