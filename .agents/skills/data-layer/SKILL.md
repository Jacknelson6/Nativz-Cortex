# Data Layer

Activated when working on API routes, database queries, or Supabase operations.

## Supabase Clients

| Client | Import | Use Case |
|--------|--------|----------|
| Browser | `lib/supabase/client.ts` | Client-side queries |
| Server | `lib/supabase/server.ts` | Server components, route handlers |
| Admin | `lib/supabase/admin.ts` | Service role — bypasses RLS |
| Middleware | `lib/supabase/middleware.ts` | Auth + role routing |

## API Route Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ /* ... */ })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // ... business logic
}
```

## Next.js 15 Dynamic Params

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```

## Auth Rules

- Admin pages: `createAdminClient()` for unrestricted access
- Portal pages: always scope queries by `organization_id`
- Check `feature_flags` before allowing portal actions

## Performance

- Vault GitHub fetches: `next: { revalidate: 300 }` (5 min cache)
- Layout user data: `unstable_cache()` (5 min)
- Middleware role: httpOnly cookie `x-user-role` (10 min)

## Reference

See `docs/database.md` for full table schemas.
See `docs/api-patterns.md` for all API routes.
