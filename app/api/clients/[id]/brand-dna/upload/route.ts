import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processUploadedFiles } from '@/lib/brand-dna/process-uploads';
import { validateFileSignature } from '@/lib/security/validate-file-type';
import { invalidateBrandContext } from '@/lib/knowledge/brand-context';

export const maxDuration = 60;

/**
 * POST /api/clients/[id]/brand-dna/upload
 *
 * Upload files (images, PDFs, docs, markdown) for Brand DNA enrichment.
 * Files are stored in Supabase Storage and created as knowledge entries.
 *
 * @auth Required (admin)
 * @body multipart/form-data with files
 * @returns {{ entryIds: string[], textContent: string }}
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify client exists
  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const formData = await req.formData();
  const fileEntries = formData.getAll('files');

  if (fileEntries.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  if (fileEntries.length > 40) {
    return NextResponse.json({ error: 'Maximum 40 files per upload' }, { status: 400 });
  }

  const ALLOWED_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp',
    'application/pdf',
    'text/plain', 'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB

  // Binary types that should be validated with magic bytes
  const MAGIC_BYTE_TYPES = [
    'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif',
    'application/pdf',
  ];

  const files: { name: string; type: string; buffer: Buffer }[] = [];

  for (const entry of fileEntries) {
    if (!(entry instanceof File)) continue;
    if (!ALLOWED_TYPES.has(entry.type) && !entry.name.endsWith('.md') && !entry.name.endsWith('.txt')) {
      continue; // Skip unsupported types silently
    }
    if (entry.size > MAX_SIZE) continue;

    const arrayBuffer = await entry.arrayBuffer();

    // Validate magic bytes for binary/image types (skip text and docx)
    const isTextFile = entry.type.startsWith('text/') || entry.name.endsWith('.md') || entry.name.endsWith('.txt');
    const isDocx = entry.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isTextFile && !isDocx) {
      const { valid } = validateFileSignature(arrayBuffer, MAGIC_BYTE_TYPES);
      if (!valid) continue; // Skip files with mismatched magic bytes
    }

    files.push({
      name: entry.name,
      type: entry.type,
      buffer: Buffer.from(arrayBuffer),
    });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No valid files found' }, { status: 400 });
  }

  const result = await processUploadedFiles(clientId, files);
  invalidateBrandContext(clientId);
  return NextResponse.json(result);
}
