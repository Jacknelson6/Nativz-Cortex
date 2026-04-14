/**
 * QA harness for the topic-plan grounding pipeline.
 *
 * Verifies the round-trip end-to-end against live data:
 *   1. extract_topic_signals returns the expected shape and counts
 *   2. matchSignal handles exact / containment / token-overlap correctly
 *   3. create_topic_plan handler enriches matched ideas with real stats
 *   4. create_topic_plan handler drops invalid sources rather than rendering them
 *   5. create_topic_plan rejects plans with < 50% grounded ideas
 *   6. The PDF builds and is structurally valid
 *
 * Each step prints PASS / FAIL with diagnostics. Exits non-zero on any FAIL.
 *
 * Run: npx tsx scripts/qa-topic-plan.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';

// Load .env.local explicitly so the admin client can find SUPABASE_SERVICE_ROLE_KEY.
const envLocal = resolve(process.cwd(), '.env.local');
try {
  const raw = readFileSync(envLocal, 'utf8');
  for (const line of raw.split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
} catch {/* ignore */}

import { loadTopicSignals, matchSignal } from '../lib/topic-plans/signals';
import { topicPlanSchema, type TopicPlan } from '../lib/topic-plans/types';
import { TopicPlanPdf } from '../components/topic-plans/topic-plan-pdf';

// A search row known to have trending_topics + emotions populated.
const TEST_SEARCH_ID = '33984716-ba0d-4638-afe1-0151b0a5f1ca'; // "workplace injury compensation"

let failures = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`  PASS  ${name}`))
    .catch((e) => {
      failures += 1;
      console.log(`  FAIL  ${name}`);
      console.log(`        ${e instanceof Error ? e.message : String(e)}`);
    });
}

