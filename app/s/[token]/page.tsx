import { notFound, redirect } from 'next/navigation';
import { resolveShareToken } from '@/lib/share/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified share resolver. New mint sites emit `/s/<token>` regardless of
 * what kind of share it is; this page fans out across every share-token
 * table and 302s to the canonical legacy path. Old emailed links keep
 * working because legacy paths stay live.
 */
export default async function ShareRedirectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);
  if (!resolved) notFound();
  redirect(resolved.path);
}
