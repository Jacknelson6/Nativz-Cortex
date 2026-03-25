# Security checklist

Infrastructure and configuration requirements for Nativz Cortex production deployments.

## Authentication and session management

- [ ] **Supabase session lifetime** (Dashboard -> Authentication -> Settings)
  - Access token (JWT) lifetime: **3600 seconds** (1 hour)
  - Refresh token lifetime: **604800 seconds** (7 days)
  - Refresh token rotation: **enabled** (invalidates old refresh tokens on use)
- [ ] Middleware calls `supabase.auth.getUser()` on every request to revalidate the JWT server-side
- [ ] Role cookie (`x-user-role`) is `httpOnly`, `secure` in production, and expires after 10 minutes

## CORS

- [ ] `NEXT_PUBLIC_APP_URL` environment variable is set to the production domain (e.g. `https://app.nativz.io`)
- [ ] Middleware sets `Access-Control-Allow-Origin` to the value of `NEXT_PUBLIC_APP_URL` for all `/api/` routes
- [ ] OPTIONS preflight requests return 204 with CORS headers
- [ ] Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- [ ] Allowed headers: `Content-Type, Authorization, X-API-Key`

## DDoS and rate limiting

- [ ] **Vercel platform DDoS protection** is active by default on all deployments -- no configuration needed
- [ ] **Vercel Firewall WAF rules** -- enable in Vercel Dashboard -> Firewall for additional protection against common attack patterns (SQL injection, XSS, etc.)
- [ ] **Bot Filter** -- enable in Vercel Dashboard -> Firewall -> Bot Protection (available on all plans) to block automated abuse
- [ ] Middleware attaches `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers to API responses so clients can self-throttle
- [ ] For stricter server-side rate limiting, consider adding `@vercel/edge-rate-limit` or an external rate-limiting service (e.g. Upstash Redis) in front of expensive endpoints

## Security headers (configured in `next.config.ts`)

- [x] `X-Frame-Options: DENY`
- [x] `X-Content-Type-Options: nosniff`
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [x] `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [x] `Content-Security-Policy` with restrictive `default-src`, `frame-src`, and `object-src`

## Cron jobs (`vercel.json`)

- [ ] All cron endpoints verify `Authorization: Bearer ${CRON_SECRET}` header
- [ ] `CRON_SECRET` environment variable is set in Vercel project settings

## API routes

- [ ] All non-public API routes verify authentication via `supabase.auth.getUser()`
- [ ] Input validated with Zod schemas before processing
- [ ] Portal routes scope all queries by `organization_id`
- [ ] Admin-only routes use `createAdminClient()` (service role key never exposed to client)

## Environment variables

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only used server-side (never prefixed with `NEXT_PUBLIC_`)
- [ ] All API keys and secrets are stored in Vercel environment variables, not committed to the repo
- [ ] `.env.local` is in `.gitignore`

## Secret rotation (every 90 days)

| Secret | Location | Last Rotated | Next Due |
|--------|----------|-------------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars | — | — |
| `OPENROUTER_API_KEY` | Vercel env vars | — | — |
| `GOOGLE_AI_STUDIO_KEY` | Vercel env vars | — | — |
| `BRAVE_SEARCH_API_KEY` | Vercel env vars | — | — |
| `GITHUB_VAULT_WEBHOOK_SECRET` | Vercel + GitHub | — | — |
| `MONDAY_WEBHOOK_SECRET` | Vercel + Monday | — | — |
| `CRON_SECRET` | Vercel env vars | — | — |
| `API_ENCRYPTION_KEY` | Vercel env vars | — | — |

### Rotation process

1. Generate new secret value
2. Add new value to Vercel env vars (keep old value until deploy succeeds)
3. Deploy with new value and verify functionality
4. Remove old value from Vercel env vars
5. Update external services that use the old secret (GitHub webhooks, Monday, etc.)
6. Update "Last Rotated" date in this table

## Backup and recovery

Supabase Pro plan provides daily backups retained for 7 days with point-in-time recovery.

### Quarterly backup test procedure

1. Create a test Supabase project
2. Restore latest backup to the test project
3. Verify: tables exist, row counts match, RLS policies active
4. Verify: auth users can sign in
5. Verify: storage buckets and files accessible
6. Delete the test project
7. Document results below

| Quarter | Tested | Result | Notes |
|---------|--------|--------|-------|
| Q1 2026 | — | — | — |
| Q2 2026 | — | — | — |

## Environment separation

| Concern | Production | Development |
|---------|-----------|-------------|
| Supabase project | Production project | Local or separate dev project |
| API keys | Production keys in Vercel | Dev keys in `.env.local` |
| Webhooks | Point to production domain | Disabled or use ngrok |
| Webhook signatures | **Required** (rejects if missing) | **Required** (rejects if missing) |
| AI API calls | Cost-capped, logged | Same keys OK (low volume) |

### Rules

- `.env.local` is gitignored — never commit secrets
- Production environment variables managed in Vercel dashboard only
- Webhook endpoints reject unsigned requests in ALL environments
- Never use production Supabase URL in local development

## Dependency security

- [x] Dependabot configured (`.github/dependabot.yml`) — weekly PRs
- [x] `console.log` stripped in production builds via Terser
- [ ] Run `npm audit` before each release
- [ ] Review Dependabot PRs within 48 hours

## Data privacy

- [x] Account deletion flow with confirmation (SOC 2 P6.1)
- [x] Activity logging for critical actions
- [ ] Data retention policy documented
- [ ] GDPR data export endpoint (if serving EU users)
