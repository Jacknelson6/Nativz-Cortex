'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Eye, Heart, MessageCircle, Share2, TrendingUp, Instagram, RefreshCw, Loader2, Image as ImageIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';

interface InsightMetric {
  name: string;
  title: string;
  total_value?: { value: number };
  values: Array<{ value: number; end_time: string }>;
}

interface MediaItem {
  id: string;
  caption: string;
  media_type: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  permalink: string;
  insights?: Record<string, number>;
}

interface Demographics {
  age_gender: Record<string, number>;
  cities: Record<string, number>;
  countries: Record<string, number>;
}

interface Account {
  id: string;
  name: string;
  username: string;
}

const CHART_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

export function InstagramDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [insights, setInsights] = useState<InsightMetric[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/instagram/accounts');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch accounts');
      }
      const data = await res.json();
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 0 && !selectedAccount) {
        setSelectedAccount(data.accounts[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    }
  }, [selectedAccount]);

  const fetchData = useCallback(async (accountId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, mediaRes, demoRes] = await Promise.all([
        fetch(`/api/instagram/insights?account_id=${accountId}&period=days_28`),
        fetch(`/api/instagram/media?account_id=${accountId}&limit=25&insights=true`),
        fetch(`/api/instagram/demographics?account_id=${accountId}`),
      ]);

      if (insightsRes.ok) {
        const d = await insightsRes.json();
        setInsights(d.insights || []);
      }
      if (mediaRes.ok) {
        const d = await mediaRes.json();
        setMedia(d.media || []);
      }
      if (demoRes.ok) {
        const d = await demoRes.json();
        setDemographics(d.demographics || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (selectedAccount) {
      fetchData(selectedAccount);
    }
  }, [selectedAccount, fetchData]);

  function getMetricValue(name: string): number {
    const metric = insights.find((m) => m.name === name);
    return metric?.total_value?.value ?? metric?.values?.[0]?.value ?? 0;
  }

  if (error && accounts.length === 0) {
    return (
      <EmptyState
        icon={<Instagram size={32} />}
        title="Instagram not connected"
        description={error}
      />
    );
  }

  if (loading && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<Instagram size={32} />}
        title="No Instagram accounts found"
        description="Connect an Instagram Business Account through Facebook to see analytics here."
      />
    );
  }

  // Prepare chart data
  const mediaChartData = media.slice(0, 10).map((m) => ({
    name: m.caption?.slice(0, 20) || m.media_type,
    likes: m.like_count,
    comments: m.comments_count,
    reach: m.insights?.reach ?? 0,
    impressions: m.insights?.impressions ?? 0,
  }));

  const topCities = demographics?.cities
    ? Object.entries(demographics.cities)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([city, value]) => ({ name: city, value }))
    : [];

  const topCountries = demographics?.countries
    ? Object.entries(demographics.countries)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([country, value]) => ({ name: country, value }))
    : [];

  const ageGenderData = demographics?.age_gender
    ? Object.entries(demographics.age_gender)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([label, value]) => ({ name: label, value }))
    : [];

  return (
    <div className="space-y-6">
      {/* Account selector + refresh */}
      <div className="flex items-center gap-3">
        {accounts.length > 1 && (
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
        )}
        {accounts.length === 1 && (
          <span className="text-sm text-text-muted">@{accounts[0].username}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => selectedAccount && fetchData(selectedAccount)}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Impressions"
          value={getMetricValue('impressions').toLocaleString()}
          icon={<Eye size={20} />}
          subtitle="Last 28 days"
        />
        <StatCard
          title="Reach"
          value={getMetricValue('reach').toLocaleString()}
          icon={<Users size={20} />}
          subtitle="Last 28 days"
        />
        <StatCard
          title="Engaged"
          value={getMetricValue('accounts_engaged').toLocaleString()}
          icon={<Heart size={20} />}
          subtitle="Last 28 days"
        />
        <StatCard
          title="Profile views"
          value={getMetricValue('profile_views').toLocaleString()}
          icon={<TrendingUp size={20} />}
          subtitle="Last 28 days"
        />
      </div>

      {/* Post performance chart */}
      {mediaChartData.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-text-primary mb-4">Recent post performance</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mediaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e1e2e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="likes" fill="#6366f1" name="Likes" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments" fill="#8b5cf6" name="Comments" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reach" fill="#a5b4fc" name="Reach" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Demographics */}
      <div className="grid gap-4 md:grid-cols-2">
        {ageGenderData.length > 0 && (
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-4">Age &amp; gender</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageGenderData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e1e2e',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="#6366f1" name="Followers" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {topCities.length > 0 && (
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-4">Top cities</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topCities}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(props: PieLabelRenderProps) => `${props.name ?? ''} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {topCities.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e1e2e',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>

      {/* Top countries */}
      {topCountries.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-text-primary mb-4">Top countries</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {topCountries.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg bg-surface-hover px-3 py-2">
                <span className="text-sm text-text-secondary">{c.name}</span>
                <span className="text-sm font-medium text-text-primary">{c.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent posts table */}
      {media.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-text-primary mb-4">Recent posts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="pb-2 pr-4">Post</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4 text-right">
                    <Heart size={12} className="inline" />
                  </th>
                  <th className="pb-2 pr-4 text-right">
                    <MessageCircle size={12} className="inline" />
                  </th>
                  <th className="pb-2 pr-4 text-right">
                    <Share2 size={12} className="inline" />
                  </th>
                  <th className="pb-2 text-right">
                    <Eye size={12} className="inline" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {media.slice(0, 15).map((m) => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      <a
                        href={m.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-text hover:underline line-clamp-1 max-w-[200px]"
                      >
                        {m.caption?.slice(0, 50) || 'View post'}
                      </a>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                        <ImageIcon size={10} />
                        {m.media_type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right text-text-secondary">{m.like_count}</td>
                    <td className="py-2 pr-4 text-right text-text-secondary">{m.comments_count}</td>
                    <td className="py-2 pr-4 text-right text-text-secondary">{m.insights?.shares ?? '—'}</td>
                    <td className="py-2 text-right text-text-secondary">{m.insights?.reach?.toLocaleString() ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
