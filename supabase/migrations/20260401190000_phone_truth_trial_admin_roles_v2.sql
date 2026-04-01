begin;

alter table if exists public.customers
  add column if not exists phone_verified_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists access_state text not null default 'pending_verification',
  add column if not exists onboarding_status text not null default 'pending_profile';

alter table if exists public.users
  add column if not exists customer_phone_e164 text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists access_state text not null default 'pending_verification';

create index if not exists idx_customers_access_state on public.customers(access_state);
create index if not exists idx_customers_trial_ends_at on public.customers(trial_ends_at);
create index if not exists idx_users_access_state on public.users(access_state);

alter table if exists public.admin_member_roles
  drop constraint if exists admin_member_roles_role_check;

create temporary table _admin_role_seed on commit drop as
select distinct r.member_id
from public.admin_member_roles r
join public.admin_members m on m.id = r.member_id
where coalesce(m.is_owner, false) is not true;

delete from public.admin_member_roles;

insert into public.admin_member_roles (member_id, role, created_at)
select seed.member_id, 'admin', now()
from _admin_role_seed seed
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_member_roles_role_check'
  ) then
    alter table public.admin_member_roles
      add constraint admin_member_roles_role_check
      check (role in ('admin'));
  end if;
end;
$$;

create or replace function public.refresh_customer_access_state(p_customer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_now timestamptz := now();
  v_access_state text := 'pending_verification';
  v_has_paid boolean := false;
begin
  select *
    into v_customer
  from public.customers
  where id = p_customer_id
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object(
      'customer_id', p_customer_id,
      'access_state', 'missing',
      'trial_ends_at', null,
      'premium_until', null,
      'plan', null
    );
  end if;

  v_has_paid := (
    v_customer.plan = 'lifetime'
    or (
      v_customer.plan = 'pro'
      and v_customer.premium_until is not null
      and v_customer.premium_until > v_now
    )
  );

  if coalesce(v_customer.is_banned, false) or (v_customer.ban_until is not null and v_customer.ban_until > v_now) then
    v_access_state := 'blocked';
  elsif v_customer.phone_verified_at is null then
    v_access_state := 'pending_verification';
  elsif v_has_paid then
    v_access_state := 'active_paid';
  elsif v_customer.trial_ends_at is not null and v_customer.trial_ends_at > v_now then
    v_access_state := 'trialing';
  else
    v_access_state := 'free_limited';
  end if;

  update public.customers
     set access_state = v_access_state,
         updated_at = now()
   where id = v_customer.id
     and access_state is distinct from v_access_state;

  return jsonb_build_object(
    'customer_id', v_customer.id,
    'access_state', v_access_state,
    'trial_ends_at', v_customer.trial_ends_at,
    'premium_until', v_customer.premium_until,
    'plan', v_customer.plan,
    'phone_verified_at', v_customer.phone_verified_at
  );
end;
$$;

create or replace function public.ensure_customer_trial(
  p_customer_id bigint,
  p_trial_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_now timestamptz := now();
  v_trial_ends_at timestamptz;
  v_plan_id bigint;
  v_existing_subscription public.subscriptions%rowtype;
begin
  select *
    into v_customer
  from public.customers
  where id = p_customer_id
  limit 1;

  if v_customer.id is null then
    raise exception 'customer_not_found';
  end if;

  if v_customer.plan = 'lifetime'
     or (
       v_customer.plan = 'pro'
       and v_customer.premium_until is not null
       and v_customer.premium_until > v_now
     ) then
    return public.refresh_customer_access_state(v_customer.id);
  end if;

  if v_customer.trial_started_at is null then
    v_trial_ends_at := v_now + make_interval(days => greatest(coalesce(p_trial_days, 7), 1));

    update public.customers
       set plan = 'free',
           status = 'active',
           trial_started_at = v_now,
           trial_ends_at = v_trial_ends_at,
           entitlement_source = coalesce(nullif(entitlement_source, ''), 'trial'),
           updated_at = v_now
     where id = v_customer.id;

    select id
      into v_plan_id
    from public.plans
    where code = 'free'
    limit 1;

    if v_plan_id is not null then
      select *
        into v_existing_subscription
      from public.subscriptions
      where customer_id = v_customer.id
      order by updated_at desc
      limit 1;

      if v_existing_subscription.id is null then
        insert into public.subscriptions (
          customer_id,
          plan_id,
          status,
          billing_cycle,
          current_period_start,
          current_period_end,
          provider,
          created_at,
          updated_at
        )
        values (
          v_customer.id,
          v_plan_id,
          'trialing',
          'monthly',
          v_now,
          v_trial_ends_at,
          'portal_trial',
          v_now,
          v_now
        );
      elsif v_existing_subscription.status not in ('active') or coalesce(v_existing_subscription.provider, '') = 'portal_trial' then
        update public.subscriptions
           set plan_id = v_plan_id,
               status = 'trialing',
               billing_cycle = 'monthly',
               current_period_start = v_now,
               current_period_end = v_trial_ends_at,
               provider = 'portal_trial',
               updated_at = v_now
         where id = v_existing_subscription.id;
      end if;
    end if;
  end if;

  perform public.sync_customer_to_compat_users(v_customer.id);
  return public.refresh_customer_access_state(v_customer.id);
end;
$$;

create or replace function public.sync_customer_to_compat_users(p_customer_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_usage integer := 0;
  v_state jsonb;
begin
  select *
    into v_customer
  from public.customers
  where id = p_customer_id;

  if not found then
    return;
  end if;

  v_state := public.refresh_customer_access_state(p_customer_id);

  select coalesce(ai_calls_used, 0)
    into v_usage
  from public.customer_daily_usage
  where customer_id = p_customer_id
    and date_local = ((now() at time zone 'Asia/Saigon')::date);

  update public.users
     set customer_id = p_customer_id,
         customer_phone_e164 = v_customer.phone_e164,
         plan = v_customer.plan,
         premium_until = v_customer.premium_until,
         trial_ends_at = v_customer.trial_ends_at,
         access_state = coalesce(v_state ->> 'access_state', 'pending_verification'),
         daily_ai_usage_count = coalesce(v_usage, 0),
         last_usage_reset_date = ((now() at time zone 'Asia/Saigon')::date)
   where id in (
      select linked_user_id
      from public.customer_channel_accounts
      where customer_id = p_customer_id
        and linked_user_id is not null
   )
      or customer_id = p_customer_id;
end;
$$;

create or replace function public.portal_complete_phone_verification(p_phone_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_customer public.customers%rowtype;
  v_user_id bigint;
  v_email text;
  v_phone_e164 text;
  v_state jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_phone_e164 := public.normalize_vn_phone(p_phone_input);
  if v_phone_e164 is null or length(trim(v_phone_e164)) = 0 then
    raise exception 'phone_required';
  end if;

  v_email := coalesce(auth.jwt() ->> 'email', null);
  v_customer_id := public.upsert_customer_by_phone(v_phone_e164, null);

  update public.customers
     set phone_display = coalesce(nullif(trim(p_phone_input), ''), phone_display),
         phone_verified_at = coalesce(phone_verified_at, now()),
         status = 'active',
         updated_at = now()
   where id = v_customer_id;

  insert into public.customer_auth_links (
    customer_id,
    auth_user_id,
    email,
    link_status
  )
  values (
    v_customer_id,
    auth.uid(),
    v_email,
    'linked'
  )
  on conflict (auth_user_id) do update
     set customer_id = excluded.customer_id,
         email = excluded.email,
         link_status = 'linked',
         updated_at = now();

  perform public.link_current_auth_user_by_email();

  select id
    into v_user_id
  from public.users
  where auth_user_id = auth.uid()
  order by id asc
  limit 1;

  if v_user_id is not null then
    update public.users
       set customer_id = v_customer_id,
           customer_phone_e164 = v_phone_e164
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
    v_customer_id,
    'web',
    auth.uid()::text,
    v_user_id,
    coalesce(v_email, v_phone_e164),
    p_phone_input,
    v_phone_e164,
    'linked'
  )
  on conflict (channel, platform_user_id) do update
     set customer_id = excluded.customer_id,
         linked_user_id = coalesce(excluded.linked_user_id, public.customer_channel_accounts.linked_user_id),
         display_name = coalesce(excluded.display_name, public.customer_channel_accounts.display_name),
         phone_claimed = excluded.phone_claimed,
         phone_claimed_e164 = excluded.phone_claimed_e164,
         link_status = 'linked',
         updated_at = now();

  v_state := public.ensure_customer_trial(v_customer_id, 7);

  select *
    into v_customer
  from public.customers
  where id = v_customer_id
  limit 1;

  return jsonb_build_object(
    'customer_id', v_customer_id,
    'phone_e164', v_phone_e164,
    'access_state', coalesce(v_state ->> 'access_state', v_customer.access_state),
    'trial_ends_at', v_customer.trial_ends_at,
    'premium_until', v_customer.premium_until,
    'plan', v_customer.plan
  );
end;
$$;

create or replace function public.portal_link_customer_by_phone(p_phone_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.portal_complete_phone_verification(p_phone_input);
end;
$$;

create or replace function public.portal_get_customer_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_email text;
  v_customer public.customers%rowtype;
  v_usage integer := 0;
  v_access jsonb;
begin
  v_email := coalesce(auth.jwt() ->> 'email', null);
  v_customer_id := public.current_customer_id();

  if v_customer_id is null then
    return jsonb_build_object(
      'customer_id', null,
      'linked_user_id', null,
      'email', v_email,
      'phone_e164', null,
      'phone_display', null,
      'full_name', null,
      'plan', 'free',
      'premium_until', null,
      'trial_ends_at', null,
      'access_state', 'pending_verification',
      'entitlement_source', 'auth_only',
      'entitlement_label', 'Xác thực số điện thoại để mở dùng thử 7 ngày.',
      'quota_used_today', 0,
      'quota_label', 'Chưa có quyền truy cập. Hãy xác thực số điện thoại để bắt đầu trial.',
      'source', 'auth_only',
      'linked_channels', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'last_sync_at', now()
    );
  end if;

  select *
    into v_customer
  from public.customers
  where id = v_customer_id
  limit 1;

  v_access := public.refresh_customer_access_state(v_customer_id);

  select coalesce(ai_calls_used, 0)
    into v_usage
  from public.customer_daily_usage
  where customer_id = v_customer_id
    and date_local = ((now() at time zone 'Asia/Saigon')::date);

  return (
    with linked_user as (
      select u.id
      from public.users u
      where u.customer_id = v_customer_id
      order by u.id asc
      limit 1
    ),
    linked_channels as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', cca.id,
            'channel', cca.channel,
            'display_name', cca.display_name,
            'link_status', cca.link_status,
            'platform_user_id', cca.platform_user_id,
            'linked_at', cca.updated_at
          )
          order by cca.updated_at desc
        ),
        '[]'::jsonb
      ) as payload
      from public.customer_channel_accounts cca
      where cca.customer_id = v_customer_id
    ),
    payments as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'amount', o.amount,
            'status', o.status,
            'payment_method', o.provider,
            'billing_sku', o.billing_sku,
            'provider', o.provider,
            'created_at', o.created_at,
            'transaction_code', o.order_code
          )
          order by o.created_at desc
        ),
        '[]'::jsonb
      ) as payload
      from public.orders o
      where o.customer_id = v_customer_id
    )
    select jsonb_build_object(
      'customer_id', v_customer.id,
      'linked_user_id', (select id from linked_user),
      'email', v_email,
      'phone_e164', v_customer.phone_e164,
      'phone_display', v_customer.phone_display,
      'full_name', v_customer.full_name,
      'plan', v_customer.plan,
      'premium_until', v_customer.premium_until,
      'trial_ends_at', v_customer.trial_ends_at,
      'access_state', coalesce(v_access ->> 'access_state', v_customer.access_state),
      'entitlement_source', v_customer.entitlement_source,
      'entitlement_label', case
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'trialing' then
          'Dùng thử 7 ngày đang hoạt động.'
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'active_paid' and v_customer.plan = 'lifetime' then
          'Lifetime đang hoạt động ở cấp customer.'
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'active_paid' then
          'Pro đang hoạt động.'
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'free_limited' then
          'Free giới hạn sau khi trial kết thúc.'
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'blocked' then
          'Tài khoản đang bị chặn.'
        else
          'Cần xác thực số điện thoại để mở trial.'
      end,
      'quota_used_today', v_usage,
      'quota_label', case
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'active_paid' then
          concat(v_usage::text, ' lượt dùng AI hôm nay • quota chia sẻ theo customer')
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'trialing' then
          concat(v_usage::text, ' lượt dùng hôm nay • đang trong trial 7 ngày')
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'free_limited' then
          concat(v_usage::text, '/5 tin nhắn hôm nay • 2 ảnh/ngày')
        when coalesce(v_access ->> 'access_state', v_customer.access_state) = 'blocked' then
          'Tài khoản đang bị chặn.'
        else
          'Chưa có quyền truy cập. Xác thực số điện thoại để bắt đầu.'
      end,
      'source', 'customer_linked',
      'linked_channels', (select payload from linked_channels),
      'payments', (select payload from payments),
      'last_sync_at', now()
    )
  );
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
  v_customer public.customers%rowtype;
  v_plan_id bigint;
  v_amount integer;
  v_order_id bigint;
  v_order_code text;
  v_phone_e164 text;
  v_billing_sku text;
  v_status text;
  v_link_token text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_customer_id := public.current_customer_id();
  if v_customer_id is null then
    raise exception 'phone_verification_required';
  end if;

  select *
    into v_customer
  from public.customers
  where id = v_customer_id
  limit 1;

  if v_customer.id is null then
    raise exception 'customer_not_found';
  end if;

  if v_customer.phone_verified_at is null then
    raise exception 'phone_verification_required';
  end if;

  v_phone_e164 := public.normalize_vn_phone(coalesce(p_phone_e164, v_customer.phone_e164));
  if v_phone_e164 is null or v_phone_e164 <> v_customer.phone_e164 then
    raise exception 'verified_phone_mismatch';
  end if;

  v_billing_sku := lower(coalesce(p_billing_sku, case when lower(coalesce(p_plan, 'free')) = 'lifetime' then 'lifetime' else 'monthly' end));

  select
    id,
    case
      when code = 'lifetime' or v_billing_sku = 'lifetime' then coalesce(lifetime_price, monthly_price, 0)
      when v_billing_sku = 'yearly' then coalesce(yearly_price, monthly_price, 0)
      when v_billing_sku = 'semiannual' then coalesce(semiannual_price, monthly_price, 0)
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
    case when v_billing_sku = 'yearly' then 'yearly' else 'monthly' end,
    v_billing_sku,
    v_amount,
    lower(coalesce(p_provider, 'bank_transfer')),
    v_status,
    v_phone_e164,
    v_order_code,
    jsonb_build_object(
      'source', 'portal_verified_checkout',
      'auth_user_id', auth.uid(),
      'customer_id', v_customer_id,
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
      when lower(coalesce(p_provider, 'bank_transfer')) = 'bank_transfer' then 'Chuyển khoản đúng nội dung mã đơn để hệ thống đối soát và cấp quyền tự động.'
      when lower(coalesce(p_provider, 'bank_transfer')) = 'momo' then 'Đơn hàng đã tạo, backend sẽ xác nhận bằng IPN trước khi cấp quyền.'
      else 'Đơn hàng đã tạo và đang chờ backend xác nhận.'
    end,
    'created_at', now()
  );
