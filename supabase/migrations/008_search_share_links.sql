-- Share links for search results
create table if not exists search_share_links (
  id uuid default gen_random_uuid() primary key,
  search_id uuid not null references topic_searches(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_search_share_links_token on search_share_links(token);
create index idx_search_share_links_search_id on search_share_links(search_id);
