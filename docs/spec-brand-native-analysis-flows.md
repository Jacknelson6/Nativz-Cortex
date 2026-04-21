# Spec — Brand-native analysis flows (our brand / competitors / prospects)

**Status:** Draft — open questions need Jack's input
**Author:** Claude (Cortex session, 2026-04-21)
**Parent:** NAT-57 (session-level brand context), NAT-?? (to file)

---

## Context

After NAT-57 shipped the session-level brand pill, every tool can
(in theory) default its "which brand am I analyzing for?" context from the
top-bar pill instead of prompting. We've stripped most of the in-page
pickers. The remaining friction is on the **analysis surfaces** — Trend
Finder, Competitor Spying, Audit, Ad Creatives — where the question isn't
just "which client are we working on?" but **"are we analyzing _our own_
brand, one of their _competitors_, or a totally _new prospect_?"**

Jack's observation: since the attached brand has a website URL (and often
Zernio-connected socials, brand DNA, and a client record), a lot of the
"input a URL and let me scrape it" friction goes away. We already know
everything about the session brand. What we don't know — and what the
user typically types — is the URL of _someone else_ we want to compare to
or scout.

## Goals

1. **Brand-native first.** When the session brand is pinned, every
   analysis tool opens with the brand's data pre-loaded: URL, social
   handles from Zernio, pillar knowledge, recent audit. Zero re-typing.
2. **Explicit modes.** Surface three distinct analysis intents as
   first-class modes, not UI ambiguity:
   - **Our brand** — deep analysis of the attached client's own presence
     (what's working on our socials, what our audits say, what our pillars
     are).
   - **Competitor** — a competitor of the attached client. Results get
     cross-referenced against _our_ data so the output is comparative
     ("they post X times per week, we post Y").
   - **Prospect** — a brand we're courting / haven't signed. Live-demo
     path for sales calls. Does NOT cross-reference against any existing
     client.
3. **One input. One verdict.** Whatever analysis path, the user types a
   single thing (URL / query / handle) and picks a mode. The tool knows
   the rest.

## Non-goals

- Re-architecting Zernio / social ingestion. This spec assumes the
  existing social-profile and brand-DNA plumbing.
- Changing how audits, topic searches, TikTok Shop searches are
  _executed_ at the API level. This is a UX + routing layer, not a
  pipeline redesign.

---

## Proposed shape

### Tool inventory + mapping

| Today's surface | Today's input | Post-spec mode(s) |
|---|---|---|
| **Trend Finder** (`/admin/search/new`) | query + optional client attach | **Our brand** (default): topic search scoped to session brand's keywords + pillars. **Competitor**: topic search for a named competitor, diffed against our performance. **Prospect**: live topic search against a URL/handle with no client attach. |
| **Competitor Spying → Organic Social** (`/admin/analyze-social`) | URL + optional client attach | **Our brand** (default): audit of session brand's own URL. **Competitor**: audit of a competitor URL diffed against ours. **Prospect**: audit of an unknown URL for demo purposes. |
| **Competitor Spying → Meta Ads / Ecom / TikTok Shop** | manual URL / handle / search | Same three-mode split. Our brand = scrape our own; Competitor = scrape theirs and diff; Prospect = scrape any. |
| **Ad Generator** (`/admin/ad-creatives` post-flatten) | session brand only | **Our brand only.** Generating ads for a competitor or prospect doesn't make sense. |
| **Strategy Lab** (`/admin/strategy-lab` post-flatten) | session brand only | **Our brand only.** Strategy Lab is about producing strategy for our client. |
| **Brain / Knowledge** | session brand only | **Our brand only.** |

### Mode picker UX

Two candidate patterns — need Jack's input on which:

**A) Tab / segmented control above the input:**
```
┌──────────────────────────────────────────────────┐
│ ○ Our brand   ● Competitor   ○ Prospect          │
├──────────────────────────────────────────────────┤
│ [ Input field — placeholder changes per mode ]   │
└──────────────────────────────────────────────────┘
```
- Pro: discoverable, mode is visible at all times
- Pro: keyboard-switchable (←/→ like tabs)
- Con: takes vertical space on every analysis tool

**B) Smart single input with inferred mode:**
- User types a URL → detect domain match against session brand → auto-mode "Our brand" (just hit Enter) OR "Competitor" if match against `social_competitors` table OR "Prospect" otherwise.
- A pill above shows the inferred mode, clickable to override.
- Pro: fastest for the common case
- Con: more magic, error-prone when brand has multiple domains or when a competitor domain is close to ours

Recommendation: **A** — explicit. Let it be obvious what mode you're in.

### Data flow per mode

