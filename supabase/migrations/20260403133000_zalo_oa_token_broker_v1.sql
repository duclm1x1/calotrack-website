create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.zalo_oa_token_state (
  app_id text primary key,
  access_token text,
  refresh_token text,
  token_type text not null default 'bearer',
  expires_at timestamptz,
  last_refresh_at timestamptz,
  last_refresh_status text not null default 'bootstrap_required',
  last_error text,
  refresh_lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.zalo_oa_delivery_logs (
  id bigserial primary key,
  app_id text not null,
  channel text not null check (channel in ('oa_cs', 'template')),
  endpoint text not null,
  target text not null,
  template_id text,
  tracking_id text,
  status text not null default 'attempted',
  http_status integer,
  provider_error_code integer,
  provider_message text,
  retry_count integer not null default 0,
  refreshed_during_send boolean not null default false,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_zalo_oa_delivery_logs_created_at
  on private.zalo_oa_delivery_logs(created_at desc);

create index if not exists idx_zalo_oa_delivery_logs_target
  on private.zalo_oa_delivery_logs(target, created_at desc);

drop trigger if exists trg_zalo_oa_token_state_updated_at on private.zalo_oa_token_state;
create trigger trg_zalo_oa_token_state_updated_at
before update on private.zalo_oa_token_state
for each row
execute function public.customer_touch_updated_at();

create or replace function public.zalo_oa_bootstrap_token(
  p_app_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_token_type text default 'bearer'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_app_id text := nullif(trim(coalesce(p_app_id, '')), '');
begin
  if v_app_id is null then
    raise exception 'zalo_oa_app_id_required';
  end if;

  insert into private.zalo_oa_token_state (
    app_id,
    access_token,
    refresh_token,
    token_type,
    expires_at,
    last_refresh_at,
    last_refresh_status,
    last_error,
    refresh_lock_until
  )
  values (
    v_app_id,
    nullif(trim(coalesce(p_access_token, '')), ''),
    nullif(trim(coalesce(p_refresh_token, '')), ''),
    coalesce(nullif(trim(coalesce(p_token_type, '')), ''), 'bearer'),
    p_expires_at,
    now(),
    'bootstrapped',
    null,
    null
  )
  on conflict (app_id) do update
    set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_type = excluded.token_type,
        expires_at = excluded.expires_at,
        last_refresh_at = now(),
        last_refresh_status = 'bootstrapped',
        last_error = null,
        refresh_lock_until = null,
        updated_at = now();

  return public.zalo_oa_get_token_state(v_app_id);
end;
$$;

create or replace function public.zalo_oa_get_token_state(
  p_app_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_app_id text := coalesce(nullif(trim(coalesce(p_app_id, '')), ''), '1450975846052622442');
  v_row private.zalo_oa_token_state%rowtype;
  v_status text := 'bootstrap_required';
begin
  select *
  into v_row
  from private.zalo_oa_token_state
  where app_id = v_app_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'app_id', v_app_id,
      'exists', false,
      'token_status', v_status
    );
  end if;

  if v_row.access_token is null or v_row.expires_at is null then
    v_status := coalesce(nullif(v_row.last_refresh_status, ''), 'bootstrap_required');
  elsif v_row.expires_at <= now() then
    v_status := 'expired';
  elsif v_row.expires_at <= now() + interval '2 hours' then
    v_status := 'expiring_soon';
  else
    v_status := 'healthy';
  end if;

  return jsonb_build_object(
    'app_id', v_row.app_id,
    'exists', true,
    'access_token', v_row.access_token,
    'refresh_token', v_row.refresh_token,
    'token_type', v_row.token_type,
    'expires_at', v_row.expires_at,
    'last_refresh_at', v_row.last_refresh_at,
    'last_refresh_status', v_row.last_refresh_status,
    'last_error', v_row.last_error,
    'refresh_lock_until', v_row.refresh_lock_until,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'token_status', v_status
  );
end;
$$;

create or replace function public.zalo_oa_acquire_refresh_lock(
  p_app_id text,
  p_lock_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_app_id text := nullif(trim(coalesce(p_app_id, '')), '');
  v_rowcount integer := 0;
begin
  if v_app_id is null then
    raise exception 'zalo_oa_app_id_required';
  end if;

  insert into private.zalo_oa_token_state (app_id, last_refresh_status)
  values (v_app_id, 'bootstrap_required')
  on conflict (app_id) do nothing;

  update private.zalo_oa_token_state
     set refresh_lock_until = now() + make_interval(secs => greatest(coalesce(p_lock_seconds, 30), 5)),
         updated_at = now()
   where app_id = v_app_id
     and (refresh_lock_until is null or refresh_lock_until <= now());

  get diagnostics v_rowcount = row_count;
  return v_rowcount > 0;
end;
$$;

create or replace function public.zalo_oa_apply_refreshed_token(
  p_app_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_token_type text default 'bearer',
  p_refresh_status text default 'ok'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_app_id text := nullif(trim(coalesce(p_app_id, '')), '');
begin
  if v_app_id is null then
    raise exception 'zalo_oa_app_id_required';
  end if;

  insert into private.zalo_oa_token_state (
    app_id,
    access_token,
    refresh_token,
    token_type,
    expires_at,
    last_refresh_at,
    last_refresh_status,
    last_error,
    refresh_lock_until
  )
  values (
    v_app_id,
    nullif(trim(coalesce(p_access_token, '')), ''),
    nullif(trim(coalesce(p_refresh_token, '')), ''),
    coalesce(nullif(trim(coalesce(p_token_type, '')), ''), 'bearer'),
    p_expires_at,
    now(),
    coalesce(nullif(trim(coalesce(p_refresh_status, '')), ''), 'ok'),
    null,
    null
  )
  on conflict (app_id) do update
    set access_token = excluded.access_token,
        refresh_token = coalesce(excluded.refresh_token, private.zalo_oa_token_state.refresh_token),
        token_type = excluded.token_type,
        expires_at = excluded.expires_at,
        last_refresh_at = now(),
        last_refresh_status = excluded.last_refresh_status,
        last_error = null,
        refresh_lock_until = null,
        updated_at = now();

  return public.zalo_oa_get_token_state(v_app_id);
end;
$$;

create or replace function public.zalo_oa_mark_refresh_failure(
  p_app_id text,
  p_refresh_status text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_app_id text := nullif(trim(coalesce(p_app_id, '')), '');
begin
  if v_app_id is null then
    raise exception 'zalo_oa_app_id_required';
  end if;

  insert into private.zalo_oa_token_state (app_id, last_refresh_status, last_error, refresh_lock_until)
  values (
    v_app_id,
    coalesce(nullif(trim(coalesce(p_refresh_status, '')), ''), 'refresh_failed'),
    nullif(trim(coalesce(p_error, '')), ''),
    null
  )
  on conflict (app_id) do update
    set last_refresh_status = excluded.last_refresh_status,
        last_error = excluded.last_error,
        refresh_lock_until = null,
        updated_at = now();

  return public.zalo_oa_get_token_state(v_app_id);
end;
$$;

create or replace function public.zalo_oa_log_delivery(
  p_app_id text,
  p_channel text,
  p_endpoint text,
  p_target text,
  p_template_id text default null,
  p_tracking_id text default null,
  p_status text default 'attempted',
  p_http_status integer default null,
  p_provider_error_code integer default null,
  p_provider_message text default null,
  p_retry_count integer default 0,
  p_refreshed_during_send boolean default false,
  p_request_payload jsonb default '{}'::jsonb,
  p_response_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id bigint;
begin
  insert into private.zalo_oa_delivery_logs (
    app_id,
    channel,
    endpoint,
    target,
    template_id,
    tracking_id,
    status,
    http_status,
    provider_error_code,
    provider_message,
    retry_count,
    refreshed_during_send,
    request_payload,
    response_payload
  )
  values (
    coalesce(nullif(trim(coalesce(p_app_id, '')), ''), '1450975846052622442'),
    coalesce(nullif(trim(coalesce(p_channel, '')), ''), 'oa_cs'),
    coalesce(nullif(trim(coalesce(p_endpoint, '')), ''), ''),
    coalesce(nullif(trim(coalesce(p_target, '')), ''), ''),
    nullif(trim(coalesce(p_template_id, '')), ''),
    nullif(trim(coalesce(p_tracking_id, '')), ''),
    coalesce(nullif(trim(coalesce(p_status, '')), ''), 'attempted'),
    p_http_status,
    p_provider_error_code,
    nullif(trim(coalesce(p_provider_message, '')), ''),
    greatest(coalesce(p_retry_count, 0), 0),
    coalesce(p_refreshed_during_send, false),
    coalesce(p_request_payload, '{}'::jsonb),
    coalesce(p_response_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.zalo_oa_bootstrap_token(text, text, text, timestamptz, text) to service_role;
grant execute on function public.zalo_oa_get_token_state(text) to service_role;
grant execute on function public.zalo_oa_acquire_refresh_lock(text, integer) to service_role;
grant execute on function public.zalo_oa_apply_refreshed_token(text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.zalo_oa_mark_refresh_failure(text, text, text) to service_role;
grant execute on function public.zalo_oa_log_delivery(text, text, text, text, text, text, text, integer, integer, text, integer, boolean, jsonb, jsonb) to service_role;
