import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export async function RevenueActivityTab() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_lifecycle_events')
    .select('id, client_id, type, title, description, occurred_at, metadata, clients(name, slug)')
    .order('occurred_at', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
        No lifecycle events yet. Once Stripe webhooks arrive or contracts are signed, entries
        appear here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <ul className="divide-y divide-white/5">
        {data.map((evt) => {
          const client = evt.clients as { name?: string | null; slug?: string | null } | null;
          return (
            <li key={evt.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{evt.title}</p>
                {evt.description ? (
                  <p className="mt-0.5 text-[11px] text-text-muted">{evt.description}</p>
                ) : null}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                  <span className="font-mono">{evt.type}</span>
                  {client?.name ? (
                    <>
                      <span>·</span>
                      <Link
                        href={`/admin/clients/${client.slug}/billing`}
                        className="hover:text-nz-cyan"
                      >
                        {client.name}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <time className="shrink-0 text-[11px] text-text-muted">
                {new Date(evt.occurred_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
