begin;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  locale text not null default 'ru' check (length(btrim(locale)) > 0),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id)
);

create table public.trainer_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  timezone text not null default 'Asia/Almaty',
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id)
);

create table public.client_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  phone text,
  archived_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id)
);

create index client_records_user_id_idx on public.client_records (user_id) where user_id is not null;
create index client_records_workspace_id_idx on public.client_records (workspace_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  client_record_id uuid not null references public.client_records (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete restrict,
  accepted_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  check ((accepted_by is null) = (accepted_at is null))
);

create index invitations_client_record_id_idx on public.invitations (client_record_id);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger trainer_workspaces_touch_updated_at before update on public.trainer_workspaces
for each row execute function public.touch_updated_at();
create trigger client_records_touch_updated_at before update on public.client_records
for each row execute function public.touch_updated_at();
create trigger invitations_touch_updated_at before update on public.invitations
for each row execute function public.touch_updated_at();

create function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.trainer_workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = (select auth.uid())
  );
$$;

create function public.my_client_record_ids()
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.id
  from public.client_records c
  where c.user_id = (select auth.uid());
$$;

revoke all on function public.is_workspace_owner(uuid) from public, anon;
revoke all on function public.my_client_record_ids() from public, anon;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.my_client_record_ids() to authenticated;

alter table public.profiles enable row level security;
alter table public.trainer_workspaces enable row level security;
alter table public.client_records enable row level security;
alter table public.invitations enable row level security;

create policy profiles_read_self on public.profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert_self on public.profiles
for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update_self on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy trainer_workspaces_read_owner on public.trainer_workspaces
for select to authenticated using (owner_user_id = (select auth.uid()));
create policy trainer_workspaces_insert_self on public.trainer_workspaces
for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy trainer_workspaces_update_owner on public.trainer_workspaces
for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy client_records_read_owner_or_client on public.client_records
for select to authenticated
using (
  public.is_workspace_owner(workspace_id)
  or id in (select public.my_client_record_ids())
);
create policy client_records_insert_owner on public.client_records
for insert to authenticated
with check (public.is_workspace_owner(workspace_id));
create policy client_records_update_owner on public.client_records
for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

create policy invitations_read_owner on public.invitations
for select to authenticated
using (
  exists (
    select 1
    from public.client_records c
    where c.id = invitations.client_record_id
      and public.is_workspace_owner(c.workspace_id)
  )
);

revoke all on public.profiles, public.trainer_workspaces, public.client_records, public.invitations
from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (user_id, display_name, locale), update (display_name, locale)
on public.profiles to authenticated;

grant select on public.trainer_workspaces to authenticated;
grant insert (owner_user_id, name, timezone), update (name, timezone)
on public.trainer_workspaces to authenticated;

grant select on public.client_records to authenticated;
grant insert (workspace_id, display_name, phone), update (display_name, phone, archived_at)
on public.client_records to authenticated;

grant select (id, client_record_id, expires_at, accepted_by, accepted_at, created_at, updated_at, created_by)
on public.invitations to authenticated;

commit;
