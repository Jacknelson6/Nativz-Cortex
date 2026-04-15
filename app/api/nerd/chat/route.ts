import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';
import { registerAllTools } from '@/lib/nerd/tools';
import { getAllTools, getTool, getToolsForAPI } from '@/lib/nerd/registry';
import type { ToolResult } from '@/lib/nerd/types';
import { toOpenAiChatModelId } from '@/lib/ai/openai-model-id';
import {
  getNerdModelFromDb,
  resolveOpenAiApiKeyForFeature,
  resolveOpenRouterApiKeyForFeature,
} from '@/lib/ai/provider-keys';
import { buildMarketingSkillsContext } from '@/lib/nerd/marketing-skills';
import { checkGuardrails } from '@/lib/nerd/guardrails';
import { buildDbSkillsContext } from '@/lib/nerd/skills-loader';
import { buildStrategyLabSystemAddendum } from '@/lib/nerd/strategy-lab-scripting-context';
import { logUsage, calculateCost } from '@/lib/ai/usage';
import { logApiError } from '@/lib/api/error-log';
import { getBrandFromRequest } from '@/lib/agency/brand-from-request';

// Register tools on module load
registerAllTools();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const mentionSchema = z.object({
  type: z.enum(['client', 'team_member']),
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});

const attachmentSchema = z.object({
  /** Content type — pdf_text for extracted PDF content, image for base64, text for plain text files */
  type: z.enum(['pdf_text', 'image', 'text']),
  /** Original filename */
  name: z.string().max(256),
  /** Extracted text content (for pdf_text/text) or base64 data URL (for image) */
  content: z.string().max(500_000),
});

