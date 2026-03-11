# Affiliates Analytics — Design

## Goal

Add an Affiliates analytics section under `/admin/analytics/affiliates`, powered by UpPromote API v2. Includes hourly sync, onboard wizard for API keys, and full reporting dashboard.

## Navigation

- Sidebar nests two sub-items under Analytics: "Social media" and "Affiliates"
- `/admin/analytics` redirects to `/admin/analytics/social`
- `/admin/analytics/social` — existing AnalyticsDashboard (moved from `/admin/analytics`)
- `/admin/analytics/affiliates` — new AffiliatesDashboard

## Dashboard Sections

### KPI Cards (3)
- Total affiliates (active)
- Total referrals (in date range)
- Total clicks (in date range)

### Affiliate Leaderboard
Table sorted by revenue: name, email, referral count, revenue, status

### Recent Referrals
Table: order number, affiliate name, sale amount, status (pending/approved/denied), date

### Payments Summary
Unpaid total vs paid total, recent payment history

## Date Filtering
Same presets as social analytics: 7d, 30d, MTD, last month, YTD, custom

## Data Architecture

### UpPromote API Client
- `lib/uppromote/client.ts` — mirrors Late API client pattern
- Base URL: `https://aff-api.uppromote.com/api/v2`
- Auth: `Authorization: <api_key>` header
- Rate limit: 120 req/min per store

### Database Tables (new)
- `affiliate_members` — synced affiliate profiles
- `affiliate_referrals` — synced referral/order data
- `affiliate_snapshots` — hourly KPI snapshots for trend data

### Hourly Sync
- Cron job at `/api/cron/sync-affiliates`
- Fetches affiliates, referrals, payments from UpPromote
- Upserts into local tables
- Dashboard reads from Supabase, not live API

### Client Integration
- New `uppromote_api_key` column on `clients` table
- Client settings page gets "Affiliate integration" section
- Paste API key → validates against UpPromote → saves

## API Endpoints (new)
- `GET /api/affiliates?clientId=X&view=overview|affiliates|referrals|payments&start=&end=`
- `POST /api/cron/sync-affiliates` — hourly cron
- `POST /api/clients/[id]/uppromote` — save/validate API key

## Key UpPromote Endpoints Used
- `GET /api/v2/affiliates` — list affiliates with pagination
- `GET /api/v2/referrals` — list referrals with date filtering
- `GET /api/v2/payments/unpaid` — unpaid commission totals
- `GET /api/v2/payments/paid` — payment history
- `GET /api/v2/programs` — program details (may contain click data)

## Not Building
- Cross-referencing affiliate revenue with social media performance
