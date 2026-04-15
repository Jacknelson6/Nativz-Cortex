import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { getBrandFromRequest } from '@/lib/agency/brand-from-request';
import crypto from 'crypto';

// In-memory cache — DB counts refresh every 5 min, AI insight persists for the day
let cache: { data: unknown; hash: string; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Separate daily AI cache — survives hash changes (only regenerates once per day)
let aiCache: {
  date: string;       // YYYY-MM-DD
  hash: string;       // pipeline state hash when AI was generated
  bullets: string[];
  tasks: { title: string; description: string; priority: string }[];
} | null = null;

/**
 * GET /api/pipeline/summary
 *
 * Generate an AI-powered summary of the current month's content pipeline. Returns editing
 * and approval status counts, AI insight bullets, and suggested action tasks. Caches the
 * AI response for 5 minutes and reuses it when pipeline state hasn't changed (detected via MD5 hash).
 *
 * @auth Required (any authenticated user)
 * @returns {{ total: number, doneCount: number, editingCounts: Record<string, { count: number, clients: string[] }>, approvalCounts: Record<string, { count: number, clients: string[] }>, aiBullets: string[], suggestedTasks: { title: string, description: string, priority: string }[], monthLabel: string }}
 */
export async function GET(req: NextRequest) {
  try {
    const { brandName } = getBrandFromRequest(req);
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data: items, error } = await adminClient
      .from('content_pipeline')
      .select('*')
      .eq('month_date', currentMonth)
      .order('client_name', { ascending: true });

    if (error) {
      console.error('Pipeline summary error:', error);
      return NextResponse.json({ error: 'Failed to load pipeline' }, { status: 500 });
    }

    const all = items ?? [];

    // Build a hash of the pipeline state to detect changes
    const stateHash = buildStateHash(all);

    // Return cached response if pipeline hasn't changed and cache is fresh
    if (cache && cache.hash === stateHash && Date.now() - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cache.data);
    }

    // Build editing status counts
    const editingCounts: Record<string, { count: number; clients: string[] }> = {};
    const approvalCounts: Record<string, { count: number; clients: string[] }> = {};

    for (const item of all) {
      if (!editingCounts[item.editing_status]) {
        editingCounts[item.editing_status] = { count: 0, clients: [] };
      }
      editingCounts[item.editing_status].count++;
      editingCounts[item.editing_status].clients.push(item.client_name);

      if (!approvalCounts[item.client_approval_status]) {
        approvalCounts[item.client_approval_status] = { count: 0, clients: [] };
      }
      approvalCounts[item.client_approval_status].count++;
      approvalCounts[item.client_approval_status].clients.push(item.client_name);
    }

    const totalItems = all.length;
    const doneCount = all.filter((i) => i.editing_status === 'done' || i.editing_status === 'scheduled').length;

    // Build pipeline snapshot for AI
    const blocked = all.filter((i) => i.editing_status === 'blocked');
    const needsRevision = all.filter((i) => i.client_approval_status === 'needs_revision');
    const overdueShoots = all.filter((i) => {
      if (!i.shoot_date) return false;
      return new Date(i.shoot_date) < now && i.raws_status !== 'uploaded';
    });
    const noEditor = all.filter((i) => !i.editor && i.editing_status === 'not_started');
    const waitingApproval = all.filter((i) => i.client_approval_status === 'waiting_on_approval');

    // AI insight — generates once per day, only updates changed bullets mid-day
    let aiBullets: string[] = [];
    let suggestedTasks: { title: string; description: string; priority: string }[] = [];
    const today = now.toISOString().slice(0, 10);

    if (totalItems > 0) {
      const hasTodaysAI = aiCache && aiCache.date === today;
      const hashUnchanged = hasTodaysAI && aiCache!.hash === stateHash;

      if (hashUnchanged) {
        // Same day, same data — reuse everything
        aiBullets = aiCache!.bullets;
        suggestedTasks = aiCache!.tasks;
      } else if (hasTodaysAI) {
        // Same day but pipeline changed — keep existing AI, update in background
        aiBullets = aiCache!.bullets;
        suggestedTasks = aiCache!.tasks;
        // Update hash so we don't re-trigger on next request
        aiCache = { ...aiCache!, hash: stateHash };
      } else {
        // New day or no cache — generate AI synchronously (with timeout)
        const snapshot = buildSnapshotText(all, {
          totalItems, doneCount, blocked, needsRevision,
          overdueShoots, noEditor, waitingApproval,
          editingCounts, approvalCounts,
          brandName,
        });

        try {
          const aiPromise = createCompletion({
            messages: [
              { role: 'system', content: buildPipelineSystemPrompt(brandName) },
              {
                role: 'user',
                content: `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.\n\n${snapshot}`,
              },
            ],
            maxTokens: 500,
            feature: 'pipeline_summary',
            userId: user.id,
            userEmail: user.email ?? undefined,
          });

          // Race against a 10-second timeout
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('AI timeout')), 10000),
          );

          const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
          const parsed = parseAIResponse(aiResponse.text);
          aiBullets = parsed.bullets.length > 0 ? parsed.bullets : buildFallbackBullets(totalItems, doneCount, blocked, needsRevision, overdueShoots, noEditor, all);
          suggestedTasks = parsed.tasks.length > 0 ? parsed.tasks : buildFallbackTasks(blocked, needsRevision, overdueShoots, noEditor, all);
        } catch (err) {
          console.error('AI pipeline insight error:', err);
          aiBullets = buildFallbackBullets(totalItems, doneCount, blocked, needsRevision, overdueShoots, noEditor, all);
          suggestedTasks = buildFallbackTasks(blocked, needsRevision, overdueShoots, noEditor, all);
        }

        // Cache for the rest of the day
        aiCache = { date: today, hash: stateHash, bullets: aiBullets, tasks: suggestedTasks };
      }
    }

    const result = {
      total: totalItems,
      doneCount,
      editingCounts,
      approvalCounts,
      aiBullets,
      suggestedTasks,
      monthLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };

    // Update cache
    cache = { data: result, hash: stateHash, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/pipeline/summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Hash the pipeline state so we can detect when data actually changes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStateHash(items: any[]): string {
  const key = items.map((i) =>
    `${i.id}:${i.editing_status}:${i.client_approval_status}:${i.raws_status}:${i.assignment_status}:${i.boosting_status}:${i.editor ?? ''}:${i.shoot_date ?? ''}`
  ).join('|');
  return crypto.createHash('md5').update(key).digest('hex');
}

// ─── SOP-aware system prompt ─────────────────────────────────────────────────

function buildPipelineSystemPrompt(brandName: string): string {
  return `You are the pipeline manager for ${brandName}, a video content marketing agency. You understand the full video editing SOP and content pipeline workflow.

## Pipeline stages (in order)

### 1. Assignment
- Strategist assigns videographer + editor to each client
- Statuses: can_assign → assigned → need_shoot
- A client can't progress until they have an assigned editor and videographer

### 2. RAWs (raw footage)
- Videographer shoots and uploads raw footage
- Statuses: need_to_schedule → waiting_on_shoot → uploaded
- Editing CANNOT begin until raws_status = "uploaded"
- If a shoot_date is in the past but raws aren't uploaded, the shoot is overdue

### 3. Editing
- Editor edits the raw footage into final videos
- Statuses: not_started → editing → edited → em_approved → scheduled → done
- "edited" means the editor finished but it hasn't been reviewed yet
- "em_approved" means the editing manager reviewed and approved the edit
- "revising" means the EM or client requested changes — editor must re-edit
- "blocked" means there's an issue preventing editing (missing assets, unclear brief, etc.)
- IMPORTANT: An item should NOT be in "not_started" if raws are uploaded — that's a red flag, editing should begin

### 4. Client approval
- After EM approves, edits are sent to the client for approval
- Statuses: not_sent → waiting_on_approval → client_approved → needs_revision → revised → sent_to_paid_media
- "not_sent" when editing isn't EM-approved yet is normal
- "not_sent" when editing IS em_approved is a bottleneck — approval should be sent immediately
- "needs_revision" means client requested changes — this goes back to "revising" in editing
- "client_approved" → content can be scheduled/posted
- "sent_to_paid_media" → content handed off for paid amplification

### 5. Boosting (social media)
- SMM handles posting and boosting
- Statuses: not_boosting → working_on_it → done

## Team roles & hierarchy
- Strategist: assigns work, owns client relationship
- Videographer: shoots raw footage
- Lead Editor (Neo Khen Gelizon): manages the editing team, distributes work to editors beneath him. Having many clients assigned to him is NORMAL — he delegates to his team. Do NOT flag him as overloaded or suggest redistributing his workload.
- Editors (Jashanjot, Jedidiah P, etc.): edit videos under Neo's direction
- Editing Manager / EM (Jack Nelson): reviews edits, approves quality
- SMM: posts and boosts content

IMPORTANT: Neo Khen is the lead editor with a team under him. His high client count is by design — he oversees all editing. Never suggest he is overloaded or that his work needs redistributing.

## "Done" definition
A client is fully done when: editing_status = "done" or "scheduled" AND client_approval_status = "client_approved" or "sent_to_paid_media"

## What to flag
- Bottlenecks: clients stuck at a stage too long (e.g. edited but not EM-approved, EM-approved but not sent for client approval)
- Blocked items: always urgent
- Revision loops: client requested revision — editor needs to act
- Unassigned editors: can't start editing without one
- Overdue shoots: footage should have been uploaded by now
- Individual editors (not Neo, the lead) with too many items in "editing" simultaneously
- Items where raws are uploaded but editing hasn't started

## Response format
Write 3-5 SHORT bullet points. Each bullet must be under 12 words. Lead with the client or person name followed by a colon. No em dashes, no explanations, no markdown formatting (no ** or *). Just plain text.

Good examples:
- "Neo Khen: 13 clients assigned, capacity overload"
- "CSS: raws uploaded, editing not started"
- "DSH: edited, waiting on EM approval"
- "21 clients still need shoots scheduled"
- "Only 1 client past editing stage mid-month"

Bad examples (too long):
- "Neo Khen has 13 clients assigned — severe capacity overload will create bottlenecks throughout the month."
- "CSS has uploaded raws but editing hasn't started — this is a red flag that should be in progress immediately."

Never use status code values like "not_started" — always use plain English like "not started".

Then suggest 1-4 actionable tasks.

Respond in JSON:
{
  "bullets": ["Short insight bullet 1", "Short insight bullet 2", ...],
  "tasks": [
    { "title": "Short task title (3-6 words, e.g. 'Schedule ASAB shoot', 'Check Khen's CSS edits')", "description": "Brief context explaining why (1 sentence)", "priority": "high" | "medium" | "low" }
  ]
}

IMPORTANT for tasks:
- Title must be SHORT — 3-6 words max, like you'd write on a sticky note. Examples: "Approve DSH edit", "Schedule CSS shoot", "Reassign Neo's overflow"
- Description provides the context/reason — this goes into the task description, not shown prominently
- Never put the description in the title`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSnapshotText(all: any[], ctx: any): string {
  const lines: string[] = [];
  lines.push(`Pipeline: ${ctx.totalItems} clients this month, ${ctx.doneCount} done/scheduled.`);
  lines.push('');

  // Editor workload summary
  const editorLoad: Record<string, string[]> = {};
  for (const item of all) {
    const editor = item.editor ?? 'Unassigned';
    if (!editorLoad[editor]) editorLoad[editor] = [];
    editorLoad[editor].push(`${item.client_name} (${item.editing_status})`);
  }
  lines.push('Editor workloads:');
  for (const [editor, clients] of Object.entries(editorLoad)) {
    lines.push(`- ${editor}: ${clients.length} clients — ${clients.join(', ')}`);
  }
  lines.push('');

  // Per-client detailed status
  lines.push('Client details:');
  for (const item of all) {
    const parts = [
      `assignment: ${item.assignment_status}`,
      `raws: ${item.raws_status}`,
      `editing: ${item.editing_status}`,
      `approval: ${item.client_approval_status}`,
      `boosting: ${item.boosting_status}`,
      item.editor ? `editor: ${item.editor}` : 'NO EDITOR',
      item.editing_manager ? `EM: ${item.editing_manager}` : '',
      item.videographer ? `videographer: ${item.videographer}` : '',
      item.shoot_date ? `shoot_date: ${item.shoot_date}` : '',
    ].filter(Boolean);
    lines.push(`- ${item.client_name} (${item.agency ?? ctx.brandName ?? 'Nativz'}): ${parts.join(', ')}`);
  }
  lines.push('');

  // Flag specific issues
  const issues: string[] = [];
  if (ctx.blocked.length > 0) {
    issues.push(`BLOCKED: ${ctx.blocked.map((b: { client_name: string }) => b.client_name).join(', ')}`);
  }
  if (ctx.needsRevision.length > 0) {
    issues.push(`CLIENT REQUESTED REVISION: ${ctx.needsRevision.map((r: { client_name: string }) => r.client_name).join(', ')}`);
  }
  if (ctx.overdueShoots.length > 0) {
    issues.push(`OVERDUE SHOOTS (past shoot_date, raws not uploaded): ${ctx.overdueShoots.map((s: { client_name: string; shoot_date: string }) => `${s.client_name} (was ${s.shoot_date})`).join(', ')}`);
  }
  if (ctx.noEditor.length > 0) {
    issues.push(`NO EDITOR ASSIGNED (editing not_started): ${ctx.noEditor.map((n: { client_name: string }) => n.client_name).join(', ')}`);
  }
  if (ctx.waitingApproval.length > 0) {
    issues.push(`WAITING ON CLIENT APPROVAL: ${ctx.waitingApproval.map((w: { client_name: string }) => w.client_name).join(', ')}`);
  }

  // Bottleneck: EM-approved but approval not sent
  const emApprovedNotSent = all.filter((i) => i.editing_status === 'em_approved' && i.client_approval_status === 'not_sent');
  if (emApprovedNotSent.length > 0) {
    issues.push(`BOTTLENECK — EM approved but client approval not sent: ${emApprovedNotSent.map((i: { client_name: string }) => i.client_name).join(', ')}`);
  }

  // Bottleneck: raws uploaded but editing not started
  const rawsUploadedNotStarted = all.filter((i) => i.raws_status === 'uploaded' && i.editing_status === 'not_started');
  if (rawsUploadedNotStarted.length > 0) {
    issues.push(`BOTTLENECK — raws uploaded but editing not started: ${rawsUploadedNotStarted.map((i: { client_name: string }) => i.client_name).join(', ')}`);
  }

  if (issues.length > 0) {
    lines.push('FLAGGED ISSUES:');
    for (const issue of issues) lines.push(`⚠ ${issue}`);
  } else {
    lines.push('No critical issues flagged.');
  }

  return lines.join('\n');
}

function parseAIResponse(text: string): { bullets: string[]; tasks: { title: string; description: string; priority: string }[] } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      let bullets: string[] = [];
      if (Array.isArray(parsed.bullets)) {
        bullets = parsed.bullets.filter((b: unknown) => typeof b === 'string' && b.length > 0);
      } else if (typeof parsed.update === 'string' && parsed.update) {
        bullets = parsed.update.split(/[.!]\s+/).filter((s: string) => s.length > 5).map((s: string) => s.replace(/\.$/, ''));
      }
      return {
        bullets,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map((t: { title?: string; description?: string; priority?: string }) => ({
          title: t.title ?? '',
          description: t.description ?? '',
          priority: t.priority ?? 'medium',
        })) : [],
      };
    }
  } catch {
    /* fall through */
  }
  return { bullets: [text.slice(0, 300)], tasks: [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFallbackBullets(total: number, done: number, blocked: any[], revisions: any[], overdue: any[], unassigned: any[], all?: any[]): string[] {
  const bullets: string[] = [];
  const pct = Math.round((done / total) * 100);
  bullets.push(`${done}/${total} clients complete (${pct}%)`);

  if (blocked.length > 0) bullets.push(`${blocked.map((b: { client_name: string }) => b.client_name).join(', ')}: blocked`);
  if (revisions.length > 0) bullets.push(`${revisions.map((r: { client_name: string }) => r.client_name).join(', ')}: revision pending`);
  if (overdue.length > 0) bullets.push(`${overdue.length} shoot${overdue.length > 1 ? 's' : ''} overdue`);
  if (unassigned.length > 0) bullets.push(`${unassigned.length} client${unassigned.length > 1 ? 's' : ''} need editors`);

  // Additional context from full pipeline
  if (all) {
    const notStarted = all.filter((i) => i.editing_status === 'not_started');
    const editing = all.filter((i) => i.editing_status === 'editing');
    const edited = all.filter((i) => i.editing_status === 'edited');
    const emApproved = all.filter((i) => i.editing_status === 'em_approved');
    const rawsUploaded = all.filter((i) => i.raws_status === 'uploaded' && i.editing_status === 'not_started');
    const emApprovedNotSent = all.filter((i) => i.editing_status === 'em_approved' && i.client_approval_status === 'not_sent');

    if (rawsUploaded.length > 0) bullets.push(`${rawsUploaded.map((i: { client_name: string }) => i.client_name).join(', ')}: raws ready, editing not started`);
    if (emApprovedNotSent.length > 0) bullets.push(`${emApprovedNotSent.map((i: { client_name: string }) => i.client_name).join(', ')}: approved, needs client send`);
    if (notStarted.length > 0 && bullets.length < 4) bullets.push(`${notStarted.length} clients not started editing yet`);
    if (editing.length > 0 && bullets.length < 5) bullets.push(`${editing.length} currently in editing`);
    if (edited.length > 0 && bullets.length < 5) bullets.push(`${edited.map((i: { client_name: string }) => i.client_name).join(', ')}: edited, awaiting EM review`);
  }

  return bullets.slice(0, 5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFallbackTasks(blocked: any[], revisions: any[], overdue: any[], unassigned: any[], all?: any[]): { title: string; description: string; priority: string }[] {
  const tasks: { title: string; description: string; priority: string }[] = [];

  for (const b of blocked) tasks.push({ title: `Unblock ${b.client_name}`, description: 'Editing is blocked — check for missing assets or unclear brief', priority: 'high' });
  for (const r of revisions) tasks.push({ title: `Revise ${r.client_name}`, description: 'Client requested revision on edits', priority: 'high' });
  for (const s of overdue) tasks.push({ title: `Follow up ${s.client_name} shoot`, description: `Shoot was scheduled for ${s.shoot_date} but raws not uploaded`, priority: 'medium' });
  if (unassigned.length > 0) tasks.push({ title: `Assign ${unassigned.length} editors`, description: `${unassigned.length} client${unassigned.length > 1 ? 's' : ''} have no editor assigned yet`, priority: 'medium' });

  // Generate tasks from pipeline state if no urgent issues
  if (all && tasks.length < 2) {
    const rawsUploaded = all.filter((i) => i.raws_status === 'uploaded' && i.editing_status === 'not_started');
    const edited = all.filter((i) => i.editing_status === 'edited');
    const emApprovedNotSent = all.filter((i) => i.editing_status === 'em_approved' && i.client_approval_status === 'not_sent');
    const needShoots = all.filter((i) => i.raws_status === 'need_to_schedule');

    for (const i of rawsUploaded.slice(0, 2)) tasks.push({ title: `Start ${i.client_name} editing`, description: 'Raws are uploaded and ready', priority: 'high' });
    for (const i of edited.slice(0, 2)) tasks.push({ title: `Review ${i.client_name} edit`, description: 'Editing complete, needs EM approval', priority: 'high' });
    for (const i of emApprovedNotSent.slice(0, 2)) tasks.push({ title: `Send ${i.client_name} for approval`, description: 'EM approved, send to client', priority: 'medium' });
    if (needShoots.length > 0 && tasks.length < 4) tasks.push({ title: `Schedule ${needShoots.length} shoots`, description: `${needShoots.length} clients need shoot scheduling`, priority: 'medium' });
  }

  return tasks.slice(0, 4);
}
