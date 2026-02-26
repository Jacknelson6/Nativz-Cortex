# Conventions

## UI & Styling

- Dark theme with card-based layout: `bg-surface` cards on `bg-background`, blue accent (`accent-text`) for active states and CTAs
- Brand colors: blue (`#046BD2` / `rgba(4, 107, 210, ...)`) and purple (`#8B5CF6` / `rgba(139, 92, 246, ...)`)
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
