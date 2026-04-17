import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';

export default async function TikTokShopPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-nativz-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-accent-text">
          <ShoppingBag size={22} aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-text-primary">TikTok Shop</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Discover top TikTok Shop creators by category — GMV, engagement, demographics, and product promotion signals.
        </p>
        <p className="mt-5 inline-flex items-center rounded-full border border-nativz-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          Building — check back soon
        </p>
      </div>
    </div>
  );
}
