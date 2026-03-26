-- ============================================================
-- CaloTrack Customer-First Omnichannel Identity V1
-- Run AFTER:
--   1. saas_upgrade_v3.sql
--   2. saas_upgrade_v4_website_first.sql
--   3. 20260325150000_calotrack_tracking_catalog_v1.sql
--   4. 20260326113000_admin_backoffice_roles_v1.sql
--
-- Purpose:
--   - introduce canonical customer identity linked by phone number
--   - keep public.users as compatibility layer for the live Telegram bot
--   - prepare portal/admin for Telegram + Zalo shared entitlement/quota
--   - keep n8n/Zalo workflow implementation for a later phase
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.normalize_vn_phone(input_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(input_phone, ''), '[^0-9]+', '', 'g');

  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF digits LIKE '84%' THEN
    RETURN '+' || digits;
  END IF;

  IF digits LIKE '0%' AND length(digits) >= 9 THEN
    RETURN '+84' || substr(digits, 2);
  END IF;

  IF digits ~ '^[1-9][0-9]{8,10}$' THEN
    RETURN '+84' || digits;
  END IF;

  RETURN '+' || digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.customers (
  id BIGSERIAL PRIMARY KEY,
  phone_e164 TEXT UNIQUE,
  phone_display TEXT,
  full_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'lifetime')),
  premium_until TIMESTAMPTZ,
  entitlement_source TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_channel_accounts (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'zalo', 'web')),
  platform_user_id TEXT NOT NULL,
  platform_chat_id TEXT,
  linked_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT,
  phone_claimed TEXT,
  phone_claimed_e164 TEXT,
  link_status TEXT NOT NULL DEFAULT 'unlinked'
    CHECK (link_status IN ('linked', 'pending_review', 'conflict', 'unlinked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, platform_user_id)
);

CREATE TABLE IF NOT EXISTS public.customer_auth_links (
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL UNIQUE,
  email TEXT,
  link_status TEXT NOT NULL DEFAULT 'linked'
    CHECK (link_status IN ('linked', 'pending_review', 'detached')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, auth_user_id)
);

CREATE TABLE IF NOT EXISTS public.customer_daily_usage (
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  ai_calls_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, date_local)
);

