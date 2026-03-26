-- ============================================================
-- CaloTrack Customer/Admin RPC Hotfix
-- Run AFTER:
--   1. 20260326113000_admin_backoffice_roles_v1.sql
--   2. 20260326153000_customer_first_omnichannel_identity_v1.sql
--
-- Purpose:
--   - fix admin_get_system_health() against payment_provider_events.received_at
--   - fix admin_list_channel_accounts() ambiguous customer_id reference
-- ============================================================

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
      SELECT MAX(received_at)
      FROM public.payment_provider_events
    ),
    'checked_at', NOW()
  );
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
    c.phone_display AS customer_phone,
    c.plan AS customer_plan,
    cal.email AS auth_email,
    u.last_active AS last_activity
  FROM public.customer_channel_accounts cca
  LEFT JOIN public.customers c ON c.id = cca.customer_id
  LEFT JOIN public.users u ON u.id = cca.linked_user_id
  LEFT JOIN LATERAL (
    SELECT customer_auth_links.email
    FROM public.customer_auth_links
    WHERE customer_auth_links.customer_id = cca.customer_id
    ORDER BY customer_auth_links.created_at DESC
    LIMIT 1
  ) cal ON TRUE
  ORDER BY cca.updated_at DESC, cca.id DESC;
END;
$$;
