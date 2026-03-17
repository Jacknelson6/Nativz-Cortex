import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';

const deleteSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
});

/**
 * DELETE /api/account/delete
 *
 * Permanently delete the authenticated user's account and associated data.
 * Removes: user profile from `users` table, auth account from Supabase Auth.
 * Does NOT cascade-delete client data (clients belong to the org, not the user).
 *
 * SOC 2 P6.1 — Right to Erasure
 *
 * @auth Required (any authenticated user)
 * @body { confirmation: "DELETE MY ACCOUNT" } — required safety phrase
 * @returns {{ success: true }}
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Delete user profile from users table
    const { error: dbError } = await adminClient
      .from('users')
      .delete()
      .eq('id', user.id);

    if (dbError) {
      console.error('Failed to delete user profile:', dbError);
      return NextResponse.json({ error: 'Failed to delete account.' }, { status: 500 });
    }

    // Delete auth account from Supabase Auth
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      console.error('Failed to delete auth account:', authDeleteError);
      return NextResponse.json({ error: 'Failed to delete auth account.' }, { status: 500 });
    }

    // Log the deletion (non-blocking)
    await logActivity(user.id, 'account_deleted', 'user', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/account/delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
