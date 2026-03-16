import { createAdminClient } from '@/lib/supabase/admin';

export type UserRole = 'super_admin' | 'admin' | 'viewer';

interface UserAuth {
  id: string;
  role: UserRole;
  isSuperAdmin: boolean;
  organizationId: string | null;
}

/**
 * Get the effective role and permissions for a user.
 * - super_admin: is_super_admin = true (overrides role field)
 * - admin: role = 'admin' (team member)
 * - viewer: role = 'viewer' (client portal)
 */
export async function getUserAuth(userId: string): Promise<UserAuth | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, role, is_super_admin, organization_id')
    .eq('id', userId)
    .single();

  if (!data) return null;

  const isSuperAdmin = data.is_super_admin === true;

  return {
    id: data.id,
    role: isSuperAdmin ? 'super_admin' : (data.role as 'admin' | 'viewer'),
    isSuperAdmin,
    organizationId: data.organization_id ?? null,
  };
}

/**
 * Check if a user is a super admin. Use this to gate destructive actions
 * like managing team members, clients, and app settings.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('is_super_admin')
    .eq('id', userId)
    .single();
  return data?.is_super_admin === true;
}

/**
 * Check if a user has at least admin-level access (admin or super_admin).
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}
