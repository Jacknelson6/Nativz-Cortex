// SPY-04 T13: Supabase Storage helpers for the prospect-pdfs bucket.
//
// Bucket layout: `prospect-pdfs/{prospectId}/{token}.pdf` — private bucket,
// service-role-only writes, signed URLs for reads. We never expose raw
// paths on the public scorecard page; the public API fetches a signed URL
// at request time so each PDF link is short-lived (PDF_SIGNED_URL_TTL_SEC
// default 1 hour).
//
// `pdf_storage_path` on `prospect_share_links` is the bucket-relative path
// (no bucket prefix) so we can re-sign with whatever TTL the caller wants.

import { createAdminClient } from '@/lib/supabase/admin';

export const PROSPECT_PDF_BUCKET = 'prospect-pdfs';
export const PDF_SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

export interface UploadResult {
  path: string;
  signedUrl: string;
}

export async function uploadScorecardPdf(
  prospectId: string,
  token: string,
  pdfBuffer: Buffer,
): Promise<UploadResult> {
  const admin = createAdminClient();
  const path = `${prospectId}/${token}.pdf`;

  const { error: uploadError } = await admin.storage
    .from(PROSPECT_PDF_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Scorecard PDF upload failed: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(PROSPECT_PDF_BUCKET)
    .createSignedUrl(path, PDF_SIGNED_URL_TTL_SEC);

  if (signError || !signed) {
    throw new Error(`Sign URL failed: ${signError?.message ?? 'no data'}`);
  }

  return { path, signedUrl: signed.signedUrl };
}

export async function getSignedPdfUrl(
  path: string,
  ttlSec: number = PDF_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  if (!path) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PROSPECT_PDF_BUCKET)
    .createSignedUrl(path, ttlSec);
  if (error || !data) return null;
  return data.signedUrl;
}
