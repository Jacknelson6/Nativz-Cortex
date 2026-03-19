# Cortex Review — Correct Patterns

Quick-reference snippets extracted from the codebase. One section per pattern.

---

## 1. Standard auth block

```ts
const supabase = await createServerSupabaseClient();
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

## 2. Admin role check block

```ts
const supabase = await createServerSupabaseClient();
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const adminClient = createAdminClient();
const { data: userData } = await adminClient
  .from('users')
  .select('role')
  .eq('id', user.id)
  .single();

if (!userData || userData.role !== 'admin') {
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
}
```

## 3. Portal org scoping block

```ts
import { getPortalClient } from '@/lib/portal/get-portal-client';

const supabase = await createServerSupabaseClient();
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const result = await getPortalClient();
if (!result) {
  return NextResponse.json({ error: 'No client found' }, { status: 404 });
}
// Use result.client.id to scope all subsequent queries
```

## 4. Cron auth block

```ts
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    // cron logic here...
```

## 5. Zod validation block

```ts
const requestSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  client_id: z.string().uuid().nullable().optional(),
});

const body = await request.json();
const parsed = requestSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json(
    { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
    { status: 400 }
  );
}
const { query, client_id } = parsed.data;
```

## 6. Error handling block

```ts
export async function POST(request: NextRequest) {
  try {
    // ... route logic ...
  } catch (error) {
    console.error('POST /api/clients/[id]/strategy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## 7. logUsage block

```ts
import { logUsage, calculateCost } from '@/lib/ai/usage';

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

## 8. Dynamic params block

```ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  // ...
}
```

## 9. maxDuration placement

```ts
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // ...
}
```
