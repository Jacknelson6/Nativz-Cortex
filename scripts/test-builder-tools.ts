import { registerAllTools } from '@/lib/nerd/tools';
import { getToolsForAPI, getAllTools } from '@/lib/nerd/registry';

registerAllTools();

const ALLOWED = new Set([
  'list_proposal_services',
  'create_proposal_draft',
  'add_service_line',
  'update_service_line',
  'update_draft_signer',
  'set_draft_payment_model',
  'add_draft_block',
  'preview_draft',
  'commit_proposal_draft',
]);

const all = getAllTools();
const found = all.filter((t) => ALLOWED.has(t.name));
console.log(`Registered tools: ${all.length}`);
console.log(`Builder tools found: ${found.length}/${ALLOWED.size}`);
const missing = [...ALLOWED].filter((n) => !found.find((t) => t.name === n));
console.log(`Missing: ${missing.join(', ') || '(none)'}`);

const apiSchemas = getToolsForAPI().filter((t) => ALLOWED.has(t.function.name));
let allOk = true;
for (const t of apiSchemas) {
  const params = t.function.parameters as { type?: string; properties?: Record<string, unknown> };
  const ok = params.type === 'object' && !!params.properties;
  if (!ok) allOk = false;
  console.log(`  ${ok ? '✓' : '✗'} ${t.function.name} — type=${params.type}, ${Object.keys(params.properties ?? {}).length} props`);
  if (!ok) console.log('    schema:', JSON.stringify(params, null, 2).slice(0, 400));
}
console.log(allOk ? '\nALL SCHEMAS VALID ✓' : '\nSCHEMA ERRORS ✗');