CREATE TABLE IF NOT EXISTS public.customer_link_reviews (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  channel_account_id BIGINT NOT NULL REFERENCES public.customer_channel_accounts(id) ON DELETE CASCADE,
  suggested_phone TEXT,
  suggested_phone_e164 TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by BIGINT REFERENCES public.admin_members(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_merge_events (
  id BIGSERIAL PRIMARY KEY,
  source_customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  target_customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_member_id BIGINT REFERENCES public.admin_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_customer_support_notes (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_member_id BIGINT REFERENCES public.admin_members(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone_e164 ON public.customers(phone_e164);
CREATE INDEX IF NOT EXISTS idx_customers_plan ON public.customers(plan);
CREATE INDEX IF NOT EXISTS idx_customer_channel_accounts_customer_id ON public.customer_channel_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_channel_accounts_channel ON public.customer_channel_accounts(channel);
CREATE INDEX IF NOT EXISTS idx_customer_channel_accounts_link_status ON public.customer_channel_accounts(link_status);
CREATE INDEX IF NOT EXISTS idx_customer_auth_links_customer_id ON public.customer_auth_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_link_reviews_status ON public.customer_link_reviews(status);
CREATE INDEX IF NOT EXISTS idx_admin_customer_support_notes_customer_id
  ON public.admin_customer_support_notes(customer_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.customer_touch_updated_at();

DROP TRIGGER IF EXISTS trg_customer_channel_accounts_updated_at ON public.customer_channel_accounts;
CREATE TRIGGER trg_customer_channel_accounts_updated_at
BEFORE UPDATE ON public.customer_channel_accounts
FOR EACH ROW
EXECUTE FUNCTION public.customer_touch_updated_at();

DROP TRIGGER IF EXISTS trg_customer_auth_links_updated_at ON public.customer_auth_links;
CREATE TRIGGER trg_customer_auth_links_updated_at
BEFORE UPDATE ON public.customer_auth_links
FOR EACH ROW
EXECUTE FUNCTION public.customer_touch_updated_at();

DROP TRIGGER IF EXISTS trg_customer_daily_usage_updated_at ON public.customer_daily_usage;
CREATE TRIGGER trg_customer_daily_usage_updated_at
BEFORE UPDATE ON public.customer_daily_usage
FOR EACH ROW
EXECUTE FUNCTION public.customer_touch_updated_at();

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.transaction_history
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.subscription_events
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.payment_provider_events
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.review_bundles
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.conversation_state
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_customer_id ON public.users(customer_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_customer_id ON public.transaction_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_customer_id ON public.subscription_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_customer_id ON public.payment_provider_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_customer_id ON public.meal_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_review_bundles_customer_id ON public.review_bundles(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_state_customer_id ON public.conversation_state(customer_id);

CREATE OR REPLACE FUNCTION public.upsert_customer_by_phone(
  p_phone_input TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_e164 TEXT;
  v_customer_id BIGINT;
BEGIN
  v_phone_e164 := public.normalize_vn_phone(p_phone_input);
  IF v_phone_e164 IS NULL THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  SELECT id
  INTO v_customer_id
  FROM public.customers
  WHERE phone_e164 = v_phone_e164
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      phone_e164,
      phone_display,
      full_name
    )
    VALUES (
      v_phone_e164,
      p_phone_input,
      NULLIF(trim(p_full_name), '')
    )
    RETURNING id
    INTO v_customer_id;
  ELSE
    UPDATE public.customers
    SET
      phone_display = COALESCE(NULLIF(trim(p_phone_input), ''), phone_display),
      full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name)
    WHERE id = v_customer_id;
  END IF;

  RETURN v_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_to_compat_users(p_customer_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_usage INTEGER := 0;
BEGIN
  SELECT *
  INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(ai_calls_used, 0)
  INTO v_usage
  FROM public.customer_daily_usage
  WHERE customer_id = p_customer_id
    AND date_local = ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE);

  UPDATE public.users
  SET
    customer_id = p_customer_id,
    plan = v_customer.plan,
    premium_until = v_customer.premium_until,
    daily_ai_usage_count = COALESCE(v_usage, 0),
    last_usage_reset_date = ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE)
  WHERE id IN (
    SELECT linked_user_id
    FROM public.customer_channel_accounts
    WHERE customer_id = p_customer_id
      AND linked_user_id IS NOT NULL
  )
  OR customer_id = p_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT customer_id
  INTO v_customer_id
  FROM public.customer_auth_links
  WHERE auth_user_id = auth.uid()
    AND link_status = 'linked'
  LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    RETURN v_customer_id;
  END IF;

  PERFORM public.link_current_auth_user_by_email();

  SELECT customer_id
  INTO v_customer_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  RETURN v_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_channel_accounts()
RETURNS TABLE (
  id BIGINT,
  channel TEXT,
  platform_user_id TEXT,
  platform_chat_id TEXT,
  display_name TEXT,
  phone_claimed TEXT,
  link_status TEXT,
  linked_user_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id BIGINT;
BEGIN
  v_customer_id := public.current_customer_id();
  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cca.id,
    cca.channel,
    cca.platform_user_id,
    cca.platform_chat_id,
    cca.display_name,
    COALESCE(cca.phone_claimed, cca.phone_claimed_e164),
    cca.link_status,
    cca.linked_user_id
  FROM public.customer_channel_accounts cca
  WHERE cca.customer_id = v_customer_id
  ORDER BY cca.channel, cca.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_get_customer_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id BIGINT;
  v_email TEXT;
BEGIN
  v_email := COALESCE(auth.jwt() ->> 'email', NULL);
  v_customer_id := public.current_customer_id();

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object(
      'customer_id', NULL,
      'email', v_email,
      'phone_e164', NULL,
      'phone_display', NULL,
      'full_name', NULL,
      'plan', 'free',
      'premium_until', NULL,
      'entitlement_source', 'auth_only',
      'quota_used_today', 0,
      'quota_label', 'Chua co customer linked',
      'source', 'auth_only',
      'linked_channels', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'last_sync_at', NOW()
    );
  END IF;

  RETURN (
    WITH customer_row AS (
      SELECT c.*
      FROM public.customers c
      WHERE c.id = v_customer_id
    ),
    usage_row AS (
      SELECT COALESCE(cdu.ai_calls_used, 0) AS ai_calls_used
      FROM public.customer_daily_usage cdu
      WHERE cdu.customer_id = v_customer_id
        AND cdu.date_local = ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE)
    ),
    channels AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', cca.id,
            'channel', cca.channel,
            'display_name', cca.display_name,
            'link_status', cca.link_status,
            'platform_user_id', cca.platform_user_id
          )
          ORDER BY cca.channel, cca.created_at DESC
        ),
        '[]'::jsonb
      ) AS items
      FROM public.customer_channel_accounts cca
      WHERE cca.customer_id = v_customer_id
    ),
    payments AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'amount', t.amount,
            'status', t.status,
            'payment_method', t.payment_method,
            'billing_sku', t.billing_sku,
            'created_at', t.created_at,
            'transaction_code', t.transaction_code
          )
          ORDER BY t.created_at DESC
        ),
        '[]'::jsonb
      ) AS items
      FROM (
        SELECT *
        FROM public.transaction_history
        WHERE customer_id = v_customer_id
        ORDER BY created_at DESC
        LIMIT 5
      ) t
    )
    SELECT jsonb_build_object(
      'customer_id', c.id,
      'email', COALESCE(
        (
          SELECT cal.email
          FROM public.customer_auth_links cal
          WHERE cal.customer_id = c.id
          ORDER BY cal.created_at DESC
          LIMIT 1
        ),
        v_email
      ),
      'phone_e164', c.phone_e164,
      'phone_display', c.phone_display,
      'full_name', c.full_name,
      'plan', c.plan,
      'premium_until', c.premium_until,
      'entitlement_source', c.entitlement_source,
      'quota_used_today', COALESCE((SELECT ai_calls_used FROM usage_row), 0),
      'quota_label', CASE
        WHEN c.plan = 'free' THEN format('%s/5 luot AI hom nay', COALESCE((SELECT ai_calls_used FROM usage_row), 0))
        WHEN c.plan = 'lifetime' THEN 'Quota dung chung cho customer Lifetime'
        ELSE 'Quota dung chung cho customer Pro'
      END,
      'source', 'customer_linked',
      'linked_channels', (SELECT items FROM channels),
      'payments', (SELECT items FROM payments),
      'last_sync_at', NOW()
    )
    FROM customer_row c
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_link_customer_by_phone(p_phone_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id BIGINT;
  v_email TEXT;
  v_user_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_email := COALESCE(auth.jwt() ->> 'email', NULL);
  v_customer_id := public.upsert_customer_by_phone(p_phone_input, NULL);

  INSERT INTO public.customer_auth_links (
    customer_id,
    auth_user_id,
    email,
    link_status
  )
  VALUES (
    v_customer_id,
    auth.uid(),
    v_email,
    'linked'
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    customer_id = EXCLUDED.customer_id,
    email = EXCLUDED.email,
    link_status = 'linked',
    updated_at = NOW();

  PERFORM public.link_current_auth_user_by_email();

  SELECT id
  INTO v_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.users
    SET customer_id = v_customer_id
    WHERE id = v_user_id;

    INSERT INTO public.customer_channel_accounts (
      customer_id,
      channel,
      platform_user_id,
      linked_user_id,
      display_name,
      link_status
    )
    VALUES (
      v_customer_id,
      'web',
      auth.uid()::TEXT,
      v_user_id,
      COALESCE(v_email, 'Portal web'),
      'linked'
    )
    ON CONFLICT (channel, platform_user_id) DO UPDATE
    SET
      customer_id = EXCLUDED.customer_id,
      linked_user_id = EXCLUDED.linked_user_id,
      display_name = EXCLUDED.display_name,
      link_status = 'linked',
      updated_at = NOW();
  END IF;

  PERFORM public.sync_customer_to_compat_users(v_customer_id);

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'phone_e164', public.normalize_vn_phone(p_phone_input),
    'link_status', 'linked',
    'linked_user_id', v_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_schema_readiness()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'plan'
  ) THEN
    missing := array_append(missing, 'users.plan');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'premium_until'
  ) THEN
    missing := array_append(missing, 'users.premium_until');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    missing := array_append(missing, 'users.auth_user_id');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    missing := array_append(missing, 'users.is_admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'customer_id'
  ) THEN
    missing := array_append(missing, 'users.customer_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaction_history') THEN
    missing := array_append(missing, 'transaction_history');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_events') THEN
    missing := array_append(missing, 'subscription_events');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_usage_log') THEN
    missing := array_append(missing, 'ai_usage_log');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_provider_events') THEN
    missing := array_append(missing, 'payment_provider_events');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content_packages') THEN
    missing := array_append(missing, 'content_packages');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
    missing := array_append(missing, 'customers');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_channel_accounts') THEN
    missing := array_append(missing, 'customer_channel_accounts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_auth_links') THEN
    missing := array_append(missing, 'customer_auth_links');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_daily_usage') THEN
    missing := array_append(missing, 'customer_daily_usage');
  END IF;

  RETURN jsonb_build_object(
    'ready', COALESCE(array_length(missing, 1), 0) = 0,
    'missing', COALESCE(to_jsonb(missing), '[]'::jsonb),
    'checked_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_customers()
RETURNS TABLE (
  id BIGINT,
  phone_e164 TEXT,
  phone_display TEXT,
  full_name TEXT,
  plan TEXT,
  premium_until TIMESTAMPTZ,
  entitlement_source TEXT,
  status TEXT,
  quota_used_today INTEGER,
  channel_count INTEGER,
  linked_portal_count INTEGER,
  last_activity TIMESTAMPTZ,
  total_spend NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['finance', 'support']);

  RETURN QUERY
  SELECT
    c.id,
    c.phone_e164,
    c.phone_display,
    c.full_name,
    c.plan,
    c.premium_until,
    c.entitlement_source,
    c.status,
    COALESCE(cdu.ai_calls_used, 0) AS quota_used_today,
    COALESCE(channel_counts.channel_count, 0)::INTEGER,
    COALESCE(auth_counts.linked_portal_count, 0)::INTEGER,
    GREATEST(
      COALESCE(last_user_activity.last_active, 'epoch'::timestamptz),
      COALESCE(last_payment_activity.last_payment_at, 'epoch'::timestamptz)
    ) AS last_activity,
    COALESCE(last_payment_activity.total_spend, 0) AS total_spend
  FROM public.customers c
  LEFT JOIN public.customer_daily_usage cdu
    ON cdu.customer_id = c.id
   AND cdu.date_local = ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE)
  LEFT JOIN (
    SELECT customer_id, COUNT(*) AS channel_count
    FROM public.customer_channel_accounts
    GROUP BY customer_id
  ) channel_counts ON channel_counts.customer_id = c.id
  LEFT JOIN (
    SELECT customer_id, COUNT(*) AS linked_portal_count
    FROM public.customer_auth_links
    WHERE link_status = 'linked'
    GROUP BY customer_id
  ) auth_counts ON auth_counts.customer_id = c.id
  LEFT JOIN (
    SELECT u.customer_id, MAX(u.last_active) AS last_active
    FROM public.users u
    WHERE u.customer_id IS NOT NULL
    GROUP BY u.customer_id
  ) last_user_activity ON last_user_activity.customer_id = c.id
  LEFT JOIN (
    SELECT t.customer_id, MAX(t.created_at) AS last_payment_at, COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'completed'), 0) AS total_spend
    FROM public.transaction_history t
    WHERE t.customer_id IS NOT NULL
    GROUP BY t.customer_id
  ) last_payment_activity ON last_payment_activity.customer_id = c.id
  ORDER BY c.updated_at DESC, c.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_channel_accounts()
