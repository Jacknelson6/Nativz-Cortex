export type ServiceKind = 'editing' | 'smm' | 'blogging';

export const SERVICE_DEFAULT_MONTHLY: Record<ServiceKind, number> = {
  editing: 0,
  smm: 60,
  blogging: 0,
};

const SERVICE_LABEL_TO_KIND: Record<string, ServiceKind> = {
  editing: 'editing',
  smm: 'smm',
  blogging: 'blogging',
};

export function normalizeServiceLabel(label: string | null | undefined): ServiceKind | null {
  if (!label) return null;
  return SERVICE_LABEL_TO_KIND[label.trim().toLowerCase()] ?? null;
}

export function clientHasService(services: string[] | null | undefined, kind: ServiceKind): boolean {
  if (!services?.length) return false;
  return services.some((s) => normalizeServiceLabel(s) === kind);
}
