import { createAdminClient } from '@/lib/supabase/admin';

type EntityType = 'search' | 'client' | 'idea' | 'shoot' | 'report' | 'api_key' | 'user' | 'impersonation';

export async function logActivity(
  actorId: string,
  action: string,
  entityType: EntityType,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const adminClient = createAdminClient();
    await adminClient.from('activity_log').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadata ?? {},
    });
  } catch (error) {
    // Non-blocking — activity logging should never break the main operation
    console.error('Failed to log activity:', error);
  }
}
