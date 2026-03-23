/**
 * Per-client access to admin client workspace areas (excluding Overview + Settings).
 * When a key is `false`, the team does not have access: nav is hidden and routes return 404.
 * Stored in `clients.admin_workspace_modules` as { [key]: boolean }; omitted keys default to allowed (true).
 */

export const ADMIN_WORKSPACE_TOGGLE_KEYS = [
  'brand-dna',
  'moodboard',
  'knowledge',
  'ideas',
  'idea-generator',
  'ad-creatives',
] as const;

export type AdminWorkspaceToggleKey = (typeof ADMIN_WORKSPACE_TOGGLE_KEYS)[number];

export const ADMIN_WORKSPACE_TOGGLE_META: Record<
  AdminWorkspaceToggleKey,
  { label: string; description: string }
> = {
  'brand-dna': {
    label: 'Brand DNA',
    description: 'When on, your team can open Brand DNA for this client; when off, there is no access (nav hidden, URL blocked).',
  },
  moodboard: {
    label: 'Moodboard',
    description: 'When on, your team can use the client moodboard; when off, no access.',
  },
  knowledge: {
    label: 'Knowledge',
    description: 'When on, your team can open the knowledge vault for this client; when off, no access.',
  },
  ideas: {
    label: 'Ideas',
    description: 'When on, your team can open the ideas hub and saved ideas; when off, no access.',
  },
  'idea-generator': {
    label: 'Idea generator',
    description: 'When on, your team can run the AI idea generation flow for this client; when off, no access.',
  },
  'ad-creatives': {
    label: 'Ad creatives',
    description: 'When on, your team can use ad creative generation and the library; when off, no access.',
  },
};

/** True if this nav key is allowed for the client (team has access). */
export function isAdminWorkspaceNavVisible(
  modules: Record<string, boolean> | null | undefined,
  navKey: string,
): boolean {
  if (navKey === 'overview' || navKey === 'settings') return true;
  if (!modules || typeof modules !== 'object') return true;
  const v = modules[navKey];
  if (v === false) return false;
  return true;
}

export function normalizeAdminWorkspaceModules(
  raw: unknown,
): Record<AdminWorkspaceToggleKey, boolean> {
  const out = {} as Record<AdminWorkspaceToggleKey, boolean>;
  for (const key of ADMIN_WORKSPACE_TOGGLE_KEYS) {
    out[key] = true;
  }
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const key of ADMIN_WORKSPACE_TOGGLE_KEYS) {
    if (typeof o[key] === 'boolean') {
      out[key] = o[key];
    }
  }
  return out;
}

/** PATCH body must include every toggle key with a boolean (full replace). */
export function parseFullAdminWorkspaceModulesForPatch(
  body: unknown,
): Record<AdminWorkspaceToggleKey, boolean> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  for (const key of ADMIN_WORKSPACE_TOGGLE_KEYS) {
    if (typeof o[key] !== 'boolean') return null;
  }
  return normalizeAdminWorkspaceModules(o);
}
