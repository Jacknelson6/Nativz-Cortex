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
  description: "View your open tasks",
  type: 'direct',
  example: '/tasks',
  handler: async (_args, userId) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/todos?user_id=${userId}&status=pending`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { content: "Couldn't load your tasks right now — try the Tasks page directly." };
    }
    const data = await res.json();
    const todos = (data.todos ?? []) as Array<{ id: string; content: string; project?: { name: string } }>;
    if (todos.length === 0) {
      return { content: "You're all clear — no open tasks." };
    }
    const lines = todos.slice(0, 10).map((t) => `- ${t.content}${t.project ? ` _(${t.project.name})_` : ''}`);
    const more = todos.length > 10 ? `\n\n+ ${todos.length - 10} more at /admin/tasks` : '';
    return {
      content: `**Your open tasks (${todos.length})**\n\n${lines.join('\n')}${more}`,
    };
  },
});

registerCommand({
  name: 'pipeline',
  description: 'Show posts in the content pipeline — grouped by stage',
  type: 'direct',
  example: '/pipeline',
  handler: async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/pipeline/summary`);
    if (!res.ok) {
      return { content: "Couldn't load the pipeline right now — try /admin/edits directly." };
    }
    const data = await res.json();
    const stages = (data.stages ?? []) as Array<{ stage: string; count: number }>;
    if (stages.length === 0) {
      return { content: 'No posts in the pipeline right now.' };
    }
    const lines = stages.map((s) => `- **${s.stage}** — ${s.count}`);
    return {
      content: `**Pipeline summary**\n\n${lines.join('\n')}\n\nOpen the full board: /admin/edits`,
    };
  },
});

registerCommand({
  name: 'clients',
  description: 'List clients — with link to each workspace',
  type: 'direct',
  example: '/clients',
  handler: async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/clients`);
    if (!res.ok) {
      return { content: "Couldn't load clients right now — /admin/clients." };
    }
    const data = await res.json();
    const clients = (data.clients ?? []) as Array<{ id: string; name: string; slug: string }>;
    const lines = clients.slice(0, 25).map((c) => `- [${c.name}](/admin/clients/${c.slug})`);
    return { content: `**Clients (${clients.length})**\n\n${lines.join('\n')}` };
  },
});

registerCommand({
  name: 'team',
  description: 'Roster of your agency team',
  type: 'direct',
  example: '/team',
  handler: async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/team`);
    if (!res.ok) {
      return { content: "Couldn't load the team right now — /admin/team." };
    }
    const data = await res.json();
    const members = (data.members ?? data ?? []) as Array<{ full_name: string; role?: string }>;
    if (members.length === 0) {
      return { content: 'No team members yet — invite some from /admin/team.' };
    }
    const lines = members.map((m) => `- ${m.full_name}${m.role ? ` _(${m.role})_` : ''}`);
    return { content: `**Team (${members.length})**\n\n${lines.join('\n')}` };
  },
});

// ── AI commands (expand to a prompt and let the Nerd reason) ──

registerCommand({
  name: 'analyze',
  description: 'Analyze a specific client',
  type: 'ai',
  example: '/analyze @ClientName',
  requiresMention: true,
  expandPrompt: (args: string) => `Run a full analytics review for ${args}. Pull their top performing posts, underperforming patterns, and benchmark vs industry. Call \`get_analytics_summary\`, \`get_top_posts\`, and \`compare_client_performance\` if relevant.`,
});

registerCommand({
  name: 'hooks',
  description: 'Pull high-performing hooks for a client',
  type: 'ai',
  example: '/hooks @ClientName',
  requiresMention: true,
  expandPrompt: (args: string) => `Find ${args}'s best-performing hooks from their recent content. Use \`get_top_posts\` to find the top-engaging videos, then extract and analyze the opening hooks (first 3 seconds). Identify patterns across what works for them.`,
});

registerCommand({
  name: 'strategy',
  description: "Review a client's content strategy",
  type: 'ai',
  example: '/strategy @ClientName',
  requiresMention: true,
  expandPrompt: (args: string) => `Review ${args}'s current content strategy. Call \`get_client_strategy\` for their documented strategy, then \`get_analytics_summary\` for performance, and give me an honest assessment — what's working, what's not, and 3 concrete changes.`,
});

registerCommand({
  name: 'affiliates',
  description: 'Affiliate performance summary for a client',
  type: 'ai',
  example: '/affiliates @ClientName',
  requiresMention: true,
  expandPrompt: (args: string) => `Pull ${args}'s affiliate performance: creator counts, top earners this month, conversion patterns. Use \`get_affiliate_summary\` or \`list_creators\` + \`get_analytics_summary\` as needed.`,
});

registerCommand({
  name: 'brief',
  description: 'Draft a creative brief for a content shoot',
  type: 'ai',
  example: '/brief @ClientName',
  requiresMention: true,
  expandPrompt: (args: string) => `Draft a creative brief for an upcoming ${args} content shoot. Include brand voice, top hooks from their last 30 days, 3 video concepts, shot list ideas, and calls-to-action. Pull from \`get_client_strategy\` and \`get_top_posts\` first.`,
});

registerCommand({
  name: 'search',
  description: 'Search topic data by query',
  type: 'ai',
  example: '/search best hooks for finance',
  expandPrompt: (args: string) => `Run a knowledge-graph search for "${args}" using \`search_knowledge_base\`. Pull past research, strategies, and notes matching this topic. Summarize what I've already got, then highlight any blind spots worth researching next.`,
});