end;
$$;

create or replace function public.ensure_current_admin_member()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_member public.admin_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.link_current_auth_user_by_email();

  select *
    into v_user
  from public.users
  where auth_user_id = auth.uid()
    and is_admin = true
  limit 1;

  if not found then
    raise exception 'Current user is not bootstrap admin';
  end if;

  select *
    into v_member
  from public.admin_members
  where auth_user_id = auth.uid()
     or linked_user_id = v_user.id
  limit 1;

  if not found then
    insert into public.admin_members (
      auth_user_id,
      linked_user_id,
      display_name,
      is_owner,
      is_active
    )
    values (
      auth.uid(),
      v_user.id,
      coalesce(v_user.first_name, v_user.username, v_user.email, 'Owner'),
      true,
      true
    )
    returning *
      into v_member;
  else
    update public.admin_members
       set auth_user_id = auth.uid(),
           linked_user_id = v_user.id,
           display_name = coalesce(public.admin_members.display_name, v_user.first_name, v_user.username, v_user.email),
           is_active = true,
           updated_at = now()
     where id = v_member.id
     returning *
      into v_member;
  end if;

  delete from public.admin_member_roles
   where member_id = v_member.id
     and v_member.is_owner = true;

  return v_member.id;
end;
$$;

create or replace function public.admin_get_member_roles(p_member_id bigint)
returns text[]
language plpgsql
stable
as $$
declare
  v_member public.admin_members%rowtype;
  v_roles text[] := array[]::text[];
