begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_attempts_provider_txn_id_key'
  ) then
    alter table public.payment_attempts
      add constraint payment_attempts_provider_txn_id_key
      unique (provider, provider_txn_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_webhooks_provider_event_id_key'
  ) then
    alter table public.payment_webhooks
      add constraint payment_webhooks_provider_event_id_key
      unique (provider, provider_event_id);
  end if;
end
$$;

commit;