const chatSchema = z.object({
  messages: z
    .array(z.object({
      role: z.enum(['user', 'assistant', 'tool']),
      content: z.string(),
      tool_call_id: z.string().optional(),
    }))
    .min(1),
  /** Parsed @mentions from the latest user message */
  mentions: z.array(mentionSchema).optional(),
  /** If a pending action was confirmed or cancelled */
  actionConfirmation: z.object({
    toolName: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    confirmed: z.boolean(),
  }).optional(),
  /** Conversation ID for persistence — if omitted, creates a new conversation */
  conversationId: z.string().uuid().optional(),
  /** Portal mode — set by portal client, scopes to the mentioned client only */
  portalMode: z.boolean().optional(),
  /** Optional frontend context for first message (e.g. opened from Strategy Lab) */
  sessionHint: z.string().max(500).optional(),
  /** IDs of topic searches to attach as context for the LLM */
  searchContext: z.array(z.string().uuid()).max(5).optional(),
  /**
   * Explicit Nerd surface mode. When 'strategy-lab', the chat route appends
   * the Strategy Lab scripting addendum (behavioural rules + preloaded
   * scripting skills from nerd_skills) to the base system prompt. Used by
   * components/strategy-lab/strategy-lab-nerd-chat.tsx.
   */
  mode: z.enum(['strategy-lab']).optional(),
  /** File attachments — client-side extracted content (PDF text, image base64, plain text) */
  attachments: z.array(attachmentSchema).max(10).optional(),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Admin-mode system prompt. Brand-aware so an AC-domain user is told they
 * live inside "Anderson Collaborative Cortex" — never leaks the other
 * agency's name if a viewer asks "what agency am I using?".
 */
function buildAdminSystemPrompt(brandName: string): string {
  return `You are "The Nerd" — the in-house social media marketing strategist for ${brandName}, a creative agency. You live inside ${brandName} Cortex, the agency's internal platform.

You are THE expert on:
- Social media marketing strategy (Instagram, TikTok, YouTube, Facebook)
- Short-form video content (hooks, pacing, trends, virality)
- Content pillar frameworks and editorial calendars
- Platform-specific best practices and algorithm behavior
- Audience growth, engagement optimization, and paid media amplification
- Brand voice development and content positioning

You have full access to every client in the ${brandName} portfolio and can take actions on their behalf using tools.

Each client has a **knowledge vault** — an Obsidian-style knowledge base with structured entries (brand profiles, web pages, meeting notes, documents, ideas). The vault is semantically indexed — use **search_knowledge_base** with a natural language query to find the most relevant entries. Do NOT try to load all entries at once; always search first, then drill deeper if needed. You can also save useful information using create_knowledge_note, and import meeting transcripts using import_meeting_notes.

KNOWLEDGE SEARCH PATTERN (QMD):
1. **Query** — use search_knowledge_base with a descriptive query to find relevant context
2. **Match** — review the returned entries and identify the most relevant ones
3. **Decide** — answer using the matched context, or search again with a refined query if needed
Never load all knowledge entries into your response. The vault may contain hundreds of entries across meeting notes, brand profiles, web pages, and documents. Semantic search will find what you need.

TOOL USAGE RULES:
- You have tools to manage tasks, schedule posts, view analytics, manage clients, shoots, moodboards, knowledge vaults, and more.
- Use tools proactively when the user's request implies an action (e.g., "create a task" → use create_task tool).
- When referring to clients or team members, users use @mentions. The system resolves these to IDs for you.
- For READ tools (listing, viewing): execute immediately and summarize results naturally.
- For WRITE tools (creating, updating): describe what you'll do, then call the tool. The frontend will show a confirmation card.
- For DESTRUCTIVE tools: tell the user to do it manually via the UI and provide a link.
- After a tool call completes, summarize the result in natural language. Don't just dump JSON.
- If a tool fails, explain the error clearly and suggest alternatives.
- You can call multiple tools in sequence if the user's request requires it.
- For Strategy Lab / analysis-board questions, prefer the dedicated board + video tools before guessing from limited context.

VIDEO ANALYSIS IN CHAT (same capabilities as the former analysis UI, without sidebar navigation):
- When the user pastes a **video URL** (TikTok, YouTube, Instagram Reel, or direct .mp4/.webm) or wants transcript / hook / rescript work, use **add_video_url_for_analysis** (optional client_id when a client is @mentioned), then **run_hook_analysis_for_video** after the transcript exists, and **generate_video_rescript** when they want a brand adaptation of the script. Use **transcribe_analysis_item** only to retry or refresh transcription.
- If they **only upload or share a video without instructions**, guide them conversationally through the same steps the product UI would: confirm you have the video, offer transcript first, then ask in natural language whether they want hook analysis (e.g. "Want me to break down the hook and score it?" not button labels like "Generate hooks").
- Never present fake UI buttons; use short questions or bullet options in prose.
- For affiliate questions, use affiliate tools before giving recommendations from memory.

BEHAVIOR RULES:
- Be direct, opinionated, and actionable. You're a senior strategist, not a generic chatbot.
- Lead with the insight, not the preamble. Skip "Great question!" / "Absolutely!" / "Here's what I think" — jump straight to the answer.
- Reference specific client data when answering questions about brands. ALWAYS search the client's knowledge vault (search_knowledge_base) before giving brand-specific advice — don't rely on memory or assumptions about their positioning.
- Use markdown formatting: headers, bullets, bold for emphasis. Keep it scannable.
- When you don't have data for something, say so — don't fabricate metrics.
- If analytics data is provided, analyze it with strategic insight, not just number recitation. Lead with the "so what" — what should change based on these numbers.
- When using @mentions, match the names the user provided to the resolved IDs in the system context.
- Be specific. "Post more Reels" is useless. "Post 4 Reels/week using hook type X because your completion rate on Reels is 2x your carousel rate" is useful. Ground recommendations in data or the client's vault.
- Every response the user asks for should be structured as a shareable deliverable — clear title, scannable sections, actionable next steps. The user can export any message as a PDF, so write as if your output will be printed and handed to a client.
- End outputs with the final deliverable. Never append closing offers like "I can also create..." or "If you want, I can..." — deliver the complete request without upselling additional work.
- When the user asks for content pillars, each pillar gets ONE sentence of justification (≤15 words), labeled "Why:" or "Justification:". No multi-paragraph explanations.
- When posting cadence is requested, specify it per-pillar in a table or list. Don't bury cadence in aggregate weekly totals.
- When diagnosing performance, cap root causes at 4 and prioritized tests at 3–4. Follow the diagnosis with a one-sentence severity assessment (e.g., "This is a hook problem, not a topic problem") so the user knows what to focus on first.

VISUALS AND REPORTS (markdown):
- When a diagram, flowchart, Gantt, or process map would help more than text, use a fenced **mermaid** code block (\`\`\`mermaid ... \`\`\`).
- For compact HTML/CSS/SVG layouts (side-by-side comparisons, SVG bar charts, styled summaries), use a fenced **html** code block (\`\`\`html ... \`\`\`). Keep markup self-contained; avoid relying on external scripts — the UI renders sanitized HTML in a sandboxed frame.
- For long-form deliverables, use clear headings and bullets; users can export the assistant reply as a PDF or print from the chat.
- Prefer visuals over walls of text. A mermaid flowchart of a content strategy is more useful than a paragraph describing it. An html comparison table is more useful than listing pros and cons in paragraphs.

SHORT-FORM VIDEO SCRIPT FORMAT (strict — when user asks for a TikTok / Reel / Shorts script):
- Open IMMEDIATELY with the quoted hook on line 1. No preamble, no style notes, no metadata before the hook.
- Format the body as numbered beats: \`1.\`, \`2.\`, \`3.\`, etc. Exactly ONE sentence per beat. Never use prose paragraphs for beat-by-beat scripts.
- Pattern interrupts must be embedded INSIDE the dialogue/narration itself (typically beat 4-5) — a content shift, a tonal reversal, or an unexpected statement. Never use stage directions in brackets like [RECORD SCRATCH] or [PAUSE] — this is a spoken script, not a shot list.
- Each numbered beat MUST be exactly ONE complete sentence. If a beat is combining multiple ideas, split it or pick the strongest.
- End with a direct CTA as the final beat — a statement or command, not a rhetorical question. For Gen Z / skeptical audiences, make it ironic or self-aware. Examples: "Sleep is the real flex." / "Choose your actual recovery arc." Avoid "Follow for more" / "Want X or Y?"
- End the script cleanly after the CTA. Never append meta-commentary like "I can also make..." or "Let me know if you want..." unless the user explicitly asks.

AGENCY KNOWLEDGE GRAPH:
You have access to the agency knowledge graph — 9,857 nodes covering SOPs, skills, patterns, methodology, meeting notes, client profiles, and more. When asked about processes, best practices, or "how do we do X", ALWAYS search the knowledge graph first using search_agency_knowledge before answering from your own knowledge. The graph contains ${brandName}'s actual documented procedures.
- Use search_agency_knowledge to find relevant nodes by semantic search
- Use get_knowledge_node to read the full content of a specific node
- Use list_knowledge_by_kind to browse all nodes of a type (e.g. all SOPs, all skills)
- Use create_agency_knowledge_note to save new knowledge from conversations`;
}

/** Portal-specific system prompt — scoped to a single client */
function buildPortalSystemPrompt(clientName: string, brandName: string): string {
  return `You are "The Nerd" — a social media marketing strategist working with ${clientName}. You live inside ${brandName} Cortex, the agency's client portal.

You are THE expert on:
- Social media marketing strategy (Instagram, TikTok, YouTube, Facebook)
- Short-form video content (hooks, pacing, trends, virality)
- Content pillar frameworks and editorial calendars
- Platform-specific best practices and algorithm behavior
- Audience growth, engagement optimization, and paid media amplification
- Brand voice development and content positioning

You are helping ${clientName} with their social media strategy. You have access to their knowledge vault and brand data.

Each client has a **knowledge vault** — an Obsidian-style knowledge base with structured entries (brand profiles, web pages, meeting notes, documents, ideas). The vault is semantically indexed — use **search_knowledge_base** with a natural language query to find the most relevant entries. Do NOT try to load all entries at once; always search first, then drill deeper if needed.

KNOWLEDGE SEARCH PATTERN (QMD):
1. **Query** — use search_knowledge_base with a descriptive query to find relevant context
2. **Match** — review the returned entries and identify the most relevant ones
3. **Decide** — answer using the matched context, or search again with a refined query if needed
Never load all knowledge entries into your response. The vault may contain hundreds of entries. Semantic search will find what you need.

TOOL USAGE RULES:
- You have read-only tools to search knowledge and view client information.
- Use tools proactively when the user's request implies a lookup (e.g., "what's our brand voice" → use search_knowledge_base).
- For READ tools (listing, viewing): execute immediately and summarize results naturally.
- After a tool call completes, summarize the result in natural language. Don't just dump JSON.
- If a tool fails, explain the error clearly and suggest alternatives.

BEHAVIOR RULES:
- Be direct, opinionated, and actionable. You're a senior strategist, not a generic chatbot.
- Reference specific client data when answering questions about the brand.
- Use markdown formatting: headers, bullets, bold for emphasis. Keep it scannable.
- When you don't have data for something, say so — don't fabricate metrics.
- If analytics data is provided, analyze it with strategic insight, not just number recitation.`;
}

/**
 * Tools that portal (viewer) users are allowed to use.
 *
 * ⚠️ Adding a tool here WITHOUT adding a caller-org check inside its
 * handler is a cross-org data leak. The admin Supabase client bypasses
 * RLS, so every handler that accepts a client_id / entry_id / search_id
 * from the caller must look up the caller's organization_id and reject
 * when the resource belongs to another org.
 *
 * Current gates (keep this block in sync with the handlers):
 *   - search_knowledge_base      → requireClientAccess in knowledge.ts
 *   - query_client_knowledge     → requireClientAccess in knowledge.ts
 *   - get_knowledge_entry        → requireClientAccess on entry.client_id
 *   - get_client_details         → inline role/org check in clients.ts
 *   - generate_video_ideas       → requireClientAccess in knowledge.ts
 *   - extract_topic_signals      → filter search_ids by caller org
 *   - create_topic_plan          → inline role/org check before insert
 */
const PORTAL_ALLOWED_TOOLS = new Set([
  'search_knowledge_base',
  'query_client_knowledge',
  'get_knowledge_entry',
  'get_client_details',
  'generate_video_ideas',
  'extract_topic_signals',
  'create_topic_plan',
]);

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  website_url: string | null;
  agency: string | null;
  services: string[] | null;
  preferences: Record<string, unknown> | null;
  health_score: string | null;
  logo_url: string | null;
}

interface SocialProfileRow {
  id: string;
  client_id: string;
  platform: string;
  username: string;
}

interface StrategyRow {
  client_id: string;
  executive_summary: string | null;
  content_pillars: unknown;
}

function buildClientSummary(c: ClientRow, profiles: SocialProfileRow[], strategy: StrategyRow | null): string {
  const parts: string[] = [];
  parts.push(`### ${c.name} (slug: ${c.slug}, id: ${c.id})`);
  if (c.agency) parts.push(`Agency: ${c.agency}`);
  if (c.industry) parts.push(`Industry: ${c.industry}`);
  if (c.services?.length) parts.push(`Services: ${c.services.join(', ')}`);
  if (c.target_audience) parts.push(`Target Audience: ${c.target_audience}`);
  if (c.brand_voice) parts.push(`Brand Voice: ${c.brand_voice}`);

  const prefs = c.preferences;
  if (prefs) {
    if ((prefs.tone_keywords as string[])?.length)
      parts.push(`Tone: ${(prefs.tone_keywords as string[]).join(', ')}`);
    if ((prefs.topics_lean_into as string[])?.length)
      parts.push(`Lean Into: ${(prefs.topics_lean_into as string[]).join(', ')}`);
    if (prefs.posting_frequency) parts.push(`Posting Frequency: ${prefs.posting_frequency}`);
  }

  if (profiles.length > 0) {
    parts.push(`Social Accounts:`);
    for (const p of profiles) {
      parts.push(`  - ${p.platform}: @${p.username} (profile_id: ${p.id})`);
    }
  }

  if (strategy?.executive_summary) {
    parts.push(`Strategy: ${strategy.executive_summary}`);
  }

  return parts.join('\n');
}

/** Notify all super_admins when a guardrail fires. Non-blocking. */
async function notifySuperAdminsGuardrail(
  adminClient: ReturnType<typeof createAdminClient>,
  ctx: { userId: string; userEmail: string; message: string; ruleName: string },
) {
  try {
    const { data: superAdmins } = await adminClient
      .from('users')
      .select('id')
      .eq('is_super_admin', true);

    if (!superAdmins || superAdmins.length === 0) return;

    // Don't notify the super_admin about their own messages
    const recipients = superAdmins.filter((sa) => sa.id !== ctx.userId);
    if (recipients.length === 0) return;

    const truncatedMsg = ctx.message.length > 120 ? ctx.message.slice(0, 120) + '...' : ctx.message;

    const notifications = recipients.map((sa) => ({
      recipient_user_id: sa.id,
      type: 'guardrail_triggered',
      title: `Guardrail triggered: ${ctx.ruleName}`,
      body: `${ctx.userEmail} asked: "${truncatedMsg}"`,
      link_path: '/admin/nerd/settings',
      is_read: false,
    }));

    await adminClient.from('notifications').insert(notifications);
  } catch (err) {
    console.error('[guardrail-notify] Failed to notify super_admins:', err);
  }
}

async function buildKnowledgeSummary(clientId: string): Promise<string> {
  try {
    const { getKnowledgeEntries, getBrandProfile } = await import('@/lib/knowledge/queries');
    const entries = await getKnowledgeEntries(clientId);
    if (entries.length === 0) return '';

    const parts: string[] = ['Knowledge Base:'];
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    parts.push(`  Entries: ${Object.entries(counts).map(([t, c]) => `${c} ${t}(s)`).join(', ')}`);

    // Full brand profile
    const brandProfile = await getBrandProfile(clientId);
    if (brandProfile) {
      parts.push(`  Brand Profile:\n${brandProfile.content.substring(0, 1500)}`);
    }

    // Structured entity summaries from knowledge entries
    const entitySummary: string[] = [];
    const people = new Set<string>();
    const products = new Set<string>();
    const locations = new Set<string>();

    for (const entry of entries) {
      const meta = entry.metadata as Record<string, unknown> | null;
      const entities = meta?.entities as {
        people?: { name: string; role?: string }[];
        products?: { name: string; description?: string }[];
        locations?: { address: string }[];
      } | undefined;
      if (!entities) continue;
      for (const p of entities.people ?? []) people.add(p.role ? `${p.name} (${p.role})` : p.name);
      for (const p of entities.products ?? []) products.add(p.name);
      for (const l of entities.locations ?? []) locations.add(l.address);
    }

    if (people.size > 0) entitySummary.push(`  Key People: ${[...people].join(', ')}`);
    if (products.size > 0) entitySummary.push(`  Products/Services: ${[...products].join(', ')}`);
    if (locations.size > 0) entitySummary.push(`  Locations: ${[...locations].join(', ')}`);
    if (entitySummary.length > 0) parts.push(...entitySummary);

    // Meeting notes summaries (last 5)
    const meetings = entries
      .filter((e) => e.type === 'meeting_note')
      .slice(0, 5);
    if (meetings.length > 0) {
      parts.push('  Recent Meetings:');
      for (const m of meetings) {
        const summary = m.content.substring(0, 200);
        parts.push(`    - ${m.title}: ${summary}...`);
      }
    }

    return parts.join('\n');
  } catch (err) {
    console.error(`buildKnowledgeSummary failed for client ${clientId}:`, err instanceof Error ? err.message : err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/nerd/chat
 *
 * Streaming AI chat endpoint for "The Nerd" — an in-house social media strategist AI.
 * Loads the full client portfolio and team context, then streams a response from Claude
 * via OpenRouter. Supports tool use with up to 5 sequential tool calls per request.
 * Write-risk tools emit action_confirmation events; destructive tools are blocked.
 *
 * @auth Required (any authenticated user)
 * @body messages - Conversation history (required, min 1 message)
 * @body mentions - Optional @mention resolutions from the latest user message
 * @body actionConfirmation - Optional confirmed/cancelled tool action to execute
 * @returns SSE stream of JSON lines: { type: 'text' | 'tool_result' | 'action_confirmation' | 'action_result', ... }
 */
export async function POST(req: NextRequest) {
  try {
    const { brandName } = getBrandFromRequest(req);
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }), { status: 400 });
    }

    const { messages, mentions, actionConfirmation, conversationId, portalMode, sessionHint, searchContext, mode, attachments } = parsed.data;

    // --- Detect portal user (viewer role or admin impersonating) ---
    // `portalMode: true` from the client is a hint, but the server-resolved
    // effective access context is the source of truth. An admin currently
    // impersonating a client is treated exactly like a viewer of that
    // client — same allowlist of tools, same mention-scoping — so a
    // real viewer and an impersonating admin produce identical transcripts.
    let isPortalUser = false;
    let portalClientName = '';
    let resolvedPortalClientId: string | undefined;
    const adminForResolve = createAdminClient();
    const effectiveCtx = await getEffectiveAccessContext(user, adminForResolve);
    const shouldTreatAsPortal =
      effectiveCtx.role === 'viewer' && (portalMode || effectiveCtx.isImpersonating);

    if (shouldTreatAsPortal) {
      isPortalUser = true;
      const accessIds = new Set(effectiveCtx.clientIds ?? []);

      const requestedId = mentions?.find((m) => m.type === 'client')?.id;
      if (requestedId && accessIds.has(requestedId)) {
        resolvedPortalClientId = requestedId;
      } else if (effectiveCtx.impersonatedClientId) {
        // Impersonation picks the exact client, regardless of mention.
        resolvedPortalClientId = effectiveCtx.impersonatedClientId;
      } else if (accessIds.size > 0) {
        resolvedPortalClientId = Array.from(accessIds)[0];
      } else {
        resolvedPortalClientId = undefined;
      }

      if (resolvedPortalClientId) {
        const { data: resolvedClient } = await adminForResolve
          .from('clients')
          .select('name')
          .eq('id', resolvedPortalClientId)
          .single();
        portalClientName = (resolvedClient?.name as string | null) ?? '';
      }
    }

    // --- Handle action confirmation (execute a pending write tool) ---
    if (actionConfirmation) {
      // Portal users cannot execute write tools
      if (isPortalUser) {
        return new Response(JSON.stringify({ type: 'action_error', error: 'Write actions are not available in the portal' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!actionConfirmation.confirmed) {
        return new Response(JSON.stringify({ type: 'action_cancelled' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tool = getTool(actionConfirmation.toolName);
      if (!tool) {
        return new Response(JSON.stringify({ type: 'action_error', error: `Tool "${actionConfirmation.toolName}" not found` }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await tool.handler(actionConfirmation.arguments, user.id);
      return new Response(JSON.stringify({ type: 'action_result', result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const admin = createAdminClient();

    // --- Load client portfolio context ---
    // Portal users only see their server-resolved client (never the one
    // from the mention payload — see resolvedPortalClientId above).
    const portalClientId = isPortalUser ? resolvedPortalClientId : undefined;

    let clientsQuery = admin
      .from('clients')
      .select('id, name, slug, industry, target_audience, brand_voice, topic_keywords, website_url, agency, services, preferences, health_score, logo_url')
      .eq('is_active', true);

    if (isPortalUser) {
      // Defense in depth: if resolvedPortalClientId is missing (no
      // user_client_access rows) force an empty result — never fall
      // through to an unfiltered clients query for a portal caller.
      clientsQuery = portalClientId
        ? clientsQuery.eq('id', portalClientId)
        : clientsQuery.in('id', []);
    } else {
      clientsQuery = clientsQuery.order('name');
    }

    const { data: clients } = await clientsQuery;

    const allClients = (clients ?? []) as ClientRow[];
    const allClientIds = allClients.map((c) => c.id);

    // Scope ancillary loads to the clients we already fetched. For admin
    // users that's all active clients; for portal users it's their single
    // resolved client. Avoids pulling the whole social_profiles /
    // client_strategies tables into memory on every portal chat turn.
    const profilesByClient = new Map<string, SocialProfileRow[]>();
    const strategyByClient = new Map<string, StrategyRow>();

    if (allClientIds.length > 0) {
      const [{ data: socialProfiles }, { data: strategies }] = await Promise.all([
        admin
          .from('social_profiles')
          .select('id, client_id, platform, username')
          .eq('is_active', true)
          .in('client_id', allClientIds),
        admin
          .from('client_strategies')
          .select('client_id, executive_summary, content_pillars')
          .eq('status', 'completed')
          .in('client_id', allClientIds)
          .order('created_at', { ascending: false }),
      ]);

      for (const p of (socialProfiles ?? []) as SocialProfileRow[]) {
        const arr = profilesByClient.get(p.client_id) ?? [];
        arr.push(p);
        profilesByClient.set(p.client_id, arr);
      }

      for (const s of (strategies ?? []) as StrategyRow[]) {
        if (!strategyByClient.has(s.client_id)) {
          strategyByClient.set(s.client_id, s);
        }
      }
    }

    // Load team members for context (admin only — portal users don't see team)
    const teamMembers = isPortalUser ? [] : (await admin
      .from('team_members')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name')).data ?? [];

    const clientSummaries = allClients.map((c) =>
      buildClientSummary(c, profilesByClient.get(c.id) ?? [], strategyByClient.get(c.id) ?? null),
    );

    // Enrich mentioned clients with knowledge context
    const visibleClientIds = new Set(allClients.map((c) => c.id));
    const mentionedClientIds = new Set(
      (mentions ?? [])
        .filter((m) => m.type === 'client' && visibleClientIds.has(m.id))
        .map((m) => m.id),
    );
    const knowledgeSummaries = await Promise.all(
      allClients
        .filter((c) => mentionedClientIds.has(c.id))
        .map(async (c) => ({ id: c.id, summary: await buildKnowledgeSummary(c.id) })),
    );
    const knowledgeByClient = new Map(knowledgeSummaries.map((k) => [k.id, k.summary]));

    const strategyPackByClient = new Map<string, string>();
    if (mentionedClientIds.size > 0) {
      const { buildStrategyLabContextPack } = await import('@/lib/nerd/strategy-lab-context-pack');
      const packResults = await Promise.allSettled(
        [...mentionedClientIds].map(async (id) => {
          const pack = await buildStrategyLabContextPack(admin, id);
          return { id, pack };
        }),
      );
      for (const result of packResults) {
        if (result.status === 'fulfilled' && result.value.pack.trim().length > 0) {
          strategyPackByClient.set(result.value.id, result.value.pack);
        } else if (result.status === 'rejected') {
          console.error('Strategy pack build failed:', result.reason);
        }
      }
    }

    const enrichedSummaries = allClients.map((c, i) => {
      const knowledge = knowledgeByClient.get(c.id);
      const strategyPack = strategyPackByClient.get(c.id);
      let block = clientSummaries[i];
      if (knowledge) block += `\n${knowledge}`;
      if (strategyPack) block += `\n\n${strategyPack}`;
      return block;
    });

    const teamContext = teamMembers.map((t: { id: string; full_name: string; role: string | null }) => `- ${t.full_name} (id: ${t.id}, role: ${t.role ?? 'team member'})`).join('\n');

    let portfolioContext: string;
    if (isPortalUser) {
      portfolioContext = `# Your Brand Profile\n\n${enrichedSummaries.join('\n\n')}`;
    } else {
      portfolioContext = `# ${brandName} Client Portfolio (${allClients.length} active clients)\n\n${enrichedSummaries.join('\n\n---\n\n')}`;
      portfolioContext += `\n\n# Team Members\n${teamContext}`;
    }

    // Add mention context if present
    if (mentions && mentions.length > 0) {
      const mentionContext = mentions.map((m) => {
        if (m.type === 'client') {
          return `@${m.name} → client_id: ${m.id}, slug: ${m.slug ?? ''}`;
        }
        return `@${m.name} → team_member_id: ${m.id}`;
      }).join('\n');
      portfolioContext += `\n\n# @Mentions in current message\n${mentionContext}`;
    }
    if (sessionHint?.trim()) {
      portfolioContext += `\n\n# Session hint\n${sessionHint.trim()}`;
    }

    // --- Attach topic search results as context ---
    if (searchContext && searchContext.length > 0) {
      // Viewer tenancy: filter searchContext to IDs whose client belongs to
      // the caller's organization. Admins pass through unchanged. Without
      // this, a crafted POST with cross-org UUIDs would leak those search
      // results into the system prompt injection below.
      let scopedIds = searchContext;
      if (isPortalUser) {
        const { data: callerUser } = await admin
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        const callerOrg = callerUser?.organization_id as string | null;
        if (!callerOrg) {
          scopedIds = [];
        } else {
          const { data: scopeRows } = await admin
            .from('topic_searches')
            .select('id, clients!inner(organization_id)')
            .in('id', searchContext);
          scopedIds = (scopeRows ?? [])
            .filter((r) => {
              const org = Array.isArray(r.clients)
                ? r.clients[0]?.organization_id
                : (r.clients as { organization_id: string } | null)?.organization_id;
              return org === callerOrg;
            })
            .map((r) => r.id as string);
        }
      }

      const { data: attachedSearches } = scopedIds.length === 0
        ? { data: [] as Array<{
            id: string; query: string; summary: string | null;
            trending_topics: unknown; metrics: unknown; content_breakdown: unknown;
            emotions: unknown; platforms: string[] | null; volume: string | null;
            search_mode: string | null;
          }> }
        : await admin
            .from('topic_searches')
            .select('id, query, summary, trending_topics, metrics, content_breakdown, emotions, platforms, volume, search_mode')
            .in('id', scopedIds)
            .eq('status', 'completed');

      if (attachedSearches && attachedSearches.length > 0) {
        const searchBlocks = attachedSearches.map((s: {
          id: string; query: string; summary: string | null;
          trending_topics: unknown; metrics: unknown; content_breakdown: unknown;
          emotions: unknown; platforms: string[] | null; volume: string | null;
          search_mode: string | null;
        }) => {
          const lines: string[] = [`## Topic Search: "${s.query}"`];
          if (s.search_mode) lines.push(`Mode: ${s.search_mode}`);
          if (s.platforms) lines.push(`Platforms: ${s.platforms.join(', ')}`);
          if (s.volume) lines.push(`Depth: ${s.volume}`);
          if (s.summary) lines.push(`\n### Summary\n${s.summary}`);

          const metrics = s.metrics as Record<string, unknown> | null;
          if (metrics) {
            lines.push(`\n### Metrics`);
            if (metrics.topic_score != null) lines.push(`- Topic score: ${metrics.topic_score}/100`);
            if (metrics.overall_sentiment != null) lines.push(`- Sentiment: ${metrics.overall_sentiment}`);
            if (metrics.conversation_intensity) lines.push(`- Conversation intensity: ${metrics.conversation_intensity}`);
            if (metrics.content_opportunities != null) lines.push(`- Content opportunities: ${metrics.content_opportunities}`);
          }

          const topics = s.trending_topics as Array<{
            name: string; resonance: string; sentiment: number;
            posts_overview?: string; video_ideas?: Array<{ title: string; hook: string; why_it_works?: string }>;
          }> | null;
          if (topics && topics.length > 0) {
            lines.push(`\n### Trending Topics (${topics.length})`);
            for (const t of topics) {
              lines.push(`\n#### ${t.name} (resonance: ${t.resonance}, sentiment: ${t.sentiment})`);
              if (t.posts_overview) lines.push(t.posts_overview);
              if (t.video_ideas && t.video_ideas.length > 0) {
                lines.push(`\nVideo ideas:`);
                for (const idea of t.video_ideas.slice(0, 3)) {
                  lines.push(`- **${idea.title}** — Hook: "${idea.hook}"${idea.why_it_works ? ` — ${idea.why_it_works}` : ''}`);
                }
              }
            }
          }

          const emotions = s.emotions as Array<{ emotion: string; percentage: number }> | null;
          if (emotions && emotions.length > 0) {
            lines.push(`\n### Emotion Breakdown`);
            for (const e of emotions) {
              lines.push(`- ${e.emotion}: ${e.percentage}%`);
            }
          }

          return lines.join('\n');
        });
        portfolioContext += `\n\n# Attached Topic Search Results\nThe user has attached the following completed topic search results for reference. Use this data to inform your responses.\n\n${searchBlocks.join('\n\n---\n\n')}`;
      }
    }

    // --- Resolve or create conversation for persistence (admin only) ---
    let activeConvoId: string | null = null;
    const latestUserMsg = messages.filter((m) => m.role === 'user').pop();

    if (!isPortalUser) {
      activeConvoId = conversationId ?? null;

      if (!activeConvoId) {
        // Create a new conversation. Tag with the first client @mention so
        // the Strategy Lab conversation picker can list per-client threads.
        // Falls back to an insert without client_id if the column isn't
        // present yet (pre-migration 096 deploy window) — ADD COLUMN IF NOT
        // EXISTS is idempotent so this path disappears once the migration
        // has run.
        const firstClientMention = (mentions ?? []).find((m) => m.type === 'client');
        const insertPayload: Record<string, unknown> = {
          user_id: user.id,
          title: 'New conversation',
        };
        if (firstClientMention) insertPayload.client_id = firstClientMention.id;

        let newConvoId: string | null = null;
        const firstAttempt = await admin
          .from('nerd_conversations')
          .insert(insertPayload)
          .select('id')
          .single();
        if (firstAttempt.data?.id) {
          newConvoId = firstAttempt.data.id;
        } else if (firstClientMention) {
          // Retry without client_id — handles the brief window where the
          // column doesn't exist yet.
          const retry = await admin
            .from('nerd_conversations')
            .insert({ user_id: user.id, title: 'New conversation' })
            .select('id')
            .single();
          newConvoId = retry.data?.id ?? null;
        }
        activeConvoId = newConvoId;
      } else {
        // Touch updated_at
        await admin
          .from('nerd_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', activeConvoId)
          .eq('user_id', user.id);
      }

      // Save the latest user message
      if (activeConvoId && latestUserMsg) {
        await admin.from('nerd_messages').insert({
          conversation_id: activeConvoId,
          role: 'user',
          content: latestUserMsg.content,
        });
      }
    }

    // --- Build API messages ---
    const openAiKey = await resolveOpenAiApiKeyForFeature('nerd');
    const orKey = await resolveOpenRouterApiKeyForFeature('nerd');
    const nerdModel = await getNerdModelFromDb();
    const openAiModelId = toOpenAiChatModelId(nerdModel);
    const useOpenAi = Boolean(openAiKey && openAiModelId);
    const apiKey = useOpenAi ? openAiKey : orKey;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            'No API key configured. Add an OpenAI or OpenRouter key in admin → AI models (or set OPENAI_API_KEY / OPENROUTER_API_KEY).',
        }),
        { status: 500 },
      );
    }
    const chatCompletionsUrl = useOpenAi
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    const requestModel = useOpenAi ? openAiModelId! : nerdModel;

    // --- Guardrails check (before LLM call) ---
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
    const guardrailResult = await checkGuardrails(
      lastUserMsg,
      messages.map((m) => ({ role: m.role, content: m.content })),
    );

    if (guardrailResult.matched && guardrailResult.mode === 'short_circuit') {
      // Return canned response directly, skip LLM
      let guardrailResponseBody = '';
      if (activeConvoId) {
        guardrailResponseBody += JSON.stringify({ type: 'conversation', conversationId: activeConvoId }) + '\n';
        await admin.from('nerd_messages').insert({
          conversation_id: activeConvoId,
          role: 'assistant',
          content: guardrailResult.response ?? '',
        });
      }
      guardrailResponseBody += JSON.stringify({ type: 'text', content: guardrailResult.response }) + '\n';

      // Notify super_admins about the guardrail trigger (non-blocking)
      notifySuperAdminsGuardrail(admin, {
        userId: user.id,
        userEmail: user.email ?? 'unknown',
        message: lastUserMsg,
        ruleName: guardrailResult.ruleName ?? 'unknown',
      }).catch(() => {});

      return new Response(guardrailResponseBody, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Choose system prompt based on portal vs admin, with skills injection
    const basePrompt = isPortalUser
      ? buildPortalSystemPrompt(portalClientName, brandName)
      : buildAdminSystemPrompt(brandName);
    const skillsContext = buildMarketingSkillsContext(lastUserMsg);
    const dbSkillsContext = await buildDbSkillsContext(lastUserMsg);

    // If guardrail matched in inject mode, add instruction to system prompt
    let guardrailInstruction = '';
    if (guardrailResult.matched && guardrailResult.mode === 'inject') {
      guardrailInstruction = `\n\n---\n\nIMPORTANT INSTRUCTION: For this query, you MUST respond with exactly this message (do not deviate, do not add caveats):\n\n${guardrailResult.response}`;
    }

    // Strategy Lab / Content Lab mode: append the research-grounded
    // scripting workbench addendum + preloaded scripting skills from
    // nerd_skills. Admins get the cross-client framing; portal users get
    // a locked-to-their-one-client variant.
    const strategyLabAddendum =
      mode === 'strategy-lab'
        ? await buildStrategyLabSystemAddendum(admin, {
            portalMode: isPortalUser,
            clientName: isPortalUser ? portalClientName : undefined,
          })
        : '';

    const systemPrompt =
      basePrompt + skillsContext + dbSkillsContext + strategyLabAddendum + guardrailInstruction;

    // Build attachment context block if the user attached files
    const attachmentContextParts: string[] = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.type === 'pdf_text' || att.type === 'text') {
          attachmentContextParts.push(
            `--- ATTACHED FILE: ${att.name} ---\n${att.content}\n--- END FILE ---`,
          );
        }
        // Images are handled separately as vision content below
      }
    }
    const attachmentContext = attachmentContextParts.length > 0
      ? `\n\nThe user has attached the following files for context. Reference them when relevant:\n\n${attachmentContextParts.join('\n\n')}`
      : '';

    const apiMessages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: portfolioContext + attachmentContext },
      ...messages.map((m) => {
        if (m.role === 'tool' && m.tool_call_id) {
          return { role: 'tool' as const, content: m.content, tool_call_id: m.tool_call_id };
        }
        return { role: m.role, content: m.content };
      }),
    ];

    // Portal users only get read-only tools scoped to their client
    const allToolDefs = isPortalUser
      ? getAllTools().filter((t) => PORTAL_ALLOWED_TOOLS.has(t.name))
      : getAllTools();
    const tools = isPortalUser
      ? getToolsForAPI().filter((t) => PORTAL_ALLOWED_TOOLS.has(t.function.name))
      : getToolsForAPI();

    /**
     * Topic-plan force: the /idea + /ideas slash commands expand into a
     * prompt with a specific signature ("MANDATORY tool pipeline"). When
     * detected on the latest user turn, tell the model it MUST call a
     * tool this turn — blocks the "just output prose" failure mode and
     * kicks off the extract_topic_signals → search_knowledge_base →
     * create_topic_plan pipeline. After the first tool result comes
     * back, subsequent turns revert to normal tool_choice: 'auto' so
     * the model can decide when it's done.
     */
    const lastUserTurn = [...messages].reverse().find((m) => m.role === 'user');
    const forceToolUse =
      tools.length > 0 &&
      typeof lastUserTurn?.content === 'string' &&
      /MANDATORY tool pipeline|You MUST call `create_topic_plan`/.test(lastUserTurn.content);
    const toolChoice: string | undefined = forceToolUse ? 'required' : undefined;

    /**
     * OpenAI's newer frontier models (gpt-5.x, o1/o3 reasoning series) require
     * `max_completion_tokens` instead of the legacy `max_tokens`. Older
     * gpt-3.5 and some third-party APIs via OpenRouter still want `max_tokens`.
     * Build the right body-shape per-provider-per-model so we don't break one
     * while fixing the other.
     */
    const modelPrefersCompletionTokens =
      useOpenAi &&
      (/^o\d/.test(requestModel) ||
        /^gpt-5/.test(requestModel) ||
        /^gpt-4\.1/.test(requestModel));
    const tokenLimitField: Record<string, number> = modelPrefersCompletionTokens
      ? { max_completion_tokens: 8192 }
      : { max_tokens: 8192 };

    // --- Initial API call with tool definitions ---
    const initialHeaders: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (!useOpenAi) {
      initialHeaders['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
      initialHeaders['X-Title'] = `${brandName} Cortex - The Nerd`;
    }

    const openRouterRes = await fetch(chatCompletionsUrl, {
      method: 'POST',
      headers: initialHeaders,
      body: JSON.stringify({
        model: requestModel,
        messages: apiMessages,
        stream: true,
        ...tokenLimitField,
        tools: tools.length > 0 ? tools : undefined,
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error('Chat completions error:', openRouterRes.status, errText);
      logApiError({
        route: '/api/nerd/chat',
        statusCode: openRouterRes.status,
        errorMessage: `LLM API error: ${openRouterRes.status}`,
        errorDetail: errText.slice(0, 1000),
        userId: user.id,
        userEmail: user.email ?? undefined,
        meta: { model: requestModel, provider: useOpenAi ? 'openai' : 'openrouter' },
      }).catch(() => {});
      // Return the actual error details to help debug
      let detail = 'AI service error';
      try {
        const errJson = JSON.parse(errText);
        detail = errJson?.error?.message || errJson?.error || detail;
      } catch { /* not JSON */ }
      return new Response(JSON.stringify({ error: detail }), { status: 502 });
    }

    // --- Stream response, handling tool calls ---
    const encoder = new TextEncoder();
    const convoIdForStream = activeConvoId;
    const userIdForStream = user.id;
    const isFirstMessage = !conversationId; // New conversation — needs title generation

    const readable = new ReadableStream({
      async start(controller) {
        const currentMessages = [...apiMessages];
        let response = openRouterRes;
        let toolCallCount = 0;
        const MAX_TOOL_CALLS = 5;
        let fullAssistantText = '';
        const allToolResults: Array<{ toolName: string; result: ToolResult }> = [];

        async function processStream(res: Response): Promise<{
          textContent: string;
          toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>;
        }> {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let textContent = '';
          const toolCalls: Array<{ id: string; index: number; function: { name: string; arguments: string } }> = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const chunk = JSON.parse(data);
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                // Text content
                if (delta.content) {
                  textContent += delta.content;
                  fullAssistantText += delta.content;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: delta.content }) + '\n'));
                }

                // Tool calls
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || '', index: idx, function: { name: '', arguments: '' } };
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              } catch {
                // skip malformed chunks
              }
            }
          }

          return { textContent, toolCalls };
        }

        try {
          while (toolCallCount < MAX_TOOL_CALLS) {
            const { textContent, toolCalls } = await processStream(response);

            // No tool calls — we're done
            if (toolCalls.length === 0) break;

            toolCallCount += toolCalls.length;

            // Build assistant message with tool calls
            const assistantMsg: Record<string, unknown> = {
              role: 'assistant',
              content: textContent || null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            };
            currentMessages.push(assistantMsg as typeof currentMessages[0]);

            // Execute each tool call
            for (const tc of toolCalls) {
              const toolName = tc.function.name;
              const toolDef = allToolDefs.find((t) => t.name === toolName);

              let result: ToolResult;

              if (!toolDef) {
                result = { success: false, error: `Unknown tool: ${toolName}` };
              } else {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments || '{}');
                } catch {
                  result = { success: false, error: 'Invalid tool arguments' };
                  // Send error result
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'tool_result',
                    toolCallId: tc.id,
                    toolName,
                    result,
                  }) + '\n'));
                  currentMessages.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: tc.id,
                  } as typeof currentMessages[0]);
                  continue;
                }

                // Check risk level
                if (toolDef.riskLevel === 'write') {
                  // Send confirmation request to frontend
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'action_confirmation',
                    toolCallId: tc.id,
                    toolName,
                    arguments: args,
                    riskLevel: toolDef.riskLevel,
                    description: toolDef.description,
                  }) + '\n'));

                  // For write actions, execute directly (frontend will handle UX)
                  // The confirmation UX is handled client-side
                  result = await toolDef.handler(args, user.id);
                } else if (toolDef.riskLevel === 'destructive') {
                  result = {
                    success: false,
                    error: `This action must be performed manually for safety.`,
                    link: { href: '/admin', label: 'Go to admin' },
                  };
                } else {
                  // Read — auto execute
                  result = await toolDef.handler(args, user.id);
                }
              }

              // Track for persistence
              allToolResults.push({ toolName, result });

              // Send tool result to frontend
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'tool_result',
                toolCallId: tc.id,
                toolName,
                result,
              }) + '\n'));

              // Add tool result to conversation for next API call
              currentMessages.push({
                role: 'tool',
                content: JSON.stringify(result),
                tool_call_id: tc.id,
              } as typeof currentMessages[0]);
            }

            // Continue conversation with tool results
            const continueHeaders: Record<string, string> = {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            };
            if (!useOpenAi) {
              continueHeaders['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
              continueHeaders['X-Title'] = `${brandName} Cortex - The Nerd`;
            }

            // Keep forcing tool_choice: 'required' across continuation turns
            // until create_topic_plan has actually fired. Otherwise the model
            // calls extract_topic_signals + search_knowledge_base (satisfying
            // the initial 'required' constraint) and then reverts to prose on
            // the next turn. Once the plan tool has been called, switch to
            // 'auto' so the final summary turn can produce text.
            const topicPlanFired = allToolResults.some((r) => r.toolName === 'create_topic_plan');
            const continueToolChoice: string | undefined =
              forceToolUse && !topicPlanFired ? 'required' : undefined;

            const continueRes = await fetch(chatCompletionsUrl, {
              method: 'POST',
              headers: continueHeaders,
              body: JSON.stringify({
                model: requestModel,
                messages: currentMessages,
                stream: true,
                ...tokenLimitField,
                tools: tools.length > 0 ? tools : undefined,
                ...(continueToolChoice ? { tool_choice: continueToolChoice } : {}),
              }),
            });

            if (!continueRes.ok) {
              const errText = await continueRes.text();
              console.error('Chat completions continue error:', continueRes.status, errText);
              let errDetail = '';
              try { errDetail = JSON.parse(errText)?.error?.message ?? ''; } catch { /* */ }
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: `\n\nI ran into an issue processing results${errDetail ? `: ${errDetail}` : ''}. Try asking a simpler question or start a new conversation.` }) + '\n'));
              break;
            }

            response = continueRes;
          }
        } catch (err) {
          console.error('Stream error:', err);
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: '\n\nConnection lost. Please try again.' }) + '\n'));
        } finally {
          // Persist assistant response + emit conversation ID
          if (convoIdForStream) {
            // Send conversation ID to frontend so it can track the active conversation
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'conversation',
              conversationId: convoIdForStream,
            }) + '\n'));

            // Save assistant message
            const persistAdmin = createAdminClient();
            if (fullAssistantText || allToolResults.length > 0) {
              await persistAdmin.from('nerd_messages').insert({
                conversation_id: convoIdForStream,
                role: 'assistant',
                content: fullAssistantText,
                tool_results: allToolResults.length > 0 ? allToolResults : null,
              }).then(() => {});
            }

            // Auto-generate title for new conversations
            if (isFirstMessage && latestUserMsg) {
              generateTitle(convoIdForStream, latestUserMsg.content, fullAssistantText, userIdForStream, user.email ?? undefined).catch(() => {});
            }
          }

          // Log usage for the Nerd chat
          const estimatedInputTokens = Math.ceil((systemPrompt.length + portfolioContext.length + lastUserMsg.length) / 4);
          const estimatedOutputTokens = Math.ceil((fullAssistantText?.length ?? 0) / 4);
          logUsage({
            service: useOpenAi ? 'openai' : 'openrouter',
            model: requestModel,
            feature: 'nerd_chat',
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
            costUsd: calculateCost(requestModel, estimatedInputTokens, estimatedOutputTokens),
            userId: userIdForStream,
            userEmail: user.email ?? undefined,
          }).catch(() => {});

          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Nerd chat error:', err);
    logApiError({
      route: '/api/nerd/chat',
      statusCode: 500,
      errorMessage: err instanceof Error ? err.message : 'Internal server error',
      errorDetail: err instanceof Error ? err.stack?.slice(0, 1000) : undefined,
    }).catch(() => {});
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Auto-generate conversation title from first exchange
// ---------------------------------------------------------------------------

async function generateTitle(conversationId: string, userMessage: string, assistantResponse: string, userId?: string, userEmail?: string) {
  try {
    const { createCompletion } = await import('@/lib/ai/client');
    const result = await createCompletion({
      messages: [
        {
          role: 'system',
          content: 'Generate a short conversation title (3-6 words max) for this chat. Return ONLY the title, no quotes, no punctuation at the end.',
        },
        {
          role: 'user',
          content: `User: ${userMessage.slice(0, 200)}\nAssistant: ${assistantResponse.slice(0, 200)}`,
        },
      ],
      maxTokens: 20,
      feature: 'nerd_title',
      userId,
      userEmail,
    });

    const title = result.text.trim().replace(/^["']|["']$/g, '').slice(0, 100);
    if (title) {
      const admin = createAdminClient();
      await admin
        .from('nerd_conversations')
        .update({ title })
        .eq('id', conversationId);
    }
  } catch (err) {
    console.error('Title generation error:', err);
  }
}
