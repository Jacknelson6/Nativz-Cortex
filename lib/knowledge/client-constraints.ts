import { createKnowledgeEntry, createKnowledgeLink } from './queries';
import type { KnowledgeEntry } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

type AdminClient = SupabaseClient;

export type ClientConstraintScope =
  | 'offering'
  | 'topic'
  | 'cta'
  | 'claim'
  | 'language'
  | 'audience'
  | 'visual'
  | 'channel'
  | 'other';

export interface ExtractedClientConstraint {
  statement: string;
  forbidden_terms?: string[];
  replacement?: string | null;
  scope?: ClientConstraintScope;
  reason?: string | null;
  confidence?: number;
}

export interface ActiveClientConstraint {
  id: string;
  title: string;
  content: string;
  scope: ClientConstraintScope;
  terms: string[];
  replacement: string | null;
  reason: string | null;
  confidence: number;
  sourceEntryId: string | null;
  createdAt: string;
}

export interface ConstraintViolation {
  constraintId: string;
  title: string;
  term: string;
}

function cleanTerm(term: string): string | null {
  const normalized = term.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2) return null;
  return normalized;
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = cleanTerm(raw);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.slice(0, 20);
}

function stripTermNoise(raw: string): string | null {
  const cleaned = raw
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(anymore|any more|again|for us|for them|publicly|in content|in scripts)\b/gi, '')
    .replace(/[.!?;:]+$/g, '')
    .trim();

  const withoutLeading = cleaned.replace(/^(a|an|the|that|this|those|these|any|our|their)\s+/i, '').trim();
  if (!withoutLeading || /^(it|that|this|those|these)$/i.test(withoutLeading)) return null;
  if (withoutLeading.length < 3) return null;
  return withoutLeading;
}

