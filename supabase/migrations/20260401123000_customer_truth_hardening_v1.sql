begin;

alter table if exists public.customers
  add column if not exists is_banned boolean not null default false,
  add column if not exists ban_until timestamptz,
  add column if not exists ban_reason text,
  add column if not exists abuse_score integer not null default 0,
  add column if not exists strike_count integer not null default 0,
  add column if not exists gym_mode_until timestamptz;

create index if not exists customers_is_banned_idx
  on public.customers(is_banned);

create index if not exists customers_ban_until_idx
  on public.customers(ban_until)
  where ban_until is not null;

create table if not exists public.user_abuse_events (
  id bigserial primary key,
  customer_id bigint references public.customers(id) on delete cascade,
  channel_account_id bigint references public.customer_channel_accounts(id) on delete set null,
  channel text,
  action_type text,
  reason_code text not null,
  abuse_score_delta integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_abuse_events_customer_created_idx
  on public.user_abuse_events(customer_id, created_at desc);

create index if not exists user_abuse_events_reason_idx
  on public.user_abuse_events(reason_code, created_at desc);

create table if not exists public.user_bans (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  strike_number integer not null default 1,
  is_active boolean not null default true,
  ban_until timestamptz,
  reason_code text not null,
  notes text,
  actor_source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_bans_customer_active_idx
  on public.user_bans(customer_id, is_active, created_at desc);

create table if not exists public.image_hash_cache (
  id bigserial primary key,
  customer_id bigint references public.customers(id) on delete cascade,
  channel_account_id bigint references public.customer_channel_accounts(id) on delete set null,
  image_hash text not null,
  mime_type text,
  bytes_size bigint,
  last_result_cache jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  hit_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  unique(customer_id, image_hash)
);

create index if not exists image_hash_cache_hash_idx
  on public.image_hash_cache(image_hash, last_seen_at desc);

create table if not exists public.abuse_counters (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  channel text not null,
  action_type text not null,
  bucket_key text not null,
  bucket_started_at timestamptz not null,
  bucket_window_seconds integer not null,
  request_count integer not null default 0,
  image_count integer not null default 0,
  ai_heavy_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(customer_id, channel, action_type, bucket_key, bucket_started_at)
);

create index if not exists abuse_counters_customer_bucket_idx
  on public.abuse_counters(customer_id, bucket_started_at desc);

alter table if exists public.plans
  add column if not exists semiannual_price integer;

update public.plans
set
  monthly_price = case when code = 'pro' then 89000 else monthly_price end,
  semiannual_price = case when code = 'pro' then 459000 else semiannual_price end,
  yearly_price = case when code = 'pro' then 889000 else yearly_price end,
  lifetime_price = case when code = 'lifetime' then 1980000 else lifetime_price end,
  quota_limits = case
    when code = 'free' then '{"ai_requests_per_day":5,"image_uploads_per_day":2,"meal_scans_per_day":2}'::jsonb
    else quota_limits
  end,
  updated_at = now()
where code in ('free', 'pro', 'lifetime');

update public.quota_policies qp
set
  ai_requests_per_day = case when p.code = 'free' then 5 else qp.ai_requests_per_day end,
  image_uploads_per_day = case when p.code = 'free' then 2 else qp.image_uploads_per_day end,
  meal_scans_per_day = case when p.code = 'free' then 2 else qp.meal_scans_per_day end,
  updated_at = now()
from public.plans p
where qp.plan_id = p.id
  and p.code = 'free';

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
    when 'semiannual' then
      return 180;
    when 'quarterly' then
      return 90;
    else
      return 30;
  end case;
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
  v_billing_sku := lower(
    coalesce(
      p_billing_sku,
      case
        when lower(coalesce(p_plan, 'free')) = 'lifetime' then 'lifetime'
        else 'monthly'
      end
    )
  );

  select
    id,
    case
      when code = 'lifetime' or v_billing_sku = 'lifetime' then coalesce(lifetime_price, monthly_price, 0)
      when v_billing_sku = 'yearly' then coalesce(yearly_price, monthly_price, 0)
      when v_billing_sku = 'semiannual' then coalesce(semiannual_price, monthly_price * 6, monthly_price, 0)
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
    case
      when v_billing_sku in ('yearly', 'quarterly', 'semiannual') then v_billing_sku
      else 'monthly'
    end,
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
      when lower(coalesce(p_provider, 'bank_transfer')) = 'bank_transfer' then 'Chuyển khoản đúng nội dung mã đơn hàng để hệ thống đối soát và mở quyền nhanh.'
      when lower(coalesce(p_provider, 'bank_transfer')) = 'momo' then 'Đơn hàng đã được tạo, hệ thống đang chờ IPN từ MoMo để kích hoạt.'
      when lower(coalesce(p_provider, 'bank_transfer')) = 'vnpay' then 'Đơn hàng đã được tạo, hệ thống đang chờ IPN hoặc xác minh giao dịch.'
      else 'Đơn hàng đã được tạo và đang chờ backend xác nhận.'
    end,
    'created_at', now()
  );
end;
$$;

commit;
