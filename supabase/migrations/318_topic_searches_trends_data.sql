-- Cache Google Trends interest-over-time on the search row so we only call the
-- (unofficial, rate-limited) Trends endpoint once per search.
alter table public.topic_searches
  add column if not exists trends_data jsonb;

comment on column public.topic_searches.trends_data is
  'Cached Google Trends interest-over-time series for the search query. Shape: { fetched_at: ISO, geo: string, timeframe: string, points: [{ date: YYYY-MM-DD, value: number }] }';
