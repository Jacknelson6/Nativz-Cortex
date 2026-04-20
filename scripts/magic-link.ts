// One-off: mint a magic link for local QA. Service-role client, admin API.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Minimal .env.local loader — avoids pulling dotenv as a dep.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const email = process.argv[2] || 'jack@nativz.io';
const redirect = process.argv[3] || 'http://localhost:3001/admin/analytics';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supa.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: redirect },
  });
  if (error) {
    console.error('ERR', error);
    process.exit(1);
  }
  console.log(data.properties?.action_link ?? data);
}
main();
