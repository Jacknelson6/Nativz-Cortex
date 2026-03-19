import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Public route — no auth required. Make sure this path is in the middleware allowlist
// (see middleware.ts publicPaths array)

// TODO: Define your Zod schema
const requestSchema = z.object({
  // example: z.string().min(1, 'Field is required'),
});

/**
 * POST /api/TODO-path
 *
 * TODO: Describe what this endpoint does.
 *
 * @auth None (public)
 * @body TODO: Document request body fields
 * @returns TODO: Document response shape
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    // TODO: Your business logic here

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/TODO-path error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
