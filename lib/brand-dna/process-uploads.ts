import { createAdminClient } from '@/lib/supabase/admin';
import { createKnowledgeEntry } from '@/lib/knowledge/queries';

interface UploadedFile {
  name: string;
  type: string;
  buffer: Buffer;
}

/**
 * Process uploaded files for Brand DNA:
 * - Images: store in Supabase Storage, classify as logo/product/other
 * - Text files (MD, TXT): import content directly as knowledge entries
 * - PDFs/DOCX: extract text content (basic extraction)
 */
export async function processUploadedFiles(
  clientId: string,
  files: UploadedFile[],
): Promise<{ entryIds: string[]; textContent: string }> {
  const admin = createAdminClient();
  const entryIds: string[] = [];
  const textParts: string[] = [];

  for (const file of files) {
    try {
      if (file.type.startsWith('image/')) {
        // Store image in Supabase Storage
        const ext = file.name.split('.').pop() ?? 'png';
        const storagePath = `${clientId}/uploads/${Date.now()}-${file.name}`;

        const { error: uploadError } = await admin.storage
          .from('brand-assets')
          .upload(storagePath, file.buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error(`[brand-dna] Upload failed for ${file.name}:`, uploadError);
          continue;
        }

        const { data: urlData } = admin.storage
          .from('brand-assets')
          .getPublicUrl(storagePath);

        // Create knowledge entry for the uploaded image
        const entry = await createKnowledgeEntry({
          client_id: clientId,
          type: 'brand_asset',
          title: file.name,
          content: `Uploaded brand asset: ${file.name}`,
          metadata: {
            file_url: urlData.publicUrl,
            asset_type: file.name.toLowerCase().includes('logo') ? 'logo' : 'other',
            original_filename: file.name,
            mime_type: file.type,
          },
          source: 'imported',
          created_by: null,
        });
        entryIds.push(entry.id);

      } else if (
        file.type === 'text/markdown' ||
        file.type === 'text/plain' ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.txt')
      ) {
        // Import text content directly
        const content = file.buffer.toString('utf-8');
        textParts.push(`## ${file.name}\n${content}`);

        const entry = await createKnowledgeEntry({
          client_id: clientId,
          type: 'document',
          title: file.name.replace(/\.(md|txt)$/, ''),
          content,
          metadata: {
            original_filename: file.name,
            mime_type: file.type,
            word_count: content.split(/\s+/).length,
          },
          source: 'imported',
          created_by: null,
        });
        entryIds.push(entry.id);

      } else if (file.type === 'application/pdf') {
        // Basic PDF text extraction — just store as document for now
        // Full pdf-parse integration can be added later
        const entry = await createKnowledgeEntry({
          client_id: clientId,
          type: 'document',
          title: file.name.replace(/\.pdf$/, ''),
          content: `PDF document uploaded: ${file.name}. Content extraction pending.`,
          metadata: {
            original_filename: file.name,
            mime_type: file.type,
            status: 'pending_extraction',
          },
          source: 'imported',
          created_by: null,
        });
        entryIds.push(entry.id);
      }
    } catch (err) {
      console.error(`[brand-dna] Failed to process ${file.name}:`, err);
    }
  }

  return {
    entryIds,
    textContent: textParts.length > 0 ? textParts.join('\n\n') : '',
  };
}