begin
  select *
    into v_member
  from public.admin_members
  where id = p_member_id
  limit 1;

  if v_member.id is null then
    return array[]::text[];
  end if;

  if coalesce(v_member.is_owner, false) then
    return array['owner'];
  end if;

  if exists (
    select 1
    from public.admin_member_roles
    where member_id = p_member_id
      and role = 'admin'
  ) then
    return array['admin'];
  end if;

  return array['user'];
end;
$$;

create or replace function public.admin_get_access_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_email text;
  v_member public.admin_members%rowtype;
  v_roles text[] := array[]::text[];
  v_is_admin boolean := false;
begin
  v_email := coalesce((auth.jwt() ->> 'email'), null);

  if auth.uid() is null then
    return jsonb_build_object(
      'is_authenticated', false,
      'linked_user_id', null,
      'is_admin', false,
      'is_owner', false,
      'roles', '[]'::jsonb,
      'email', v_email,
      'checked_at', now(),
      'reason', 'not_authenticated'
    );
  end if;

  perform public.link_current_auth_user_by_email();

  select u.id, u.is_admin, u.email
    into v_user
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if v_user.id is null then
    return jsonb_build_object(
      'is_authenticated', true,
      'linked_user_id', null,
      'is_admin', false,
      'is_owner', false,
      'roles', '[]'::jsonb,
      'email', v_email,
      'checked_at', now(),
      'reason', 'not_linked'
    );
  end if;

  select *
    into v_member
  from public.admin_members
  where (auth_user_id = auth.uid() or linked_user_id = v_user.id)
    and is_active = true
  limit 1;

  if v_member.id is null and coalesce(v_user.is_admin, false) then
    perform public.ensure_current_admin_member();

    select *
      into v_member
    from public.admin_members
    where (auth_user_id = auth.uid() or linked_user_id = v_user.id)
      and is_active = true
    limit 1;
  end if;

  if v_member.id is not null then
    v_roles := public.admin_get_member_roles(v_member.id);
    v_is_admin := coalesce(v_member.is_owner, false) or exists (
      select 1
      from unnest(v_roles) as role_name
      where role_name in ('owner', 'admin')
    );
  end if;

  return jsonb_build_object(
    'is_authenticated', true,
    'linked_user_id', v_user.id,
    'is_admin', v_is_admin,
    'is_owner', coalesce(v_member.is_owner, false),
    'roles', coalesce(to_jsonb(v_roles), '[]'::jsonb),
    'email', coalesce(v_user.email, v_email),
    'checked_at', now(),
    'reason', case when v_is_admin then null else 'not_admin' end
  );
