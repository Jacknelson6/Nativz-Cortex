# Cortex Review Checklist

Organized by severity. For each check: what to look for, a BAD example, and a GOOD example.

---

## Critical (block)

### 1. Auth before data

Every API route must authenticate before any DB query or external call.

```ts
// BAD — data access before auth check
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const { data } = await admin.from('clients').select('*');
  // auth check happens later...
}
```

```ts
// GOOD — auth first, then data
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // now safe to query
}
```

### 2. Portal org scoping

Routes under `app/api/portal/` must scope all queries by the portal user's organization.

```ts
// BAD — portal route without org scoping
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('clients').select('*');
  return NextResponse.json(data);
}
```

```ts
// GOOD — scoped via getPortalClient()
export async function GET(request: NextRequest) {
  const result = await getPortalClient();
  if (!result) {
    return NextResponse.json({ error: 'No client found' }, { status: 404 });
  }
  // all queries scoped to result.client.id
}
```

### 3. Zod before processing

Request body/params validated with `.safeParse()` before any use.

```ts
// BAD — raw destructure, no validation
export async function POST(request: NextRequest) {
  const { name, email } = await request.json();
  await admin.from('users').insert({ name, email });
}
```

```ts
// GOOD — Zod safeParse with error response
const body = await request.json();
const parsed = requestSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json(
    { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
    { status: 400 }
  );
}
const { name, email } = parsed.data;
```

---

## Warning (flag)

### 4. AI null-safety

AI response fields can be undefined. Always use nullish coalescing.

```ts
// BAD — trusts AI response shape
const ideas = response.ideas;
const summary = response.summary;
const score = response.score;
```

```ts
// GOOD — null-safe defaults
const ideas = response.ideas ?? [];
const summary = response.summary ?? '';
const score = response.score ?? 0;
```

### 5. Usage tracking

Routes that call AI/external APIs should log usage with user context.

```ts
// BAD — no logUsage, or missing user context
await createCompletion({ model, messages });
// no logUsage call at all
```

```ts
// GOOD — logUsage with userId and userEmail
await logUsage({
  service: 'openrouter',
  model: modelName,
  feature: 'topic_research',
  inputTokens: usage.prompt_tokens,
  outputTokens: usage.completion_tokens,
  totalTokens: usage.total_tokens,
  costUsd: calculateCost(modelName, usage.prompt_tokens, usage.completion_tokens),
  userId: user.id,
  userEmail: user.email ?? undefined,
});
```

### 6. Error responses

All error responses must use `NextResponse.json()` with a descriptive `{ error }` object.

```ts
// BAD — raw Response or thrown error
return new Response('Something went wrong');
throw new Error('Not found');
```

```ts
// GOOD — structured JSON error with status code
return NextResponse.json({ error: 'Client not found' }, { status: 404 });
return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
```

### 7. Dynamic params

Next.js 15 params are async. Must `await` them.

```ts
// BAD — synchronous destructure (breaks in Next.js 15)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
}
```

```ts
// GOOD — async params with await
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
}
```

### 8. Error log format

Console errors should include the route path for traceability.

```ts
// BAD — anonymous error log
console.log(error);
console.error(error);
```

```ts
// GOOD — route-prefixed error message
console.error('POST /api/clients/[id]/strategy error:', error);
console.error('GET /api/cron/publish-posts error:', error);
```

### 9. maxDuration

Routes calling external APIs (OpenRouter, Apify, Cloudflare, Brave) need an explicit timeout.

```ts
// BAD — no maxDuration on a route that calls OpenRouter
import { createCompletion } from '@/lib/ai/client';
export async function POST(request: NextRequest) {
  const result = await createCompletion({ ... });
}
```

```ts
// GOOD — maxDuration exported at top of file
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const result = await createCompletion({ ... });
}
```

### 10. Admin client scope

Don't use `createAdminClient()` when `createServerSupabaseClient()` suffices.

```ts
// BAD — admin client for a user-scoped read
const admin = createAdminClient();
const { data } = await admin.from('searches')
  .select('*')
  .eq('user_id', user.id);
```

```ts
// GOOD — server client respects RLS
const supabase = await createServerSupabaseClient();
const { data } = await supabase.from('searches')
  .select('*')
  .eq('user_id', user.id);
```

---

## Info (note)

### 11. Missing JSDoc

Every exported handler should have a JSDoc block documenting auth, body, and return shape.

```ts
// BAD — no documentation
export async function POST(request: NextRequest) {
```

```ts
// GOOD — JSDoc with auth, body, and return info
/**
 * POST /api/clients/[id]/strategy
 *
 * Generate a full content strategy for a client using AI.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @returns {{ strategyId: string, status: string }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
```
