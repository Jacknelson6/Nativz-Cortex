# PRD: VFF · 08 · 9:16 thumbnail card

> Viral Format Finder · 08/10 · 2026-05-10

## Purpose & Value

The atomic UI unit. Every row in VFF-07 is a sequence of these. The card must communicate format type, engagement angle, and brand fit in a single glance while staying 9:16 so it reads as short-form video. After this PRD, the placeholder cards in VFF-07's rows are replaced by the real component and the surface looks like a real product.

## Problem

Generic 16:9 thumbnails fail twice: they do not reflect the actual content shape (TikTok / Reels / Shorts are vertical), and they waste horizontal real estate. A 9:16 card forces sharper hierarchy and feels native to the medium. Also: broken images and grey eye tiles destroy trust; persistence + fallback are non-negotiable.

## Primary User

Internal strategist scanning a row.

## SMART Goals

- Card render <=30ms with no layout shift (image fetched eagerly within viewport; reserved aspect ratio).
- 100% of cards show a real thumbnail OR a platform-tinted fallback. Zero broken images at 24h post-deploy.
- Glance test: strategist identifies hook type + format archetype within 1.5s on visual review.
- Card width works between 160-220px without descender / ellipsis clipping.

## User Stories

- **US-01** — As a strategist, every card shows: 9:16 thumbnail, format pill (top-left), bold title (1-2 lines bottom), engagement-hook descriptor (subtitle one-line bottom).
- **US-02** — As a strategist, hovering surfaces a brand-relevance pill (high / medium / low) bottom-right; card scales 1.04 + accent border glow.
- **US-03** — As a strategist, clicking the card opens the detail view (VFF-09) via intercepting modal route; no full page reload.
- **US-04** — As a strategist, a card with no thumbnail renders a platform-tinted block with logomark + readable overlay.

## In Scope

- `components/formats/format-card.tsx` — the canonical card.
- `components/formats/format-card-fallback.tsx` — platform-tinted fallback layer.
- `components/formats/format-card.test.tsx` (RTL).
- Card wired into `format-row.tsx` (replaces placeholder from VFF-07).
- Click handler routes to `/admin/formats/[id]` (Next.js intercepting modal: `@modal/(.)formats/[id]`). The modal route itself lands in VFF-09; this PRD only wires the click target.
- Slug → display_name lookup map cached at the row level (passed as a prop, computed once per feed).
- Brand-relevance pill: derived from `brand_relevance` field already returned by VFF-07's feed.

## Out of Scope

- The detail view content (VFF-09).
- Drag-to-reorder cards.
- Mobile sizing variants.
- Multi-select for bulk actions.

## Resolved Decisions

- **D-01** — Title source? **→ First line of caption if <=60 chars and not empty; else `viral_videos.title` (LLM-generated); else `engagement_hook_descriptor`.** Rationale: caption first-line is most recognizable; LLM title is fallback only.
- **D-02** — Brand-relevance pill always or hover-only? **→ Hover-only.** Rationale: reduces visual noise; power-user reveal.
- **D-03** — Format pill placement when title is busy at top? **→ Pin top-left always; gradient handles legibility.** Rationale: consistency beats per-card optimization.
- **D-04** — Fallback when thumbnail missing? **→ Platform-tinted block (`bg-platform-tiktok` / `bg-platform-instagram` / `bg-platform-youtube` tokens) with white logomark centered.** Rationale: visually distinct from a broken image; signals platform.
- **D-05** — Card width? **→ Tailwind `w-44` (176px) default; row can override via prop `cardWidth`.** Rationale: fits 5-6 across on a 14" laptop.
- **D-06** — Hover scale + glow? **→ `transition-transform duration-150 hover:scale-[1.04]` + `hover:ring-1 hover:ring-accent`.** Rationale: subtle; matches existing audit card pattern.
- **D-07** — Click behavior? **→ Intercepting modal route `@modal/(.)formats/[id]`; URL updates; back closes modal.** Rationale: deep-linkable, no full reload.
- **D-08** — Thumbnail fetch? **→ Native `<img>` with `loading="lazy"` AND `decoding="async"`. Not `next/image` because Supabase Storage URLs are pre-sized; next/image adds overhead.** Rationale: pragmatic; row already lazy-loads beyond first viewport.

## Data Model

No new schema. Consumes feed payload from VFF-07's `/api/admin/formats/feed` route.

## API Contracts

None new in this PRD.

## LLM Prompts

None.

## UI Components

### `components/formats/format-card.tsx`

Props:
```ts
type ViralVideoCard = {
  id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url: string;
  thumbnail_storage_url: string | null;
  thumbnail_source_url: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  creator_handle: string | null;
  views_count: number | null;
  posted_at: string | null;
  hook_type_slug: string | null;
  hook_type_label: string | null;
  brand_relevance: 'high' | 'medium' | 'low' | null;
};

type Props = {
  video: ViralVideoCard;
  cardWidth?: number;     // default 176
  onOpen?: (id: string) => void;  // optional override; defaults to router.push intercepting modal
};
```

