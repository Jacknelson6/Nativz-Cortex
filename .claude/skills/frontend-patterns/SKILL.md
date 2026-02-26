# Frontend Patterns

Activated when working on React components, pages, or UI elements.

## Component Conventions

- All chart components must be client components (`'use client'`)
- Use `<Card interactive>` when wrapping a card in a `<Link>`
- Glass buttons for primary search actions, glow buttons for settings CTAs
- Brand colors: blue `#046BD2`, purple `#8B5CF6`
- Dark theme: `bg-surface` cards on `bg-background`, `accent-text` for active states

## Copy Rules

- **Sentence case** everywhere (only capitalize first word + proper nouns)
- Error messages: what happened + what to do next
- Empty states: always include guidance text
- Button labels: start with a verb, name the specific action

## Data Display

- AI response fields: always null-safe (`?? []`, `?? ''`, `?? 0`)
- Sentiment: use `getSentimentColorClass(score)` and `getSentimentBadgeVariant(score)` from `lib/utils/sentiment.ts`

## UI Primitives (components/ui/)

Button, Card, Input, Badge, Select, Dialog, GlassButton, GlowButton, Toggle, ImageUpload, TagInput, Skeleton, ScrollToTop, FloatingDock, TooltipCard, AvatarEditor, EncryptedText, TextFlip

## Shared Components (components/shared/)

StatCard, LoadingSkeleton, EmptyState, PageError, Breadcrumbs, CommandPalette, PageTransition

## Reference

See `docs/detail-design-patterns.md` for 56 applicable UI/UX micro-interaction patterns.
