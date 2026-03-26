-- ============================================================
-- CaloTrack Admin Backoffice Roles V1
-- Run AFTER:
--   1. saas_upgrade_v3.sql
--   2. saas_upgrade_v4_website_first.sql
--   3. 20260325150000_calotrack_tracking_catalog_v1.sql
--
-- Purpose:
--   - add business admin roles: finance, catalog, support
--   - keep users.is_admin as bootstrap owner gate
--   - add admin members, audit logs, support notes
--   - add role-aware admin RPCs with owner fallback
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_members (
  id BIGSERIAL PRIMARY KEY,
  auth_user_id UUID UNIQUE,
  linked_user_id BIGINT UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT,
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_member_roles (
  member_id BIGINT NOT NULL REFERENCES public.admin_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('finance', 'catalog', 'support')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, role)
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_member_id BIGINT REFERENCES public.admin_members(id) ON DELETE SET NULL,
  actor_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  role_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_support_notes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_member_id BIGINT REFERENCES public.admin_members(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_members_active ON public.admin_members(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_member_roles_role ON public.admin_member_roles(role);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_support_notes_user_created_at ON public.admin_support_notes(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_members_updated_at ON public.admin_members;
CREATE TRIGGER trg_admin_members_updated_at
BEFORE UPDATE ON public.admin_members
FOR EACH ROW
EXECUTE FUNCTION public.admin_touch_updated_at();

CREATE OR REPLACE FUNCTION public.admin_get_member_roles(p_member_id BIGINT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(role ORDER BY role), ARRAY[]::TEXT[])
  FROM public.admin_member_roles
  WHERE member_id = p_member_id;
$$;

CREATE OR REPLACE FUNCTION public.ensure_current_admin_member()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_member public.admin_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.link_current_auth_user_by_email();

  SELECT *
  INTO v_user
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_admin = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current user is not bootstrap admin';
  END IF;

  SELECT *
  INTO v_member
  FROM public.admin_members
  WHERE auth_user_id = auth.uid()
     OR linked_user_id = v_user.id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.admin_members (
      auth_user_id,
      linked_user_id,
      display_name,
      is_owner,
      is_active
    )
    VALUES (
      auth.uid(),
      v_user.id,
      COALESCE(v_user.first_name, v_user.username, v_user.email, 'Bootstrap owner'),
      TRUE,
      TRUE
    )
    RETURNING *
    INTO v_member;
  ELSE
    UPDATE public.admin_members
    SET
      auth_user_id = auth.uid(),
      linked_user_id = v_user.id,
      display_name = COALESCE(admin_members.display_name, v_user.first_name, v_user.username, v_user.email),
      is_active = TRUE
    WHERE id = v_member.id
    RETURNING *
    INTO v_member;
  END IF;

  IF v_member.is_owner THEN
    INSERT INTO public.admin_member_roles (member_id, role)
    VALUES
      (v_member.id, 'finance'),
      (v_member.id, 'catalog'),
      (v_member.id, 'support')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_member.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_admin_is_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_is_owner BOOLEAN;
BEGIN
  v_member_id := public.ensure_current_admin_member();

  SELECT is_owner
  INTO v_is_owner
  FROM public.admin_members
  WHERE id = v_member_id;

  RETURN COALESCE(v_is_owner, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.require_admin_role(p_roles TEXT[] DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_member public.admin_members%ROWTYPE;
  v_roles TEXT[];
BEGIN
  PERFORM public.require_current_admin();
  v_member_id := public.ensure_current_admin_member();

  SELECT *
  INTO v_member
  FROM public.admin_members
  WHERE id = v_member_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin member inactive or missing';
  END IF;

  IF v_member.is_owner THEN
    RETURN v_member.id;
  END IF;

  IF p_roles IS NULL OR COALESCE(array_length(p_roles, 1), 0) = 0 THEN
    RETURN v_member.id;
  END IF;

  v_roles := public.admin_get_member_roles(v_member.id);

  IF EXISTS (
    SELECT 1
    FROM unnest(v_roles) AS role_name
    WHERE role_name = ANY (p_roles)
  ) THEN
    RETURN v_member.id;
  END IF;

  RAISE EXCEPTION 'Missing required admin role';
END;
$$;

CREATE OR REPLACE FUNCTION public.require_admin_owner()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
BEGIN
  v_member_id := public.require_admin_role(NULL);
  IF public.current_admin_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Owner role required';
  END IF;
  RETURN v_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_write_audit(
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
  v_roles TEXT[];
BEGIN
  v_member_id := public.ensure_current_admin_member();
  v_roles := public.admin_get_member_roles(v_member_id);

  INSERT INTO public.admin_audit_log (
    actor_member_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    role_snapshot,
    metadata
  )
  VALUES (
    v_member_id,
    public.current_linked_user_id(),
    p_action,
    p_target_type,
    p_target_id,
    to_jsonb(COALESCE(v_roles, ARRAY[]::TEXT[])),
    COALESCE(p_metadata, '{}'::jsonb)
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    missing := array_append(missing, 'users');
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'foods') THEN
    missing := array_append(missing, 'foods');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'food_candidates') THEN
    missing := array_append(missing, 'food_candidates');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_members') THEN
    missing := array_append(missing, 'admin_members');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_member_roles') THEN
    missing := array_append(missing, 'admin_member_roles');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_audit_log') THEN
    missing := array_append(missing, 'admin_audit_log');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_support_notes') THEN
    missing := array_append(missing, 'admin_support_notes');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_get_access_state') THEN
    missing := array_append(missing, 'admin_get_access_state()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_list_users') THEN
    missing := array_append(missing, 'admin_list_users()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_list_payments') THEN
    missing := array_append(missing, 'admin_list_payments()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_list_members') THEN
    missing := array_append(missing, 'admin_list_members()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_get_system_health') THEN
    missing := array_append(missing, 'admin_get_system_health()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_food_list') THEN
    missing := array_append(missing, 'admin_food_list()');
  END IF;

  RETURN jsonb_build_object(
    'ready', COALESCE(array_length(missing, 1), 0) = 0,
    'missing', COALESCE(to_jsonb(missing), '[]'::jsonb),
    'checked_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_access_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_email TEXT;
  v_member_id BIGINT;
  v_is_owner BOOLEAN := FALSE;
  v_roles TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_email := COALESCE((auth.jwt() ->> 'email'), NULL);

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'is_authenticated', FALSE,
      'linked_user_id', NULL,
      'is_admin', FALSE,
      'is_owner', FALSE,
      'roles', '[]'::jsonb,
      'email', v_email,
      'checked_at', NOW(),
      'reason', 'not_authenticated'
    );
  END IF;

  PERFORM public.link_current_auth_user_by_email();

  SELECT u.id, u.is_admin, u.email
  INTO v_user
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(
      'is_authenticated', TRUE,
      'linked_user_id', NULL,
      'is_admin', FALSE,
      'is_owner', FALSE,
      'roles', '[]'::jsonb,
      'email', v_email,
      'checked_at', NOW(),
      'reason', 'not_linked'
    );
  END IF;

  IF COALESCE(v_user.is_admin, FALSE) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'is_authenticated', TRUE,
      'linked_user_id', v_user.id,
      'is_admin', FALSE,
      'is_owner', FALSE,
      'roles', '[]'::jsonb,
      'email', COALESCE(v_user.email, v_email),
      'checked_at', NOW(),
      'reason', 'not_admin'
    );
  END IF;

  v_member_id := public.ensure_current_admin_member();
  v_roles := public.admin_get_member_roles(v_member_id);

  SELECT is_owner
  INTO v_is_owner
  FROM public.admin_members
  WHERE id = v_member_id;

  RETURN jsonb_build_object(
    'is_authenticated', TRUE,
    'linked_user_id', v_user.id,
    'is_admin', TRUE,
    'is_owner', COALESCE(v_is_owner, FALSE),
    'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb),
    'email', COALESCE(v_user.email, v_email),
    'checked_at', NOW(),
    'reason', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(NULL);

  RETURN jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.users),
    'premium_users', (SELECT COUNT(*) FROM public.users WHERE plan = 'pro'),
    'lifetime_users', (SELECT COUNT(*) FROM public.users WHERE plan = 'lifetime'),
    'today_ai_calls', (
      SELECT COUNT(*)
      FROM public.ai_usage_log
      WHERE created_at >= ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.transaction_history
      WHERE status = 'completed'
        AND DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
          = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ),
    'total_revenue', (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.transaction_history
      WHERE status = 'completed'
    ),
    'expiring_in_7_days', (
      SELECT COUNT(*)
      FROM public.users
      WHERE plan = 'pro'
        AND premium_until IS NOT NULL
        AND premium_until > NOW()
        AND premium_until < NOW() + INTERVAL '7 days'
    ),
    'telegram_users', (SELECT COUNT(*) FROM public.users WHERE COALESCE(platform, 'telegram') = 'telegram'),
    'zalo_users', (SELECT COUNT(*) FROM public.users WHERE platform = 'zalo'),
    'web_users', (SELECT COUNT(*) FROM public.users WHERE platform = 'web')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id BIGINT,
  username TEXT,
  first_name TEXT,
  platform TEXT,
  platform_id TEXT,
  chat_id BIGINT,
  email TEXT,
  auth_user_id UUID,
  is_active BOOLEAN,
  is_banned BOOLEAN,
  plan TEXT,
  premium_until TIMESTAMPTZ,
  daily_ai_usage_count INTEGER,
  last_usage_reset_date DATE,
  created_at TIMESTAMPTZ,
  last_active TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support', 'finance']);

  RETURN QUERY
  SELECT
    u.id,
    u.username::TEXT,
    u.first_name::TEXT,
    u.platform::TEXT,
    u.platform_id::TEXT,
    u.chat_id,
    u.email::TEXT,
    u.auth_user_id,
    u.is_active,
    u.is_banned,
    u.plan::TEXT,
    u.premium_until::TIMESTAMPTZ,
    u.daily_ai_usage_count,
    u.last_usage_reset_date,
    u.created_at::TIMESTAMPTZ,
    u.last_active::TIMESTAMPTZ
  FROM public.users u
  ORDER BY u.created_at DESC
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_payments()
RETURNS TABLE (
  id UUID,
  user_id BIGINT,
  user_name TEXT,
  channel TEXT,
  amount NUMERIC,
  payment_method TEXT,
  status TEXT,
  transaction_code TEXT,
  description TEXT,
  days_added INTEGER,
  plan_granted TEXT,
  billing_sku TEXT,
  provider_event_id TEXT,
  entitlement_result TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['finance']);

  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    COALESCE(u.first_name, u.username, u.email, CONCAT('User ', u.id::TEXT))::TEXT AS user_name,
    COALESCE(u.platform, 'telegram')::TEXT AS channel,
    t.amount,
    t.payment_method::TEXT,
    t.status::TEXT,
    t.transaction_code::TEXT,
    t.description::TEXT,
    t.days_added,
    t.plan_granted::TEXT,
    t.billing_sku::TEXT,
    COALESCE(t.metadata ->> 'provider_event_id', t.metadata ->> 'payos_event_id')::TEXT AS provider_event_id,
    COALESCE(t.plan_granted::TEXT, t.billing_sku::TEXT, 'unknown') AS entitlement_result,
    t.created_at::TIMESTAMPTZ,
    t.completed_at::TIMESTAMPTZ
  FROM public.transaction_history t
  LEFT JOIN public.users u ON u.id = t.user_id
  ORDER BY t.created_at DESC
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_ban(
  p_user_id BIGINT,
  p_ban BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support']);

  UPDATE public.users
  SET
    is_banned = p_ban,
    is_active = CASE WHEN p_ban THEN FALSE ELSE TRUE END
  WHERE id = p_user_id;

  PERFORM public.admin_write_audit(
    CASE WHEN p_ban THEN 'support.ban_user' ELSE 'support.unban_user' END,
    'user',
    p_user_id::TEXT,
    jsonb_build_object('is_banned', p_ban)
  );

  RETURN jsonb_build_object('user_id', p_user_id, 'is_banned', p_ban);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_daily_quota(p_user_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support']);

  UPDATE public.users
  SET
    daily_ai_usage_count = 0,
    last_usage_reset_date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
  WHERE id = p_user_id;

  PERFORM public.admin_write_audit(
    'support.reset_daily_quota',
    'user',
    p_user_id::TEXT,
    '{}'::jsonb
  );

  RETURN jsonb_build_object('user_id', p_user_id, 'daily_ai_usage_count', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_link_user_account(
  p_user_id BIGINT,
  p_auth_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY['support']);

  UPDATE public.users
  SET auth_user_id = p_auth_user_id
  WHERE id = p_user_id;

  PERFORM public.admin_write_audit(
    'support.link_user_account',
    'user',
    p_user_id::TEXT,
    jsonb_build_object('auth_user_id', p_auth_user_id)
  );

  RETURN jsonb_build_object('user_id', p_user_id, 'auth_user_id', p_auth_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_support_note(
  p_user_id BIGINT,
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
  IF COALESCE(TRIM(p_note), '') = '' THEN
    RAISE EXCEPTION 'Support note cannot be empty';
  END IF;

  v_member_id := public.require_admin_role(ARRAY['support']);

  INSERT INTO public.admin_support_notes (user_id, actor_member_id, note)
  VALUES (p_user_id, v_member_id, TRIM(p_note))
  RETURNING id INTO v_note_id;

  PERFORM public.admin_write_audit(
    'support.add_note',
    'user',
    p_user_id::TEXT,
    jsonb_build_object('note_id', v_note_id)
  );

  RETURN v_note_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_360(p_user_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_json JSONB;
  v_payments_json JSONB;
  v_events_json JSONB;
  v_notes_json JSONB;
  v_state_json JSONB;
BEGIN
  PERFORM public.require_admin_role(ARRAY['support', 'finance']);

  SELECT to_jsonb(x)
  INTO v_user_json
  FROM (
    SELECT
      u.id,
      u.username,
      u.first_name,
      u.platform,
      u.platform_id,
      u.chat_id,
      u.email,
      u.auth_user_id,
      u.is_active,
      u.is_banned,
      u.plan,
      u.premium_until,
      u.daily_ai_usage_count,
      u.last_usage_reset_date,
      u.created_at,
      u.last_active
    FROM public.users u
    WHERE u.id = p_user_id
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_payments_json
  FROM (
    SELECT
      t.id,
      t.user_id,
      COALESCE(u.first_name, u.username, u.email, CONCAT('User ', u.id::TEXT)) AS user_name,
      COALESCE(u.platform, 'telegram') AS channel,
      t.amount,
      t.payment_method,
      t.status,
      t.transaction_code,
      t.description,
      t.days_added,
      t.plan_granted,
      t.billing_sku,
      COALESCE(t.metadata ->> 'provider_event_id', t.metadata ->> 'payos_event_id') AS provider_event_id,
      COALESCE(t.plan_granted, t.billing_sku, 'unknown') AS entitlement_result,
      t.created_at,
      t.completed_at
    FROM public.transaction_history t
    LEFT JOIN public.users u ON u.id = t.user_id
    WHERE t.user_id = p_user_id
    ORDER BY t.created_at DESC
    LIMIT 12
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_events_json
  FROM (
    SELECT
      s.id,
      s.event_type,
      s.plan_from,
      s.plan_to,
      s.amount,
      s.source,
      s.notes,
      s.billing_sku,
      s.created_at
    FROM public.subscription_events s
    WHERE s.user_id = p_user_id
    ORDER BY s.created_at DESC
    LIMIT 12
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_notes_json
  FROM (
    SELECT
      n.id,
      n.user_id,
      n.note,
      COALESCE(m.display_name, u.first_name, u.username, u.email, 'Admin') AS actor_display_name,
      n.created_at
    FROM public.admin_support_notes n
    LEFT JOIN public.admin_members m ON m.id = n.actor_member_id
    LEFT JOIN public.users u ON u.id = m.linked_user_id
    WHERE n.user_id = p_user_id
    ORDER BY n.created_at DESC
    LIMIT 20
  ) x;

  SELECT to_jsonb(x)
  INTO v_state_json
  FROM (
    SELECT
      c.response_surface,
      c.conversation_focus,
      c.pending_search_result,
      c.last_actionable_entities,
      c.profile_gate_mode,
      c.updated_at
    FROM public.conversation_state c
    WHERE c.user_id = p_user_id
  ) x;

  RETURN jsonb_build_object(
    'user', v_user_json,
    'recent_payments', COALESCE(v_payments_json, '[]'::jsonb),
    'subscription_events', COALESCE(v_events_json, '[]'::jsonb),
    'support_notes', COALESCE(v_notes_json, '[]'::jsonb),
    'conversation_state', v_state_json,
    'linked_auth_state', jsonb_build_object(
      'auth_user_id', COALESCE(v_user_json ->> 'auth_user_id', NULL),
      'email', COALESCE(v_user_json ->> 'email', NULL),
      'pending_intent', (
        SELECT pending_intent
        FROM public.users
        WHERE id = p_user_id
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_system_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema JSONB;
BEGIN
  PERFORM public.require_admin_role(NULL);
  v_schema := public.admin_schema_readiness();

  RETURN jsonb_build_object(
    'schema_ready', COALESCE((v_schema ->> 'ready')::BOOLEAN, FALSE),
    'schema_missing', COALESCE(v_schema -> 'missing', '[]'::jsonb),
    'pending_payments', (SELECT COUNT(*) FROM public.transaction_history WHERE status = 'pending'),
    'duplicate_like_payments', (
      SELECT COUNT(*)
      FROM (
        SELECT transaction_code
        FROM public.transaction_history
        WHERE transaction_code IS NOT NULL
        GROUP BY transaction_code
        HAVING COUNT(*) > 1
      ) duplicates
    ),
    'failed_payment_events', (SELECT COUNT(*) FROM public.transaction_history WHERE status = 'failed'),
    'catalog_candidates_pending', (
      SELECT COUNT(*)
      FROM public.food_candidates
      WHERE COALESCE(promotion_status, status, 'pending') = 'pending'
    ),
    'ai_calls_today', (
      SELECT COUNT(*)
      FROM public.ai_usage_log
      WHERE created_at >= ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
    ),
    'admin_members', (SELECT COUNT(*) FROM public.admin_members WHERE is_active = TRUE),
    'last_webhook_at', (
      SELECT MAX(created_at)
      FROM public.payment_provider_events
    ),
    'checked_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_log(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id BIGINT,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  actor_display_name TEXT,
  role_snapshot TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(NULL);

  RETURN QUERY
  SELECT
    a.id,
    a.action,
    a.target_type,
    a.target_id,
    COALESCE(m.display_name, u.first_name, u.username, u.email, 'Admin')::TEXT AS actor_display_name,
    ARRAY(
      SELECT jsonb_array_elements_text(a.role_snapshot)
    )::TEXT[] AS role_snapshot,
    a.metadata,
    a.created_at
  FROM public.admin_audit_log a
  LEFT JOIN public.admin_members m ON m.id = a.actor_member_id
  LEFT JOIN public.users u ON u.id = m.linked_user_id
  ORDER BY a.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_members()
RETURNS TABLE (
  id BIGINT,
  auth_user_id UUID,
  linked_user_id BIGINT,
  display_name TEXT,
  email TEXT,
  username TEXT,
  is_owner BOOLEAN,
  is_active BOOLEAN,
  roles TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_role(NULL);

  RETURN QUERY
  SELECT
    m.id,
    m.auth_user_id,
    m.linked_user_id,
    m.display_name::TEXT,
    u.email::TEXT,
    u.username::TEXT,
    m.is_owner,
    m.is_active,
    public.admin_get_member_roles(m.id) AS roles,
    m.created_at,
    m.updated_at
  FROM public.admin_members m
  LEFT JOIN public.users u ON u.id = m.linked_user_id
  ORDER BY m.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_member(
  p_linked_user_id BIGINT,
  p_auth_user_id UUID DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_is_owner BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id BIGINT;
BEGIN
  PERFORM public.require_admin_owner();

  INSERT INTO public.admin_members (
    linked_user_id,
    auth_user_id,
    display_name,
    is_owner,
    is_active
  )
  VALUES (
    p_linked_user_id,
    p_auth_user_id,
    p_display_name,
    COALESCE(p_is_owner, FALSE),
    TRUE
  )
  ON CONFLICT (linked_user_id)
  DO UPDATE SET
    auth_user_id = COALESCE(EXCLUDED.auth_user_id, public.admin_members.auth_user_id),
    display_name = COALESCE(EXCLUDED.display_name, public.admin_members.display_name),
    is_owner = COALESCE(EXCLUDED.is_owner, public.admin_members.is_owner),
    is_active = TRUE
  RETURNING id INTO v_member_id;

  PERFORM public.admin_write_audit(
    'settings.upsert_admin_member',
    'admin_member',
    v_member_id::TEXT,
    jsonb_build_object('linked_user_id', p_linked_user_id, 'is_owner', p_is_owner)
  );

  RETURN v_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_member_roles(
  p_member_id BIGINT,
  p_roles TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  PERFORM public.require_admin_owner();

  DELETE FROM public.admin_member_roles
  WHERE member_id = p_member_id;

  FOREACH v_role IN ARRAY COALESCE(p_roles, ARRAY[]::TEXT[])
  LOOP
    IF v_role NOT IN ('finance', 'catalog', 'support') THEN
      RAISE EXCEPTION 'Unsupported role: %', v_role;
    END IF;

    INSERT INTO public.admin_member_roles (member_id, role)
    VALUES (p_member_id, v_role)
    ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM public.admin_write_audit(
    'settings.set_member_roles',
    'admin_member',
    p_member_id::TEXT,
    jsonb_build_object('roles', COALESCE(p_roles, ARRAY[]::TEXT[]))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_member_active(
  p_member_id BIGINT,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin_owner();

  UPDATE public.admin_members
  SET is_active = p_is_active
  WHERE id = p_member_id;

  PERFORM public.admin_write_audit(
    'settings.toggle_member_active',
    'admin_member',
    p_member_id::TEXT,
    jsonb_build_object('is_active', p_is_active)
  );
END;
$$;
