begin;

create table public.payment_entries (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 client_record_id uuid not null,
 purchase_id uuid not null,
 kind text not null check (kind in ('payment','reversal')),
 amount_minor bigint not null,
 currency text not null default 'KZT' check (currency = 'KZT'),
 paid_on date not null,
 method text not null check (method in ('Kaspi','Перевод','Наличные')),
 source text not null default 'manual' check (source = 'manual'),
 reason text,
 reverses_entry_id uuid,
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id) on delete restrict,
 unique (workspace_id,client_record_id,purchase_id,id),
 foreign key (workspace_id,client_record_id,purchase_id) references public.client_purchases(workspace_id,client_record_id,id) on delete restrict,
 foreign key (workspace_id,client_record_id,purchase_id,reverses_entry_id) references public.payment_entries(workspace_id,client_record_id,purchase_id,id) on delete restrict,
 check ((kind = 'payment' and amount_minor > 0 and reverses_entry_id is null)
 or (kind = 'reversal' and amount_minor < 0 and reverses_entry_id is not null and reason is not null and length(btrim(reason)) between 1 and 1000)),
 check (reason is null or length(btrim(reason)) between 1 and 1000)
);
create unique index payment_one_reversal on public.payment_entries(reverses_entry_id) where kind = 'reversal';
create index payment_purchase_history on public.payment_entries(workspace_id,client_record_id,purchase_id,created_at,id);

create function private.validate_payment_reversal() returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_original public.payment_entries%rowtype;
begin
 if new.kind = 'reversal' then
  select * into v_original from public.payment_entries where id = new.reverses_entry_id;
  if not found or v_original.kind <> 'payment'
   or v_original.workspace_id <> new.workspace_id or v_original.client_record_id <> new.client_record_id
   or v_original.purchase_id <> new.purchase_id or new.amount_minor <> -v_original.amount_minor
   or new.currency <> v_original.currency or new.method <> v_original.method then
   raise exception 'Invalid payment reversal' using errcode = '23514';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.validate_payment_reversal() from public,anon,authenticated;
create trigger payment_validate_reversal before insert on public.payment_entries for each row execute function private.validate_payment_reversal();
create trigger payment_history_immutable before update or delete on public.payment_entries for each row execute function private.reject_billing_history_mutation();
alter table public.payment_entries enable row level security;
create policy payment_read on public.payment_entries for select to authenticated using (public.is_workspace_owner(workspace_id) or client_record_id in (select public.my_client_record_ids()));
revoke all on public.payment_entries from public,anon,authenticated;
grant select(id,workspace_id,client_record_id,purchase_id,kind,amount_minor,currency,paid_on,method,source,reason,reverses_entry_id,created_at) on public.payment_entries to authenticated;

commit;
