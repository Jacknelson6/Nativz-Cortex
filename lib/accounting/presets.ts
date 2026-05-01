// Hard-coded preset amounts per service. Half-period = ½ of monthly fee
// since payroll runs 24x/year (1st and 16th). Today only SMM has a flat
// preset; editing/affiliate/blogging are project-priced.
//
// TODO: move to a `payroll_presets` table editable from settings once we
// need per-client overrides or non-SMM presets.

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

export interface AmountPreset {
  amount_cents: number;
  description?: string;
  label: string;
}

export function getPreset(service: EntryType): AmountPreset | null {
  if (service === 'smm') {
    return {
      amount_cents: 61000,
      label: '$610 per half-period',
    };
  }
  return null;
}
