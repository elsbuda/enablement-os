-- Enablement OS — core schema (release 1)
-- Runs on Supabase (auth.uid() available) and on plain Postgres for tests
-- (the test harness provides a stand-in auth schema; see scripts/db-test.mjs).

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type member_role as enum ('owner', 'admin', 'editor', 'viewer');
create type package_code as enum ('build', 'scale', 'transform');
create type subscription_status as enum ('trial', 'active', 'past_due', 'read_only', 'cancelled');
create type template_kind as enum ('health_check', 'tool', 'kpi_library');
create type publication_status as enum ('draft', 'review', 'published', 'retired');
create type permission_status as enum ('original', 'licensed_confirmed', 'requires_confirmation', 'not_permitted');
create type assessment_status as enum ('in_progress', 'completed');
create type period_status as enum ('planning', 'active', 'in_review', 'closed');
create type action_status as enum ('not_started', 'on_track', 'late', 'at_risk', 'done');
create type kpi_direction as enum ('higher_better', 'lower_better');
create type kpi_perspective as enum ('financial', 'customer', 'internal', 'people');
create type target_status as enum ('working_on_it', 'done', 'stuck', 'moved_to_next_quarter');

-- ---------- tenancy ----------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  registration_no text,
  vat_no text,
  sector text,
  staff_band text,
  turnover_band text,
  financial_year_end smallint check (financial_year_end between 1 and 12),
  created_at timestamptz not null default now()
);

create table company_profile (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  version integer not null,
  products jsonb not null default '[]',
  customer_types jsonb not null default '[]',
  sales_team_size integer,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (company_id, version)
);

create table users (
  id uuid primary key,              -- = auth.users.id
  email text not null unique,
  full_name text
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role member_role not null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (user_id, company_id)
);

create table subscriptions (
  company_id uuid primary key references companies(id) on delete cascade,
  package package_code not null,
  seats integer not null check (seats > 0),
  status subscription_status not null default 'trial',
  current_period_start date,
  current_period_end date,
  paystack_customer_code text,
  paystack_subscription_code text,
  paystack_plan_code text,
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  paystack_reference text unique,
  amount_cents bigint not null,
  vat_cents bigint not null default 0,
  currency text not null default 'ZAR',
  status text not null,
  paid_at timestamptz,
  invoice_no text
);

-- ---------- templates (published by Enablement Group staff only) ----------
-- Only the declarative operations the engine implements may appear in rules.
create or replace function template_rules_allowed(body jsonb) returns boolean
language sql immutable as $$
  select not exists (
    select 1 from jsonb_array_elements(coalesce(body->'rules', '[]'::jsonb)) r
    where not (r->>'op' = any (array['sum','avg','min','max','count_if','band','diff','ratio','map']))
  )
$$;

create table templates (
  id uuid primary key default gen_random_uuid(),
  tool_key text not null,
  version integer not null,
  kind template_kind not null,
  category text not null,
  title text not null,
  body jsonb not null,                       -- instructions, input_schema, output_schema, rules, interpretation
  source_references jsonb not null default '[]',
  permission_status permission_status not null default 'requires_confirmation',
  licence_reference text,
  publication_status publication_status not null default 'draft',
  downloadable_source boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tool_key, version),
  -- Publication guard: a template can only be published when its permission is settled.
  constraint templates_publication_guard check (
    publication_status <> 'published'
    or permission_status = 'original'
    or (permission_status = 'licensed_confirmed' and licence_reference is not null)
  ),
  constraint templates_rules_allowed check (template_rules_allowed(body))
);

-- ---------- assessments ----------
create table assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  template_id uuid not null references templates(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  overall_score numeric(5,2),
  status assessment_status not null default 'in_progress'
);

create table assessment_answers (
  assessment_id uuid not null references assessments(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  question_key text not null,
  value smallint check (value between 1 and 5),
  dont_know boolean not null default false,
  primary key (assessment_id, question_key),
  check (dont_know or value is not null)
);

create table assessment_area_scores (
  assessment_id uuid not null references assessments(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  area_key text not null,
  score_pct numeric(5,2) not null,
  band text not null,
  primary key (assessment_id, area_key)
);

-- ---------- plan ----------
create table priorities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_year integer not null,
  title text not null check (char_length(title) between 5 and 80),
  objective text not null check (char_length(objective) between 10 and 200),
  rank integer not null,
  source_area_key text,
  assessment_id uuid references assessments(id),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  priority_id uuid not null references priorities(id) on delete cascade,
  measure text not null check (char_length(measure) between 2 and 80),
  kpi_id uuid,
  target_value numeric not null check (target_value <> 0),
  unit text not null check (unit in ('R','%','count','days')),
  direction kpi_direction not null,
  owner_user_id uuid not null references users(id),
  due_quarter text not null check (due_quarter in ('Q1','Q2','Q3','Q4')),
  status target_status not null default 'working_on_it',
  result numeric(2,1) check (result between 0 and 1)
);

create table initiatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  priority_id uuid not null references priorities(id) on delete cascade,
  title text not null,
  description text,
  owner_user_id uuid references users(id),
  start_date date,
  end_date date,
  status text not null default 'active',
  template_fields jsonb not null default '{}'
);

create table periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  status period_status not null default 'planning',
  check (end_date > start_date)
);
create unique index periods_one_active_per_company on periods (company_id) where status = 'active';

create table actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  initiative_id uuid not null references initiatives(id) on delete cascade,
  period_id uuid not null references periods(id),
  title text not null,
  owner_user_id uuid not null references users(id),
  due_date date not null,
  status action_status not null default 'not_started',
  kpi_id uuid,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table kpis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  unit text not null,
  direction kpi_direction not null,
  target_value numeric,
  frequency text not null default 'monthly',
  perspective kpi_perspective,
  owner_user_id uuid references users(id)
);
alter table targets add constraint targets_kpi_fk foreign key (kpi_id) references kpis(id);
alter table actions add constraint actions_kpi_fk foreign key (kpi_id) references kpis(id);

create table kpi_actuals (
  kpi_id uuid not null references kpis(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  period_month date not null,              -- first day of month
  actual_value numeric not null,
  entered_by uuid references users(id),
  entered_at timestamptz not null default now(),
  primary key (kpi_id, period_month)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_id uuid not null references periods(id),
  held_on date not null,
  achieved_text text,
  slipped_text text,
  decisions jsonb not null default '[]',
  plan_score numeric(3,2),
  next_period_id uuid references periods(id),
  created_by uuid references users(id)
);

create table audit_log (
  id bigserial primary key,
  company_id uuid,
  actor_user_id uuid,
  table_name text not null,
  row_id text,
  change jsonb,
  at timestamptz not null default now()
);

-- helpful indexes on the tenancy key
create index on memberships (company_id);
create index on assessments (company_id);
create index on priorities (company_id, plan_year);
create index on actions (company_id, period_id, status);
create index on kpi_actuals (company_id, period_month);
