-- 159_client_ad_spend_portal_read.sql — portal viewers need to read their
-- own client's ad spend on /portal/billing. Migration 154 made it admin-only;
-- relaxing to a select-only policy scoped through user_client_access.
begin;

drop policy if exists client_ad_spend_portal_read on client_ad_spend;
create policy client_ad_spend_portal_read on client_ad_spend for select using (
  exists (
    select 1 from user_client_access
    where user_client_access.user_id = auth.uid()
    and user_client_access.client_id = client_ad_spend.client_id
  )
);

commit;
