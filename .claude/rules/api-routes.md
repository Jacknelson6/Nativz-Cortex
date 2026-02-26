# API Route Rules

Applies to all files under `app/api/`.

## Required

- Validate input with Zod schema before processing
- Check auth (`supabase.auth.getUser()`) before any data access
- Use `createAdminClient()` only for admin-only operations
- Portal routes must scope queries by `organization_id`
- Return proper HTTP status codes (401 unauthorized, 400 bad request, 404 not found)

## Patterns

- Dynamic params: `{ params }: { params: Promise<{ id: string }> }` then `await params`
- Always return `NextResponse.json()` — never raw `Response()`
- Error responses: `{ error: string }` with descriptive message
- AI response fields: null-safe with `?? []`, `?? ''`, `?? 0`
