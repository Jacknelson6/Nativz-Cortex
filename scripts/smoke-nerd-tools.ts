/**
 * Smoke-test the two formerly-broken pieces of /api/nerd/chat:
 *   1. `getToolsForAPI()` — must emit `type: "object"` for every tool
 *   2. The route's token-field regex — must pick `max_completion_tokens`
 *      for `gpt-5.4-mini`
 *
 * Run: npx tsx scripts/smoke-nerd-tools.ts
 */
import { getAllTools, getToolsForAPI } from '@/lib/nerd/registry';
import { registerAllTools } from '@/lib/nerd/tools/index';

registerAllTools();

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

// 1. Tool schema
const all = getAllTools();
console.log(`Registered ${all.length} tools:`, all.map((t) => t.name).join(', '));
const api = getToolsForAPI();
for (const t of api) {
  const p = t.function.parameters as { type?: string; properties?: unknown };
  const ok = p.type === 'object';
  if (!ok) {
    console.error('  BAD schema for', t.function.name, JSON.stringify(p).slice(0, 200));
  }
  assert(ok, `tool "${t.function.name}" → parameters.type === "object"`);
}

// Spot-check list_tasks shape
const listTasks = api.find((t) => t.function.name === 'list_tasks');
console.log('\nlist_tasks JSON Schema:\n', JSON.stringify(listTasks?.function.parameters, null, 2));

// 2. Token field regex (mirrors route)
function tokenField(model: string) {
  const prefers =
    /^o\d/.test(model) || /^gpt-5/.test(model) || /^gpt-4\.1/.test(model);
  return prefers ? 'max_completion_tokens' : 'max_tokens';
}
assert(
  tokenField('gpt-5.4-mini') === 'max_completion_tokens',
  'gpt-5.4-mini → max_completion_tokens',
);
assert(
  tokenField('gpt-4.1-mini') === 'max_completion_tokens',
  'gpt-4.1-mini → max_completion_tokens',
);
assert(tokenField('gpt-4o-mini') === 'max_tokens', 'gpt-4o-mini → max_tokens');
assert(tokenField('o1') === 'max_completion_tokens', 'o1 → max_completion_tokens');
