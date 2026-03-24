import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublishableKey, getSupabaseUrl } from './public-env';

/**
 * SECURITY: Session lifetime configuration
 *
 * Supabase session settings are configured at the project level (Supabase Dashboard
 * → Authentication → Settings), NOT in the client SDK. Ensure the following are set:
 *
 *   - Access token (JWT) lifetime: 3600 seconds (1 hour)
 *   - Refresh token lifetime: 604800 seconds (7 days)
 *   - Refresh token rotation: ENABLED (invalidates old refresh tokens on use)
 *
 * These settings limit exposure from stolen tokens and ensure sessions are
 * revalidated regularly. The middleware in middleware.ts handles automatic
 * token refresh on each request via supabase.auth.getUser().
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
