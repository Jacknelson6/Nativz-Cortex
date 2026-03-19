---
name: cortex-feature
description: "Use when building a new feature that spans API + UI. Orchestrates route scaffolding (delegates to cortex-route), lib function creation, UI component generation with dark theme, and page wiring. Knows admin vs portal file layout."
---

# cortex-feature

Orchestrates building a full vertical feature slice: API route, lib function, UI component, and page wiring.

## 1. Decision tree

```
Is this admin, portal, or shared?
├── Admin → route at app/api/<domain>/, page at app/admin/<section>/
├── Portal → route at app/api/portal/<domain>/, page at app/portal/<section>/
└── Shared → route at app/api/shared/<domain>/, token-based auth (manual)

Does it call an external service?
├── Yes → Add logUsage() with TrackedService, wire userId/userEmail
└── No → Skip usage tracking

Does it need a UI?
├── Yes → Component + page wiring. Reference detail-design-patterns.md
└── No → Just API + lib (background job, cron, etc.)

Is it long-running (AI, crawl, scrape)?
├── Yes → Add export const maxDuration
└── No → Skip
```

## 2. Workflow

1. **API route** — Use the `cortex-route` skill to scaffold the correct variant (standard, admin, portal, cron, or public)
2. **Lib function** — Create `lib/<domain>/<feature>.ts` with typed inputs/outputs. If the domain already has a `types.ts`, add types there. Otherwise check `lib/types/<domain>.ts`
3. **UI component** — Create `components/<domain>/<feature>.tsx`. Read `references/component-patterns.md` for the four main patterns (data card, data table, form, modal)
4. **Page wiring** — Add the component to the correct page under `app/admin/<section>/` or `app/portal/<section>/`
5. **Review** — Run through `references/checklist.md` to verify nothing is missed

## 3. References

- `references/file-layout.md` — Where files go based on feature type
- `references/component-patterns.md` — UI skeleton patterns with actual Tailwind classes
- `references/checklist.md` — Pre-flight checks before finishing
- `docs/detail-design-patterns.md` — 56 micro-interaction patterns (hover states, transitions, loading animations)
- `docs/conventions.md` — Full UI conventions, copy rules, data safety, performance patterns
