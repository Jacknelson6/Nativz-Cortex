# PRD 03 — Identity

## Goal

The heaviest editor in the profile. Captures everything that defines who the brand is, in one page split into focused sub-cards:

1. **Basics** — name, slug (read-only), website, agency, industry, lifecycle, description, logo
2. **Voice** (id `#voice`) — brand_voice, target_audience
3. **Captions** (id `#captions`) — caption_cta, caption_hashtags, caption_notes
4. **Products** (id `#products`) — NEW. Product rows with thumbnail, title, URL, price. Scraped from website during onboarding (PRD 10), editable here.
5. **Aliases** (id `#aliases`) — alternate brand names the AI should treat as synonyms

## Data model

### Existing columns (`clients`)
- `name`, `slug`, `industry`, `website_url`, `agency`, `logo_url`, `lifecycle_state`, `description`
- `brand_voice`, `target_audience`
- `caption_cta`, `caption_hashtags text[]`, `caption_notes`

### New table — `client_products`

Stores per-product rows so the AI can reference real merchandise during topic / script gen. Thumbnails live in the existing `client-logos` bucket under a `products/` prefix (no new bucket — admin-only read; products are not user-private).

```sql
create table if not exists client_products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  url text,
  price_cents integer,
  currency text default 'USD',
  thumbnail_url text,
  source text not null default 'manual'
    check (source in ('manual','onboarding_scrape','admin_import')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_products_client_id_idx on client_products (client_id, position);
alter table client_products enable row level security;
-- admin-only policy
```

### New table — `client_aliases`

```sql
create table if not exists client_aliases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (client_id, lower(alias))
);
```

## UI spec

- `WorkspaceSection` for each sub-card.
- Each sub-card has its own anchor id so Overview hover-Edit jumps to the exact card.
- Basics card uses the existing `InfoIdentityCard` editor logic, dropped into the new chrome.
- Voice / Captions reuse `InfoBrandVoiceCard` and `InfoBrandCaptionsCard` editor logic.
- Products is a new sortable list with inline add/edit/delete. Each row shows thumbnail (40px square), title, price, URL. Drag handle on the left.
- Aliases is a chip input ("Add alias…") — same shape as the captions hashtag input.

## API

- `GET /api/admin/clients/[slug]/products` — list
- `POST /api/admin/clients/[slug]/products` — create one
- `PATCH /api/admin/clients/[slug]/products/[id]`
- `DELETE /api/admin/clients/[slug]/products/[id]`
- `POST /api/admin/clients/[slug]/products/scrape` — kicks off a website scrape (returns scraped candidates for admin to confirm/reject)
- `POST /api/admin/clients/[slug]/products/reorder` — accepts `[{id, position}]`
- `GET/POST/DELETE /api/admin/clients/[slug]/aliases`

## Done criteria

- [ ] All five sub-cards render with read + edit states using `InfoCard` primitive.
- [ ] Anchor scrolling works (`/profile/identity#captions` scrolls + focuses the Captions card).
- [ ] Products: thumbnail uploads to `client-logos/products/<client_id>/<uuid>.png`, signed via public URL.
- [ ] Products scrape endpoint returns a candidate list; admin picks which to keep.
- [ ] Aliases dedupe case-insensitively.
- [ ] Migration 320 lands `client_products` + `client_aliases`.

## Out of scope

- Brand DNA (colors / fonts / logos beyond the avatar) — deferred per kill list. The current `InfoBrandDnaSlim` stays on `/settings/info` until rebuilt in a later phase.
