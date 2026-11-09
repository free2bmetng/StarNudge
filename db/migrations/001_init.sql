-- 001_init.sql: core StarNudge schema.
-- Tenant tables carry business_id and are protected by row-level security (RLS).
-- The runtime role starnudge_app is not the table owner, so RLS applies to it.
-- Cross-tenant lookups (webhooks, worker claims, short links) go through
-- SECURITY DEFINER functions defined at the bottom of this file.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null check (industry in ('restaurant','salon','dental_medical','auto','home_services','fitness')),
  time_zone text not null,
  default_language text not null default 'en' check (default_language in ('en','es')),
  postal_address text not null,
  -- Sends are allowed in [quiet_start_hour, quiet_end_hour). Owners may only narrow this window.
  quiet_start_hour int not null default 8 check (quiet_start_hour between 8 and 20),
  quiet_end_hour int not null default 21 check (quiet_end_hour between 9 and 21),
  check (quiet_end_hour > quiet_start_hour),
  -- Owners may lengthen the frequency window, never shorten it below 90 days.
  frequency_window_days int not null default 90 check (frequency_window_days between 90 and 365),
  subscription_status text not null default 'none' check (subscription_status in ('none','active','canceled_at_period_end','canceled')),
  period_end timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now()
);

create table memberships (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create table sessions (
  token_hash text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);

create table review_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  url text not null,
  place_id text,
  confirmed_at timestamptz,
  confirmed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One app short link per business. Every customer gets the same link (rule R1).
create table short_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table short_link_clicks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  short_link_id uuid not null references short_links(id) on delete cascade,
  clicked_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  first_name_enc text,
  last_name_enc text,
  phone_enc text,
  phone_hash text,
  email_enc text,
  email_hash text,
  language text not null default 'en' check (language in ('en','es')),
  time_zone text,
  eu_country text,
  lawful_basis text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_phone_unique on customers (business_id, phone_hash)
  where phone_hash is not null and deleted_at is null;
create index customers_email_hash_idx on customers (business_id, email_hash)
  where email_hash is not null;

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  filename text not null,
  total_rows int not null default 0,
  created_rows int not null default 0,
  merged_rows int not null default 0,
  skipped_rows int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  service_name text not null,
  visit_type text not null check (visit_type in ('service','sale')),
  completed_at timestamptz not null,
  source text not null check (source in ('manual','import')),
  import_batch_id uuid references import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);
create index visits_customer_idx on visits (business_id, customer_id, completed_at desc);

create table consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('sms','email')),
  type text not null check (type in ('sms_pew','email_opt_in','email_relationship')),
  source text not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references users(id) on delete set null,
  disclosure_version text not null default 'draft-v1',
  revoked_at timestamptz,
  constraint consent_channel_type check (
    (channel = 'sms' and type = 'sms_pew') or
    (channel = 'email' and type in ('email_opt_in','email_relationship'))
  )
);
create index consents_customer_idx on consents (business_id, customer_id);

-- An opt-out on any channel blocks every channel for that business (rule R5).
create table opt_outs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('sms','email','web')),
  source text not null,
  created_at timestamptz not null default now(),
  unique (business_id, customer_id, channel)
);

-- Suppressions hold hashes, so they survive deletion and block re-imports.
create table suppressions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text not null check (channel in ('sms','email','all')),
  contact_hash text not null,
  reason text not null check (reason in ('bounce','complaint','invalid','deleted','opted_out')),
  created_at timestamptz not null default now()
);
create index suppressions_contact_idx on suppressions (business_id, contact_hash);
create index suppressions_customer_idx on suppressions (business_id, customer_id);

create table templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  industry text not null,
  language text not null check (language in ('en','es')),
  channel text not null check (channel in ('sms','email')),
  kind text not null check (kind in ('service','retail')),
  subject text,
  body text not null,
  version int not null default 1,
  lint_status text not null check (lint_status in ('passed','failed')),
  lint_problems jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (business_id, industry, language, channel, kind)
);

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  visit_kind text not null check (visit_kind in ('service','retail')),
  delay_minutes int not null check (delay_minutes between 0 and 10080),
  enabled boolean not null default true,
  unique (business_id, visit_kind)
);

create table review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  source text not null check (source in ('automation','manual')),
  idempotency_key text not null,
  channel text check (channel in ('sms','email')),
  status text not null check (status in ('queued','deferred','suppressed','sending','sent','delivered','failed','expired','cancelled')),
  status_reason text,
  due_at timestamptz not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key)
);
create index review_requests_queue_idx on review_requests (next_attempt_at)
  where status in ('queued','deferred','sending');
create index review_requests_customer_idx on review_requests (business_id, customer_id, sent_at);

