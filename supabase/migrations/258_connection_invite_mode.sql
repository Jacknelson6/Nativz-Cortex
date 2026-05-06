-- 258_connection_invite_mode.sql
-- Persist whether an invite is a first-time "connect" or a recovery
-- "reconnect" so the public landing page can render the right copy
-- without re-deriving from social_profiles state (which can change
-- between when we minted the invite and when the client opens it).

alter table connection_invites
  add column if not exists mode text not null default 'reconnect'
    check (mode in ('connect', 'reconnect'));

comment on column connection_invites.mode is
  'connect = first-time link for these platforms; reconnect = recovering a dropped or expired token. Drives email subject + landing-page copy.';
