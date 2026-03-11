-- Expand clients table with agency info, services, description, and Google Drive links

alter table clients
  add column agency text,
  add column services text[] default '{}',
  add column description text,
  add column google_drive_branding_url text,
  add column google_drive_calendars_url text;
