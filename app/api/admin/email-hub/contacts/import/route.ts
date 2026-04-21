import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

/**
 * Minimal CSV parser that handles quoted fields, escaped quotes, and \r\n.
 * Good enough for pasted Google Sheets / Notion exports — not a full RFC 4180
 * implementation. If a field contains newlines the row must be quoted.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim().length > 0)) rows.push(row);
  }
  return rows;
}

type FieldKey =
  | 'email'
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'title'
  | 'company'
  | 'role'
  | 'notes'
  | 'tags';

function normalizeHeader(h: string): FieldKey | null {
  const key = h.toLowerCase().trim().replace(/\s+/g, '_');
  if (['email', 'email_address', 'e-mail'].includes(key)) return 'email';
  if (['name', 'full_name', 'contact_name'].includes(key)) return 'full_name';
  if (['first_name', 'firstname', 'given_name'].includes(key)) return 'first_name';
  if (['last_name', 'lastname', 'family_name', 'surname'].includes(key)) return 'last_name';
  if (['title', 'job_title', 'position'].includes(key)) return 'title';
  if (['company', 'organization', 'org'].includes(key)) return 'company';
  if (['role', 'persona'].includes(key)) return 'role';
  if (['notes', 'note'].includes(key)) return 'notes';
  if (['tags', 'labels'].includes(key)) return 'tags';
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const csvText = typeof body?.csv === 'string' ? (body.csv as string) : null;
  if (!csvText) {
    return NextResponse.json({ error: 'Missing csv field' }, { status: 400 });
  }

  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) {
    return NextResponse.json(
      { error: 'CSV must include a header row and at least one data row' },
      { status: 400 },
    );
  }

  const header = rows[0].map((h) => normalizeHeader(h));
  const emailCol = header.indexOf('email');
  if (emailCol === -1) {
    return NextResponse.json(
      { error: 'CSV must include an "email" column' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from('email_contacts')
    .select('id, email');
  const existingMap = new Map(
    (existingRows ?? []).map((r) => [r.email.toLowerCase(), r.id] as const),
  );

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
  let skipped = 0;
  const errors: { line: number; reason: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawEmail = row[emailCol]?.trim() ?? '';
    if (!rawEmail) {
      skipped += 1;
      continue;
    }
    const email = rawEmail.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ line: i + 1, reason: `Invalid email: ${rawEmail}` });
      continue;
    }

    const record: Record<string, unknown> = { email };
    header.forEach((key, colIdx) => {
      if (!key || key === 'email') return;
      const raw = row[colIdx]?.trim() ?? '';
      if (!raw) return;
      if (key === 'tags') {
        record.tags = raw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
      } else {
        record[key] = raw;
      }
    });

    if (!record.full_name && (record.first_name || record.last_name)) {
      record.full_name = [record.first_name, record.last_name].filter(Boolean).join(' ');
    }

    const existingId = existingMap.get(email);
    if (existingId) {
      toUpdate.push({
        id: existingId,
        patch: { ...record, updated_at: new Date().toISOString() },
      });
    } else {
      toInsert.push({ ...record, created_by: auth.user.id });
    }
  }

  let inserted = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const { error } = await admin.from('email_contacts').insert(toInsert);
    if (error) {
      console.warn('[email-hub/contacts/import] insert failed:', error);
      return NextResponse.json({ error: 'Failed to import contacts' }, { status: 500 });
    }
    inserted = toInsert.length;
  }
  for (const u of toUpdate) {
    const { error } = await admin.from('email_contacts').update(u.patch).eq('id', u.id);
    if (!error) updated += 1;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    skipped,
    errors: errors.slice(0, 10),
    errorCount: errors.length,
  });
}