end;
$$;

create or replace function public.admin_list_members()
returns table (
  id bigint,
  auth_user_id uuid,
  linked_user_id bigint,
  display_name text,
  email text,
  username text,
  is_owner boolean,
  is_active boolean,
  roles text[],
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_role(null);

  return query
  select
    m.id,
    m.auth_user_id,
    m.linked_user_id,
    m.display_name::text,
    u.email::text,
    u.username::text,
    m.is_owner,
    m.is_active,
    public.admin_get_member_roles(m.id) as roles,
    m.created_at,
    m.updated_at
  from public.admin_members m
  left join public.users u on u.id = m.linked_user_id
  order by m.created_at asc;
end;
$$;

create or replace function public.admin_set_member_access(
  p_member_id bigint,
  p_role text,
  p_is_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.admin_members%rowtype;
  v_role text := lower(coalesce(p_role, 'user'));
  v_next_active boolean;
  v_owner_count integer := 0;
begin
  perform public.require_admin_owner();

  if v_role not in ('owner', 'admin', 'user') then
    raise exception 'Unsupported role: %', p_role;
  end if;

  select *
    into v_target
  from public.admin_members
  where id = p_member_id
  limit 1;

  if v_target.id is null then
    raise exception 'admin_member_not_found';
  end if;

  v_next_active := coalesce(p_is_active, v_target.is_active);

  if v_target.is_owner and (v_role <> 'owner' or v_next_active is false) then
    select count(*)
      into v_owner_count
    from public.admin_members
    where is_owner = true
      and is_active = true;

    if v_owner_count <= 1 then
      raise exception 'cannot_remove_last_owner';
    end if;
  end if;

  update public.admin_members
     set is_owner = (v_role = 'owner'),
         is_active = v_next_active,
         updated_at = now()
   where id = p_member_id;

  delete from public.admin_member_roles
   where member_id = p_member_id;

  if v_role = 'admin' then
    insert into public.admin_member_roles (member_id, role)
    values (p_member_id, 'admin')
    on conflict do nothing;
  end if;

  perform public.admin_write_audit(
    'security.set_member_access',
    'admin_member',
    p_member_id::text,
    jsonb_build_object(
      'role', v_role,
      'is_active', v_next_active
    )
  );
end;
$$;

create or replace function public.admin_set_member_roles(
  p_member_id bigint,
  p_roles text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'user';
begin
  if exists (
    select 1
    from unnest(coalesce(p_roles, array[]::text[])) as role_name
    where lower(role_name) in ('owner', 'super_admin')
  ) then
    v_role := 'owner';
  elsif exists (
    select 1
    from unnest(coalesce(p_roles, array[]::text[])) as role_name
    where lower(role_name) in ('admin', 'billing_admin', 'support_admin', 'content_admin', 'analyst', 'finance', 'catalog', 'support')
  ) then
    v_role := 'admin';
  end if;

  perform public.admin_set_member_access(p_member_id, v_role, null);
end;
$$;

create or replace function public.admin_toggle_member_active(
  p_member_id bigint,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.admin_members%rowtype;
  v_role text := 'user';
begin
  select *
    into v_member
  from public.admin_members
  where id = p_member_id
  limit 1;

  if v_member.id is null then
    raise exception 'admin_member_not_found';
  end if;

  if v_member.is_owner then
    v_role := 'owner';
  elsif exists (
    select 1
    from public.admin_member_roles
    where member_id = p_member_id
      and role = 'admin'
  ) then
    v_role := 'admin';
  end if;

  perform public.admin_set_member_access(p_member_id, v_role, p_is_active);
end;
$$;

commit;
