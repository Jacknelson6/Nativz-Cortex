const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DistributeInput {
  count: number;
  startDate: string;
  endDate: string;
  // Retained for legacy callers but ignored — every slot is 12:00 America/Chicago.
  defaultTime?: string;
}

export function distributeSlots(input: DistributeInput): string[] {
  if (input.count <= 0) return [];
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    throw new Error('Dates must be YYYY-MM-DD');
  }
  if (input.defaultTime !== undefined && !TIME_RE.test(input.defaultTime)) {
    throw new Error('defaultTime must be HH:MM');
  }

  const start = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date');
  }
  if (end < start) throw new Error('End date must be on or after start date');

  const totalDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  const slots: string[] = [];

  for (let i = 0; i < input.count; i++) {
    const dayOffset =
      input.count === 1 ? 0 : Math.round((i * (totalDays - 1)) / (input.count - 1));
    const date = new Date(start.getTime() + dayOffset * MS_PER_DAY);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    slots.push(chicagoNoonUtc(`${yyyy}-${mm}-${dd}`));
  }

  return slots;
}

// Returns the UTC ISO string for 12:00 wall-clock America/Chicago on the given
// date. Handles CST/CDT automatically via Intl — no hardcoded offset.
function chicagoNoonUtc(yyyyMmDd: string): string {
  const utcNoon = new Date(`${yyyyMmDd}T12:00:00Z`);
  const chicagoHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(utcNoon),
    10,
  );
  const hoursToAdd = 12 - chicagoHour;
  return new Date(utcNoon.getTime() + hoursToAdd * 60 * 60 * 1000).toISOString();
}
