/** Common IANA zones for weekly digest scheduling (extend as needed). */
export const AFFILIATE_DIGEST_TIMEZONE_PRESETS: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'US — Eastern' },
  { value: 'America/Chicago', label: 'US — Central' },
  { value: 'America/Denver', label: 'US — Mountain' },
  { value: 'America/Phoenix', label: 'US — Arizona' },
  { value: 'America/Los_Angeles', label: 'US — Pacific' },
  { value: 'America/Anchorage', label: 'US — Alaska' },
  { value: 'Pacific/Honolulu', label: 'US — Hawaii' },
  { value: 'Europe/London', label: 'UK — London' },
  { value: 'Europe/Paris', label: 'Europe — Paris' },
  { value: 'Europe/Berlin', label: 'Europe — Berlin' },
  { value: 'Australia/Sydney', label: 'Australia — Sydney' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo' },
];

export const AFFILIATE_DIGEST_CUSTOM_TIMEZONE = '__custom__';
