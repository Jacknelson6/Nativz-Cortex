# New Feature Workflow

Steps when adding a new feature to Nativz Cortex:

1. **Read context** — Check `todo.md` for current priorities and `docs/architecture.md` for where it fits
2. **Database** — If new tables/columns needed, create migration via Supabase MCP `apply_migration`
3. **Types** — Add TypeScript interfaces to the appropriate file in `lib/types/`
4. **API route** — Create route in `app/api/`, follow pattern in `docs/api-patterns.md`
5. **Components** — Build in appropriate `components/` subdirectory, follow `docs/conventions.md`
6. **Page** — Wire up in `app/admin/` or `app/portal/` as appropriate
7. **Test** — Run `npm run build` to verify no TypeScript errors
8. **Update docs** — Add route to `docs/api-patterns.md`, update `todo.md`
