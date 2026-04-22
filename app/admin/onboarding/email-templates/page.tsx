import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmailTemplatesManager } from '@/components/onboarding/email-templates-manager';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  service: string;
  name: string;
  subject: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * /admin/onboarding/email-templates — manage the service-scoped email
 * template library. Admins write {{placeholder}} strings in the subject
 * + body; those get interpolated at render time in the tracker editor.
 */
export default async function OnboardingEmailTemplatesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') notFound();

  const { data } = await admin
    .from('onboarding_email_templates')
    .select('id, service, name, subject, body, sort_order, created_at, updated_at')
    .order('service', { ascending: true })
    .order('sort_order', { ascending: true });

  const rows = (data as Row[] | null) ?? [];

  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <Link
          href="/admin/onboarding"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          All onboarding
        </Link>
        <h1 className="ui-page-title flex items-center gap-2">
          <Mail size={22} className="text-accent-text" />
          Email templates
        </h1>
        <p className="text-[15px] text-text-muted mt-1">
          Reusable subject + body pairs that interpolate against a tracker&apos;s
          client and share link. Organized by service.
        </p>
      </div>

      <EmailTemplatesManager initialTemplates={rows} />
    </div>
  );
}
