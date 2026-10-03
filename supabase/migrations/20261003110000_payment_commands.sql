begin;

create function private.apply_payment_command(p_command text,p_purchase_id uuid,p_payment_entry_id uuid,p_amount_minor bigint,p_paid_on date,p_method text,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_actor uuid:=auth.uid(); v_workspace uuid; v_payload jsonb; v_result jsonb;
 v_receipt private.billing_command_receipts%rowtype; v_purchase public.client_purchases%rowtype;
 v_original public.payment_entries%rowtype; v_entry public.payment_entries%rowtype;
 v_paid numeric; v_due numeric; v_reason text:=nullif(btrim(p_reason),''); v_method text:=btrim(p_method);
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id into v_workspace from public.trainer_workspaces where owner_user_id=v_actor for update;
 if v_workspace is null then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Invalid payment request' using errcode='22023'; end if;
 v_payload:=jsonb_build_object('purchase_id',p_purchase_id,'payment_entry_id',p_payment_entry_id,'amount_minor',p_amount_minor,'paid_on',p_paid_on,'method',v_method,'reason',v_reason);
 select * into v_receipt from private.billing_command_receipts where workspace_id=v_workspace and actor_user_id=v_actor and request_id=p_request_id;
 if found then
  if v_receipt.command<>p_command or v_receipt.payload<>v_payload then raise exception 'Request id payload mismatch' using errcode='22023'; end if;
  return v_receipt.result || jsonb_build_object('replayed',true);
 end if;
 if p_command not in ('record_client_payment','reverse_client_payment') then raise exception 'Invalid payment command' using errcode='22023'; end if;
 if v_reason is not null and length(v_reason)>1000 then raise exception 'Invalid payment reason' using errcode='22023'; end if;
 if p_command='reverse_client_payment' then
  if v_reason is null then raise exception 'Public reason required' using errcode='22023'; end if;
  select * into v_original from public.payment_entries where workspace_id=v_workspace and id=p_payment_entry_id;
  if not found then raise exception 'Payment unavailable' using errcode='P0002'; end if;
  if v_original.kind<>'payment' or exists(select 1 from public.payment_entries where reverses_entry_id=v_original.id) then raise exception 'Payment already reversed or not original' using errcode='55000'; end if;
  p_purchase_id:=v_original.purchase_id;
 end if;
 select * into v_purchase from public.client_purchases where workspace_id=v_workspace and id=p_purchase_id for update;
 if not found then raise exception 'Purchase unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from public.client_records where workspace_id=v_workspace and id=v_purchase.client_record_id and archived_at is null) then raise exception 'Client unavailable' using errcode='P0002'; end if;
 select coalesce(sum(amount_minor),0) into v_paid from public.payment_entries where workspace_id=v_workspace and client_record_id=v_purchase.client_record_id and purchase_id=v_purchase.id;
 if v_paid<0 or v_paid>v_purchase.price_minor then raise exception 'Unsafe payment balance' using errcode='22003'; end if;
 v_due:=v_purchase.price_minor::numeric-v_paid;
 if p_command='record_client_payment' then
  if p_amount_minor is null or p_amount_minor<=0 or p_paid_on is null or not isfinite(p_paid_on) or p_paid_on<'0001-01-01'::date or p_paid_on>'9999-12-31'::date or v_method is null or v_method not in ('Kaspi','Перевод','Наличные') then raise exception 'Invalid payment request' using errcode='22023'; end if;
  if p_amount_minor>v_due then raise exception 'Payment exceeds remaining debt' using errcode='P0003'; end if;
  insert into public.payment_entries(workspace_id,client_record_id,purchase_id,kind,amount_minor,paid_on,method,reason,created_by)
  values(v_workspace,v_purchase.client_record_id,v_purchase.id,'payment',p_amount_minor,p_paid_on,v_method,v_reason,v_actor) returning * into v_entry;
 else
  insert into public.payment_entries(workspace_id,client_record_id,purchase_id,kind,amount_minor,currency,paid_on,method,reason,reverses_entry_id,created_by)
  values(v_workspace,v_purchase.client_record_id,v_purchase.id,'reversal',-v_original.amount_minor,v_original.currency,v_original.paid_on,v_original.method,v_reason,v_original.id,v_actor) returning * into v_entry;
 end if;
 v_paid:=v_paid+v_entry.amount_minor; v_due:=v_purchase.price_minor::numeric-v_paid;
 if v_paid<0 or v_due<0 then raise exception 'Unsafe payment balance' using errcode='22003'; end if;
 v_result:=jsonb_build_object('payment_entry_id',v_entry.id,'workspace_id',v_workspace,'client_record_id',v_entry.client_record_id,'purchase_id',v_entry.purchase_id,'kind',v_entry.kind,'amount_minor',v_entry.amount_minor::text,'currency',v_entry.currency,'paid_on',v_entry.paid_on,'method',v_entry.method,'source',v_entry.source,'reason',v_entry.reason,'reverses_entry_id',v_entry.reverses_entry_id,'paid_minor',v_paid::text,'due_minor',v_due::text);
 insert into private.billing_command_receipts(workspace_id,actor_user_id,request_id,command,payload,result) values(v_workspace,v_actor,p_request_id,p_command,v_payload,v_result);
 return v_result || jsonb_build_object('replayed',false);
end; $$;

create function public.record_client_payment(p_purchase_id uuid,p_amount_minor bigint,p_paid_on date,p_method text,p_request_id uuid,p_reason text default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_payment_command('record_client_payment',p_purchase_id,null,p_amount_minor,p_paid_on,p_method,p_reason,p_request_id); $$;
create function public.reverse_client_payment(p_payment_entry_id uuid,p_reason text,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_payment_command('reverse_client_payment',null,p_payment_entry_id,null,null,null,p_reason,p_request_id); $$;
revoke all on function private.apply_payment_command(text,uuid,uuid,bigint,date,text,text,uuid) from public,anon,authenticated;
revoke all on function public.record_client_payment(uuid,bigint,date,text,uuid,text),public.reverse_client_payment(uuid,text,uuid) from public,anon;
grant execute on function public.record_client_payment(uuid,bigint,date,text,uuid,text),public.reverse_client_payment(uuid,text,uuid) to authenticated;
commit;
