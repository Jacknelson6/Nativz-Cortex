import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Log an API error to the database for super_admin monitoring.
 * Non-blocking — failures are swallowed.
 */
export async function logApiError(params: {
  route: string;
  method?: string;
  statusCode?: number;
  errorMessage: string;
  errorDetail?: string;
  userId?: string;
  userEmail?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('api_error_log').insert({
      route: params.route,
      method: params.method ?? 'POST',
      status_code: params.statusCode ?? 500,
      error_message: params.errorMessage,
      error_detail: params.errorDetail ?? null,
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      request_meta: params.meta ?? {},
    });
  } catch {
    // Swallow — error logging itself shouldn't crash the request
  }
}
