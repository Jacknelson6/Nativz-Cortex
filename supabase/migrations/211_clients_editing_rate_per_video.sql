-- Per-client editing revenue rate (used by accounting margin calc).
-- $50/video is the house default — Toastique and other custom-rate
-- clients get adjusted from the UI.

alter table clients
  add column editing_rate_per_video_cents integer not null default 5000;

comment on column clients.editing_rate_per_video_cents is
  'Revenue Nativz charges this client per edited video, in cents. Default 5000 ($50). Used by /admin/accounting margin calc.';
