import type { SupabaseClient } from '@supabase/supabase-js';

export interface PersonalBoard {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  created_by: string | null;
  is_personal: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * Returns the caller's personal moodboard, creating one on first access.
 *
 * Invariant: exactly one active (non-archived) personal board per user.
 * The DB-level partial index on user_id where is_personal=true plus the
 * CHECK constraint keeps state coherent; this helper just manages the
 * application-level "first visit" create.
 */
export async function getOrCreatePersonalBoard(
  userId: string,
  adminClient: SupabaseClient,
): Promise<PersonalBoard> {
  const { data: existing, error: fetchError } = await adminClient
    .from('moodboard_boards')
    .select('id, name, description, user_id, created_by, is_personal, created_at, updated_at, archived_at')
    .eq('user_id', userId)
    .eq('is_personal', true)
    .is('archived_at', null)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing as PersonalBoard;

  const { data: created, error: insertError } = await adminClient
    .from('moodboard_boards')
    .insert({
      name: 'My board',
      description: 'Personal moodboard for pasted videos and reference clips.',
      user_id: userId,
      created_by: userId,
      is_personal: true,
    })
    .select('id, name, description, user_id, created_by, is_personal, created_at, updated_at, archived_at')
    .single();

  if (insertError) throw insertError;
  return created as PersonalBoard;
}
