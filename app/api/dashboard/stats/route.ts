import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().split('T')[0];
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    const [
      clientsCount,
      searchesThisMonth,
      searchesLastMonth,
      upcomingShoots,
      moodboardItems,
      upcomingShootsList,
      recentSearches,
      recentClients,
      recentMoodboardItems,
      recentTopicSearches,
      recentShootEvents,
    ] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('topic_searches').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabase.from('topic_searches').select('id', { count: 'exact', head: true }).gte('created_at', lastMonth).lte('created_at', endOfLastMonth),
      supabase.from('shoot_events').select('id', { count: 'exact', head: true }).gte('shoot_date', today),
      supabase.from('moodboard_items').select('id', { count: 'exact', head: true }),
      // Upcoming shoots next 7 days
      supabase
        .from('shoot_events')
        .select('id, title, shoot_date, location, client_id, clients(name, slug)')
        .gte('shoot_date', today)
        .lte('shoot_date', nextWeek)
        .order('shoot_date')
        .limit(10),
      // Recent searches
      supabase
        .from('topic_searches')
        .select('id, query, search_type, status, created_at, client_id, clients(name, slug)')
        .order('created_at', { ascending: false })
        .limit(5),
      // Activity: recent clients
      supabase
        .from('clients')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      // Activity: recent moodboard items
      supabase
        .from('moodboard_items')
        .select('id, title, created_at, moodboard_id')
        .order('created_at', { ascending: false })
        .limit(5),
      // Activity: recent topic searches
      supabase
        .from('topic_searches')
        .select('id, query, created_at, client_id, clients(name)')
        .order('created_at', { ascending: false })
        .limit(5),
      // Activity: recent shoot events
      supabase
        .from('shoot_events')
        .select('id, title, created_at, shoot_date, client_id, clients(name)')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Build activity feed — union and sort
    type ActivityItem = {
      type: 'search' | 'shoot' | 'moodboard' | 'client';
      id: string;
      description: string;
      created_at: string;
      link: string;
    };

    const activity: ActivityItem[] = [];

    for (const s of recentTopicSearches.data || []) {
      const client = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      activity.push({
        type: 'search',
        id: s.id,
        description: `Search completed: "${s.query}"${client ? ` for ${client.name}` : ''}`,
        created_at: s.created_at,
        link: `/admin/search/${s.id}`,
      });
    }
    for (const s of recentShootEvents.data || []) {
      const client = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      activity.push({
        type: 'shoot',
        id: s.id,
        description: `Shoot scheduled: "${s.title}"${client ? ` for ${client.name}` : ''}`,
        created_at: s.created_at,
        link: `/admin/shoots`,
      });
    }
    for (const m of recentMoodboardItems.data || []) {
      activity.push({
        type: 'moodboard',
        id: m.id,
        description: `Moodboard item added: "${m.title || 'Untitled'}"`,
        created_at: m.created_at,
        link: `/admin/moodboard`,
      });
    }
    for (const c of recentClients.data || []) {
      activity.push({
        type: 'client',
        id: c.id,
        description: `Client onboarded: ${c.name}`,
        created_at: c.created_at,
        link: `/admin/clients/${c.slug}`,
      });
    }

    activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      stats: {
        totalClients: clientsCount.count || 0,
        activeSearches: searchesThisMonth.count || 0,
        activeSearchesLastMonth: searchesLastMonth.count || 0,
        upcomingShoots: upcomingShoots.count || 0,
        moodboardItems: moodboardItems.count || 0,
      },
      upcomingShootsList: (upcomingShootsList.data || []).map((s) => ({
        ...s,
        clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
      })),
      recentSearches: (recentSearches.data || []).map((s) => ({
        ...s,
        clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
      })),
      activity: activity.slice(0, 10),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