RETURNS TABLE (
  id BIGINT,
  customer_id BIGINT,
  channel TEXT,
  platform_user_id TEXT,
  platform_chat_id TEXT,
  display_name TEXT,
  phone_claimed TEXT,
  link_status TEXT,
  linked_user_id BIGINT,
  customer_phone TEXT,
  customer_plan TEXT,
  auth_email TEXT,
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['finance', 'support']);

  RETURN QUERY
  SELECT
    cca.id,
    cca.customer_id,
    cca.channel,
    cca.platform_user_id,
    cca.platform_chat_id,
    cca.display_name,
    COALESCE(cca.phone_claimed, cca.phone_claimed_e164) AS phone_claimed,
    cca.link_status,
    cca.linked_user_id,
    c.phone_display,
    c.plan,
    cal.email,
    u.last_active
  FROM public.customer_channel_accounts cca
  LEFT JOIN public.customers c ON c.id = cca.customer_id
  LEFT JOIN public.users u ON u.id = cca.linked_user_id
  LEFT JOIN LATERAL (
    SELECT email
    FROM public.customer_auth_links
    WHERE customer_id = cca.customer_id
    ORDER BY created_at DESC
    LIMIT 1
  ) cal ON TRUE
  ORDER BY cca.updated_at DESC, cca.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_link_reviews()
