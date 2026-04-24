type Package = {
  monthly_cents: number | null;
  annual_cents: number | null;
  setup_cents: number | null;
};

export function computeTotals(packages: Package[]): {
  monthlyCents: number;
  annualCents: number;
  setupCents: number;
  firstInvoiceCents: number;
} {
  let monthly = 0;
  let annual = 0;
  let setup = 0;
  for (const p of packages) {
    monthly += p.monthly_cents ?? 0;
    annual += p.annual_cents ?? 0;
    setup += p.setup_cents ?? 0;
  }
  return {
    monthlyCents: monthly,
    annualCents: annual,
    setupCents: setup,
    firstInvoiceCents: setup + monthly,
  };
}
