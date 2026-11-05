-- Row-level security: every customer table is isolated by company membership,
-- and writes require editor or above. Staff use the service role from the admin
-- area, which bypasses RLS by design (never a customer login).

-- Helper: companies the current user belongs to (accepted memberships only).
create or replace function current_company_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select company_id from memberships
  where user_id = auth.uid() and accepted_at is not null
$$;

-- Helper: the current user's role in a company.
create or replace function current_role_in(c uuid)
returns member_role
language sql stable security definer set search_path = public as $$
  select role from memberships
  where user_id = auth.uid() and company_id = c and accepted_at is not null
$$;

create or replace function can_edit(c uuid) returns boolean
language sql stable as $$
  select current_role_in(c) in ('owner','admin','editor')
$$;

create or replace function can_admin(c uuid) returns boolean
language sql stable as $$
  select current_role_in(c) in ('owner','admin')
$$;

-- Subscription gate: writes are refused when the company is not active or trialling.
create or replace function subscription_allows_write(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status in ('trial','active') from subscriptions where company_id = c), false)
$$;

-- ---------- users / memberships ----------
alter table users enable row level security;
create policy users_self_read on users for select using (id = auth.uid() or id in (
  select user_id from memberships where company_id in (select current_company_ids())));
create policy users_self_write on users for insert with check (id = auth.uid());
create policy users_self_update on users for update using (id = auth.uid());

alter table memberships enable row level security;
create policy memberships_read on memberships for select
  using (user_id = auth.uid() or company_id in (select current_company_ids()));
create policy memberships_admin_insert on memberships for insert
  with check (can_admin(company_id));
create policy memberships_admin_update on memberships for update
  using (can_admin(company_id) or user_id = auth.uid());
create policy memberships_admin_delete on memberships for delete
  using (can_admin(company_id));

-- ---------- companies ----------
alter table companies enable row level security;
create policy companies_read on companies for select using (id in (select current_company_ids()));
create policy companies_update on companies for update using (can_admin(id));
-- Creating a company is done by a security-definer function so the creator becomes owner atomically.

create or replace function create_company_with_owner(p_name text, p_package package_code default 'build', p_seats int default 3)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into companies (name) values (p_name) returning id into cid;
  insert into memberships (user_id, company_id, role, accepted_at) values (auth.uid(), cid, 'owner', now());
  insert into subscriptions (company_id, package, seats, status) values (cid, p_package, p_seats, 'trial');
  return cid;
end $$;

-- ---------- generic company-scoped tables ----------
-- Read: member of the company. Write: editor+ and subscription allows writes.
do $$
declare t text;
begin
  foreach t in array array[
    'company_profile','assessments','assessment_answers','assessment_area_scores',
    'priorities','targets','initiatives','periods','actions','kpis','kpi_actuals','reviews'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_read on %I for select using (company_id in (select current_company_ids()))', t, t);
    execute format('create policy %I_insert on %I for insert with check (can_edit(company_id) and subscription_allows_write(company_id))', t, t);
    execute format('create policy %I_update on %I for update using (can_edit(company_id) and subscription_allows_write(company_id))', t, t);
    execute format('create policy %I_delete on %I for delete using (can_admin(company_id) and subscription_allows_write(company_id))', t, t);
  end loop;
end $$;

-- ---------- subscriptions / payments: read-only to members; written by server (service role) ----------
alter table subscriptions enable row level security;
create policy subscriptions_read on subscriptions for select using (company_id in (select current_company_ids()));
alter table payments enable row level security;
create policy payments_read on payments for select using (can_admin(company_id));

-- ---------- templates: customers read only published; staff write via service role ----------
alter table templates enable row level security;
create policy templates_read_published on templates for select using (publication_status = 'published');

-- ---------- audit log: append-only from server; members read their own company's ----------
alter table audit_log enable row level security;
create policy audit_read on audit_log for select using (company_id in (select current_company_ids()) and can_admin(company_id));

-- Seat limit: accepted non-viewer memberships may not exceed the subscription's seats.
create or replace function enforce_seat_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare used int; allowed int;
begin
  if new.accepted_at is null or new.role = 'viewer' then return new; end if;
  select seats into allowed from subscriptions where company_id = new.company_id;
  select count(*) into used from memberships
    where company_id = new.company_id and accepted_at is not null and role <> 'viewer' and id <> new.id;
  if allowed is not null and used + 1 > allowed then
    raise exception 'seat limit reached (% of %)', used, allowed using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger memberships_seat_limit before insert or update on memberships
  for each row execute function enforce_seat_limit();
