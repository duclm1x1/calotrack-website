begin;

alter table if exists public.channel_link_tokens
  add column if not exists order_id bigint references public.orders(id) on delete set null;

create index if not exists channel_link_tokens_order_id_idx
  on public.channel_link_tokens(order_id);

create unique index if not exists payment_attempts_provider_txn_id_uidx
  on public.payment_attempts(provider, provider_txn_id)
  where provider_txn_id is not null;

create unique index if not exists payment_webhooks_provider_event_id_uidx
  on public.payment_webhooks(provider, provider_event_id)
  where provider_event_id is not null;

create or replace function public.billing_days_from_sku(p_billing_sku text)
returns integer
language plpgsql
immutable
as $$
begin
  case lower(coalesce(p_billing_sku, 'monthly'))
    when 'lifetime' then
      return 36500;
    when 'yearly' then
      return 365;
    when 'quarterly' then
      return 90;
    else
      return 30;
  end case;
end;
$$;

create or replace function public.ensure_channel_link_token(
  p_customer_id bigint,
  p_channel text default 'telegram',
  p_order_id bigint default null,
  p_ttl interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select link_token
    into v_token
  from public.channel_link_tokens
  where customer_id = p_customer_id
    and channel = coalesce(p_channel, 'telegram')
    and coalesce(order_id, -1) = coalesce(p_order_id, -1)
    and status = 'active'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(gen_random_bytes(18), 'hex');

    insert into public.channel_link_tokens (
      customer_id,
      order_id,
      channel,
      link_token,
      status,
      expires_at
    )
    values (
      p_customer_id,
      p_order_id,
      coalesce(p_channel, 'telegram'),
      v_token,
      'active',
      now() + coalesce(p_ttl, interval '7 days')
    );
  end if;

  return v_token;
end;
$$;

create or replace function public.portal_start_checkout(
  p_plan text,
  p_billing_sku text,
  p_provider text,
  p_phone_e164 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_plan_id bigint;
  v_amount integer;
  v_order_id bigint;
  v_order_code text;
  v_phone_e164 text;
  v_billing_sku text;
  v_status text;
  v_link_token text;
begin
  v_phone_e164 := public.normalize_vn_phone(p_phone_e164);
  if v_phone_e164 is null or length(trim(v_phone_e164)) = 0 then
    raise exception 'phone_required';
  end if;

  v_customer_id := public.upsert_customer_by_phone(v_phone_e164, null);
  v_billing_sku := lower(coalesce(p_billing_sku, case when lower(coalesce(p_plan, 'free')) = 'lifetime' then 'lifetime' else 'monthly' end));

  select
    id,
    case
      when code = 'lifetime' or v_billing_sku = 'lifetime' then coalesce(lifetime_price, monthly_price, 0)
      when v_billing_sku = 'yearly' then coalesce(yearly_price, monthly_price, 0)
      else coalesce(monthly_price, 0)
    end
    into v_plan_id, v_amount
  from public.plans
  where code = lower(coalesce(p_plan, 'free'))
  limit 1;

  if v_plan_id is null then
    raise exception 'invalid_plan';
  end if;

  v_order_code := 'CT' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || lpad((floor(random() * 99) + 1)::text, 2, '0');
  v_status := case when lower(coalesce(p_plan, 'free')) = 'free' then 'active' else 'pending_confirmation' end;

  insert into public.orders (
    customer_id,
    plan_id,
    billing_cycle,
    billing_sku,
    amount,
    provider,
    status,
    phone_e164,
    order_code,
    metadata
  )
  values (
    v_customer_id,
    v_plan_id,
    case when v_billing_sku in ('yearly', 'quarterly') then v_billing_sku else 'monthly' end,
    v_billing_sku,
    v_amount,
    lower(coalesce(p_provider, 'bank_transfer')),
    v_status,
    v_phone_e164,
    v_order_code,
    jsonb_build_object(
      'source', 'portal_public_checkout',
      'auth_user_id', auth.uid(),
      'phone_e164', v_phone_e164
    )
  )
  returning id into v_order_id;

  v_link_token := public.ensure_channel_link_token(v_customer_id, 'telegram', v_order_id, interval '7 days');

  return jsonb_build_object(
    'id', v_order_id,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'provider', lower(coalesce(p_provider, 'bank_transfer')),
    'status', v_status,
    'plan', lower(coalesce(p_plan, 'free')),
    'billing_sku', v_billing_sku,
    'amount', v_amount,
    'phone_e164', v_phone_e164,
    'payment_url', null,
    'qr_content', case when lower(coalesce(p_provider, 'bank_transfer')) = 'bank_transfer' then v_order_code else null end,
    'bank_transfer_note', case when lower(coalesce(p_provider, 'bank_transfer')) = 'bank_transfer' then v_order_code else null end,
    'telegram_link_token', v_link_token,
    'helper_text', case
      when lower(coalesce(p_provider, 'bank_transfer')) = 'bank_transfer' then 'Chuyen khoan dung noi dung ma don hang de he thong doi soat va mo quyen Telegram ngay.'
      when lower(coalesce(p_provider, 'bank_transfer')) = 'momo' then 'Don hang da tao, backend cho IPN de kich hoat.'
      when lower(coalesce(p_provider, 'bank_transfer')) = 'vnpay' then 'Don hang da tao, backend cho IPN hoac xac minh giao dich.'
      else 'Don hang da tao va dang cho backend xac nhan.'
    end,
    'created_at', now()
  );
end;
$$;

create or replace function public.portal_get_order_status(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_subscription record;
  v_link_token text;
begin
  select *
    into v_order
  from public.orders
  where id::text = p_order_id
     or order_code = p_order_id
  order by created_at desc
  limit 1;

  if v_order is null then
    return jsonb_build_object(
      'order_id', p_order_id,
      'status', 'not_found',
      'entitlement_active', false,
      'premium_until', null,
      'provider', null,
      'updated_at', now()
    );
  end if;

  select s.*
    into v_subscription
  from public.subscriptions s
  where s.customer_id = v_order.customer_id
  order by s.updated_at desc
  limit 1;

  v_link_token := public.ensure_channel_link_token(v_order.customer_id, 'telegram', v_order.id, interval '7 days');

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_code', v_order.order_code,
    'status', v_order.status,
    'entitlement_active', coalesce(v_order.status in ('active', 'paid', 'completed'), false) or coalesce(v_subscription.status = 'active', false),
    'premium_until', v_subscription.current_period_end,
    'provider', v_order.provider,
    'amount', v_order.amount,
    'phone_e164', v_order.phone_e164,
    'telegram_link_token', v_link_token,
    'updated_at', coalesce(v_order.updated_at, now())
  );
end;
$$;

create or replace function public.mark_order_paid_and_grant_entitlement(
  p_order_code text,
  p_provider text default 'bank_transfer',
  p_provider_txn_id text default null,
  p_amount integer default null,
  p_raw_payload jsonb default '{}'::jsonb,
  p_provider_event_id text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_plan public.plans%rowtype;
  v_customer public.customers%rowtype;
  v_now timestamptz := now();
  v_period_end timestamptz;
  v_days integer;
  v_link_token text;
  v_existing_payment public.payment_attempts%rowtype;
  v_existing_user_id bigint;
begin
  select *
    into v_order
  from public.orders
  where order_code = p_order_code
  limit 1;

  if v_order.id is null then
    return jsonb_build_object('status', 'order_not_found', 'order_code', p_order_code);
  end if;

  select * into v_plan from public.plans where id = v_order.plan_id limit 1;
  select * into v_customer from public.customers where id = v_order.customer_id limit 1;

  if p_amount is not null and v_order.amount <> p_amount and coalesce(p_force, false) is not true then
    insert into public.payment_webhooks (provider, event_type, provider_event_id, payload, status, processed_at)
    values (coalesce(p_provider, v_order.provider), 'bank_transfer_mismatch', coalesce(p_provider_event_id, p_provider_txn_id), coalesce(p_raw_payload, '{}'::jsonb), 'needs_review', v_now)
    on conflict (provider, provider_event_id) where provider_event_id is not null
    do update set payload = excluded.payload, status = 'needs_review', processed_at = excluded.processed_at;

    update public.orders
      set status = 'needs_review', updated_at = v_now
    where id = v_order.id and status not in ('paid', 'active', 'completed');

    return jsonb_build_object(
      'status', 'needs_review',
      'reason', 'amount_mismatch',
      'order_id', v_order.id,
      'order_code', v_order.order_code,
      'expected_amount', v_order.amount,
      'received_amount', p_amount
    );
  end if;

  if p_provider_txn_id is not null then
    select *
      into v_existing_payment
    from public.payment_attempts
    where provider = coalesce(p_provider, v_order.provider)
      and provider_txn_id = p_provider_txn_id
    limit 1;
  end if;

  if v_order.status in ('paid', 'active', 'completed') then
    v_link_token := public.ensure_channel_link_token(v_order.customer_id, 'telegram', v_order.id, interval '7 days');
    return jsonb_build_object(
      'status', 'already_paid',
      'order_id', v_order.id,
      'order_code', v_order.order_code,
      'customer_id', v_order.customer_id,
      'telegram_link_token', v_link_token
    );
  end if;

  insert into public.payment_webhooks (provider, event_type, provider_event_id, payload, status, processed_at)
  values (coalesce(p_provider, v_order.provider), 'payment_confirmed', coalesce(p_provider_event_id, p_provider_txn_id), coalesce(p_raw_payload, '{}'::jsonb), 'processed', v_now)
  on conflict (provider, provider_event_id) where provider_event_id is not null
  do update set payload = excluded.payload, status = 'processed', processed_at = excluded.processed_at;

  if v_existing_payment.id is null then
    if p_provider_txn_id is not null then
      insert into public.payment_attempts (
        order_id, provider, provider_txn_id, status, amount, paid_at, raw_payload, updated_at
      )
      values (
        v_order.id, coalesce(p_provider, v_order.provider), p_provider_txn_id, 'paid', coalesce(p_amount, v_order.amount), v_now, coalesce(p_raw_payload, '{}'::jsonb), v_now
      )
      on conflict (provider, provider_txn_id)
      do update set
        order_id = excluded.order_id,
        status = 'paid',
        amount = excluded.amount,
        paid_at = excluded.paid_at,
        raw_payload = excluded.raw_payload,
        updated_at = excluded.updated_at;
    else
      insert into public.payment_attempts (
        order_id, provider, status, amount, paid_at, raw_payload, updated_at
      )
      values (
        v_order.id, coalesce(p_provider, v_order.provider), 'paid', coalesce(p_amount, v_order.amount), v_now, coalesce(p_raw_payload, '{}'::jsonb), v_now
      );
    end if;
  end if;

  v_days := public.billing_days_from_sku(v_order.billing_sku);
  v_period_end := case
    when v_plan.code = 'lifetime' or lower(coalesce(v_order.billing_sku, '')) = 'lifetime' then '2099-12-31T23:59:59Z'::timestamptz
    else v_now + make_interval(days => greatest(v_days, 1))
  end;

  update public.orders
    set status = 'paid', updated_at = v_now
  where id = v_order.id;

  insert into public.subscriptions (
    customer_id, plan_id, status, billing_cycle, current_period_start, current_period_end, provider, created_at, updated_at
  )
  values (
    v_order.customer_id,
    v_order.plan_id,
    'active',
    coalesce(v_order.billing_cycle, 'monthly'),
    v_now,
    v_period_end,
    coalesce(p_provider, v_order.provider),
    v_now,
    v_now
  )
  on conflict do nothing;

  update public.subscriptions
    set plan_id = v_order.plan_id,
        status = 'active',
        billing_cycle = coalesce(v_order.billing_cycle, billing_cycle),
        current_period_start = v_now,
        current_period_end = v_period_end,
        provider = coalesce(p_provider, v_order.provider),
        updated_at = v_now
  where customer_id = v_order.customer_id;

  update public.customers
    set plan = case when v_plan.code = 'lifetime' then 'lifetime' else case when v_plan.code = 'pro' then 'pro' else 'free' end end,
        premium_until = case when v_plan.code = 'free' then null else v_period_end end,
        entitlement_source = concat('payment:', coalesce(p_provider, v_order.provider)),
        status = 'active',
        updated_at = v_now
  where id = v_order.customer_id;

  perform public.sync_customer_to_compat_users(v_order.customer_id);

  select u.id
    into v_existing_user_id
  from public.users u
  where u.customer_id = v_order.customer_id
  order by u.id asc
  limit 1;

  begin
    insert into public.transaction_history (
      user_id, customer_id, amount, payment_method, status, transaction_code, description, days_added, plan_granted, billing_sku, metadata, created_at, completed_at
    )
    values (
      v_existing_user_id,
      v_order.customer_id,
      coalesce(p_amount, v_order.amount),
      coalesce(p_provider, v_order.provider),
      'completed',
      coalesce(p_provider_txn_id, v_order.order_code),
      concat('Order ', v_order.order_code, ' auto-confirmed'),
      case when v_plan.code = 'lifetime' then 36500 else v_days end,
      v_plan.code,
      v_order.billing_sku,
      jsonb_build_object('order_id', v_order.id, 'order_code', v_order.order_code, 'provider_event_id', coalesce(p_provider_event_id, p_provider_txn_id)),
      v_now,
      v_now
    );
  exception when others then
    null;
  end;

  begin
    insert into public.subscription_events (
      user_id, customer_id, event_type, plan_from, plan_to, amount, source, notes, billing_sku, created_at
    )
    values (
      v_existing_user_id,
      v_order.customer_id,
      'payment_confirmed',
      null,
      v_plan.code,
      coalesce(p_amount, v_order.amount),
      coalesce(p_provider, v_order.provider),
      concat('Order ', v_order.order_code),
      v_order.billing_sku,
      v_now
    );
  exception when others then
    null;
  end;

  v_link_token := public.ensure_channel_link_token(v_order.customer_id, 'telegram', v_order.id, interval '7 days');

  return jsonb_build_object(
    'status', 'paid',
    'order_id', v_order.id,
    'order_code', v_order.order_code,
    'customer_id', v_order.customer_id,
    'plan', v_plan.code,
    'premium_until', v_period_end,
    'telegram_link_token', v_link_token
  );
end;
$$;

create or replace function public.consume_telegram_link_token(
  p_link_token text,
  p_platform_user_id text,
  p_chat_id text,
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_language_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.channel_link_tokens%rowtype;
  v_customer public.customers%rowtype;
  v_order public.orders%rowtype;
  v_existing_channel public.customer_channel_accounts%rowtype;
  v_user_id bigint;
  v_chat_id bigint;
begin
  if p_link_token is null or length(trim(p_link_token)) = 0 then
    return jsonb_build_object('status', 'token_missing');
  end if;

  select *
    into v_token
  from public.channel_link_tokens
  where link_token = trim(p_link_token)
    and channel = 'telegram'
  limit 1;

  if v_token.id is null then
    return jsonb_build_object('status', 'token_not_found');
  end if;

  if v_token.status <> 'active' then
    return jsonb_build_object('status', 'token_not_active');
  end if;

  if v_token.expires_at is not null and v_token.expires_at < now() then
    update public.channel_link_tokens set status = 'expired' where id = v_token.id;
    return jsonb_build_object('status', 'token_expired');
  end if;

  select * into v_customer from public.customers where id = v_token.customer_id limit 1;
  select * into v_order from public.orders where id = v_token.order_id limit 1;

  select *
    into v_existing_channel
  from public.customer_channel_accounts
  where channel = 'telegram'
    and platform_user_id = p_platform_user_id
  limit 1;

  if v_existing_channel.id is not null
     and v_existing_channel.customer_id is not null
     and v_existing_channel.customer_id <> v_customer.id then
    return jsonb_build_object(
      'status', 'needs_support',
      'reason', 'telegram_already_linked',
      'customer_id', v_existing_channel.customer_id
    );
  end if;

  begin
    v_chat_id := case when p_chat_id ~ '^-?[0-9]+$' then p_chat_id::bigint else null end;
  exception when others then
    v_chat_id := null;
  end;

  select id
    into v_user_id
  from public.users
  where platform = 'telegram'
    and platform_id = p_platform_user_id
  limit 1;

  if v_user_id is null then
    insert into public.users (
      username,
      first_name,
      last_name,
      language,
      platform,
      platform_id,
      chat_id,
      plan,
      premium_until,
      is_active,
      is_banned,
      customer_id
    )
    values (
      nullif(trim(p_username), ''),
      nullif(trim(p_first_name), ''),
      nullif(trim(p_last_name), ''),
      nullif(trim(p_language_code), ''),
      'telegram',
      p_platform_user_id,
      v_chat_id,
      v_customer.plan,
      v_customer.premium_until,
      true,
      false,
      v_customer.id
    )
    returning id into v_user_id;
  else
    update public.users
      set username = coalesce(nullif(trim(p_username), ''), username),
          first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
          last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
          language = coalesce(nullif(trim(p_language_code), ''), language),
          chat_id = coalesce(v_chat_id, chat_id),
          customer_id = v_customer.id,
          plan = v_customer.plan,
          premium_until = v_customer.premium_until,
          is_active = true
    where id = v_user_id;
  end if;

  insert into public.customer_channel_accounts (
    customer_id, channel, platform_user_id, platform_chat_id, linked_user_id, display_name, link_status, phone_claimed_e164
  )
  values (
    v_customer.id,
    'telegram',
    p_platform_user_id,
    p_chat_id,
    v_user_id,
    coalesce(nullif(trim(concat_ws(' ', p_first_name, p_last_name)), ''), nullif(trim(p_username), ''), v_customer.full_name),
    'linked',
    v_customer.phone_e164
  )
  on conflict (channel, platform_user_id)
  do update set
    customer_id = excluded.customer_id,
    platform_chat_id = excluded.platform_chat_id,
    linked_user_id = excluded.linked_user_id,
    display_name = coalesce(excluded.display_name, public.customer_channel_accounts.display_name),
    link_status = 'linked',
    updated_at = now();

  update public.channel_link_tokens
    set status = 'used',
        used_at = now()
  where id = v_token.id;

  perform public.sync_customer_to_compat_users(v_customer.id);

  if v_order.id is not null
     and v_order.status not in ('paid', 'active', 'completed')
     and coalesce(v_customer.plan, 'free') = 'free' then
    return jsonb_build_object(
      'status', 'order_pending',
      'order_code', v_order.order_code,
      'order_status', v_order.status,
      'customer_id', v_customer.id,
      'user_id', v_user_id,
      'plan', v_customer.plan,
      'premium_until', v_customer.premium_until
    );
  end if;

  return jsonb_build_object(
    'status', 'linked',
    'customer_id', v_customer.id,
    'user_id', v_user_id,
    'plan', v_customer.plan,
    'premium_until', v_customer.premium_until,
    'order_status', coalesce(v_order.status, 'not_found')
  );
end;
$$;

create or replace function public.telegram_resolve_user(
  p_platform_user_id text,
  p_chat_id text,
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_language_code text default null,
  p_message_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_link_result jsonb;
  v_user public.users%rowtype;
begin
  if p_message_text ~* '^/start\s+[A-Za-z0-9]+' then
    v_token := regexp_replace(p_message_text, '^/start\s+([A-Za-z0-9]+).*$','\1', 'i');
    v_link_result := public.consume_telegram_link_token(
      v_token,
      p_platform_user_id,
      p_chat_id,
      p_username,
      p_first_name,
      p_last_name,
      p_language_code
    );
  end if;

  select *
    into v_user
  from public.users
  where platform = 'telegram'
    and platform_id = p_platform_user_id
  limit 1;

  if v_user.id is null and p_chat_id is not null then
    select *
      into v_user
    from public.users
    where platform = 'telegram'
      and chat_id::text = p_chat_id
    limit 1;
  end if;

  if v_user.id is null then
    return coalesce(v_link_result, '{}'::jsonb);
  end if;

  return to_jsonb(v_user) || jsonb_build_object('link_result', coalesce(v_link_result, '{}'::jsonb));
end;
$$;

create or replace function public.admin_mark_order_paid(
  p_order_code text,
  p_amount integer default null,
  p_tx_code text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin_role(array['billing_admin', 'finance']);

  v_result := public.mark_order_paid_and_grant_entitlement(
    p_order_code => p_order_code,
    p_provider => 'manual_admin',
    p_provider_txn_id => p_tx_code,
    p_amount => p_amount,
    p_raw_payload => jsonb_build_object('note', p_note, 'source', 'admin_manual_mark_paid'),
    p_provider_event_id => p_tx_code,
    p_force => true
  );

  perform public.admin_write_audit(
    'finance.mark_order_paid',
    'order',
    p_order_code,
    jsonb_build_object('amount', p_amount, 'tx_code', p_tx_code, 'note', p_note, 'result', v_result)
  );

  return v_result;
end;
$$;

create or replace function public.admin_list_payments()
returns table (
  id text,
  user_id bigint,
  user_name text,
  channel text,
  customer_id bigint,
  customer_phone text,
  amount numeric,
  payment_method text,
  status text,
  transaction_code text,
  description text,
  days_added integer,
  plan_granted text,
  billing_sku text,
  provider_event_id text,
  entitlement_result text,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_role(array['billing_admin', 'finance']);

  return query
  with legacy_payments as (
    select
      t.id::text as id,
      t.user_id,
      coalesce(u.first_name, u.username, u.email, concat('User ', u.id::text))::text as user_name,
      coalesce(u.platform, 'telegram')::text as channel,
      t.customer_id,
      c.phone_e164::text as customer_phone,
      t.amount,
      t.payment_method::text,
      t.status::text,
      t.transaction_code::text,
      t.description::text,
      t.days_added,
      t.plan_granted::text,
      t.billing_sku::text,
      coalesce(t.metadata ->> 'provider_event_id', t.metadata ->> 'payos_event_id')::text as provider_event_id,
      coalesce(t.plan_granted::text, t.billing_sku::text, 'unknown')::text as entitlement_result,
      t.created_at::timestamptz as created_at,
      t.completed_at::timestamptz as completed_at
    from public.transaction_history t
    left join public.users u on u.id = t.user_id
    left join public.customers c on c.id = t.customer_id
  ),
  canonical_orders as (
    select
      concat('order:', o.id)::text as id,
      u.id as user_id,
      coalesce(u.first_name, u.username, u.email, c.full_name, concat('Customer ', c.id::text))::text as user_name,
      coalesce(cca.channel, u.platform, 'web')::text as channel,
      c.id as customer_id,
      c.phone_e164::text as customer_phone,
      o.amount::numeric as amount,
      o.provider::text as payment_method,
      o.status::text as status,
      coalesce(pa.provider_txn_id, o.order_code)::text as transaction_code,
      concat('Order ', o.order_code)::text as description,
      case when p.code = 'lifetime' then 36500 else public.billing_days_from_sku(o.billing_sku) end as days_added,
      p.code::text as plan_granted,
      o.billing_sku::text as billing_sku,
      pw.provider_event_id::text as provider_event_id,
      case when o.status in ('paid', 'active', 'completed') then p.code else o.status end::text as entitlement_result,
      o.created_at::timestamptz as created_at,
      coalesce(pa.paid_at, o.updated_at)::timestamptz as completed_at
    from public.orders o
    left join public.customers c on c.id = o.customer_id
    left join public.plans p on p.id = o.plan_id
    left join lateral (
      select *
      from public.payment_attempts pa1
      where pa1.order_id = o.id
      order by coalesce(pa1.paid_at, pa1.created_at) desc
      limit 1
    ) pa on true
    left join lateral (
      select *
      from public.payment_webhooks pw1
      where pw1.provider = o.provider
      order by pw1.created_at desc
      limit 1
    ) pw on true
    left join lateral (
      select *
      from public.customer_channel_accounts cca1
      where cca1.customer_id = c.id
        and cca1.channel = 'telegram'
      order by cca1.updated_at desc
      limit 1
    ) cca on true
    left join lateral (
      select *
      from public.users u1
      where u1.customer_id = c.id
        and coalesce(u1.platform, 'telegram') = 'telegram'
      order by u1.id asc
      limit 1
    ) u on true
    where not exists (
      select 1
      from public.transaction_history t
      where (t.metadata ->> 'order_id')::bigint = o.id
    )
  )
  select *
  from legacy_payments
  union all
  select *
  from canonical_orders
  order by created_at desc
  limit 500;
end;
$$;

create or replace function public.admin_get_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_role(null);

  return jsonb_build_object(
    'total_users', (select count(*) from public.users),
    'premium_users', (select count(*) from public.customers where plan = 'pro'),
    'lifetime_users', (select count(*) from public.customers where plan = 'lifetime'),
    'today_ai_calls', (
      select count(*)
      from public.ai_usage_log
      where created_at >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
    ),
    'month_revenue', (
      select coalesce(sum(o.amount), 0)
      from public.orders o
      where o.status in ('paid', 'active', 'completed')
        and date_trunc('month', o.created_at at time zone 'Asia/Ho_Chi_Minh')
          = date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')
    ),
    'total_revenue', (
      select coalesce(sum(o.amount), 0)
      from public.orders o
      where o.status in ('paid', 'active', 'completed')
    ),
    'expiring_in_7_days', (
      select count(*)
      from public.customers
      where plan = 'pro'
        and premium_until is not null
        and premium_until > now()
        and premium_until < now() + interval '7 days'
    ),
    'telegram_users', (
      select count(*)
      from public.customer_channel_accounts
      where channel = 'telegram' and link_status = 'linked'
    ),
    'zalo_users', (
      select count(*)
      from public.customer_channel_accounts
      where channel = 'zalo' and link_status = 'linked'
    ),
    'web_users', (
      select count(*)
      from public.customer_auth_links
      where link_status in ('linked', 'active')
    )
  );
end;
$$;

create or replace function public.admin_get_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schema jsonb;
begin
  perform public.require_admin_role(null);
  v_schema := public.admin_schema_readiness();

  return jsonb_build_object(
    'schema_ready', coalesce((v_schema ->> 'ready')::boolean, false),
    'schema_missing', coalesce(v_schema -> 'missing', '[]'::jsonb),
    'pending_payments', (select count(*) from public.orders where status in ('pending_confirmation', 'pending')),
    'duplicate_like_payments', (
      select count(*)
      from (
        select provider, provider_txn_id
        from public.payment_attempts
        where provider_txn_id is not null
        group by provider, provider_txn_id
        having count(*) > 1
      ) duplicates
    ),
    'failed_payment_events', (select count(*) from public.payment_webhooks where status in ('failed', 'needs_review')),
    'catalog_candidates_pending', (
      select count(*)
      from public.food_candidates
      where coalesce(promotion_status, status, 'pending') = 'pending'
    ),
    'ai_calls_today', (
      select count(*)
      from public.ai_usage_log
      where created_at >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
    ),
    'admin_members', (select count(*) from public.admin_members where is_active = true),
    'last_webhook_at', (select max(created_at) from public.payment_webhooks),
    'checked_at', now()
  );
end;
$$;

grant execute on function public.portal_start_checkout(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.portal_get_order_status(text) to anon, authenticated, service_role;
grant execute on function public.mark_order_paid_and_grant_entitlement(text, text, text, integer, jsonb, text, boolean) to service_role;
grant execute on function public.consume_telegram_link_token(text, text, text, text, text, text, text) to service_role;
grant execute on function public.telegram_resolve_user(text, text, text, text, text, text, text) to service_role;
grant execute on function public.admin_mark_order_paid(text, integer, text, text) to authenticated, service_role;

commit;
