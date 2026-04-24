import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function ProposalPaidPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: proposal } = await admin
    .from('proposals')
    .select('title, signer_name, status')
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) notFound();

  const first = (proposal.signer_name ?? '').split(' ')[0] || 'there';

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center p-6 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        <CheckCircle2 size={28} />
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-text-primary">Payment received</h1>
      <p className="mt-3 text-text-secondary">
        Thanks {first} — your payment for <strong>{proposal.title}</strong> came through. We&rsquo;ll
        be in touch shortly to schedule your kickoff call.
      </p>
      <p className="mt-8 text-[11px] text-text-muted">
        A receipt is on its way to your inbox from Stripe.
      </p>
    </div>
  );
}