function deriveForbiddenTerms(statement: string): string[] {
  const terms: string[] = [];
  const patterns = [
    /\b(?:do not|don't|does not|doesn't|no longer|not)\s+(?:offer|provide|do|sell|support|service|handle|promote|recommend|position around)\s+([^.,;:\n]+)/gi,
    /\b(?:do not|don't|does not|doesn't|never)\s+(?:mention|say|use|claim|call it|call them|refer to it as|refer to them as)\s+([^.,;:\n]+)/gi,
    /\b(?:avoid|stop)\s+(?:using|mentioning|saying|claiming|recommending|promoting)?\s*([^.,;:\n]+)/gi,
    /\b(?:not|isn't|is not|are not|aren't)\s+(?:our|their)?\s*(?:audience|customer|service|offer|cta|claim|positioning|language)\s*:?\s*([^.,;:\n]+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of statement.matchAll(pattern)) {
      const term = stripTermNoise(match[1] ?? '');
      if (term) terms.push(term);
    }
  }

  for (const quoted of statement.matchAll(/["'`]([^"'`]{3,80})["'`]/g)) {
    const term = stripTermNoise(quoted[1] ?? '');
    if (term) terms.push(term);
  }

  return uniqueTerms(terms);
}

function metadataForConstraint(
  constraint: ExtractedClientConstraint,
  meetingEntryId?: string,
): Record<string, unknown> {
  const terms = uniqueTerms([
    ...(constraint.forbidden_terms ?? []),
    ...deriveForbiddenTerms(constraint.statement ?? ''),
  ]);

  return {
    category: 'hard_constraint',
    slot: `client_constraint.${constraint.scope ?? 'other'}`,
    polarity: 'forbidden',
    scope: constraint.scope ?? 'other',
    terms,
    replacement: constraint.replacement ?? null,
    reason: constraint.reason ?? null,
    confidence: constraint.confidence ?? 0.85,
    source_meeting_id: meetingEntryId ?? null,
  };
}

export async function persistClientConstraintsFromMeeting(
  clientId: string,
  meetingEntryId: string,
  constraints: ExtractedClientConstraint[],
  createdBy: string | null,
): Promise<string[]> {
  const createdIds: string[] = [];

  for (const constraint of constraints) {
    const entry = await createClientConstraint(clientId, constraint, {
      createdBy,
      sourceEntryId: meetingEntryId,
      source: 'imported',
    });
    if (entry) createdIds.push(entry.id);
  }

  return createdIds;
}

export async function createClientConstraint(
  clientId: string,
  constraint: ExtractedClientConstraint,
  options: {
    createdBy: string | null;
    sourceEntryId?: string | null;
    source?: 'manual' | 'scraped' | 'generated' | 'imported';
  },
): Promise<KnowledgeEntry | null> {
  const statement = constraint.statement?.trim();
  if (!statement || (constraint.confidence ?? 0.85) < 0.65) return null;

  const scope = constraint.scope ?? 'other';
  const title =
    statement.length > 96
      ? `Do not use: ${statement.slice(0, 84).trim()}...`
      : `Do not use: ${statement}`;

  const terms = uniqueTerms([
    ...(constraint.forbidden_terms ?? []),
    ...deriveForbiddenTerms(statement),
  ]);
  const replacement = constraint.replacement?.trim();
  const reason = constraint.reason?.trim();
  const contentParts = [
    statement,
    terms.length > 0 ? `Forbidden terms or ideas: ${terms.join(', ')}` : '',
    replacement ? `Preferred replacement: ${replacement}` : '',
    reason ? `Reason: ${reason}` : '',
  ].filter(Boolean);

  const entry = await createKnowledgeEntry(
    {
      client_id: clientId,
      type: 'guideline',
      title,
      content: contentParts.join('\n\n'),
      metadata: metadataForConstraint(
        { ...constraint, forbidden_terms: terms, scope },
        options.sourceEntryId ?? undefined,
      ),
      source: options.source ?? 'generated',
      created_by: options.createdBy,
    },
    { skipTemporalEnrichment: false },
  );

  if (options.sourceEntryId) {
    await createKnowledgeLink({
      client_id: clientId,
      source_id: options.sourceEntryId,
      source_type: 'entry',
      target_id: entry.id,
      target_type: 'entry',
      label: 'produced',
    });
  }

  return entry;
}

export async function getActiveClientConstraints(
  admin: AdminClient,
  clientId: string,
  options: { limit?: number } = {},
): Promise<ActiveClientConstraint[]> {
  const { data, error } = await admin
    .from('client_knowledge_entries')
    .select('id, title, content, metadata, valid_until, superseded_by, created_at')
    .eq('client_id', clientId)
    .eq('type', 'guideline')
    .eq('metadata->>category', 'hard_constraint')
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 40);

  if (error) {
    console.error('[client-constraints] failed to load constraints:', error.message);
    return [];
  }

  const now = Date.now();
  return ((data ?? []) as Array<Pick<KnowledgeEntry, 'id' | 'title' | 'content' | 'metadata' | 'valid_until' | 'superseded_by' | 'created_at'>>)
    .filter((row) => !row.valid_until || new Date(row.valid_until).getTime() > now)
    .map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const rawTerms = Array.isArray(meta.terms) ? meta.terms : [];
      const terms = uniqueTerms([
        ...rawTerms.filter((t): t is string => typeof t === 'string'),
        ...deriveForbiddenTerms(row.content),
      ]);
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        scope: (typeof meta.scope === 'string' ? meta.scope : 'other') as ClientConstraintScope,
        terms,
        replacement: typeof meta.replacement === 'string' ? meta.replacement : null,
        reason: typeof meta.reason === 'string' ? meta.reason : null,
        confidence: typeof meta.confidence === 'number' ? meta.confidence : 0.85,
        sourceEntryId: typeof meta.source_meeting_id === 'string' ? meta.source_meeting_id : null,
        createdAt: row.created_at,
      };
    });
}

export function formatClientConstraintsForPrompt(constraints: ActiveClientConstraint[]): string {
  if (constraints.length === 0) return '';

  const lines = constraints.slice(0, 24).map((constraint) => {
    const pieces = [`- ${constraint.content.replace(/\s+/g, ' ').trim()}`];
    if (constraint.terms.length > 0) pieces.push(`Forbidden terms/ideas: ${constraint.terms.join(', ')}`);
    if (constraint.replacement) pieces.push(`Use instead: ${constraint.replacement}`);
    return pieces.join(' ');
  });

  return `<hard_client_constraints>
These are active client corrections. They override trends, script ideas, brand assumptions, and generic best practices.
Never recommend, script, or position the client around the forbidden items below unless the user explicitly asks for historical context.
${lines.join('\n')}
</hard_client_constraints>`;
}

function includesForbiddenTerm(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  if (needle.length <= 2) return false;

  if (/\s/.test(needle)) return haystack.includes(needle);

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export function findConstraintViolations(
  text: string,
  constraints: ActiveClientConstraint[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const seen = new Set<string>();

  for (const constraint of constraints) {
    for (const term of constraint.terms) {
      if (!includesForbiddenTerm(text, term)) continue;
      const key = `${constraint.id}:${term.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        constraintId: constraint.id,
        title: constraint.title,
        term,
      });
    }
  }

  return violations;
}
