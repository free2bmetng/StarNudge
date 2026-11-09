-- 002_phase2.sql: tables only, reserved for Phase 2 (Google Business Profile reviews and replies).
-- No application logic uses these tables yet. They carry RLS so they are safe to fill later.

create table reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  google_review_name text not null unique,
  rating int check (rating between 1 and 5),
  text_enc text,
  reviewer_name_enc text,
  review_created_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table review_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  body text not null,
  status text not null default 'draft' check (status in ('draft','approved','posted','failed')),
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table reviews enable row level security;
alter table review_replies enable row level security;

create policy tenant_isolation on reviews
  using (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('app.business_id', true), '')::uuid);

create policy tenant_isolation on review_replies
  using (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
