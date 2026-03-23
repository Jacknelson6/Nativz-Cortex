# Conventions

## UI & Styling

- Card-based layout: `bg-surface` cards on `bg-background`, accent colors for active states and CTAs
- **Brand mode toggle**: click sidebar logo to switch between Nativz (dark/blue) and Anderson Collaborative (light/teal)
- **Never hardcode colors** — use CSS variable tokens: `--accent`, `--accent2`, `--background`, `--surface`, `--text-primary`, `--text-secondary`, `--text-muted`, `--focus-ring`, `--error`, `--error-hover`
- Primary accent: `accent` / `accent-text` / `accent-surface` (blue in Nativz, teal in AC)
- Secondary accent: `accent2` / `accent2-text` / `accent2-surface` (purple in Nativz, teal in AC)
- Focus rings: match inputs and buttons — `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background` plus `focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]` where applicable
- **Typography utilities** (`app/globals.css` `@layer components`): `ui-page-title`, `ui-section-title`, `ui-card-title`, `ui-label`, `ui-body`, `ui-muted`, `ui-caption`, `ui-cal-weekday` — prefer these (or the same token classes inline) so font size, weight, and color stay aligned across SaaS surfaces
- **Buttons**: default to `@/components/ui/button` — `primary` (gradient + `btn-shimmer`) for main CTAs, `secondary` / `outline` / `ghost` for hierarchy, `danger` uses `--error` tokens. Reserve **GlassButton** for hero search-style actions and **GlowButton** for settings CTAs (see below)
- **Body font**: root layout uses `font-sans` (Plus Jakarta Sans via `next/font` → `--font-geist-sans`); avoid introducing second sans families in product UI
- All UI copy uses **sentence case** (only capitalize first word + proper nouns)
- Glass buttons (`components/ui/glass-button.tsx`) for primary search actions
- Glow buttons (`components/ui/glow-button.tsx`) for settings CTAs
- Use the `interactive` prop on `<Card>` for any card wrapped in a `<Link>`
- All chart components are client components (`'use client'`)

## Content & Copy

- Error messages follow the pattern: what happened + what to do next
- Empty states always include guidance on what the user should do
- Button labels start with a verb and name the specific action

## Data Safety

- AI response fields must always use null safety (`?? []`, `?? ''`, `?? 0`) — Claude sometimes returns incomplete JSON
- Use `getSentimentColorClass(score)` and `getSentimentBadgeVariant(score)` from `lib/utils/sentiment.ts`

## Performance

- Vault GitHub fetches use `next: { revalidate: 300 }` (5 min cache)
- Layout user data uses `unstable_cache()` (5 min)
- Middleware role uses httpOnly cookie (`x-user-role`, 10 min)

## UI/UX Patterns Reference

See `docs/detail-design-patterns.md` for 56 curated patterns from detail.design. Reference when implementing new UI components or interactions.