create table messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  review_request_id uuid references review_requests(id) on delete set null,
  kind text not null check (kind in ('review_request','owner_notice','auto_reply')),
  channel text not null check (channel in ('sms','email')),
  client_ref text not null unique,
  provider text not null,
  provider_message_id text unique,
  attempt int not null default 1,
  status text not null check (status in ('attempting','accepted','unknown','failed','delivered','undelivered')),
  segments int,
  error_code text,
  to_enc text,
  body_enc text,
  subject text,
  template_id uuid references templates(id) on delete set null,
  template_version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one attempt number per request: a second send of the same attempt is impossible.
create unique index messages_request_attempt_uq on messages (review_request_id, attempt)
  where review_request_id is not null;

create table inbound_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text not null check (channel in ('sms','email')),
  provider_message_id text unique,
  keyword text not null check (keyword in ('stop','start','help','other')),
  body_enc text,
  received_at timestamptz not null default now()
);

create table support_threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  inbound_message_id uuid references inbound_messages(id) on delete set null,
  source text not null check (source in ('sms','web')),
  body_enc text,
  reply_to_enc text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table sender_registrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  channel text not null default 'sms' check (channel in ('sms')),
  provider text not null,
  sender_number text unique,
  status text not null default 'not_started' check (status in ('not_started','submitted','pending','approved','rejected')),
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table owner_logged_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  note text,
  logged_at timestamptz not null default now()
);

create table deletion_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Provider webhook de-duplication. Global table, no tenant data.
create table webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  created_at timestamptz not null default now()
);

-- Sandbox sender numbers live in the fictional 555-0150 .. 555-0199 range.
create sequence sandbox_sender_seq start 150 minvalue 150 maxvalue 199 no cycle;

-- Row-level security -------------------------------------------------------

do $$
declare
  t text;
  tenant_tables text[] := array[
    'memberships','sessions','locations','review_links','short_links','short_link_clicks',
    'customers','import_batches','visits','consents','opt_outs','suppressions','templates',
    'automation_rules','review_requests','messages','inbound_messages','support_threads',
    'sender_registrations','owner_logged_reviews','deletion_requests','audit_log'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I
      using (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
      with check (business_id = nullif(current_setting('app.business_id', true), '')::uuid)$p$, t);
  end loop;

  alter table businesses enable row level security;
  drop policy if exists tenant_isolation on businesses;
  create policy tenant_isolation on businesses
    using (id = nullif(current_setting('app.business_id', true), '')::uuid)
    with check (id = nullif(current_setting('app.business_id', true), '')::uuid);
end $$;

-- Narrow SECURITY DEFINER lookups --------------------------------------------
-- These run as the owner (which bypasses RLS) and return only what the caller needs.

create or replace function membership_for_user(p_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.business_id from memberships m where m.user_id = p_user_id order by m.created_at limit 1;
$$;

create or replace function resolve_session(p_token_hash text)
returns table (user_id uuid, business_id uuid)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.business_id from sessions s
  where s.token_hash = p_token_hash and s.expires_at > now();
$$;

create or replace function find_business_by_sender(p_number text)
returns uuid language sql stable security definer set search_path = public as $$
  select sr.business_id from sender_registrations sr where sr.sender_number = p_number limit 1;
$$;

create or replace function find_business_by_message(p_provider_message_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select m.business_id from messages m where m.provider_message_id = p_provider_message_id limit 1;
$$;

create or replace function find_business_by_stripe_customer(p_customer text)
returns uuid language sql stable security definer set search_path = public as $$
  select b.id from businesses b where b.stripe_customer_id = p_customer limit 1;
$$;

create or replace function find_short_link(p_code text)
returns table (business_id uuid, short_link_id uuid)
language sql stable security definer set search_path = public as $$
  select sl.business_id, sl.id from short_links sl where sl.code = p_code;
$$;

-- Claims due requests for the worker. Sets a short lease so two workers never take the same row.
create or replace function claim_due_review_requests(p_limit int)
returns table (request_id uuid, business_id uuid)
language sql security definer set search_path = public as $$
  with due as (
    select r.id from review_requests r
    where r.status in ('queued','deferred','sending')
      and r.due_at <= now()
      and r.next_attempt_at <= now()
    order by r.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update review_requests r
  set next_attempt_at = now() + interval '5 minutes'
  from due
  where r.id = due.id
  returning r.id as request_id, r.business_id;
$$;

create or replace function claim_pending_deletions(p_limit int)
returns table (deletion_id uuid, business_id uuid, customer_id uuid)
language sql security definer set search_path = public as $$
  select d.id, d.business_id, d.customer_id
  from deletion_requests d
  where d.status = 'pending'
  order by d.requested_at
  limit p_limit;
$$;
