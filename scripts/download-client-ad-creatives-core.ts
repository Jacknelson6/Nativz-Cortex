/**
 * Shared: download all `ad_creatives` images for a client to a local folder (used by CLI scripts).
 */
import { mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export function expandHomeDir(p: string): string {
  if (p.startsWith('~/')) return join(process.env.HOME ?? '', p.slice(2));
  return p;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = res.body;
  if (!body) throw new Error('No body');
  await pipeline(body, createWriteStream(destPath));
}

export async function downloadClientAdCreativesToFolder(
  admin: AdminClient,
  clientId: string,
  outDir: string,
): Promise<{ ok: number; total: number; outDir: string; clientName: string | null }> {
  const { data: client, error: cErr } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('id', clientId)
    .maybeSingle();
  if (cErr) throw new Error(`clients lookup: ${cErr.message}`);
  if (!client) throw new Error(`No client with id ${clientId}`);

  const { data: rows, error } = await admin
    .from('ad_creatives')
    .select('id, image_url, created_at, batch_id, template_source')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`ad_creatives: ${error.message}`);
  const list = rows ?? [];
  if (list.length === 0) {
    return { ok: 0, total: 0, outDir, clientName: client.name ?? null };
  }

  mkdirSync(outDir, { recursive: true });

  let ok = 0;
  for (let i = 0; i < list.length; i++) {
    const row = list[i] as {
      id: string;
      image_url: string;
      created_at: string;
      batch_id: string | null;
      template_source: string | null;
    };
    const url = row.image_url?.trim();
    if (!url) continue;
    let ext = '.png';
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      if (path.endsWith('.jpg') || path.endsWith('.jpeg')) ext = '.jpg';
      else if (path.endsWith('.webp')) ext = '.webp';
    } catch {
      /* default .png */
    }
    const safeSource = (row.template_source ?? 'unknown').replace(/[^a-z0-9_-]/gi, '_');
    const dest = join(outDir, `${String(i + 1).padStart(3, '0')}_${safeSource}_${row.id.slice(0, 8)}${ext}`);
    try {
      await downloadFile(url, dest);
      ok++;
    } catch (e) {
      console.error(`[download-client-creatives] failed ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return { ok, total: list.length, outDir, clientName: client.name ?? null };
}