RETURNS TABLE (
  id BIGINT,
  customer_id BIGINT,
  channel_account_id BIGINT,
  channel TEXT,
  platform_user_id TEXT,
  display_name TEXT,
  suggested_phone TEXT,
  reason TEXT,
  status TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support']);

  RETURN QUERY
  SELECT
    clr.id,
    clr.customer_id,
    clr.channel_account_id,
    cca.channel,
    cca.platform_user_id,
    cca.display_name,
    COALESCE(clr.suggested_phone, clr.suggested_phone_e164),
    clr.reason,
    clr.status,
    clr.reviewed_at,
    clr.created_at
  FROM public.customer_link_reviews clr
  JOIN public.customer_channel_accounts cca ON cca.id = clr.channel_account_id
  ORDER BY clr.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_customer_360(p_customer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['finance', 'support']);

  RETURN (
    WITH customer_row AS (
      SELECT *
      FROM public.customers
      WHERE id = p_customer_id
    ),
    channels AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) AS items
      FROM (
        SELECT
          cca.id,
          cca.customer_id,
          cca.channel,
          cca.platform_user_id,
          cca.platform_chat_id,
          cca.display_name,
          COALESCE(cca.phone_claimed, cca.phone_claimed_e164) AS phone_claimed,
          cca.link_status,
          cca.linked_user_id,
          u.last_active,
          cca.created_at
        FROM public.customer_channel_accounts cca
        LEFT JOIN public.users u ON u.id = cca.linked_user_id
        WHERE cca.customer_id = p_customer_id
      ) x
    ),
    payments AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) AS items
      FROM (
        SELECT
          t.id,
          t.user_id,
          COALESCE(u.first_name, u.username, u.email, 'User ' || t.user_id::text) AS user_name,
          COALESCE(u.platform, 'telegram') AS channel,
          t.amount,
          t.payment_method,
          t.status,
          t.transaction_code,
          t.description,
          t.days_added,
          t.plan_granted,
          t.billing_sku,
          t.provider_event_id,
          (t.metadata ->> 'entitlement_result') AS entitlement_result,
          t.created_at,
          t.completed_at
        FROM public.transaction_history t
        LEFT JOIN public.users u ON u.id = t.user_id
        WHERE t.customer_id = p_customer_id
        ORDER BY t.created_at DESC
        LIMIT 10
      ) x
    ),
    notes AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) AS items
      FROM (
        SELECT
          n.id,
          n.customer_id,
          n.note,
          COALESCE(m.display_name, 'Admin') AS actor_display_name,
          n.created_at
        FROM public.admin_customer_support_notes n
        LEFT JOIN public.admin_members m ON m.id = n.actor_member_id
        WHERE n.customer_id = p_customer_id
        ORDER BY n.created_at DESC
      ) x
    ),
    auth_links AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) AS items
      FROM (
        SELECT auth_user_id, email, link_status, created_at
        FROM public.customer_auth_links
        WHERE customer_id = p_customer_id
      ) x
    ),
    conversation AS (
      SELECT to_jsonb(cs.*) AS item
      FROM public.conversation_state cs
      WHERE cs.customer_id = p_customer_id
      ORDER BY cs.updated_at DESC
      LIMIT 1
    )
    SELECT jsonb_build_object(
      'customer', (
        SELECT to_jsonb(x)
        FROM (
          SELECT
            c.id,
            c.phone_e164,
            c.phone_display,
            c.full_name,
            c.plan,
            c.premium_until,
            c.entitlement_source,
            c.status,
            COALESCE((
              SELECT ai_calls_used
              FROM public.customer_daily_usage
              WHERE customer_id = c.id
                AND date_local = ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE)
            ), 0) AS quota_used_today
          FROM customer_row c
        ) x
      ),
      'channels', (SELECT items FROM channels),
      'recent_payments', (SELECT items FROM payments),
      'support_notes', (SELECT items FROM notes),
      'linked_auths', (SELECT items FROM auth_links),
      'conversation_state', (SELECT item FROM conversation)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_customer_phone(
  p_customer_id BIGINT,
  p_phone_input TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_phone_e164 TEXT;
BEGIN
  v_member_id := public.require_admin_role(ARRAY['support']);
  v_phone_e164 := public.normalize_vn_phone(p_phone_input);

  IF v_phone_e164 IS NULL THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  UPDATE public.customers
  SET
    phone_e164 = v_phone_e164,
    phone_display = p_phone_input,
    full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name)
  WHERE id = p_customer_id;

  PERFORM public.admin_write_audit(
    'customer_phone_updated',
    'customer',
    p_customer_id::text,
    jsonb_build_object('phone_e164', v_phone_e164)
  );

  RETURN jsonb_build_object('customer_id', p_customer_id, 'phone_e164', v_phone_e164, 'actor_member_id', v_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_link_channel_account(
  p_channel_account_id BIGINT,
  p_customer_id BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_linked_user_id BIGINT;
BEGIN
  v_member_id := public.require_admin_role(ARRAY['support']);

  UPDATE public.customer_channel_accounts
  SET
    customer_id = p_customer_id,
    link_status = 'linked'
  WHERE id = p_channel_account_id
  RETURNING linked_user_id INTO v_linked_user_id;

  IF v_linked_user_id IS NOT NULL THEN
    UPDATE public.users
    SET customer_id = p_customer_id
    WHERE id = v_linked_user_id;
  END IF;

  UPDATE public.customer_link_reviews
  SET
    status = 'approved',
    reviewed_by = v_member_id,
    reviewed_at = NOW()
  WHERE channel_account_id = p_channel_account_id
    AND status = 'pending';

  PERFORM public.sync_customer_to_compat_users(p_customer_id);

  PERFORM public.admin_write_audit(
    'customer_channel_linked',
    'channel_account',
    p_channel_account_id::text,
    jsonb_build_object('customer_id', p_customer_id, 'note', p_note)
  );

  RETURN jsonb_build_object('channel_account_id', p_channel_account_id, 'customer_id', p_customer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlink_channel_account(
  p_channel_account_id BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_previous_customer_id BIGINT;
  v_linked_user_id BIGINT;
BEGIN
  v_member_id := public.require_admin_role(ARRAY['support']);

  SELECT customer_id, linked_user_id
  INTO v_previous_customer_id, v_linked_user_id
  FROM public.customer_channel_accounts
  WHERE id = p_channel_account_id;

  UPDATE public.customer_channel_accounts
  SET
    customer_id = NULL,
    link_status = 'unlinked'
  WHERE id = p_channel_account_id;

  IF v_linked_user_id IS NOT NULL THEN
    UPDATE public.users
    SET customer_id = NULL
    WHERE id = v_linked_user_id;
  END IF;

  PERFORM public.admin_write_audit(
    'customer_channel_unlinked',
    'channel_account',
    p_channel_account_id::text,
    jsonb_build_object('previous_customer_id', v_previous_customer_id, 'note', p_note)
  );

  RETURN jsonb_build_object('channel_account_id', p_channel_account_id, 'previous_customer_id', v_previous_customer_id, 'actor_member_id', v_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_merge_customers(
  p_source_customer_id BIGINT,
  p_target_customer_id BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
BEGIN
  v_member_id := public.require_admin_role(ARRAY['support']);

  IF p_source_customer_id = p_target_customer_id THEN
    RAISE EXCEPTION 'Source and target customers must differ';
  END IF;

  UPDATE public.customer_channel_accounts
  SET customer_id = p_target_customer_id,
      link_status = 'linked'
  WHERE customer_id = p_source_customer_id;

  UPDATE public.customer_auth_links
  SET customer_id = p_target_customer_id
  WHERE customer_id = p_source_customer_id;

  INSERT INTO public.customer_daily_usage (customer_id, date_local, ai_calls_used, updated_at)
  SELECT p_target_customer_id, date_local, ai_calls_used, NOW()
  FROM public.customer_daily_usage
  WHERE customer_id = p_source_customer_id
  ON CONFLICT (customer_id, date_local)
  DO UPDATE SET
    ai_calls_used = public.customer_daily_usage.ai_calls_used + EXCLUDED.ai_calls_used,
    updated_at = NOW();

  DELETE FROM public.customer_daily_usage
  WHERE customer_id = p_source_customer_id;

  UPDATE public.users SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.transaction_history SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.subscription_events SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.payment_provider_events SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.meal_logs SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.review_bundles SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.conversation_state SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;
  UPDATE public.admin_customer_support_notes SET customer_id = p_target_customer_id WHERE customer_id = p_source_customer_id;

  UPDATE public.customers
  SET status = 'merged'
  WHERE id = p_source_customer_id;

  INSERT INTO public.customer_merge_events (
    source_customer_id,
    target_customer_id,
    action,
    metadata,
    actor_member_id
  )
  VALUES (
    p_source_customer_id,
    p_target_customer_id,
    'merge',
    jsonb_build_object('note', p_note),
    v_member_id
  );

  PERFORM public.sync_customer_to_compat_users(p_target_customer_id);

  PERFORM public.admin_write_audit(
    'customer_merged',
    'customer',
    p_target_customer_id::text,
    jsonb_build_object('source_customer_id', p_source_customer_id, 'note', p_note)
  );

  RETURN jsonb_build_object('source_customer_id', p_source_customer_id, 'target_customer_id', p_target_customer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_customer_entitlement(
  p_customer_id BIGINT,
  p_plan TEXT,
  p_premium_until TIMESTAMPTZ DEFAULT NULL,
  p_entitlement_source TEXT DEFAULT 'admin',
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_previous_plan TEXT;
BEGIN
  v_member_id := public.require_admin_role(ARRAY['finance']);

  IF p_plan NOT IN ('free', 'pro', 'lifetime') THEN
    RAISE EXCEPTION 'Unsupported plan: %', p_plan;
  END IF;

  SELECT plan
  INTO v_previous_plan
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  UPDATE public.customers
  SET
    plan = p_plan,
    premium_until = CASE
      WHEN p_plan = 'free' THEN NULL
      WHEN p_plan = 'lifetime' THEN '2099-12-31T23:59:59Z'::timestamptz
      ELSE p_premium_until
    END,
    entitlement_source = COALESCE(NULLIF(p_entitlement_source, ''), 'admin')
  WHERE id = p_customer_id;

  INSERT INTO public.subscription_events (
    user_id,
    customer_id,
    event_type,
    plan_from,
    plan_to,
    amount,
    source,
    notes,
    metadata
  )
  SELECT
    cca.linked_user_id,
    p_customer_id,
    CASE WHEN p_plan = 'free' THEN 'subscription_removed' ELSE 'subscription_granted' END,
    v_previous_plan,
    p_plan,
    0,
    'admin',
    COALESCE(p_note, 'Customer entitlement updated from admin'),
    jsonb_build_object('actor_member_id', v_member_id)
  FROM public.customer_channel_accounts cca
  WHERE cca.customer_id = p_customer_id
    AND cca.linked_user_id IS NOT NULL;

  PERFORM public.sync_customer_to_compat_users(p_customer_id);

  PERFORM public.admin_write_audit(
    'customer_entitlement_updated',
    'customer',
    p_customer_id::text,
    jsonb_build_object('plan_from', v_previous_plan, 'plan_to', p_plan, 'note', p_note)
  );

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'plan', p_plan,
    'premium_until', CASE
      WHEN p_plan = 'free' THEN NULL
      WHEN p_plan = 'lifetime' THEN '2099-12-31T23:59:59Z'::timestamptz
      ELSE p_premium_until
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_customer_quota(p_customer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support']);

  INSERT INTO public.customer_daily_usage (
    customer_id,
    date_local,
    ai_calls_used,
    updated_at
  )
  VALUES (
    p_customer_id,
    ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE),
    0,
    NOW()
  )
  ON CONFLICT (customer_id, date_local)
  DO UPDATE SET
    ai_calls_used = 0,
    updated_at = NOW();

  PERFORM public.sync_customer_to_compat_users(p_customer_id);

  PERFORM public.admin_write_audit(
    'customer_quota_reset',
    'customer',
    p_customer_id::text,
    '{}'::jsonb
  );

  RETURN jsonb_build_object('customer_id', p_customer_id, 'quota_reset', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_customer_support_note(
  p_customer_id BIGINT,
  p_note TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_note_id BIGINT;
BEGIN
  v_member_id := public.require_admin_role(ARRAY['support']);

  INSERT INTO public.admin_customer_support_notes (
    customer_id,
    actor_member_id,
    note
  )
  VALUES (
    p_customer_id,
    v_member_id,
    p_note
  )
  RETURNING id INTO v_note_id;

  PERFORM public.admin_write_audit(
    'customer_support_note_added',
    'customer',
    p_customer_id::text,
    jsonb_build_object('note_id', v_note_id)
  );

  RETURN v_note_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_link_portal_auth(
  p_customer_id BIGINT,
  p_auth_user_id UUID,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support']);

  INSERT INTO public.customer_auth_links (
    customer_id,
    auth_user_id,
    email,
    link_status
  )
  VALUES (
    p_customer_id,
    p_auth_user_id,
    NULLIF(trim(p_email), ''),
    'linked'
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    customer_id = EXCLUDED.customer_id,
    email = EXCLUDED.email,
    link_status = 'linked',
    updated_at = NOW();

  INSERT INTO public.customer_channel_accounts (
    customer_id,
    channel,
    platform_user_id,
    display_name,
    link_status
  )
  VALUES (
    p_customer_id,
    'web',
    p_auth_user_id::TEXT,
    COALESCE(NULLIF(trim(p_email), ''), p_auth_user_id::TEXT),
    'linked'
  )
  ON CONFLICT (channel, platform_user_id) DO UPDATE
  SET
    customer_id = EXCLUDED.customer_id,
    display_name = EXCLUDED.display_name,
    link_status = 'linked',
    updated_at = NOW();

  PERFORM public.admin_write_audit(
    'portal_auth_linked',
    'customer',
    p_customer_id::text,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'email', p_email)
  );

  RETURN jsonb_build_object('customer_id', p_customer_id, 'auth_user_id', p_auth_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_list_channel_accounts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_customer_snapshot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_link_customer_by_phone(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_customers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_channel_accounts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_link_reviews() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_customer_360(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_phone(BIGINT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_link_channel_account(BIGINT, BIGINT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unlink_channel_account(BIGINT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_merge_customers(BIGINT, BIGINT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_entitlement(BIGINT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_customer_quota(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_customer_support_note(BIGINT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_link_portal_auth(BIGINT, UUID, TEXT) TO authenticated, service_role;
