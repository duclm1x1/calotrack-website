begin;

create or replace function public.portal_create_zalo_link_token()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_token text;
  v_code text;
begin
  v_customer_id := public.current_customer_id();

  if v_customer_id is null then
    raise exception 'customer_not_linked';
  end if;

  select link_token
    into v_token
  from public.channel_link_tokens
  where customer_id = v_customer_id
    and channel = 'zalo'
    and status = 'active'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(gen_random_bytes(18), 'hex');

    insert into public.channel_link_tokens (
      customer_id,
      channel,
      link_token,
      status,
      expires_at
    )
    values (
      v_customer_id,
      'zalo',
      v_token,
      'active',
      now() + interval '30 minutes'
    );
  end if;

  v_code := upper(substr(v_token, 1, 8));

  return jsonb_build_object(
    'status', 'ready',
    'customer_id', v_customer_id,
    'link_token', v_token,
    'link_code', v_code,
    'helper_text', 'Mo Zalo OA Calo Track va gui ma lien ket nay mot lan de noi tai khoan.'
  );
end;
$$;

create or replace function public.consume_zalo_link_token(
  p_link_token text,
  p_platform_user_id text,
  p_compat_user_id bigint default null,
  p_display_name text default null,
  p_phone_claimed text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lookup text := upper(trim(coalesce(p_link_token, '')));
  v_token public.channel_link_tokens%rowtype;
  v_customer public.customers%rowtype;
  v_existing_channel public.customer_channel_accounts%rowtype;
  v_user_id bigint := p_compat_user_id;
  v_phone_e164 text := public.normalize_vn_phone(p_phone_claimed);
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  if v_lookup = '' then
    return jsonb_build_object('status', 'token_missing');
  end if;

  if p_platform_user_id is null or length(trim(p_platform_user_id)) = 0 then
    return jsonb_build_object('status', 'platform_user_missing');
  end if;

  select *
    into v_token
  from public.channel_link_tokens
  where channel = 'zalo'
    and (
      link_token = lower(v_lookup)
      or upper(substr(link_token, 1, 8)) = v_lookup
    )
  order by created_at desc
  limit 1;

  if v_token.id is null then
    return jsonb_build_object('status', 'token_not_found');
  end if;

  if v_token.status <> 'active' then
    return jsonb_build_object('status', 'token_not_active');
  end if;

  if v_token.expires_at is not null and v_token.expires_at < now() then
    update public.channel_link_tokens
       set status = 'expired'
     where id = v_token.id;

    return jsonb_build_object('status', 'token_expired');
  end if;

  select *
    into v_customer
  from public.customers
  where id = v_token.customer_id
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object('status', 'customer_missing');
  end if;

  select *
    into v_existing_channel
  from public.customer_channel_accounts
  where channel = 'zalo'
    and platform_user_id = trim(p_platform_user_id)
  limit 1;

  if v_existing_channel.id is not null
     and v_existing_channel.customer_id is not null
     and v_existing_channel.customer_id <> v_customer.id then
    return jsonb_build_object(
      'status', 'needs_support',
      'reason', 'zalo_already_linked',
      'customer_id', v_existing_channel.customer_id
    );
  end if;

  if v_user_id is null then
    select id
      into v_user_id
    from public.users
    where platform = 'zalo'
      and platform_id = trim(p_platform_user_id)
    limit 1;
  end if;

  if v_user_id is null then
    insert into public.users (
      username,
      first_name,
      language,
      platform,
      platform_id,
      plan,
      premium_until,
      is_active,
      is_banned,
      customer_id
    )
    values (
      null,
      v_display_name,
      'vi',
      'zalo',
      trim(p_platform_user_id),
      coalesce(v_customer.plan, 'free'),
      v_customer.premium_until,
      true,
      false,
      v_customer.id
    )
    returning id into v_user_id;
  else
    update public.users
       set first_name = coalesce(public.users.first_name, v_display_name),
           plan = coalesce(v_customer.plan, public.users.plan),
           premium_until = v_customer.premium_until,
           is_active = true,
           is_banned = false,
           customer_id = v_customer.id,
           updated_at = now()
     where id = v_user_id;
  end if;

  insert into public.customer_channel_accounts (
    customer_id,
    channel,
    platform_user_id,
    linked_user_id,
    display_name,
    phone_claimed,
    phone_claimed_e164,
    link_status
  )
  values (
    v_customer.id,
    'zalo',
    trim(p_platform_user_id),
    v_user_id,
    v_display_name,
    nullif(trim(coalesce(p_phone_claimed, '')), ''),
    v_phone_e164,
    'linked'
  )
  on conflict (channel, platform_user_id) do update
    set customer_id = excluded.customer_id,
        linked_user_id = excluded.linked_user_id,
        display_name = coalesce(excluded.display_name, public.customer_channel_accounts.display_name),
        phone_claimed = coalesce(excluded.phone_claimed, public.customer_channel_accounts.phone_claimed),
        phone_claimed_e164 = coalesce(excluded.phone_claimed_e164, public.customer_channel_accounts.phone_claimed_e164),
        link_status = 'linked',
        updated_at = now();

  update public.channel_link_tokens
     set status = 'used',
         used_at = now()
   where id = v_token.id;

  perform public.sync_customer_to_compat_users(v_customer.id);

  return jsonb_build_object(
    'status', 'linked',
    'customer_id', v_customer.id,
    'linked_user_id', v_user_id,
    'link_code', upper(substr(v_token.link_token, 1, 8)),
    'helper_text', 'Da lien ket Zalo vao customer truth thanh cong.'
  );
end;
$$;

grant execute on function public.portal_create_zalo_link_token() to authenticated;
grant execute on function public.portal_create_zalo_link_token() to service_role;
grant execute on function public.consume_zalo_link_token(text, text, bigint, text, text) to service_role;

commit;