**Our brand mode:**
- Skip URL/query input for URL-based tools — we already know the session
  brand's `website_url`. Show it passively ("Analyzing allshuttersandblinds.com").
- For topic search: pre-fill the query suggestion from the brand's
  `topic_keywords` column; user can override.
- Automatically cross-link the result to the brand (existing `attached_client_id` column).
- Pull and display **actual performance data** from Zernio where available
  (follower counts, post frequency, last 30d reach) as context above the
  results. Today's audit pipeline only looks at public-facing data;
  brand-native mode augments with internal social metrics.

**Competitor mode:**
- User types URL or handle. Required.
- Result is diffed against the session brand's own data — side-by-side
  cards ("them: 50k followers / us: 12k", "they post 8/wk / we post 3/wk").
- Saved under the session brand as a `competitor_of_client_id` row so it
  appears in that client's competitive intel over time.

**Prospect mode:**
- User types URL or handle. Required.
- No cross-reference, no save-to-client. Results persist only in the
  short-term `prospect_audits` table (TTL ~30 days, or until converted
  to a client).
- UI hint: "Prospect audits don't save to any client. Good for live
  sales demos."
- Option at the bottom of the result: "Onboard this prospect" →
  `/admin/clients/onboard` with the scraped data pre-filled.

### Implementation sketch

```
components/analysis/
  mode-selector.tsx        ← segmented control (3 modes)
  brand-native-input.tsx   ← input that reads session brand for "Our brand"
  competitor-input.tsx
  prospect-input.tsx
  analysis-shell.tsx       ← wraps mode-selector + appropriate input

lib/analysis/
  resolve-our-brand.ts     ← pulls session brand + zernio metrics
  resolve-competitor.ts
  resolve-prospect.ts
```

Each tool (`trend-finder`, `audit-hub`, `meta-ads`, etc.) drops its
current custom input block and renders `<AnalysisShell toolId="…" />`
with its own output area below.

---

## Open questions for Jack

1. **Mode UX** — A (explicit tabs), B (inferred with override), or C (you have a better idea)?

2. **"Our brand" data depth** — When analyzing our own brand, how much
   Zernio data should surface inline vs linking out to Analytics? E.g.,
   on the audit page, should I show our own brand's last-30d reach /
   engagement / follower growth right there, or just "see Analytics"?

3. **Prospect persistence** — Is 30 days right? Or save forever until
   manually deleted? Or never save (ephemeral in-session only)?

4. **Prospect → onboarding flow** — You mentioned scraping prospect socials
   live on a call. The scraped profile — do we save it raw to a
   `prospect_profiles` table so the "Onboard this prospect" CTA pre-fills
   a real client record, or is it always re-scraped during onboarding?

5. **Competitor diff source** — For the "them vs us" side-by-side, do we
   pull _our_ side from:
   - (a) Zernio live data (rate-limited, fresh)?
   - (b) The most recent audit we ran on ourselves (cheap, might be stale)?
   - (c) Both — show live stats + link to the audit for deeper context?

6. **Which social networks does Zernio cover?** I need to know where the
   data will come from. Also: is there a generic "connected social"
   abstraction today, or is it Zernio-specific?

7. **Multi-competitor tracking** — Right now `social_competitors` is a
   manual list. Should "Competitor mode" automatically add to that list,
   or keep it as a separate ad-hoc search path?

8. **Modes available per tool** — confirm the mapping table above. Any
   tools where one mode doesn't make sense? E.g. is TikTok Shop
   "Our brand" mode even useful (the idea there is scouting _other_
   people's products), or is it Competitor/Prospect only?

---

## Phased rollout (once questions answered)

**Phase 1 — concrete, no spec-dependency (executing now):**
- Flatten `/admin/strategy-lab/[clientId]` → `/admin/strategy-lab` (read
  session brand from cookie).
- Rename + flatten `/admin/ad-creatives-v2/[clientId]` →
  `/admin/ad-creatives` (after retiring v1 hub).
- Strip Trend Finder's inline brand popover — default to session brand.

**Phase 2 — pilot on Audit, then broaden:**
- Build `<AnalysisShell>` + mode-selector primitive.
- Wire Audit (`/admin/analyze-social`) as the first tool.
- Get Jack's approval on the UX shape before expanding.

**Phase 3 — roll out to the rest:**
- Trend Finder, Meta Ads, Ecom Tracker, TikTok Shop Hub adopt
  `<AnalysisShell>`.
- Retire each tool's bespoke input block.

**Phase 4 — "our brand" data surfacing:**
- Add Zernio-powered performance context panel to "Our brand" mode on
  applicable tools.
- Only after phases 2–3 prove the pattern.
