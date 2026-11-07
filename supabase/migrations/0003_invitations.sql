-- Invitations: an admin invites an email address with a role; the invitee signs in
-- (or creates an account) with that email and accepts. Acceptance creates the
-- membership through a security-definer function so the seat limit trigger and
-- the email match are enforced in the database, not in the app.

create table invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  role member_role not null check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_user_id uuid references users(id),
  revoked_at timestamptz
);
create index on invitations (company_id);
create index on invitations (lower(email));

alter table invitations enable row level security;
-- Admins of the company manage its invitations.
create policy invitations_admin_read on invitations for select using (can_admin(company_id));
create policy invitations_admin_insert on invitations for insert with check (can_admin(company_id) and invited_by = auth.uid());
create policy invitations_admin_update on invitations for update using (can_admin(company_id));
-- The invitee can see invitations addressed to their own email (to accept them).
create policy invitations_invitee_read on invitations for select
  using (lower(email) = lower(coalesce(auth.email(), '')) and accepted_at is null and revoked_at is null);

-- Company name is needed on the invite page before the invitee is a member.
create or replace function invitation_preview(p_token text)
returns table (company_name text, role member_role, email text, expired boolean, accepted boolean, revoked boolean)
language sql stable security definer set search_path = public as $$
  select c.name, i.role, i.email, i.expires_at < now(), i.accepted_at is not null, i.revoked_at is not null
  from invitations i join companies c on c.id = i.company_id
  where i.token = p_token
$$;

create or replace function accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations%rowtype; uid uuid := auth.uid(); mail text := lower(coalesce(auth.email(), ''));
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into inv from invitations where token = p_token for update;
  if not found then raise exception 'invitation not found'; end if;
  if inv.revoked_at is not null then raise exception 'invitation was withdrawn'; end if;
  if inv.accepted_at is not null then raise exception 'invitation already used'; end if;
  if inv.expires_at < now() then raise exception 'invitation expired'; end if;
  if lower(inv.email) <> mail then raise exception 'this invitation was sent to %, but you are signed in as %', inv.email, mail; end if;
  if exists (select 1 from memberships where user_id = uid and accepted_at is not null) then
    raise exception 'you already belong to a company workspace';
  end if;
  insert into users (id, email) values (uid, mail) on conflict (id) do nothing;
  insert into memberships (user_id, company_id, role, accepted_at) values (uid, inv.company_id, inv.role, now())
    on conflict (user_id, company_id) do update set role = excluded.role, accepted_at = now();
  update invitations set accepted_at = now(), accepted_user_id = uid where id = inv.id;
  return inv.company_id;
end $$;

-- Admins may change a member's role or remove them, but never the owner's row, and never their own.
create or replace function guard_membership_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    raise exception 'the owner role cannot be changed here';
  end if;
  if tg_op = 'DELETE' and old.role = 'owner' then
    raise exception 'the owner cannot be removed';
  end if;
  if tg_op = 'DELETE' and old.user_id = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger memberships_guard before update or delete on memberships
  for each row execute function guard_membership_change();
