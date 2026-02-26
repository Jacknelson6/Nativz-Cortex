import Link from 'next/link';
import { Search, Building2, Clock, History } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';
import { SearchModeSelector } from '@/components/search/search-mode-selector';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function AdminNewSearchPage() {
  const supabase = createAdminClient();

  // Fetch clients for the selector with logos and agencies
  const [vaultClients, { data: dbClients }] = await Promise.all([
    getVaultClients(),
    supabase
      .from('clients')
      .select('id, slug, logo_url, is_active')
      .eq('is_active', true),
  ]);

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.slug,
      logo_url: db.logo_url,
      agency: vault?.agency,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Fetch recent searches
  const { data: recentSearches } = await supabase
    .from('topic_searches')
    .select('id, query, search_mode, status, created_at, client_id, clients(name)')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="p-6 space-y-12">
      <div className="flex flex-col items-center justify-center pt-8">
        <div className="w-full max-w-4xl">
          <SearchModeSelector redirectPrefix="/admin" initialClients={clients} />
        </div>
      </div>

      {/* Recent Searches Section */}
      {recentSearches && recentSearches.length > 0 && (
        <div className="max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <History size={18} className="text-accent-text" />
              Recent history
            </h2>
            <Link 
              href="/admin/search/history" 
              className="text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              View all history
            </Link>
          </div>
          
          <div className="space-y-2">
            {recentSearches.map((search, index) => {
              const client = Array.isArray(search.clients) ? search.clients[0] : search.clients;
              return (
                <Link key={search.id} href={`/admin/search/${search.id}`}>
                  <Card 
                    interactive 
                    className="flex items-center justify-between py-3 px-4 animate-stagger-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Search size={14} className="text-text-muted shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {search.query}
                          </p>
                          <Badge variant={search.search_mode === 'client_strategy' ? 'purple' : 'default'} className="text-[10px] px-1.5 py-0">
                            {search.search_mode === 'client_strategy' ? 'Brand' : 'Topic'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-text-muted flex items-center gap-1">
                            <Clock size={10} />
                            {formatRelativeTime(search.created_at)}
                          </span>
                          {client && (
                            <span className="text-[11px] text-text-muted flex items-center gap-1">
                              <Building2 size={10} />
                              {(client as { name: string }).name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {search.status === 'failed' && (
                      <Badge variant="danger">Failed</Badge>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
