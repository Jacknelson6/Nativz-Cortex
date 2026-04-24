# Docs-repo patches for Cortex proposal sync

Cortex now generates per-prospect folders in `Anderson-Collaborative/ac-docs`
and `andersoncollab/nativz-docs`. This directory holds the git patches that
wire those repos to call Cortex back on sign/paid events and allow iframe
embedding of the proposal page inside Cortex.

## What the patches do

For each of the two docs repos:

1. **`functions/_lib/cortex-callback.ts` (new)** — tiny auth'd fetch helper
   that POSTs to Cortex `/api/webhooks/docs/[event]` with a bearer token.
2. **`functions/api/sign.ts` (patched)** — reads `source.cortexProposalId`
   from `client.json`, passes it as Stripe `client_reference_id` on the
   payment redirect, and fires a `waitUntil(postToCortex('signed', …))`
   after the KV write. Fire-and-forget: if Cortex is down or env isn't
   configured, the sign flow still completes.
3. **`_headers` (patched)** — swaps `X-Frame-Options: DENY` for
   `Content-Security-Policy: frame-ancestors … cortex.*` so
   `/admin/proposals/[slug]` can iframe the live proposal preview.

## Applying

```bash
# AC docs
cd ~/path/to/ac-docs
git checkout -b cortex-sync
git am < /path/to/cortex/docs/docs-repo-patches/ac-docs/0001-*.patch

# Nativz docs
cd ~/path/to/nativz-docs
git checkout -b cortex-sync
git am < /path/to/cortex/docs/docs-repo-patches/nativz-docs/0001-*.patch
```

Then push the branch and open a PR (or merge to `main` directly — it's
fully backward-compatible: if `CORTEX_WEBHOOK_URL` / `DOCS_WEBHOOK_SECRET`
aren't set, the callback logs a warning and skips. Signing continues to
work even if Cortex is offline).

## Required Cloudflare Pages env vars

Set these in each project's Cloudflare dashboard → Settings → Environment
variables → **Production** (and Preview, if used):

| Var | Value |
| --- | --- |
| `CORTEX_WEBHOOK_URL` | `https://cortex.andersoncollaborative.com` (AC) or `https://cortex.nativz.io` (Nativz) |
| `DOCS_WEBHOOK_SECRET` | A strong random string; set the **same value** in Cortex's Vercel env |

## Required Cortex (Vercel) env var

| Var | Value |
| --- | --- |
| `DOCS_WEBHOOK_SECRET` | Same random string as above |

## Verifying

After merging + setting env vars + redeploying both sides:

1. Cortex admin → Proposals → New proposal → generate for a test prospect.
2. Open the public URL. The page should render (CSP allows framing).
3. Inside the Cortex detail page, the iframe preview should now load.
4. Sign the test proposal on the public page.
5. Within a few seconds, Cortex's `/admin/proposals/[slug]` flips to
   `Signed` and the activity feed shows a "Proposal signed" row.
6. Pay the deposit. Cortex's regular Stripe webhook fires via
   `checkout.session.completed`, matches on `client_reference_id`, and
   flips the proposal to `Paid`.
