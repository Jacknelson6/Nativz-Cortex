# Zernio setup (scheduler + reporting)

Official API reference: [Zernio API documentation](https://docs.zernio.com/).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ZERNIO_API_KEY` | Bearer token for `https://zernio.com/api/v1`. Create in Zernio **Settings → API keys**. Legacy alias: `LATE_API_KEY`. |
| `ZERNIO_WEBHOOK_SECRET` | Same value as Zernio **webhooks → Secret key**. Used to verify `X-Zernio-Signature` / `X-Late-Signature` on `POST /api/scheduler/webhooks` and to sign OAuth state for scheduler connect. Legacy alias: `LATE_WEBHOOK_SECRET`. |
| `ZERNIO_API_BASE` | Optional. Default `https://zernio.com/api/v1`. |

Optional notify targets for webhook-driven in-app alerts:

- `ZERNIO_WEBHOOK_NOTIFY_EMAILS` — comma-separated. Matches `users.email` for role admin, else `team_members.email` + linked `user_id`.
- `ZERNIO_WEBHOOK_NOTIFY_USER_IDS` — comma-separated auth UUIDs.

Apply migration `068_account_disconnected_notification_type.sql` for the `account_disconnected` notification type.

## Legacy aliases (still supported)

- Env: `LATE_API_KEY` → `ZERNIO_API_KEY`, `LATE_WEBHOOK_SECRET` → `ZERNIO_WEBHOOK_SECRET`, `POSTING_PROVIDER=late` still resolves.
- DB columns: `late_profile_id` / `late_account_id` / `late_post_id` are unchanged.
- Webhook signature header may still be labeled `X-Late-Signature` in Zernio's UI — same secret.

## Deploy checklist

1. **Vercel** — Add `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` for Production (and Preview if you test there). Local dev: same keys in `.env.local` (gitignored).
2. **Zernio dashboard** — Webhook URL: `https://<your-domain>/api/scheduler/webhooks`. Enable **Post failed** and **Account disconnected**.
3. **Redeploy** — Trigger a deployment after changing env vars so serverless functions and cron jobs read the new values.

## Code entry points

- Webhook: `app/api/scheduler/webhooks/route.ts`
- OAuth connect: `app/api/scheduler/connect/route.ts` and `lib/scheduler/oauth-state.ts`
- Client: `lib/posting/zernio.ts`
