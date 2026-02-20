import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  avatar_url: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { full_name, avatar_url, job_title, password } = parsed.data;

    // Update password via Supabase Auth if provided
    if (password) {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        return NextResponse.json({ error: pwError.message }, { status: 400 });
      }
    }

    // Update profile fields in users table
    const updates: Record<string, string | null> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (job_title !== undefined) updates.job_title = job_title;

    if (Object.keys(updates).length > 0) {
      const adminClient = createAdminClient();
      const { error: dbError } = await adminClient
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (dbError) {
        return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