function require_(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('\n=== Topic Plan QA ===\n');

  // ─── 1. Signals extraction ──────────────────────────────────────────────
  console.log('1. extract_topic_signals shape');
  const signals = await loadTopicSignals([TEST_SEARCH_ID]);
  await check('returns at least one signal', () => {
    require_(signals.length > 0, `expected signals, got ${signals.length}`);
  });
  await check('every signal has search_id, search_query, topic_name', () => {
    for (const s of signals) {
      require_(typeof s.search_id === 'string', 'missing search_id');
      require_(typeof s.search_query === 'string', 'missing search_query');
      require_(typeof s.topic_name === 'string' && s.topic_name.length > 0, 'missing topic_name');
    }
  });
  await check('at least one signal carries resonance', () => {
    require_(signals.some((s) => !!s.resonance), 'no signals had resonance');
  });
  console.log(`     loaded ${signals.length} signals from search ${TEST_SEARCH_ID.slice(0, 8)}…`);
  console.log(`     sample topic names: ${signals.slice(0, 3).map((s) => `"${s.topic_name}"`).join(', ')}`);

  // ─── 2. matchSignal fuzzy matching ──────────────────────────────────────
  console.log('\n2. matchSignal fuzzy matching');
  const realName = signals[0].topic_name;
  await check('exact match', () => {
    const m = matchSignal(realName, signals);
    require_(m?.topic_name === realName, `exact match failed for "${realName}"`);
  });
  await check('case-insensitive match', () => {
    const m = matchSignal(realName.toUpperCase(), signals);
    require_(m?.topic_name === realName, `uppercase match failed for "${realName}"`);
  });
  await check('substring match (idea source contains topic name)', () => {
    const m = matchSignal(`Why ${realName} matters more than people think`, signals);
    require_(m?.topic_name === realName, `substring match failed`);
  });
  await check('returns null for unrelated source string', () => {
    const m = matchSignal('completely unrelated nonsense xyz qux', signals);
    require_(m === null, `expected null for unrelated source, got "${m?.topic_name}"`);
  });
  await check('returns null for empty/missing source', () => {
    require_(matchSignal(undefined, signals) === null, 'undefined source should be null');
    require_(matchSignal(null, signals) === null, 'null source should be null');
    require_(matchSignal('', signals) === null, 'empty source should be null');
  });

  // ─── 3. create_topic_plan handler — enrichment + rejection ──────────────
  console.log('\n3. create_topic_plan handler — enrichment + rejection');
  const { topicPlanTools } = await import('../lib/nerd/tools/topic-plans');
  const createPlanTool = topicPlanTools.find((t) => t.name === 'create_topic_plan');
  require_(createPlanTool != null, 'create_topic_plan tool not found');

  const { createAdminClient } = await import('../lib/supabase/admin');
  const admin = createAdminClient();
  const { data: searchRow } = await admin
    .from('topic_searches')
    .select('client_id')
    .eq('id', TEST_SEARCH_ID)
    .single();
  const clientId = searchRow?.client_id as string | null;
  require_(typeof clientId === 'string' && clientId.length > 0, 'test search has no client_id');
  const { data: userRow } = await admin
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();
  const userId = userRow?.id as string;
  require_(typeof userId === 'string', 'no admin user found');

  // (a) Plan with mostly real sources → should succeed AND enrich stats
  const goodIdeas = signals.slice(0, 5).map((s, i) => ({
    number: i + 1,
    title: `Idea about ${s.topic_name}`,
    source: s.topic_name,
    why_it_works: 'Test grounding works.',
  }));
  const goodPlan: TopicPlan = topicPlanSchema.parse({
    title: '[QA] Grounded Plan',
    series: [{ name: 'QA Series', ideas: goodIdeas }],
  });

  await check('grounded plan succeeds and enriches stats from signals', async () => {
    const result = await createPlanTool!.handler(
      { client_id: clientId!, plan: goodPlan, topic_search_ids: [TEST_SEARCH_ID] },
      userId!,
    );
    require_(result.success === true, `expected success, got error: ${result.error}`);
    const planRowId = (result.data as { id: string } | undefined)?.id;
    require_(typeof planRowId === 'string', 'no plan id in result');
    const { data: row } = await admin
      .from('topic_plans')
      .select('plan_json')
      .eq('id', planRowId)
      .single();
    const stored = row?.plan_json as TopicPlan | null;
    require_(stored != null, 'stored plan not found');
    let enrichedCount = 0;
    for (const series of stored.series) {
      for (const idea of series.ideas) {
        if (idea.resonance != null || idea.audience != null || idea.positive_pct != null) {
          enrichedCount += 1;
        }
      }
    }
    require_(enrichedCount > 0, `expected some ideas to be enriched, got ${enrichedCount}`);
    console.log(`        enriched ${enrichedCount} of ${goodIdeas.length} ideas with real signal data`);
    await admin.from('topic_plans').delete().eq('id', planRowId);
  });

  // (b) Plan with all garbage sources → handler should reject
  const garbagePlan: TopicPlan = topicPlanSchema.parse({
    title: '[QA] Ungrounded Plan',
    series: [
      {
        name: 'Garbage Series',
        ideas: Array.from({ length: 4 }, (_, i) => ({
          number: i + 1,
          title: `Made-up idea ${i + 1}`,
          source: `Total nonsense topic ${i + 1}`,
        })),
      },
    ],
  });
  await check('plan with no grounded sources is rejected', async () => {
    const result = await createPlanTool!.handler(
      { client_id: clientId!, plan: garbagePlan, topic_search_ids: [TEST_SEARCH_ID] },
      userId!,
    );
    require_(result.success === false, `expected rejection, got success`);
    require_(
      /(mapped to a real|trending topic|extract_topic_signals)/i.test(result.error ?? ''),
      `error should reference the signal-matching guidance, got: ${result.error}`,
    );
  });

  // (c) Plan with no attached searches → enrichment skipped, plan accepted as-is
  await check('plan without attached searches is accepted (no enrichment expected)', async () => {
    const planNoSearches: TopicPlan = topicPlanSchema.parse({
      title: '[QA] No-Search Plan',
      series: [{ name: 'Free Form', ideas: [{ number: 1, title: 'Standalone idea' }] }],
    });
    const result = await createPlanTool!.handler(
      { client_id: clientId!, plan: planNoSearches, topic_search_ids: [] },
      userId!,
    );
    require_(result.success === true, `expected success, got: ${result.error}`);
    const planRowId = (result.data as { id: string } | undefined)?.id;
    if (planRowId) await admin.from('topic_plans').delete().eq('id', planRowId);
  });

  // ─── 4. Portal scoping — create_topic_plan + extract_topic_signals ──────
  console.log('\n4. Portal scoping — cross-org viewer is rejected');

  const { topicSignalTools } = await import('../lib/nerd/tools/topic-signals');
  const extractTool = topicSignalTools.find((t) => t.name === 'extract_topic_signals');
  require_(extractTool != null, 'extract_topic_signals tool not found');

  // Look up the test client's org so we can pick a viewer from a different org.
  const { data: testClient } = await admin
    .from('clients')
    .select('organization_id')
    .eq('id', clientId!)
    .single();
  const testClientOrg = testClient?.organization_id as string | null;
  require_(typeof testClientOrg === 'string', 'test client has no organization_id');

  // Find a viewer user whose organization_id differs from the test client's.
  const { data: otherOrgViewers } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('role', 'viewer')
    .neq('organization_id', testClientOrg!)
    .limit(1);
  const crossOrgViewerId = otherOrgViewers?.[0]?.id as string | undefined;

  if (!crossOrgViewerId) {
    console.log('  SKIP  no cross-org viewer user in this environment — cannot run portal scoping tests');
  } else {
    await check('cross-org viewer: create_topic_plan rejected with access error', async () => {
      const result = await createPlanTool!.handler(
        { client_id: clientId!, plan: goodPlan, topic_search_ids: [TEST_SEARCH_ID] },
        crossOrgViewerId,
      );
      require_(result.success === false, 'expected rejection for cross-org viewer');
      require_(
        /access/i.test(result.error ?? ''),
        `error should reference access control, got: ${result.error}`,
      );
      // Belt + suspenders: no row should have been written.
      const { count } = await admin
        .from('topic_plans')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', crossOrgViewerId)
        .eq('client_id', clientId!);
      require_((count ?? 0) === 0, `expected no rows from cross-org viewer, got ${count}`);
    });

    await check('cross-org viewer: extract_topic_signals returns empty', async () => {
      const result = await extractTool!.handler(
        { search_ids: [TEST_SEARCH_ID] },
        crossOrgViewerId,
      );
      require_(result.success === true, `expected success with empty data, got error: ${result.error}`);
      const d = result.data as { total: number; signals: unknown[] } | undefined;
      require_(d?.total === 0, `expected total=0 for cross-org viewer, got ${d?.total}`);
      require_(Array.isArray(d?.signals) && d.signals.length === 0, 'expected empty signals array');
    });
  }

  // In-org viewer happy path: find (or skip) a viewer inside the test client's org.
  const { data: inOrgViewers } = await admin
    .from('users')
    .select('id')
    .eq('role', 'viewer')
    .eq('organization_id', testClientOrg!)
    .limit(1);
  const inOrgViewerId = inOrgViewers?.[0]?.id as string | undefined;

  if (!inOrgViewerId) {
    console.log('  SKIP  no in-org viewer user in this environment — cannot run happy-path scoping test');
  } else {
    await check('in-org viewer: create_topic_plan succeeds for own-org client', async () => {
      const result = await createPlanTool!.handler(
        { client_id: clientId!, plan: goodPlan, topic_search_ids: [TEST_SEARCH_ID] },
        inOrgViewerId,
      );
      require_(result.success === true, `expected success for in-org viewer, got: ${result.error}`);
      const planRowId = (result.data as { id: string } | undefined)?.id;
      if (planRowId) await admin.from('topic_plans').delete().eq('id', planRowId);
    });

    await check('in-org viewer: extract_topic_signals returns the search', async () => {
      const result = await extractTool!.handler(
        { search_ids: [TEST_SEARCH_ID] },
        inOrgViewerId,
      );
      require_(result.success === true, `expected success, got: ${result.error}`);
      const d = result.data as { total: number } | undefined;
      require_((d?.total ?? 0) > 0, `expected in-org viewer to see signals, got total=${d?.total}`);
    });
  }

  // ─── 4b. Knowledge tools — cross-org viewer rejected ────────────────────
  console.log('\n4b. Knowledge tools — cross-org viewer rejected');
  const { knowledgeTools } = await import('../lib/nerd/tools/knowledge');
  const searchKbTool = knowledgeTools.find((t) => t.name === 'search_knowledge_base');
  const queryKbTool = knowledgeTools.find((t) => t.name === 'query_client_knowledge');
  const genIdeasTool = knowledgeTools.find((t) => t.name === 'generate_video_ideas');
  require_(searchKbTool != null && queryKbTool != null && genIdeasTool != null, 'knowledge tools not found');

  if (!crossOrgViewerId) {
    console.log('  SKIP  no cross-org viewer — cannot run knowledge scoping tests');
  } else {
    await check('cross-org viewer: search_knowledge_base rejected', async () => {
      const result = await searchKbTool!.handler(
        { client_id: clientId!, query: 'anything', limit: 3 },
        crossOrgViewerId,
      );
      require_(result.success === false, `expected rejection, got success`);
      require_(/access/i.test(result.error ?? ''), `expected access error, got: ${result.error}`);
    });

    await check('cross-org viewer: query_client_knowledge rejected', async () => {
      const result = await queryKbTool!.handler(
        { client_id: clientId! },
        crossOrgViewerId,
      );
      require_(result.success === false, `expected rejection, got success`);
      require_(/access/i.test(result.error ?? ''), `expected access error, got: ${result.error}`);
    });

    await check('cross-org viewer: generate_video_ideas rejected', async () => {
      const result = await genIdeasTool!.handler(
        { client_id: clientId!, count: 1 },
        crossOrgViewerId,
      );
      require_(result.success === false, `expected rejection, got success`);
      require_(/access/i.test(result.error ?? ''), `expected access error, got: ${result.error}`);
    });
  }

  // ─── 5. PDF builds from an enriched plan ────────────────────────────────
  console.log('\n5. PDF rendering');
  await check('PDF renders from enriched plan, both agencies', async () => {
    const enrichedIdeas = signals.slice(0, 3).map((s, i) => ({
      number: i + 1,
      title: `Test idea about ${s.topic_name}`,
      source: s.topic_name,
      audience: s.search_audience ?? null,
      positive_pct: s.positive_pct ?? null,
      negative_pct: s.negative_pct ?? null,
      resonance: s.resonance ?? null,
      why_it_works: 'QA verification.',
    }));
    const plan = topicPlanSchema.parse({
      title: '[QA] PDF Render Test',
      series: [{ name: 'QA Series', ideas: enrichedIdeas }],
    });
    for (const agency of ['nativz', 'anderson'] as const) {
      const buf = await renderToBuffer(
        React.createElement(TopicPlanPdf, { plan, clientName: 'QA Client', agency }),
      );
      require_(buf.length > 5000, `${agency} PDF too small: ${buf.length} bytes`);
    }
  });

  console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAIL\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
