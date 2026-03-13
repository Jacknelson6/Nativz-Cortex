import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually (no dotenv dependency)
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

async function main() {
  const { getServiceAccountGmailToken } = await import('../lib/google/service-account');

  console.log('ENV check:', process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? 'Key found' : 'Key missing');
  console.log('Requesting Gmail token via service account...');
  const token = await getServiceAccountGmailToken();
  console.log('Token obtained:', token.substring(0, 20) + '...');

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('from:notetaker@fyxer.com')}&maxResults=3`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('Gmail API error:', res.status, err);
    process.exit(1);
  }

  const data = await res.json() as { messages?: { id: string }[]; resultSizeEstimate?: number };
  console.log(`Found ${data.messages?.length ?? 0} Fyxer emails (estimate: ${data.resultSizeEstimate})`);
  if (data.messages) {
    for (const msg of data.messages) {
      console.log('  - Message ID:', msg.id);
    }
  }
  console.log('\nService account Gmail access is working!');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
