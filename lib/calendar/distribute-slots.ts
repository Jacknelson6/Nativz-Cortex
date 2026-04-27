const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DistributeInput {
  count: number;
  startDate: string;
  endDate: string;
  defaultTime: string;
}

export function distributeSlots(input: DistributeInput): string[] {
  if (input.count <= 0) return [];
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    throw new Error('Dates must be YYYY-MM-DD');
  }
  if (!TIME_RE.test(input.defaultTime)) {
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
    const hhmm = input.defaultTime.slice(0, 5);
    slots.push(`${yyyy}-${mm}-${dd}T${hhmm}:00Z`);
  }

  return slots;
}