Layout (tailwind, 9:16):
```
<button
  type="button"
  className="group relative block w-44 aspect-[9/16] rounded-md overflow-hidden bg-surface transition-transform duration-150 hover:scale-[1.04] hover:ring-1 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  onClick={() => onOpen?.(video.id) ?? router.push(`/admin/formats/${video.id}`)}
>
  {thumbnail ? (
    <img src={thumbnail} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
  ) : (
    <FormatCardFallback platform={video.platform} />
  )}
  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
  {video.hook_type_label && (
    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-[11px] font-medium text-white">
      {video.hook_type_label}
    </span>
  )}
  <div className="absolute bottom-2 left-2 right-2">
    <div className="text-sm font-semibold text-white line-clamp-2 leading-tight">
      {resolveTitle(video)}
    </div>
    {video.engagement_hook_descriptor && (
      <div className="mt-1 text-[11px] text-neutral-200 line-clamp-1">
        {video.engagement_hook_descriptor}
      </div>
    )}
  </div>
  {video.brand_relevance && (
    <span className="absolute bottom-2 right-2 hidden group-hover:inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-black/80 text-white">
      {RELEVANCE_LABEL[video.brand_relevance]}
    </span>
  )}
</button>
```

Copy:
- Aria-label on the card: "Open {hook_type_label} format card"
- Relevance pill labels:
  - `high` → "Strong fit"
  - `medium` → "Decent fit"
  - `low` → "Loose fit"
- Title resolution helper `resolveTitle(video)`:
  ```ts
  function resolveTitle(v: ViralVideoCard): string {
    const cap = v.title?.trim() ?? '';
    if (cap && cap.length <= 60) return cap;
    if (cap && cap.length > 60) return cap.slice(0, 57).trim() + '...';
    return v.engagement_hook_descriptor ?? 'Untitled video';
  }
  ```

States: hover (handled by group); focus-visible (ring); empty (no card rendered when video missing — parent decides).

Tokens: `bg-surface`, `text-white`, `text-neutral-200`, `bg-black/60`, ring `accent`. Platform tokens defined in T01.

### `components/formats/format-card-fallback.tsx`

Props:
```ts
type Props = {
  platform: 'tiktok' | 'instagram' | 'youtube';
};
```

Layout: solid platform-tinted background, white logomark centered (TikTok music note, Instagram gradient logo, YouTube play triangle).

Tokens (new utility classes added in T01 if missing):
- `bg-platform-tiktok` → `#000000`
- `bg-platform-instagram` → gradient `linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)`
- `bg-platform-youtube` → `#ff0000`

### Modify `components/formats/format-row.tsx`
Replace placeholder card with `<FormatCard video={v} />`.

## File Map

Create:
- `components/formats/format-card.tsx`
- `components/formats/format-card-fallback.tsx`
- `components/formats/format-card.test.tsx`
- `lib/branding/platform-tokens.ts` (if not present — exports `PLATFORM_BG`, `PLATFORM_LOGOMARK`)
- `tasks/ralph/vff-08-thumbnail-card/progress.txt`

Modify:
- `components/formats/format-row.tsx` (swap placeholder for real card)
- `app/globals.css` (add `.bg-platform-tiktok`, `.bg-platform-instagram`, `.bg-platform-youtube` utilities if not present)

## Env Vars

None new.

## Edge Cases

- **Missing thumbnail AND missing title AND missing descriptor.** Renders fallback + "Untitled video" string; rare; do not crash.
- **Caption with emoji or RTL text.** Use `truncate` + `line-clamp-2`; emoji safe; RTL caught by overflow.
- **Very long single-word title.** `break-words` not added; ellipsis at 60 chars truncate handles.
- **Thumbnail URL returns 403/404 after persisting.** Native `<img>` shows broken icon; mitigated by `onError` handler swapping in fallback at runtime.
- **Card clicked while modal is opening.** Idempotent; router handles deduplication.
- **Keyboard navigation.** `<button>` element is focusable; Enter triggers click.
- **`hook_type_label` missing (un-mapped slug).** Pill hides; do not show raw slug.
- **`brand_relevance` null (no embedding yet).** Pill hides on hover.

## Test Plan

Unit (RTL):
- `format-card.test.tsx`:
  - Renders title from caption when <=60 chars.
  - Truncates caption with ellipsis when >60.
  - Falls back to `engagement_hook_descriptor` when caption empty.
  - Falls back to "Untitled video" when all missing.
  - Renders fallback component when `thumbnail_storage_url` and `thumbnail_source_url` both null.
  - Hover reveals brand-relevance pill (`getByText('Strong fit')` after `userEvent.hover`).
  - Click triggers onOpen prop or router.push.

E2E (Playwright, runs inside VFF-07 page tests):
- Click a card in `/admin/formats`; URL changes to `/admin/formats/<id>`; modal opens (modal content is VFF-09; here just verify URL + opening).

Manual QA:
- Verify zero broken images across 100 random cards (refresh, sample 10 rows).
- Verify fallback renders for an intentionally-broken thumbnail row.
- Verify ring + scale on hover.
- Verify keyboard focus ring.

## Architecture Wiring

- Card consumes the `ViralVideoCard` shape from VFF-07's feed payload directly.
- Click handler uses Next.js parallel-route intercepting modal at `@modal/(.)formats/[id]` (defined in VFF-09).
- Platform tokens live in `lib/branding/platform-tokens.ts` for reuse across audit + analytics + VFF surfaces.
- Hover scale + ring mirror existing audit card behavior in `components/audit/audit-thumb-card.tsx` (or sibling); verify and harmonize.

## Done When

- Cards render with real data across all 8 rows in `/admin/formats`.
- Zero broken images verified at 24h.
- Visual QA Jack-approved: density, hierarchy, typography match audit detail card.
- Glance test passes (informal Jack review).
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
