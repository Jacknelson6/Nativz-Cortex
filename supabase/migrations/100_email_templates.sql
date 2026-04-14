-- 100_email_templates.sql
-- Admin-shared email template library for the Users page composer.

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('followup', 'reminder', 'calendar', 'welcome', 'general')),
  subject text not null,
  body_markdown text not null,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists email_templates_category_idx on email_templates (category);

alter table email_templates enable row level security;

create policy email_templates_admin_read on email_templates for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy email_templates_admin_write on email_templates for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Seed 6 starter templates
insert into email_templates (name, category, subject, body_markdown) values
  (
    'Follow-up — day 3',
    'followup',
    'Quick follow-up, {{user.first_name}}',
    'Hey {{user.first_name}},

Checking in a few days after we talked. Any questions on the proposal?

Happy to jump on a call or answer anything here.

– {{sender.name}}'
  ),
  (
    'Follow-up — day 7',
    'followup',
    'Bumping this up, {{user.first_name}}',
    'Hey {{user.first_name}},

Just bumping this back to the top of your inbox. No rush, but I wanted to make sure it didn''t get buried.

Let me know if you want to keep the conversation going.

– {{sender.name}}'
  ),
  (
    'Reminder — audit ready to review',
    'reminder',
    'Your social analysis is ready',
    'Hi {{user.first_name}},

Your social analysis is ready to walk through. It covers your content performance vs competitors across TikTok, Instagram, Facebook, and YouTube.

Want to book a time this week to go through it?

– {{sender.name}}'
  ),
  (
    'Welcome — new client portal access',
    'welcome',
    'Welcome to {{client.name}} on Cortex',
    'Hi {{user.first_name}},

You''ve been added to the {{client.name}} client portal. Log in at cortex.nativz.io to see strategy, research, and analytics we''re tracking for you.

Let me know if anything looks off.

– {{sender.name}}'
  ),
  (
    'Meeting confirmation',
    'calendar',
    'Confirming our meeting',
    'Hi {{user.first_name}},

Confirming our time together. Add the meeting link to your calendar so you don''t miss it.

Meeting link: [scheduling link goes here]

– {{sender.name}}'
  ),
  (
    'Generic',
    'general',
    '',
    'Hi {{user.first_name}},

– {{sender.name}}'
  );
