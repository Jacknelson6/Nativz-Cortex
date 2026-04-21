import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 10;

/**
 * Find potential duplicate contacts. The email column has a lowercase-unique
 * index so true dupes shouldn't exist — this scans for near-duplicates by
 * normalizing the local part (stripping +tags, dots for Gmail) and by
 * matching contacts that share the same full_name.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('email_contacts')
    .select('id, email, full_name, company, created_at');
  if (error) {
    console.warn('[email-hub/contacts/duplicates] load failed:', error);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }

  const byCanonical = new Map<string, typeof rows>();
  const byName = new Map<string, typeof rows>();

  for (const row of rows ?? []) {
    const [local, domain] = row.email.split('@');
    if (local && domain) {
      const canonicalLocal = domain.toLowerCase().includes('gmail')
        ? local.split('+')[0].replace(/\./g, '').toLowerCase()
        : local.split('+')[0].toLowerCase();
      const key = `${canonicalLocal}@${domain.toLowerCase()}`;
      const bucket = byCanonical.get(key) ?? [];
      bucket.push(row);
      byCanonical.set(key, bucket);
    }
    if (row.full_name && row.full_name.trim().length > 2) {
      const nameKey = row.full_name.trim().toLowerCase();
      const bucket = byName.get(nameKey) ?? [];
      bucket.push(row);
      byName.set(nameKey, bucket);
    }
  }

  const emailGroups = Array.from(byCanonical.values()).filter((group) => group.length > 1);
  const nameGroups = Array.from(byName.values()).filter((group) => group.length > 1);

  return NextResponse.json({
    emailDuplicates: emailGroups,
    nameDuplicates: nameGroups,
  });
}