registerCommand({
  name: 'schedule',
  description: 'Check and manage schedules',
  type: 'ai',
  example: '/schedule',
  expandPrompt: (args: string) =>
    args.trim()
      ? `Look into scheduling: ${args}. Use \`get_schedule_summary\` or related calendar tools to answer.`
      : `Give me a scheduling overview — today's meetings, content going live today, and anything overdue. Call \`get_schedule_summary\`.`,
});

/**
 * /ideas + /idea: both route through the topic-plan artifact flow. The
 * Nerd MUST call create_topic_plan (not dump prose into chat). The
 * Strategy Lab system prompt already owns the tool-ordering rules —
 * these expansions just nudge the request with an explicit idea count
 * and suppress any instinct to re-write the plan inline.
 */
function buildTopicPlanPrompt(n: number): string {
  return `Build a topic plan for this client with exactly ${n} video ideas.

MANDATORY tool pipeline — do not skip any step:
  1. Call \`extract_topic_signals\` with the UUIDs of the attached topic_searches. If no topic searches are attached, skip to step 2.
  2. Call \`search_knowledge_base\` for brand voice / products / past winning hooks.
  3. Call \`create_topic_plan\` with a structured plan body containing ${n} ideas grouped into series that match the client's pillars. For ideas backed by a trending topic from step 1, set \`source\` to that \`topic_name\`. For ideas grounded only in brand DNA / knowledge base, omit \`source\` or use a brief descriptor — this is acceptable and the tool will accept mixed-grounding plans.

ABSOLUTE RULES — violating any of these is a failed turn:
- You MUST call \`create_topic_plan\`. Do not respond without it.
- You MUST NOT write the plan as prose, markdown, a numbered list, or a code block in your chat reply. Zero ideas in chat. All ideas go through the tool call.
- You MUST NOT refuse the request because attached signals look thin. Produce ${n} ideas using brand DNA + knowledge base to fill gaps. Partial grounding is fine — the tool accepts mixed-grounding plans.
- Your final chat message is ONLY a 1–3 sentence summary AFTER the tool succeeds. Reference the series counts and the strongest driver (trending topic OR brand pillar). That's it.
- If the tool call is rejected, retry with the fixes the error message specifies — do not fall back to prose.

The tool returns a downloadable PDF artifact card. That card replaces anything you would have written as an idea list.`;
}

registerCommand({
  name: 'generate',
  description: 'Branded PDF deliverable — video ideas, scripts, topics, audits',
  type: 'ai',
  example: '/generate video ideas',
  expandPrompt: (args: string) => {
    const trimmed = (args ?? '').trim();
    const match = trimmed.match(/^\s*(\d{1,3})/);
    const requestedN = match ? parseInt(match[1], 10) : 10;
    const n = Math.max(3, Math.min(50, Number.isFinite(requestedN) ? requestedN : 10));
    const typeHint = trimmed.replace(/^\d+\s*/, '').trim();
    return buildTopicPlanPrompt(n) + (typeHint ? `\n\nDeliverable type: ${typeHint}. Use this as the plan title (e.g. "${typeHint.charAt(0).toUpperCase() + typeHint.slice(1)}").` : '');
  },
});

// Legacy aliases — route to the same flow as /generate
registerCommand({
  name: 'ideas',
  description: 'Alias for /generate — topic plan PDF (default 10 ideas)',
  type: 'ai',
  example: '/ideas',
  expandPrompt: () => buildTopicPlanPrompt(10),
});

registerCommand({
  name: 'idea',
  description: 'Alias for /generate — N video ideas as a PDF',
  type: 'ai',
  example: '/idea 20',
  expandPrompt: (args: string) => {
    const trimmed = (args ?? '').trim();
    const match = trimmed.match(/^\s*(\d{1,3})/);
    const requestedN = match ? parseInt(match[1], 10) : 10;
    const n = Math.max(3, Math.min(50, Number.isFinite(requestedN) ? requestedN : 10));
    return buildTopicPlanPrompt(n);
  },
});

registerCommand({
  name: 'script',
  description: 'Turn an idea into a full spoken-word script',
  type: 'ai',
  example: '/script <paste an idea or describe it>',
  expandPrompt: (args: string) => args.trim()
    ? `Turn this idea into a full short-form video script. Ground the dialogue in the attached research + brand voice. Include: opening hook (verbatim first 3 seconds), body (spoken-word only — no stage directions, camera notes, or hashtags), CTA. Use the AGENCY SCRIPTING FRAMEWORKS in your system context for structure — pick the framework that fits the idea best (PHOS, Thesis-Turn-Takeaway, Story-Stakes-Surprise, or equivalents).

Idea: ${args}`
    : `Paste an idea after /script and I'll turn it into a spoken-word script grounded in the attached research + brand voice.`,
});

registerCommand({
  name: 'pillars',
  description: 'Review or propose the 3–5 content pillars for a client',
  type: 'ai',
  example: '/pillars @ClientName',
  requiresMention: true,
  expandPrompt: (args: string) => `Review ${args}'s content pillars — the 3-5 buckets their short-form content should fit into. Pull from \`get_client_strategy\` and \`search_knowledge_base\`. If pillars are documented, read them out and give an honest read on whether they still fit the current research. If they aren't documented, propose 3-5 based on the attached research + brand DNA.`,
});
