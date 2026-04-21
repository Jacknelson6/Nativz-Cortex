# Spec — Brand-native analysis flows (our brand / competitors)

**Status:** Resolved — executing
**Author:** Claude (Cortex session, 2026-04-21; revised through Jack's lunch-break answers)
**Parent:** NAT-57 (session-level brand context), NAT-?? (to file)

---

## Context

After NAT-57 shipped the session-level brand pill, every tool defaults
its "which brand am I analyzing for?" context from the top-bar pill
instead of prompting. We've stripped most of the in-page pickers. The
remaining friction is on the **analysis surfaces** — Trend Finder,
Competitor Spying, Audit, Ad Creatives — where the question isn't just
"which client are we working on?" but **"are we analyzing _our own_
brand or one of their _competitors_?"**

Jack's observation: the attached brand already has a website URL, linked
social handles, a client record, and optionally Zernio — so the "input
a URL and let me scrape it" friction is unnecessary for the common
case. What we don't know (and what the user typically types) is the URL
of _someone else_ we want to compare to.

### Why no "Prospect" mode

An earlier draft had three modes — Our brand / Competitor / Prospect —
where Prospect covered "live-demo on a sales call." Jack killed it:
prospects are already a `clients` row by the time we run analysis on
them, so "scrape a totally unknown brand" isn't a real user journey —
it's just "Our brand mode on a client that doesn't have Zernio yet."

That collapses the model to two modes and pushes the data-source
question ("Zernio vs scrape?") into a resolver beneath the mode.

## Goals

1. **Brand-native first.** When the session brand is pinned, every
   analysis tool opens with the brand's data pre-loaded: URL, social
   handles, pillar knowledge, recent audit. Zero re-typing.
2. **Two explicit modes.**
   - **Our brand** — deep analysis of the attached client's own presence.
   - **Competitor** — a competitor of the attached client; results diff
     against _our_ data so the output is comparative.
3. **One input, one verdict.** At most one thing typed (URL / query /
   handle) and a mode inference. Tool knows the rest.
4. **Zernio-or-scrape is invisible.** Resolver returns one shape; tools
   never branch on data source.
5. **No AI competitor-sourcing.** Competitor social profiles come from
   (a) website scrape of the competitor's site or (b) admin manually
   pasted links. Never from an LLM-generated guess. Bad handles waste
   scrapes and produce misleading diffs — explicit input is cheap and
   deterministic.

## Non-goals

- Re-architecting Zernio / social ingestion. Existing `social_profiles`
  table + a thin resolver.
- Changing how audits / topic searches / TikTok Shop searches run at
  the API layer. This is UX + routing, not a pipeline redesign.

---

## Resolved design decisions (Jack's lunch break, 2026-04-21)

| Question | Answer |
|---|---|
| Mode UX | **Inferred** (B). Session brand → "Our brand". Pasted URL not matching → "Competitor" with override pill. |
| Data-source chip | **Hidden.** Same data shape from both sources; source stays behind the veil. |
| Data shape | **Identical across Zernio + scrape.** Surface the intersection of fields so comparisons are apples-to-apples. Zernio might have more internally, but the UI shows only what both can produce. |
| Zernio-covered platforms | **YouTube, TikTok, Instagram, Facebook.** All four are scrape-capable too. |
| Competitor discovery | **Always manual or website-scrape.** No AI guessing. |
| Onboarding enforcement | Per-platform: every client has a slot for YT / TT / IG / FB. Each slot is one of: linked handle, "No account", or unset. "Unset" blocks analysis tools for that platform only. |
| Competitor spying scope | **Organic Social + TikTok Shop only for now.** Meta Ads + Ecom retired from nav (pages may stay but hidden from navigation). |
| Brand profile | New **client-visible** portal page at `/portal/brand-profile`. Shows brand info + linked socials + competitor list. Deep detail (brand DNA raw, audit history, billing, etc.) stays admin-only. |

---

## Proposed shape

### Tool inventory + mapping

| Today's surface | Post-spec mode(s) | Notes |
|---|---|---|
| **Trend Finder** (`/admin/search/new`) | Our brand (session) / Competitor (paste URL) | No URL typing for Our brand — resolved from session brand's `website_url` + linked socials. |
| **Competitor Spying → Organic Social** (`/admin/analyze-social`) | Our brand / Competitor | Competitor picker auto-suggests the client's saved competitor list first. |
| **Competitor Spying → TikTok Shop** | Our brand / Competitor | Same pattern. |
| **Competitor Spying → Meta Ads** | — | **Retired from nav.** Files may remain but the flow is dormant. |
| **Competitor Spying → Ecom stores** | — | **Retired from nav.** Same. |
| **Ad Generator** (`/admin/ad-creatives`) | Our brand only | |
| **Strategy Lab** (`/admin/strategy-lab`) | Our brand only | |
| **Brain / Knowledge** | Our brand only | |

### Data flow per mode

**Our brand mode:**
- No URL input for URL-based tools — use session brand's `website_url`
  and `social_profiles` rows.
- Topic search: pre-fill query from `topic_keywords`; user can override.
- Result auto-linked to brand (`attached_client_id`).
- Performance-data panel above results, via the resolver.

**Competitor mode:**
- User picks from the brand's saved competitor list **or** pastes a URL
  inline. URL paste path also saves the competitor to the list for
  future use (with admin confirmation prompt).
- Always scrape-based.
- Result diffed against our own data — side-by-side cards.
- Appears in that client's competitor intel over time.

### The data resolver — Zernio-or-scrape

```ts
// lib/analysis/resolve-brand-metrics.ts
export async function resolveBrandMetrics(
  clientId: string,
  network: 'instagram' | 'tiktok' | 'facebook' | 'youtube',
): Promise<BrandMetrics | NoAccountMarker> {
  const profile = await getLinkedSocialProfile(clientId, network);
  if (!profile) throw new MissingProfileError(clientId, network);
  if (profile.no_account) return { noAccount: true as const };

  if (profile.late_account_id) {
    return fetchZernioMetrics(profile.late_account_id, network);
  }
  return scrapePublicMetrics(profile.handle, network);
}
```

The resolver's return type hides whether data came from Zernio or a
scrape. The UI shows whichever field set both paths produce — same
fields, same shape. No "source: Zernio" chip anywhere.

### The onboarding invariant (revised)

Every client record has **four platform slots** — YouTube, TikTok,
Instagram, Facebook. Each slot is one of three states:

- **Linked** — a `social_profiles` row exists for (client, platform).
- **No account** — admin has explicitly declared the client has no
  presence on this platform. Analysis tools skip it silently.
- **Unset** — neither linked nor declared. Analysis tools surface a
  prompt: "Add a handle or mark 'no account'".

Enforcement:

1. **Onboarding** (`/admin/clients/onboard`) — scrape the client's
   website for socials. For each found handle → pre-fill as Linked. For
   each platform missing → admin decides Linked / No account before
   saving. No more "skip and fill later."
2. **Retroactive backfill** — existing clients get a one-time prompt
   until all four slots are resolved.
3. **Visible on brand profile (portal)** — clients see their own slot
   states. Admin-side (`/admin/clients/[slug]/settings/brand`) has the
   full management UI.

### The data resolver + `social_profiles` schema changes

We already have `social_profiles` (migrations 026 + 027). We need one
additional column:

```sql
ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS no_account BOOLEAN NOT NULL DEFAULT FALSE;
```

A `no_account = TRUE` row encodes "this client is NOT on this platform"
— platform field still populated, handle/tokens can be NULL. The
presence of the row itself encodes "admin has decided." Absence = Unset.

Alternative considered: separate enum column `status ('linked'|'no_account'|'unset')`.
Rejected because Unset is "no row at all" by nature.

### The competitor list

New table (or re-use `social_competitors` if the schema fits):

```sql
CREATE TABLE IF NOT EXISTS client_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  instagram_handle TEXT,
  tiktok_handle TEXT,
  facebook_handle TEXT,
  youtube_handle TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Populated by:
1. **Website scrape** during onboarding or first audit — parses obvious
   "competitors" mentions on a competitor's homepage / "alternatives"
   style SEO pages. If found → suggested, admin confirms before save.
2. **Admin manual entry** on `/admin/clients/[slug]/settings/brand`
   under a "Competitors" section. Paste URL + socials, save.
3. **Organic Social audit** — when a user pastes a competitor URL, we
   auto-save it (with consent prompt).

When launching a Competitor-mode analysis:
- Show the brand's saved competitor list as auto-suggestions.
- Allow picking one with one click → pre-fills socials.
- Or allow pasting a fresh URL + socials for a one-off.

### Implementation sketch

```
app/portal/brand-profile/
  page.tsx                         ← client-visible brand profile

app/admin/clients/[slug]/settings/brand/
  page.tsx                         ← existing; add <LinkedSocialsSection/> + <CompetitorsSection/>

components/clients/
  linked-socials-section.tsx       ← admin UI to link/unlink/mark-no-account per platform
  competitors-section.tsx          ← admin UI for competitor list
  brand-profile-view.tsx           ← shared read-only block used by portal

components/analysis/
  mode-pill.tsx                    ← inferred-mode indicator with override popover
  brand-native-input.tsx
  competitor-input.tsx             ← picker with saved-list suggestions + URL paste
  analysis-shell.tsx

lib/analysis/
  resolve-brand-metrics.ts
  resolve-our-brand.ts
  resolve-competitor.ts
  infer-analysis-mode.ts           ← URL → 'our-brand' | 'competitor'
  scrape-competitor-socials.ts     ← website URL → { ig, tt, fb, yt } or nulls
```

---

## Phased rollout

**Phase 1 — concrete, no spec-dependency (✅ shipped earlier today):**
- `/admin/strategy-lab/[clientId]` → `/admin/strategy-lab`
- `/admin/ad-creatives-v2/[clientId]` → `/admin/ad-creatives`
- Trend Finder inline brand popover stripped.

**Phase 2 — brand profile + competitor infra (executing now):**
- Retire Meta Ads + Ecom from sidebar (keep routes dormant for now).
- Kill AI-based competitor discovery path.
- DB migration: `social_profiles.no_account` + `client_competitors` table.
- Admin UI: Linked Social Profiles + Competitors sections on brand settings.
- Portal UI: `/portal/brand-profile` page.

**Phase 3 — resolver + onboarding (next session):**
- `resolve-brand-metrics.ts` unit-tested against both branches.
- Onboarding flow captures per-platform slots (Linked / No account).
- Retroactive backfill prompt for existing clients.

**Phase 4 — analysis shell (next session):**
- `<AnalysisShell>` + inferred mode pill.
- Pilot on Organic Social audit.

**Phase 5 — broader rollout:**
- Trend Finder, TikTok Shop adopt `<AnalysisShell>`.
- Retire each tool's bespoke input block.

---

## Deferred / explicit non-scope

- Meta Ads + Ecom competitor spying surfaces. Routes remain but hidden
  from navigation until Jack re-prioritizes.
- Prospect mode / `prospect_audits` table. Scrapped.
- "Source: Zernio / scrape" chip. Scrapped.
- AI-generated competitor lists. Scrapped.
