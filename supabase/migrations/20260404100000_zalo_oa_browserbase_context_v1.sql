alter table private.zalo_oa_token_state
  add column if not exists browserbase_context_id text,
  add column if not exists last_browserbase_session_id text,
  add column if not exists last_reauth_at timestamptz,
  add column if not exists last_reauth_status text,
  add column if not exists last_reauth_error text;

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
    'browserbase_context_id', v_row.browserbase_context_id,
    'last_browserbase_session_id', v_row.last_browserbase_session_id,
    'last_reauth_at', v_row.last_reauth_at,
    'last_reauth_status', v_row.last_reauth_status,
    'last_reauth_error', v_row.last_reauth_error,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'token_status', v_status
  );
end;
$$;

create or replace function public.zalo_oa_update_browserbase_state(
  p_app_id text,
  p_browserbase_context_id text default null,
  p_last_browserbase_session_id text default null,
  p_last_reauth_at timestamptz default null,
  p_last_reauth_status text default null,
  p_last_reauth_error text default null
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
    last_refresh_status,
    browserbase_context_id,
    last_browserbase_session_id,
    last_reauth_at,
    last_reauth_status,
    last_reauth_error
  )
  values (
    v_app_id,
    'bootstrap_required',
    nullif(trim(coalesce(p_browserbase_context_id, '')), ''),
    nullif(trim(coalesce(p_last_browserbase_session_id, '')), ''),
    p_last_reauth_at,
    nullif(trim(coalesce(p_last_reauth_status, '')), ''),
    nullif(trim(coalesce(p_last_reauth_error, '')), '')
  )
  on conflict (app_id) do update
    set browserbase_context_id = excluded.browserbase_context_id,
        last_browserbase_session_id = excluded.last_browserbase_session_id,
        last_reauth_at = excluded.last_reauth_at,
        last_reauth_status = excluded.last_reauth_status,
        last_reauth_error = excluded.last_reauth_error,
        updated_at = now();

  return public.zalo_oa_get_token_state(v_app_id);
end;
$$;

grant execute on function public.zalo_oa_update_browserbase_state(text, text, text, timestamptz, text, text) to service_role;
