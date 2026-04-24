export function formatCents(cents: number | null | undefined, currency = 'usd'): string {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatCentsCompact(cents: number | null | undefined, currency = 'usd'): string {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  if (Math.abs(value) >= 1_000_000_00) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value / 100);
  }
  return formatCents(value, currency);
}

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number | null | undefined): number {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return 0;
  return cents / 100;
}
