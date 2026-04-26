import { createAdminClient } from '@/lib/supabase/admin';
import { downloadFile, extractFolderId, listFiles } from '@/lib/google/drive';
import { extractAdPrompt } from '@/lib/ad-creatives/extract-prompt';
import type { BrandContext } from '@/lib/knowledge/brand-context';

export const DEFAULT_REFERENCE_ADS_DRIVE_URL =
  'https://drive.google.com/drive/folders/1QNJjbvjWfQGy_DsEppJBAApAt7mp3Abk';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_SYNC_LIMIT = 300;

export interface ReferenceAd {
  id: string;
  source_file_name: string;
  source_folder_name: string | null;
  source_url: string;
  image_url: string | null;
  category: string | null;
  tags: string[] | null;
  prompt_schema: Record<string, unknown>;
  analysis: Record<string, unknown>;
  performance_notes: string | null;
}

interface SyncOptions {
  userId: string;
  driveUrl?: string;
  limit?: number;
  analyze?: boolean;
}

interface DriveImageCandidate {
  fileId: string;
  fileName: string;
  mimeType: string;
  size?: string;
  url: string;
  folderId: string;
  folderName: string;
}

function normalizeCategory(folderName: string): string {
  return folderName
    .replace(/\s+\d+$/g, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tagsForCandidate(candidate: DriveImageCandidate): string[] {
  const tags = new Set<string>();
  tags.add(normalizeCategory(candidate.folderName));
  for (const part of candidate.fileName.toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length > 2 && part !== 'png' && part !== 'jpg' && part !== 'jpeg' && part !== 'webp') {
      tags.add(part);
    }
  }
  return Array.from(tags).slice(0, 12);
}

async function listReferenceCandidates(
  userId: string,
  rootFolderId: string,
  limit: number,
): Promise<DriveImageCandidate[]> {
  const root = await listFiles(userId, { folderId: rootFolderId, pageSize: 100 });
  const folders = root.files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
  const out: DriveImageCandidate[] = [];

  for (const folder of folders) {
    if (out.length >= limit) break;
    let pageToken: string | undefined;
    do {
      const page = await listFiles(userId, {
        folderId: folder.id,
        pageSize: Math.min(100, limit - out.length),
        pageToken,
      });
      for (const file of page.files) {
        if (out.length >= limit) break;
        if (!IMAGE_MIME_TYPES.has(file.mimeType)) continue;
        out.push({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          size: file.size,
          url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
          folderId: folder.id,
          folderName: folder.name,
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken && out.length < limit);
  }

  return out;
}

export async function syncReferenceAdsFromDrive(options: SyncOptions): Promise<{
  scanned: number;
  imported: number;
  updated: number;
  failed: Array<{ fileId: string; name: string; error: string }>;
}> {
  const driveUrl =
    options.driveUrl?.trim() ||
    process.env.AD_REFERENCE_DRIVE_FOLDER_URL?.trim() ||
    DEFAULT_REFERENCE_ADS_DRIVE_URL;
  const rootFolderId = extractFolderId(driveUrl);
  if (!rootFolderId) throw new Error('Could not extract Drive folder ID for reference ads');

  const admin = createAdminClient();
  const limit = options.limit ?? Number(process.env.AD_REFERENCE_SYNC_LIMIT ?? DEFAULT_SYNC_LIMIT);
  const candidates = await listReferenceCandidates(options.userId, rootFolderId, limit);
  const failed: Array<{ fileId: string; name: string; error: string }> = [];
  let imported = 0;
  let updated = 0;

  for (const candidate of candidates) {
    try {
      const { data: existing } = await admin
        .from('ad_reference_ads')
        .select('id, storage_path, image_url, prompt_schema')
        .eq('source', 'google_drive')
        .eq('source_file_id', candidate.fileId)
        .maybeSingle();

      let imageUrl = (existing?.image_url as string | null | undefined) ?? null;
      let storagePath = (existing?.storage_path as string | null | undefined) ?? null;
      let byteSize = candidate.size ? Number(candidate.size) : null;

      if (!imageUrl || !storagePath) {
        const downloaded = await downloadFile(options.userId, candidate.fileId);
        byteSize = downloaded.size;
        const ext =
          downloaded.mimeType.includes('jpeg') ? 'jpg' :
          downloaded.mimeType.includes('webp') ? 'webp' :
          'png';
        storagePath = `reference-ads/${candidate.fileId}.${ext}`;
        const { error: uploadError } = await admin.storage
          .from('ad-creatives')
          .upload(storagePath, downloaded.buffer, {
            contentType: downloaded.mimeType,
            upsert: true,
          });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicUrl } = admin.storage.from('ad-creatives').getPublicUrl(storagePath);
        imageUrl = publicUrl.publicUrl;
      }

      let promptSchema = (existing?.prompt_schema as Record<string, unknown> | null) ?? {};
      if (options.analyze !== false && imageUrl && Object.keys(promptSchema).length === 0) {
        promptSchema = await extractAdPrompt(imageUrl) as unknown as Record<string, unknown>;
      }

      const row = {
        source: 'google_drive',
        source_folder_id: candidate.folderId,
        source_folder_name: candidate.folderName,
        source_file_id: candidate.fileId,
        source_file_name: candidate.fileName,
        source_url: candidate.url,
        image_url: imageUrl,
        storage_path: storagePath,
        mime_type: candidate.mimeType,
        byte_size: byteSize,
        category: normalizeCategory(candidate.folderName),
        tags: tagsForCandidate(candidate),
        prompt_schema: promptSchema,
        analysis: {
          folder: candidate.folderName,
          proven_reference: true,
          synced_from_root_folder_id: rootFolderId,
        },
        is_active: true,
        synced_at: new Date().toISOString(),
      };

      const { error } = await admin
        .from('ad_reference_ads')
        .upsert(row, { onConflict: 'source,source_file_id' });
      if (error) throw new Error(error.message);

      if (existing) updated++;
      else imported++;
    } catch (err) {
      failed.push({
        fileId: candidate.fileId,
        name: candidate.fileName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scanned: candidates.length, imported, updated, failed };
}

function textScore(haystack: string, needles: string[]): number {
  let score = 0;
  for (const n of needles) {
    const needle = n.trim().toLowerCase();
    if (needle.length < 3) continue;
    if (haystack.includes(needle)) score += 3;
  }
  return score;
}

function industryHints(ctx: BrandContext): string[] {
  const raw = [
    ctx.clientIndustry,
    ctx.clientName,
    ctx.audience.summary ?? '',
    ctx.positioning ?? '',
    ...ctx.products.slice(0, 8).flatMap((p) => [p.name, p.description ?? '', p.offeringType ?? '']),
  ].join(' ');
  const lower = raw.toLowerCase();
  const hints = new Set<string>();
  if (/health|beauty|wellness|skin|med|clinic|fitness/.test(lower)) hints.add('health_and_beauty');
  if (/fashion|apparel|clothing|style|wear/.test(lower)) hints.add('fashion');
  if (/software|saas|course|digital|app|platform|online/.test(lower)) hints.add('digital_products');
  if (/sale|holiday|black friday|cyber|promo|discount/.test(lower)) hints.add('bfcm');
  hints.add('general');
  return Array.from(hints);
}

export async function selectReferenceAdsForBrand(
  brandContext: BrandContext,
  count = 20,
): Promise<ReferenceAd[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_reference_ads')
    .select('id, source_file_name, source_folder_name, source_url, image_url, category, tags, prompt_schema, analysis, performance_notes')
    .eq('is_active', true)
    .limit(500);
  if (error) throw new Error(`Failed to load reference ads: ${error.message}`);

  const rows = (data ?? []) as ReferenceAd[];
  if (rows.length === 0) return [];

  const hints = industryHints(brandContext);
  const brandNeedles = [
    brandContext.clientIndustry,
    brandContext.audience.summary ?? '',
    brandContext.positioning ?? '',
    ...brandContext.products.slice(0, 8).map((p) => `${p.name} ${p.description ?? ''}`),
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4)
    .slice(0, 80);

  return rows
    .map((row) => {
      const haystack = [
        row.category ?? '',
        row.source_folder_name ?? '',
        row.source_file_name,
        ...(row.tags ?? []),
        JSON.stringify(row.prompt_schema ?? {}),
        JSON.stringify(row.analysis ?? {}),
      ].join(' ').toLowerCase();
      const categoryScore = hints.some((h) => haystack.includes(h)) ? 20 : 0;
      const lexical = textScore(haystack, brandNeedles);
      return { row, score: categoryScore + lexical + Math.random() * 0.01 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.row);
}

export function formatReferenceAdsForPrompt(referenceAds: ReferenceAd[]): string {
  if (referenceAds.length === 0) {
    return '(Reference library has not been synced yet. Use built-in direct-response patterns, but mark source_grounding from Brand DNA only.)';
  }
  return referenceAds
    .map((ad, index) => {
      const schema = JSON.stringify(ad.prompt_schema ?? {}).slice(0, 900);
      const tags = ad.tags?.length ? ` Tags: ${ad.tags.join(', ')}.` : '';
      return `${index + 1}. ${ad.source_folder_name ?? ad.category ?? 'Reference'} / ${ad.source_file_name}.${tags}\nReference ID: ${ad.id}\nReusable structure: ${schema}`;
    })
    .join('\n\n');
}
