const STORAGE_KEY = 'cortex_brand_dna_pending';
const MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6h — ignore stale entries

export type BrandDnaPending = {
  clientId: string;
  clientName?: string;
  at: number;
};

export function setBrandDnaPending(clientId: string, clientName?: string): void {
  try {
    const payload: BrandDnaPending = {
      clientId,
      clientName,
      at: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // private mode / quota
  }
}

export function clearBrandDnaPending(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readBrandDnaPending(): BrandDnaPending | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<BrandDnaPending>;
    if (!o?.clientId || typeof o.clientId !== 'string') return null;
    const at = typeof o.at === 'number' ? o.at : 0;
    if (Date.now() - at > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      clientId: o.clientId,
      clientName: typeof o.clientName === 'string' ? o.clientName : undefined,
      at,
    };
  } catch {
    return null;
  }
}
