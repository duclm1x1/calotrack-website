begin;

alter table if exists public.customers
  add column if not exists last_active_at timestamptz;

alter table if exists public.users
  add column if not exists customer_id bigint references public.customers(id) on delete set null;

create table if not exists public.plans (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  monthly_price integer not null default 0,
  yearly_price integer,
  lifetime_price integer,
  trial_days integer not null default 0,
  feature_set jsonb not null default '[]'::jsonb,
  quota_limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_entitlements (
  id bigserial primary key,
  plan_id bigint not null references public.plans(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(plan_id, feature_key)
);

create table if not exists public.quota_policies (
  id bigserial primary key,
  plan_id bigint not null references public.plans(id) on delete cascade,
  ai_requests_per_day integer,
  image_uploads_per_day integer,
  meal_scans_per_day integer,
  token_budget_per_day integer,
  token_budget_per_month integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id)
);

create table if not exists public.subscriptions (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  plan_id bigint not null references public.plans(id) on delete restrict,
  status text not null default 'active',
  billing_cycle text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_customer_id_idx on public.subscriptions(customer_id);

create table if not exists public.orders (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  plan_id bigint not null references public.plans(id) on delete restrict,
  billing_cycle text,
  billing_sku text,
  amount integer not null default 0,
  currency text not null default 'VND',
  provider text not null,
  status text not null default 'pending_confirmation',
  phone_e164 text,
  order_code text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_status_idx on public.orders(status);

create table if not exists public.payment_attempts (
  id bigserial primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  provider text not null,
  provider_txn_id text,
  status text not null default 'pending',
  amount integer not null default 0,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_attempts_order_id_idx on public.payment_attempts(order_id);
create index if not exists payment_attempts_status_idx on public.payment_attempts(status);

create table if not exists public.payment_webhooks (
  id bigserial primary key,
  provider text not null,
  event_type text,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_webhooks_provider_event_id_idx on public.payment_webhooks(provider_event_id);

create table if not exists public.customer_entitlement_overrides (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_logs (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  channel_account_id bigint references public.customer_channel_accounts(id) on delete set null,
  feature_key text not null,
  usage_count integer not null default 1,
  tokens integer,
  cost numeric(12,2),
  date_local date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_customer_date_idx on public.usage_logs(customer_id, date_local desc);

create table if not exists public.channel_link_tokens (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  channel text not null,
  link_token text not null unique,
  status text not null default 'active',
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_channel_link_requests (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  channel text not null,
  status text not null default 'pending_review',
  phone_e164 text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id bigserial primary key,
  customer_id bigint references public.customers(id) on delete set null,
  channel_account_id bigint references public.customer_channel_accounts(id) on delete set null,
  category text,
  status text not null default 'open',
  subject text,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  free_plan_id bigint;
  pro_plan_id bigint;
  lifetime_plan_id bigint;
begin
  insert into public.plans (code, name, monthly_price, yearly_price, lifetime_price, trial_days, feature_set, quota_limits, is_active, is_hidden)
  values
    ('free', 'Free', 0, 0, null, 0, '["basic_tracking"]'::jsonb, '{"ai_requests_per_day":5,"image_uploads_per_day":3,"meal_scans_per_day":3}'::jsonb, true, false),
    ('pro', 'Pro', 99000, 799000, null, 0, '["ai_meal_analysis","meal_plan_generator","calorie_history_90d","export_report","advanced_macro_insights","priority_support"]'::jsonb, '{"ai_requests_per_day":100,"image_uploads_per_day":50,"meal_scans_per_day":50}'::jsonb, true, false),
    ('lifetime', 'Lifetime', 0, 0, 990000, 0, '["ai_meal_analysis","meal_plan_generator","calorie_history_90d","export_report","advanced_macro_insights","priority_support"]'::jsonb, '{"ai_requests_per_day":100,"image_uploads_per_day":50,"meal_scans_per_day":50}'::jsonb, true, false)
  on conflict (code) do update
    set name = excluded.name,
        monthly_price = excluded.monthly_price,
        yearly_price = excluded.yearly_price,
        lifetime_price = excluded.lifetime_price,
        feature_set = excluded.feature_set,
        quota_limits = excluded.quota_limits,
        is_active = excluded.is_active,
        is_hidden = excluded.is_hidden,
        updated_at = now();

  select id into free_plan_id from public.plans where code = 'free' limit 1;
  select id into pro_plan_id from public.plans where code = 'pro' limit 1;
  select id into lifetime_plan_id from public.plans where code = 'lifetime' limit 1;

  delete from public.plan_entitlements
  where plan_id in (free_plan_id, pro_plan_id, lifetime_plan_id);

  insert into public.plan_entitlements (plan_id, feature_key, is_enabled)
  values
    (free_plan_id, 'ai_meal_analysis', true),
    (pro_plan_id, 'ai_meal_analysis', true),
    (pro_plan_id, 'meal_plan_generator', true),
    (pro_plan_id, 'calorie_history_90d', true),
    (pro_plan_id, 'export_report', true),
    (pro_plan_id, 'advanced_macro_insights', true),
    (pro_plan_id, 'priority_support', true),
    (lifetime_plan_id, 'ai_meal_analysis', true),
    (lifetime_plan_id, 'meal_plan_generator', true),
    (lifetime_plan_id, 'calorie_history_90d', true),
    (lifetime_plan_id, 'export_report', true),
    (lifetime_plan_id, 'advanced_macro_insights', true),
    (lifetime_plan_id, 'priority_support', true);

  insert into public.quota_policies (plan_id, ai_requests_per_day, image_uploads_per_day, meal_scans_per_day)
  values
    (free_plan_id, 5, 3, 3),
    (pro_plan_id, 100, 50, 50),
    (lifetime_plan_id, 100, 50, 50)
  on conflict (plan_id) do update
    set ai_requests_per_day = excluded.ai_requests_per_day,
        image_uploads_per_day = excluded.image_uploads_per_day,
        meal_scans_per_day = excluded.meal_scans_per_day,
        updated_at = now();
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_member_roles'
      and column_name = 'role'
  ) then
    begin
      execute 'alter table public.admin_member_roles alter column role type text using role::text';
    exception when others then
      null;
    end;

    update public.admin_member_roles set role = 'billing_admin' where role = 'finance';
    update public.admin_member_roles set role = 'content_admin' where role = 'catalog';
    update public.admin_member_roles set role = 'support_admin' where role = 'support';
  end if;
end
$$;

create or replace function public.current_customer_id()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
begin
  select cal.customer_id
    into v_customer_id
  from public.customer_auth_links cal
  where cal.auth_user_id = auth.uid()
    and cal.link_status in ('linked', 'active')
  order by cal.created_at desc
  limit 1;

  if v_customer_id is not null then
    return v_customer_id;
  end if;

  select u.customer_id
    into v_customer_id
  from public.users u
  where u.auth_user_id = auth.uid()
  order by u.id asc
  limit 1;

  return v_customer_id;
end
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
  v_order_id bigint;
  v_amount integer;
  v_order_code text;
begin
  if p_phone_e164 is null or length(trim(p_phone_e164)) = 0 then
    raise exception 'phone_required';
  end if;

  select id into v_customer_id
  from public.customers
  where phone_e164 = p_phone_e164
  limit 1;

  if v_customer_id is null then
    insert into public.customers (phone_e164, phone_display, plan, status, created_at, updated_at)
    values (p_phone_e164, p_phone_e164, 'free', 'active', now(), now())
    returning id into v_customer_id;
  end if;

  select id,
         case
           when code = 'lifetime' then coalesce(lifetime_price, 0)
           when code = 'pro' and p_billing_sku = 'yearly' then coalesce(yearly_price, monthly_price)
           else coalesce(monthly_price, 0)
         end
    into v_plan_id, v_amount
  from public.plans
  where code = p_plan
  limit 1;

  if v_plan_id is null then
    raise exception 'invalid_plan';
  end if;

  v_order_code := 'CT' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');

  insert into public.orders (
    customer_id, plan_id, billing_cycle, billing_sku, amount, provider, status, phone_e164, order_code, metadata
  )
  values (
    v_customer_id,
    v_plan_id,
    case when p_billing_sku in ('yearly', 'quarterly') then p_billing_sku else 'monthly' end,
    p_billing_sku,
    v_amount,
    p_provider,
    case when p_plan = 'free' then 'active' else 'pending_confirmation' end,
    p_phone_e164,
    v_order_code,
    jsonb_build_object('source', 'portal', 'auth_user_id', auth.uid())
  )
  returning id into v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'provider', p_provider,
    'status', case when p_plan = 'free' then 'active' else 'pending_confirmation' end,
    'plan', p_plan,
    'billing_sku', p_billing_sku,
    'amount', v_amount,
    'phone_e164', p_phone_e164,
    'payment_url', null,
    'qr_content', case when p_provider = 'bank_transfer' then v_order_code else null end,
    'bank_transfer_note', case when p_provider = 'bank_transfer' then v_order_code else null end,
    'helper_text', case
      when p_provider = 'bank_transfer' then 'Chuyển khoản đúng nội dung mã đơn hàng để hệ thống đối soát.'
      when p_provider = 'vnpay' then 'Đơn hàng đã tạo, backend sẽ chờ IPN hoặc xác minh giao dịch.'
      when p_provider = 'momo' then 'Đơn hàng đã tạo, backend sẽ chờ IPN từ MoMo.'
      else 'Đơn hàng đã tạo và đang chờ backend xác nhận.'
    end,
    'created_at', now()
  );
end
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
begin
  select *
    into v_order
  from public.orders
  where id::text = p_order_id or order_code = p_order_id
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

  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'entitlement_active', coalesce(v_order.status in ('active', 'paid', 'completed'), false) or coalesce(v_subscription.status = 'active', false),
    'premium_until', v_subscription.current_period_end,
    'provider', v_order.provider,
    'updated_at', coalesce(v_order.updated_at, now())
  );
end
$$;

create or replace function public.portal_create_telegram_link_token()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_token text;
begin
  v_customer_id := public.current_customer_id();

  if v_customer_id is null then
    raise exception 'customer_not_linked';
  end if;

  v_token := encode(gen_random_bytes(18), 'hex');

  insert into public.channel_link_tokens (customer_id, channel, link_token, status, expires_at)
  values (v_customer_id, 'telegram', v_token, 'active', now() + interval '30 minutes');

  return jsonb_build_object(
    'link_token', v_token,
    'customer_id', v_customer_id
  );
end
$$;

create or replace function public.portal_request_zalo_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_request_id bigint;
begin
  v_customer_id := public.current_customer_id();

  if v_customer_id is null then
    raise exception 'customer_not_linked';
  end if;

  insert into public.customer_channel_link_requests (customer_id, channel, status, phone_e164, note)
  select c.id, 'zalo', 'pending_review', c.phone_e164, 'Requested from portal activation'
  from public.customers c
  where c.id = v_customer_id
  returning id into v_request_id;

  return jsonb_build_object(
    'status', 'pending_review',
    'request_id', v_request_id,
    'helper_text', 'Yêu cầu link Zalo đã được ghi nhận để team vận hành nối workflow riêng.'
  );
end
$$;

commit;
