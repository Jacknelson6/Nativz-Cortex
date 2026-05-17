'use client';

import {
  SectionEditor,
  EditorField,
  editorInputClass,
} from './section-editor';

const KNOWN_SERVICES = [
  'SMM',
  'Editing',
  'Strategy',
  'Production',
  'Ads',
  'Email',
  'Web',
  'Photo',
] as const;

type ServicesDraft = { services: string[] };

export function ServicesEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: ServicesDraft;
}) {
  return (
    <SectionEditor<ServicesDraft>
      title="Services"
      description="What we deliver for this brand. Drives which dashboards + crons run for them."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({ services: d.services })}
    >
      {(d, set) => (
        <EditorField
          label="Active services"
          hint="Tick everything that's in scope. SMM unlocks the monthly calendar cron."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {KNOWN_SERVICES.map((s) => {
              const active = d.services.includes(s);
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() =>
                    set({
                      services: active
                        ? d.services.filter((v) => v !== s)
                        : [...d.services, s],
                    })
                  }
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'border-accent/40 bg-accent-surface text-accent-text'
                      : 'border-nativz-border bg-background text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </EditorField>
      )}
    </SectionEditor>
  );
}

type CapacityDraft = { monthly_calendar_post_count: number };

export function CapacityEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: CapacityDraft;
}) {
  return (
    <SectionEditor<CapacityDraft>
      title="Monthly output"
      description="Number of post slots the calendar cron pre-creates on the 1st of every month. 0 disables the cron."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      validate={(d) => {
        const n = d.monthly_calendar_post_count;
        if (!Number.isInteger(n) || n < 0 || n > 1000) {
          return 'Must be a whole number between 0 and 1000';
        }
        return null;
      }}
      buildBody={(d) => ({
        monthly_calendar_post_count: d.monthly_calendar_post_count,
      })}
    >
      {(d, set) => (
        <EditorField label="Posts per month">
          <input
            type="number"
            min={0}
            max={1000}
            value={d.monthly_calendar_post_count}
            onChange={(e) =>
              set({
                monthly_calendar_post_count: Number.parseInt(e.target.value || '0', 10) || 0,
              })
            }
            className={editorInputClass}
          />
        </EditorField>
      )}
    </SectionEditor>
  );
}

type PostingDraft = {
  default_posting_time: string;
  default_posting_timezone: string;
};

const COMMON_TZS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Australia/Sydney',
];

export function PostingDefaultsEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: PostingDraft;
}) {
  return (
    <SectionEditor<PostingDraft>
      title="Posting defaults"
      description="Used when the calendar pre-fills new drops so the team doesn't have to set time + timezone every month."
      initial={initial}
      endpoint={`/api/clients/${clientId}/brand-profile`}
      buildBody={(d) => ({
        default_posting_time: d.default_posting_time || null,
        default_posting_timezone: d.default_posting_timezone.trim() || null,
      })}
    >
      {(d, set) => (
        <>
          <EditorField label="Default post time" hint="24-hour local time, e.g. 09:00.">
            <input
              type="time"
              value={d.default_posting_time}
              onChange={(e) => set({ default_posting_time: e.target.value })}
              className={editorInputClass}
            />
          </EditorField>
          <EditorField label="Timezone">
            <input
              list="timezone-options"
              type="text"
              value={d.default_posting_timezone}
              onChange={(e) => set({ default_posting_timezone: e.target.value })}
              className={editorInputClass}
              placeholder="America/Chicago"
            />
            <datalist id="timezone-options">
              {COMMON_TZS.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </EditorField>
        </>
      )}
    </SectionEditor>
  );
}
