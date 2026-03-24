export const NATIVZ_BRAND_DNA_UPDATED_EVENT = 'nativz:brand-dna-updated';

export type NativzBrandDnaUpdatedDetail = { clientId: string };

/** Call after any successful Brand DNA save so ad wizard / hub refetch from the database. */
export function dispatchBrandDnaUpdated(clientId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<NativzBrandDnaUpdatedDetail>(NATIVZ_BRAND_DNA_UPDATED_EVENT, {
      detail: { clientId },
    }),
  );
}
