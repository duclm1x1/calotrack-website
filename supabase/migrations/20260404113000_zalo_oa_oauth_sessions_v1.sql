create table if not exists private.zalo_oa_oauth_sessions (
  state text primary key,
  app_id text not null,
  code_verifier text not null,
  redirect_after text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  oa_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_zalo_oa_oauth_sessions_expires_at
  on private.zalo_oa_oauth_sessions(expires_at desc);

create or replace function public.zalo_oa_create_oauth_session(
  p_state text,
  p_app_id text,
  p_code_verifier text,
  p_redirect_after text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_state text := nullif(trim(coalesce(p_state, '')), '');
  v_app_id text := nullif(trim(coalesce(p_app_id, '')), '');
  v_code_verifier text := nullif(trim(coalesce(p_code_verifier, '')), '');
  v_redirect_after text := nullif(trim(coalesce(p_redirect_after, '')), '');
  v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '10 minutes');
begin
  if v_state is null then
    raise exception 'zalo_oa_oauth_state_required';
  end if;

  if v_app_id is null then
    raise exception 'zalo_oa_app_id_required';
  end if;

  if v_code_verifier is null then
    raise exception 'zalo_oa_code_verifier_required';
  end if;

  insert into private.zalo_oa_oauth_sessions (
    state,
    app_id,
    code_verifier,
    redirect_after,
    expires_at
  )
  values (
    v_state,
    v_app_id,
    v_code_verifier,
    v_redirect_after,
    v_expires_at
  )
  on conflict (state) do update
    set app_id = excluded.app_id,
        code_verifier = excluded.code_verifier,
        redirect_after = excluded.redirect_after,
        expires_at = excluded.expires_at,
        consumed_at = null,
        oa_id = null;

  return public.zalo_oa_get_oauth_session(v_state);
end;
$$;

create or replace function public.zalo_oa_get_oauth_session(
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_state text := nullif(trim(coalesce(p_state, '')), '');
  v_row private.zalo_oa_oauth_sessions%rowtype;
begin
  if v_state is null then
    raise exception 'zalo_oa_oauth_state_required';
  end if;

  select *
  into v_row
  from private.zalo_oa_oauth_sessions
  where state = v_state
  limit 1;

  if not found then
    return jsonb_build_object(
      'exists', false,
      'state', v_state
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'state', v_row.state,
    'app_id', v_row.app_id,
    'code_verifier', v_row.code_verifier,
    'redirect_after', v_row.redirect_after,
    'expires_at', v_row.expires_at,
    'consumed_at', v_row.consumed_at,
    'oa_id', v_row.oa_id,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.zalo_oa_consume_oauth_session(
  p_state text,
  p_oa_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_state text := nullif(trim(coalesce(p_state, '')), '');
begin
  if v_state is null then
    raise exception 'zalo_oa_oauth_state_required';
  end if;

  update private.zalo_oa_oauth_sessions
     set consumed_at = now(),
         oa_id = nullif(trim(coalesce(p_oa_id, '')), '')
   where state = v_state;

  return public.zalo_oa_get_oauth_session(v_state);
end;
$$;

grant execute on function public.zalo_oa_create_oauth_session(text, text, text, text, timestamptz) to service_role;
grant execute on function public.zalo_oa_get_oauth_session(text) to service_role;
grant execute on function public.zalo_oa_consume_oauth_session(text, text) to service_role;
