-- ============================================================
-- CaloTrack Tracking + Catalog Architecture V1
-- Run AFTER:
--   1. saas_upgrade_v3.sql
--   2. saas_upgrade_v4_website_first.sql
--
-- Purpose:
--   - Evolve current schema without breaking the live Telegram bot
--   - Add canonical tracking/state tables
--   - Harden food catalog tables for exact match + portion-first resolution
--   - Add summary tables for daily/weekly stats
--   - Add admin RPCs for food catalog curation and CSV import
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- BLOCK 1: Helper functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_food_text(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    TRIM(
      REGEXP_REPLACE(
        LOWER(unaccent(COALESCE(input_text, ''))),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_food_type(input_name TEXT, input_brand TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT := public.normalize_food_text(COALESCE(input_brand, '') || ' ' || COALESCE(input_name, ''));
BEGIN
  IF normalized IS NULL THEN
    RETURN 'generic';
  END IF;

  IF normalized ~ '(bo huc|red ?bull|sting|coca|pepsi|sprite|7up|bia|beer|jinro|soju|whey)' THEN
    RETURN 'beverage';
  END IF;

  IF normalized ~ '(uc ga|thit ga|thit vien|thit bo|thit heo|ca hoi|ca ngu|trung|whey|protein)' THEN
    RETURN 'protein';
  END IF;

  IF normalized ~ '(com|bun|pho|mi|banh mi|khoai|y?n mach|oat)' THEN
    RETURN 'carb';
  END IF;

  IF normalized ~ '(rau|dua|salad|bong cai|dau que|bau|du du)' THEN
    RETURN 'vegetable';
  END IF;

  RETURN 'generic';
END;
$$;

-- ------------------------------------------------------------
-- BLOCK 2: Evolve canonical food catalog tables
-- ------------------------------------------------------------
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS food_type TEXT,
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS is_branded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS default_serving_grams NUMERIC,
  ADD COLUMN IF NOT EXISTS default_portion_label TEXT,
  ADD COLUMN IF NOT EXISTS primary_source_type TEXT,
  ADD COLUMN IF NOT EXISTS primary_source_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS editor_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.foods
SET
  food_type = COALESCE(food_type, public.resolve_food_type(name, brand_name)),
  primary_source_type = COALESCE(primary_source_type, 'database'),
  primary_source_confidence = COALESCE(primary_source_confidence, CASE WHEN is_verified THEN 1 ELSE 0.7 END),
  default_serving_grams = COALESCE(default_serving_grams, 100),
  default_portion_label = COALESCE(default_portion_label, '100g'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  is_active = COALESCE(is_active, TRUE),
  is_branded = COALESCE(is_branded, FALSE);

CREATE INDEX IF NOT EXISTS idx_foods_status ON public.foods(status);
CREATE INDEX IF NOT EXISTS idx_foods_food_type ON public.foods(food_type);
CREATE INDEX IF NOT EXISTS idx_foods_brand_name ON public.foods(brand_name);
CREATE INDEX IF NOT EXISTS idx_foods_is_active ON public.foods(is_active);

ALTER TABLE public.food_aliases
  ADD COLUMN IF NOT EXISTS alias_type TEXT NOT NULL DEFAULT 'common_name',
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 1;

UPDATE public.food_aliases
SET
  alias_norm = COALESCE(alias_norm, public.normalize_food_text(alias)),
  alias_type = COALESCE(NULLIF(alias_type, ''), 'common_name'),
  source_type = COALESCE(NULLIF(source_type, ''), 'manual'),
  confidence = COALESCE(confidence, 1);

CREATE INDEX IF NOT EXISTS idx_food_aliases_alias_norm ON public.food_aliases(alias_norm);
CREATE INDEX IF NOT EXISTS idx_food_aliases_food_id ON public.food_aliases(food_id);

ALTER TABLE public.food_nutrition
  ADD COLUMN IF NOT EXISTS serving_grams NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_label TEXT,
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS protein NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs NUMERIC,
  ADD COLUMN IF NOT EXISTS fat NUMERIC,
  ADD COLUMN IF NOT EXISTS fiber NUMERIC,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.food_nutrition
SET
  serving_grams = COALESCE(serving_grams, 100),
  serving_label = COALESCE(serving_label, '100g'),
  calories = COALESCE(calories, kcal_per_100g),
  protein = COALESCE(protein, protein_per_100g),
  carbs = COALESCE(carbs, carbs_per_100g),
  fat = COALESCE(fat, fat_per_100g),
  fiber = COALESCE(fiber, fiber_per_100g),
  source_type = COALESCE(source_type, source, 'database'),
  source_ref = COALESCE(source_ref, source),
  confidence = COALESCE(confidence, 1),
  is_primary = COALESCE(is_primary, TRUE),
  updated_at = COALESCE(updated_at, NOW());

CREATE INDEX IF NOT EXISTS idx_food_nutrition_food_id ON public.food_nutrition(food_id);
CREATE INDEX IF NOT EXISTS idx_food_nutrition_is_primary ON public.food_nutrition(is_primary);

ALTER TABLE public.food_portions
  ADD COLUMN IF NOT EXISTS quantity_value NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT,
  ADD COLUMN IF NOT EXISTS portion_type TEXT NOT NULL DEFAULT 'serving',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.food_portions
SET
  label_norm = COALESCE(label_norm, public.normalize_food_text(label)),
  quantity_value = COALESCE(quantity_value, CASE WHEN public.normalize_food_text(label) ~ '^[0-9]+([.][0-9]+)? g$' THEN SPLIT_PART(public.normalize_food_text(label), ' ', 1)::NUMERIC ELSE 1 END),
  quantity_unit = COALESCE(quantity_unit, CASE WHEN public.normalize_food_text(label) LIKE '% ml' THEN 'ml' WHEN public.normalize_food_text(label) LIKE '% g' THEN 'g' ELSE NULL END),
  source_type = COALESCE(NULLIF(source_type, ''), CASE WHEN is_verified THEN 'database' ELSE 'manual' END),
  confidence = COALESCE(confidence, CASE WHEN is_verified THEN 1 ELSE 0.8 END),
  portion_type = COALESCE(NULLIF(portion_type, ''), 'serving');

CREATE INDEX IF NOT EXISTS idx_food_portions_food_id ON public.food_portions(food_id);
CREATE INDEX IF NOT EXISTS idx_food_portions_label_norm ON public.food_portions(label_norm);

ALTER TABLE public.food_candidates
  ADD COLUMN IF NOT EXISTS candidate_type TEXT NOT NULL DEFAULT 'search_estimate',
  ADD COLUMN IF NOT EXISTS first_seen_query TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS promotion_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS suggested_food_name TEXT,
  ADD COLUMN IF NOT EXISTS suggested_serving_label TEXT,
  ADD COLUMN IF NOT EXISTS source_images_meta JSONB;

UPDATE public.food_candidates
SET
  first_seen_query = COALESCE(first_seen_query, raw_name),
  last_seen_at = COALESCE(last_seen_at, created_at, NOW()),
  usage_count = COALESCE(NULLIF(usage_count, 0), 1),
  promotion_status = COALESCE(NULLIF(promotion_status, ''), status, 'pending'),
  suggested_food_name = COALESCE(suggested_food_name, raw_name),
  suggested_serving_label = COALESCE(suggested_serving_label, raw_portion);

CREATE INDEX IF NOT EXISTS idx_food_candidates_status ON public.food_candidates(status);
CREATE INDEX IF NOT EXISTS idx_food_candidates_promotion_status ON public.food_candidates(promotion_status);
CREATE INDEX IF NOT EXISTS idx_food_candidates_normalized_name ON public.food_candidates(normalized_name);
CREATE INDEX IF NOT EXISTS idx_food_usage_stats_food_id ON public.food_usage_stats(food_id);

-- ------------------------------------------------------------
-- BLOCK 3: Canonical tracking/state tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_channel TEXT NOT NULL DEFAULT 'telegram',
  source_message_id TEXT,
  log_mode TEXT NOT NULL DEFAULT 'single',
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_local DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Asia/Saigon')::DATE),
  trace_id TEXT,
  compat_food_log_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date ON public.meal_logs(user_id, date_local);
CREATE INDEX IF NOT EXISTS idx_meal_logs_logged_at ON public.meal_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_logs_compat_food_log_id ON public.meal_logs(compat_food_log_id);

CREATE TABLE IF NOT EXISTS public.meal_log_items (
  id BIGSERIAL PRIMARY KEY,
  meal_log_id BIGINT NOT NULL REFERENCES public.meal_logs(id) ON DELETE CASCADE,
  food_id BIGINT REFERENCES public.foods(id),
  food_name_snapshot TEXT NOT NULL,
  quantity_value NUMERIC,
  quantity_unit TEXT,
  portion_label TEXT,
  grams NUMERIC,
  calories NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT,
  source_confidence NUMERIC,
  compat_food_log_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_log_items_meal_log_id ON public.meal_log_items(meal_log_id);
CREATE INDEX IF NOT EXISTS idx_meal_log_items_food_id ON public.meal_log_items(food_id);
CREATE INDEX IF NOT EXISTS idx_meal_log_items_compat_food_log_id ON public.meal_log_items(compat_food_log_id);

CREATE TABLE IF NOT EXISTS public.review_bundles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bundle_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  source_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  saved_meal_log_id BIGINT REFERENCES public.meal_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_review_bundles_user_status ON public.review_bundles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_review_bundles_created_at ON public.review_bundles(created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_bundle_items (
  id BIGSERIAL PRIMARY KEY,
  bundle_id BIGINT NOT NULL REFERENCES public.review_bundles(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  food_id BIGINT REFERENCES public.foods(id),
  food_name TEXT NOT NULL,
  raw_input TEXT,
  quantity_value NUMERIC,
  quantity_unit TEXT,
  portion_label TEXT,
  grams NUMERIC,
  best_calories NUMERIC NOT NULL DEFAULT 0,
  min_calories NUMERIC,
  max_calories NUMERIC,
  best_protein NUMERIC NOT NULL DEFAULT 0,
  best_carbs NUMERIC NOT NULL DEFAULT 0,
  best_fat NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT,
  source_confidence NUMERIC,
  merge_status TEXT,
  is_selected BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_bundle_items_bundle_item_index
  ON public.review_bundle_items(bundle_id, item_index);

CREATE TABLE IF NOT EXISTS public.conversation_state (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  response_surface TEXT,
  conversation_focus TEXT,
  active_review_bundle_id BIGINT REFERENCES public.review_bundles(id),
  pending_search_result JSONB,
  last_actionable_entities JSONB,
  profile_gate_mode TEXT NOT NULL DEFAULT 'soft',
  state_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_user_stats (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  total_calories NUMERIC NOT NULL DEFAULT 0,
  total_protein NUMERIC NOT NULL DEFAULT 0,
  total_carbs NUMERIC NOT NULL DEFAULT 0,
  total_fat NUMERIC NOT NULL DEFAULT 0,
  exercise_calories NUMERIC NOT NULL DEFAULT 0,
  net_calories NUMERIC NOT NULL DEFAULT 0,
  meal_count INTEGER NOT NULL DEFAULT 0,
  goal_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date_local)
);

CREATE TABLE IF NOT EXISTS public.weekly_user_stats (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  avg_intake NUMERIC NOT NULL DEFAULT 0,
  avg_exercise NUMERIC NOT NULL DEFAULT 0,
  avg_net NUMERIC NOT NULL DEFAULT 0,
  protein_adequacy NUMERIC NOT NULL DEFAULT 0,
  weight_trend_pct NUMERIC,
  days_logged INTEGER NOT NULL DEFAULT 0,
  goal_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

-- ------------------------------------------------------------
-- BLOCK 4: Summary refresh functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_daily_user_stats(p_user_id BIGINT, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_snapshot JSONB;
BEGIN
  SELECT JSONB_BUILD_OBJECT(
    'daily_calorie_goal', u.daily_calorie_goal,
    'tdee', u.tdee,
    'weight_kg', u.weight_kg,
    'activity_level', u.activity_level
  )
  INTO v_goal_snapshot
  FROM public.users u
  WHERE u.id = p_user_id;

  INSERT INTO public.daily_user_stats (
    user_id,
    date_local,
    total_calories,
    total_protein,
    total_carbs,
    total_fat,
    exercise_calories,
    net_calories,
    meal_count,
    goal_snapshot,
    updated_at
  )
  SELECT
    p_user_id,
    p_date,
    COALESCE(SUM(mli.calories), 0),
    COALESCE(SUM(mli.protein), 0),
    COALESCE(SUM(mli.carbs), 0),
    COALESCE(SUM(mli.fat), 0),
    COALESCE((
      SELECT SUM(COALESCE(el.calories_burned, 0))
      FROM public.exercise_logs el
      WHERE el.user_id = p_user_id
        AND el.date = p_date
    ), 0),
    COALESCE(SUM(mli.calories), 0) - COALESCE((
      SELECT SUM(COALESCE(el.calories_burned, 0))
      FROM public.exercise_logs el
      WHERE el.user_id = p_user_id
        AND el.date = p_date
    ), 0),
    COUNT(DISTINCT ml.id),
    COALESCE(v_goal_snapshot, '{}'::JSONB),
    NOW()
  FROM public.meal_logs ml
  LEFT JOIN public.meal_log_items mli ON mli.meal_log_id = ml.id
  WHERE ml.user_id = p_user_id
    AND ml.date_local = p_date
  ON CONFLICT (user_id, date_local) DO UPDATE SET
    total_calories = EXCLUDED.total_calories,
    total_protein = EXCLUDED.total_protein,
    total_carbs = EXCLUDED.total_carbs,
    total_fat = EXCLUDED.total_fat,
    exercise_calories = EXCLUDED.exercise_calories,
    net_calories = EXCLUDED.net_calories,
    meal_count = EXCLUDED.meal_count,
    goal_snapshot = EXCLUDED.goal_snapshot,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_weekly_user_stats(p_user_id BIGINT, p_anchor_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start DATE := DATE_TRUNC('week', p_anchor_date::TIMESTAMP)::DATE;
  v_goal_snapshot JSONB;
  v_latest_weight NUMERIC;
  v_oldest_weight NUMERIC;
  v_weight_trend_pct NUMERIC;
BEGIN
  SELECT JSONB_BUILD_OBJECT(
    'daily_calorie_goal', u.daily_calorie_goal,
    'tdee', u.tdee,
    'weight_kg', u.weight_kg,
    'activity_level', u.activity_level
  )
  INTO v_goal_snapshot
  FROM public.users u
  WHERE u.id = p_user_id;

  SELECT wl.weight
  INTO v_latest_weight
  FROM public.weight_logs wl
  WHERE wl.user_id = p_user_id
    AND wl.date BETWEEN v_week_start AND (v_week_start + 6)
  ORDER BY wl.date DESC
  LIMIT 1;

  SELECT wl.weight
  INTO v_oldest_weight
  FROM public.weight_logs wl
  WHERE wl.user_id = p_user_id
    AND wl.date BETWEEN v_week_start AND (v_week_start + 6)
  ORDER BY wl.date ASC
  LIMIT 1;

  IF v_latest_weight IS NOT NULL AND v_oldest_weight IS NOT NULL AND v_oldest_weight <> 0 THEN
    v_weight_trend_pct := ROUND(((v_latest_weight - v_oldest_weight) / v_oldest_weight) * 100, 2);
  ELSE
    v_weight_trend_pct := NULL;
  END IF;

  INSERT INTO public.weekly_user_stats (
    user_id,
    week_start,
    avg_intake,
    avg_exercise,
    avg_net,
    protein_adequacy,
    weight_trend_pct,
    days_logged,
    goal_snapshot,
    updated_at
  )
  SELECT
    p_user_id,
    v_week_start,
    COALESCE(AVG(dus.total_calories), 0),
    COALESCE(AVG(dus.exercise_calories), 0),
    COALESCE(AVG(dus.net_calories), 0),
    COALESCE(AVG(
      CASE
        WHEN COALESCE(NULLIF((dus.goal_snapshot ->> 'daily_calorie_goal')::NUMERIC, 0), 0) > 0
          THEN LEAST(dus.total_protein / GREATEST(((dus.goal_snapshot ->> 'daily_calorie_goal')::NUMERIC / 1000) * 50, 1), 1)
        ELSE 0
      END
    ), 0),
    v_weight_trend_pct,
    COUNT(*) FILTER (WHERE dus.meal_count > 0),
    COALESCE(v_goal_snapshot, '{}'::JSONB),
    NOW()
  FROM public.daily_user_stats dus
  WHERE dus.user_id = p_user_id
    AND dus.date_local BETWEEN v_week_start AND (v_week_start + 6)
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    avg_intake = EXCLUDED.avg_intake,
    avg_exercise = EXCLUDED.avg_exercise,
    avg_net = EXCLUDED.avg_net,
    protein_adequacy = EXCLUDED.protein_adequacy,
    weight_trend_pct = EXCLUDED.weight_trend_pct,
    days_logged = EXCLUDED.days_logged,
    goal_snapshot = EXCLUDED.goal_snapshot,
    updated_at = NOW();
END;
$$;

-- ------------------------------------------------------------
-- BLOCK 5: Compat sync functions + triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_food_log_to_meal_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meal_log_id BIGINT;
  v_date_local DATE;
BEGIN
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.meal_log_items
    WHERE compat_food_log_id = COALESCE(NEW.id, OLD.id);

    DELETE FROM public.meal_logs
    WHERE compat_food_log_id = COALESCE(NEW.id, OLD.id);

    RETURN COALESCE(NEW, OLD);
  END IF;

  v_date_local := COALESCE(NEW.date, (COALESCE(NEW.logged_at, NOW()) AT TIME ZONE 'Asia/Saigon')::DATE);

  INSERT INTO public.meal_logs (
    user_id,
    source_channel,
    source_message_id,
    log_mode,
    logged_at,
    date_local,
    trace_id,
    compat_food_log_id,
    created_at
  )
  VALUES (
    NEW.user_id,
    COALESCE(NULLIF(NEW.source, ''), 'telegram'),
    NULL,
    'compat_food_log',
    COALESCE(NEW.logged_at, NOW()),
    v_date_local,
    CONCAT('food_log:', NEW.id),
    NEW.id,
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (compat_food_log_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    source_channel = EXCLUDED.source_channel,
    logged_at = EXCLUDED.logged_at,
    date_local = EXCLUDED.date_local
  RETURNING id INTO v_meal_log_id;

  INSERT INTO public.meal_log_items (
    meal_log_id,
    food_id,
    food_name_snapshot,
    quantity_value,
    quantity_unit,
    portion_label,
    grams,
    calories,
    protein,
    carbs,
    fat,
    source_type,
    source_confidence,
    compat_food_log_id,
    created_at
  )
  VALUES (
    v_meal_log_id,
    NEW.food_id,
    COALESCE(NULLIF(NEW.food_name, ''), 'Unknown food'),
    NEW.quantity,
    NULL,
    CASE WHEN NEW.quantity IS NOT NULL THEN CONCAT(NEW.quantity::TEXT, ' phần') ELSE NULL END,
    NULL,
    COALESCE(NEW.calories, 0),
    COALESCE(NEW.protein, 0),
    COALESCE(NEW.carbs, 0),
    COALESCE(NEW.fat, 0),
    COALESCE(NULLIF(NEW.source, ''), CASE WHEN COALESCE(NEW.ai_detected, FALSE) THEN 'ai' ELSE 'database' END),
    COALESCE(NEW.ai_confidence, 1),
    NEW.id,
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (compat_food_log_id) DO UPDATE SET
    meal_log_id = EXCLUDED.meal_log_id,
    food_id = EXCLUDED.food_id,
    food_name_snapshot = EXCLUDED.food_name_snapshot,
    quantity_value = EXCLUDED.quantity_value,
    portion_label = EXCLUDED.portion_label,
    calories = EXCLUDED.calories,
    protein = EXCLUDED.protein,
    carbs = EXCLUDED.carbs,
    fat = EXCLUDED.fat,
    source_type = EXCLUDED.source_type,
    source_confidence = EXCLUDED.source_confidence;

  PERFORM public.refresh_daily_user_stats(NEW.user_id, v_date_local);
  PERFORM public.refresh_weekly_user_stats(NEW.user_id, v_date_local);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_food_log_to_meal_tables ON public.food_logs;
CREATE TRIGGER trg_sync_food_log_to_meal_tables
AFTER INSERT OR UPDATE OR DELETE ON public.food_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_food_log_to_meal_tables();

CREATE OR REPLACE FUNCTION public.sync_pending_intent_to_conversation_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending JSONB := COALESCE(NEW.pending_intent, '{}'::JSONB);
  v_active_bundle_id BIGINT;
BEGIN
  IF JSONB_TYPEOF(v_pending) <> 'object' THEN
    v_pending := '{}'::JSONB;
  END IF;

  IF COALESCE(v_pending ->> 'active_review_bundle_id', '') ~ '^[0-9]+$' THEN
    v_active_bundle_id := (v_pending ->> 'active_review_bundle_id')::BIGINT;
  ELSE
    v_active_bundle_id := NULL;
  END IF;

  IF v_active_bundle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.review_bundles rb
    WHERE rb.id = v_active_bundle_id
  ) THEN
    v_active_bundle_id := NULL;
  END IF;

  INSERT INTO public.conversation_state (
    user_id,
    response_surface,
    conversation_focus,
    active_review_bundle_id,
    pending_search_result,
    last_actionable_entities,
    profile_gate_mode,
    state_payload,
    updated_at
  )
  VALUES (
    NEW.id,
    NULLIF(v_pending ->> 'response_surface', ''),
    NULLIF(v_pending ->> 'conversation_focus', ''),
    v_active_bundle_id,
    COALESCE(v_pending -> 'pending_search_result', NULL),
    COALESCE(v_pending -> 'last_actionable_entities', NULL),
    COALESCE(NULLIF(v_pending ->> 'profile_gate_mode', ''), 'soft'),
    v_pending,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    response_surface = EXCLUDED.response_surface,
    conversation_focus = EXCLUDED.conversation_focus,
    active_review_bundle_id = EXCLUDED.active_review_bundle_id,
    pending_search_result = EXCLUDED.pending_search_result,
    last_actionable_entities = EXCLUDED.last_actionable_entities,
    profile_gate_mode = EXCLUDED.profile_gate_mode,
    state_payload = EXCLUDED.state_payload,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pending_intent_to_conversation_state ON public.users;
CREATE TRIGGER trg_sync_pending_intent_to_conversation_state
AFTER INSERT OR UPDATE OF pending_intent ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_pending_intent_to_conversation_state();

-- ------------------------------------------------------------
-- BLOCK 6: Backfill existing compat data
-- ------------------------------------------------------------
INSERT INTO public.meal_logs (
  user_id,
  source_channel,
  source_message_id,
  log_mode,
  logged_at,
  date_local,
  trace_id,
  compat_food_log_id,
  created_at
)
SELECT
  fl.user_id,
  COALESCE(NULLIF(fl.source, ''), 'telegram'),
  NULL,
  'compat_food_log',
  COALESCE(fl.logged_at, NOW()),
  COALESCE(fl.date, (COALESCE(fl.logged_at, NOW()) AT TIME ZONE 'Asia/Saigon')::DATE),
  CONCAT('food_log:', fl.id),
  fl.id,
  COALESCE(fl.created_at, NOW())
FROM public.food_logs fl
WHERE fl.deleted_at IS NULL
ON CONFLICT (compat_food_log_id) DO NOTHING;

INSERT INTO public.meal_log_items (
  meal_log_id,
  food_id,
  food_name_snapshot,
  quantity_value,
  quantity_unit,
  portion_label,
  grams,
  calories,
  protein,
  carbs,
  fat,
  source_type,
  source_confidence,
  compat_food_log_id,
  created_at
)
SELECT
  ml.id,
  fl.food_id,
  COALESCE(NULLIF(fl.food_name, ''), 'Unknown food'),
  fl.quantity,
  NULL,
  CASE WHEN fl.quantity IS NOT NULL THEN CONCAT(fl.quantity::TEXT, ' phần') ELSE NULL END,
  NULL,
  COALESCE(fl.calories, 0),
  COALESCE(fl.protein, 0),
  COALESCE(fl.carbs, 0),
  COALESCE(fl.fat, 0),
  COALESCE(NULLIF(fl.source, ''), CASE WHEN COALESCE(fl.ai_detected, FALSE) THEN 'ai' ELSE 'database' END),
  COALESCE(fl.ai_confidence, 1),
  fl.id,
  COALESCE(fl.created_at, NOW())
FROM public.food_logs fl
JOIN public.meal_logs ml ON ml.compat_food_log_id = fl.id
WHERE fl.deleted_at IS NULL
ON CONFLICT (compat_food_log_id) DO NOTHING;

INSERT INTO public.conversation_state (
  user_id,
  response_surface,
  conversation_focus,
  active_review_bundle_id,
  pending_search_result,
  last_actionable_entities,
  profile_gate_mode,
  state_payload,
  updated_at
)
SELECT
  u.id,
  NULLIF(COALESCE(u.pending_intent, '{}'::JSONB) ->> 'response_surface', ''),
  NULLIF(COALESCE(u.pending_intent, '{}'::JSONB) ->> 'conversation_focus', ''),
  NULL,
  COALESCE(u.pending_intent, '{}'::JSONB) -> 'pending_search_result',
  COALESCE(u.pending_intent, '{}'::JSONB) -> 'last_actionable_entities',
  COALESCE(NULLIF(COALESCE(u.pending_intent, '{}'::JSONB) ->> 'profile_gate_mode', ''), 'soft'),
  COALESCE(u.pending_intent, '{}'::JSONB),
  NOW()
FROM public.users u
WHERE u.pending_intent IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  state_payload = EXCLUDED.state_payload,
  updated_at = NOW();

DO $$
DECLARE
  record_item RECORD;
BEGIN
  FOR record_item IN
    SELECT DISTINCT ml.user_id, ml.date_local
    FROM public.meal_logs ml
  LOOP
    PERFORM public.refresh_daily_user_stats(record_item.user_id, record_item.date_local);
    PERFORM public.refresh_weekly_user_stats(record_item.user_id, record_item.date_local);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- BLOCK 7: RLS for canonical tracking tables
-- ------------------------------------------------------------
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_log_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meal_logs_select_self" ON public.meal_logs;
CREATE POLICY "meal_logs_select_self" ON public.meal_logs
  FOR SELECT TO authenticated
  USING (user_id = public.current_linked_user_id());

DROP POLICY IF EXISTS "meal_log_items_select_self" ON public.meal_log_items;
CREATE POLICY "meal_log_items_select_self" ON public.meal_log_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_logs ml
      WHERE ml.id = meal_log_items.meal_log_id
        AND ml.user_id = public.current_linked_user_id()
    )
  );

DROP POLICY IF EXISTS "review_bundles_select_self" ON public.review_bundles;
CREATE POLICY "review_bundles_select_self" ON public.review_bundles
  FOR SELECT TO authenticated
  USING (user_id = public.current_linked_user_id());

DROP POLICY IF EXISTS "review_bundle_items_select_self" ON public.review_bundle_items;
CREATE POLICY "review_bundle_items_select_self" ON public.review_bundle_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_bundles rb
      WHERE rb.id = review_bundle_items.bundle_id
        AND rb.user_id = public.current_linked_user_id()
    )
  );

DROP POLICY IF EXISTS "conversation_state_select_self" ON public.conversation_state;
CREATE POLICY "conversation_state_select_self" ON public.conversation_state
  FOR SELECT TO authenticated
  USING (user_id = public.current_linked_user_id());

DROP POLICY IF EXISTS "daily_user_stats_select_self" ON public.daily_user_stats;
CREATE POLICY "daily_user_stats_select_self" ON public.daily_user_stats
  FOR SELECT TO authenticated
  USING (user_id = public.current_linked_user_id());

DROP POLICY IF EXISTS "weekly_user_stats_select_self" ON public.weekly_user_stats;
CREATE POLICY "weekly_user_stats_select_self" ON public.weekly_user_stats
  FOR SELECT TO authenticated
  USING (user_id = public.current_linked_user_id());

-- ------------------------------------------------------------
-- BLOCK 8: Extend admin_schema_readiness
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_schema_readiness()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'plan') THEN
    missing := array_append(missing, 'users.plan');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin') THEN
    missing := array_append(missing, 'users.is_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'pending_intent') THEN
    missing := array_append(missing, 'users.pending_intent');
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content_packages') THEN
    missing := array_append(missing, 'content_packages');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meal_logs') THEN
    missing := array_append(missing, 'meal_logs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meal_log_items') THEN
    missing := array_append(missing, 'meal_log_items');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_bundles') THEN
    missing := array_append(missing, 'review_bundles');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_bundle_items') THEN
    missing := array_append(missing, 'review_bundle_items');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_state') THEN
    missing := array_append(missing, 'conversation_state');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_user_stats') THEN
    missing := array_append(missing, 'daily_user_stats');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_user_stats') THEN
    missing := array_append(missing, 'weekly_user_stats');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_food_list') THEN
    missing := array_append(missing, 'admin_food_list()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_food_csv_import_commit') THEN
    missing := array_append(missing, 'admin_food_csv_import_commit()');
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'ready', COALESCE(array_length(missing, 1), 0) = 0,
    'missing', missing,
    'checked_at', NOW()
  );
END;
$$;

-- ------------------------------------------------------------
-- BLOCK 9: Admin food catalog RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_food_list(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  category TEXT,
  food_type TEXT,
  brand_name TEXT,
  is_active BOOLEAN,
  default_serving_grams NUMERIC,
  default_portion_label TEXT,
  primary_source_type TEXT,
  primary_source_confidence NUMERIC,
  calories NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  alias_count INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT := public.normalize_food_text(p_search);
BEGIN
  PERFORM public.require_current_admin();

  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.category,
    f.food_type,
    f.brand_name,
    f.is_active,
    f.default_serving_grams,
    f.default_portion_label,
    f.primary_source_type,
    f.primary_source_confidence,
    fn.calories,
    fn.protein,
    fn.carbs,
    fn.fat,
    COALESCE(alias_meta.alias_count, 0)::INTEGER,
    f.updated_at
  FROM public.foods f
  LEFT JOIN LATERAL (
    SELECT
      n.calories,
      n.protein,
      n.carbs,
      n.fat
    FROM public.food_nutrition n
    WHERE n.food_id = f.id
    ORDER BY n.is_primary DESC, n.updated_at DESC NULLS LAST
    LIMIT 1
  ) fn ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS alias_count
    FROM public.food_aliases fa
    WHERE fa.food_id = f.id
  ) alias_meta ON TRUE
  WHERE q IS NULL
    OR f.name_norm = q
    OR f.name_norm LIKE '%' || q || '%'
    OR public.normalize_food_text(COALESCE(f.brand_name, '')) LIKE '%' || q || '%'
    OR EXISTS (
      SELECT 1
      FROM public.food_aliases fa
      WHERE fa.food_id = f.id
        AND fa.alias_norm LIKE '%' || q || '%'
    )
  ORDER BY
    CASE WHEN f.name_norm = q THEN 0 ELSE 1 END,
    COALESCE(f.is_active, TRUE) DESC,
    COALESCE(f.quality_score, 0) DESC,
    f.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_candidates_list(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  id BIGINT,
  raw_name TEXT,
  normalized_name TEXT,
  raw_portion TEXT,
  candidate_type TEXT,
  status TEXT,
  promotion_status TEXT,
  usage_count INTEGER,
  match_food_id BIGINT,
  match_confidence NUMERIC,
  suggested_food_name TEXT,
  suggested_serving_label TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_current_admin();

  RETURN QUERY
  SELECT
    fc.id,
    fc.raw_name,
    fc.normalized_name,
    fc.raw_portion,
    fc.candidate_type,
    fc.status,
    fc.promotion_status,
    fc.usage_count,
    fc.match_food_id,
    fc.match_confidence,
    fc.suggested_food_name,
    fc.suggested_serving_label,
    fc.created_at,
    fc.last_seen_at
  FROM public.food_candidates fc
  WHERE p_status IS NULL
    OR p_status = ''
    OR fc.promotion_status = p_status
    OR fc.status = p_status
  ORDER BY COALESCE(fc.last_seen_at, fc.created_at) DESC, fc.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_upsert(
  p_id BIGINT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_food_type TEXT DEFAULT NULL,
  p_brand_name TEXT DEFAULT NULL,
  p_default_serving_grams NUMERIC DEFAULT NULL,
  p_default_portion_label TEXT DEFAULT NULL,
  p_primary_source_type TEXT DEFAULT 'manual',
  p_primary_source_confidence NUMERIC DEFAULT 1,
  p_editor_notes TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_food_id BIGINT;
  v_name TEXT := NULLIF(TRIM(COALESCE(p_name, '')), '');
BEGIN
  PERFORM public.require_current_admin();

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Food name is required';
  END IF;

  IF p_id IS NULL THEN
    SELECT f.id
    INTO v_food_id
    FROM public.foods f
    WHERE f.name_norm = public.normalize_food_text(v_name)
      AND COALESCE(LOWER(f.brand_name), '') = COALESCE(LOWER(p_brand_name), '')
    ORDER BY f.is_active DESC, f.id DESC
    LIMIT 1;
  ELSE
    v_food_id := p_id;
  END IF;

  IF v_food_id IS NULL THEN
    INSERT INTO public.foods (
      name,
      name_norm,
      category,
      food_type,
      brand_name,
      is_branded,
      status,
      default_serving_grams,
      default_portion_label,
      primary_source_type,
      primary_source_confidence,
      editor_notes,
      is_active,
      is_verified,
      updated_at
    )
    VALUES (
      v_name,
      public.normalize_food_text(v_name),
      p_category,
      COALESCE(p_food_type, public.resolve_food_type(v_name, p_brand_name)),
      p_brand_name,
      COALESCE(NULLIF(TRIM(COALESCE(p_brand_name, '')), ''), '') <> '',
      CASE WHEN p_is_active THEN 'active' ELSE 'draft' END,
      p_default_serving_grams,
      p_default_portion_label,
      COALESCE(p_primary_source_type, 'manual'),
      COALESCE(p_primary_source_confidence, 1),
      p_editor_notes,
      COALESCE(p_is_active, TRUE),
      FALSE,
      NOW()
    )
    RETURNING id INTO v_food_id;
  ELSE
    UPDATE public.foods
    SET
      name = v_name,
      name_norm = public.normalize_food_text(v_name),
      category = p_category,
      food_type = COALESCE(p_food_type, public.resolve_food_type(v_name, p_brand_name)),
      brand_name = p_brand_name,
      is_branded = COALESCE(NULLIF(TRIM(COALESCE(p_brand_name, '')), ''), '') <> '',
      status = CASE WHEN COALESCE(p_is_active, TRUE) THEN 'active' ELSE 'draft' END,
      default_serving_grams = p_default_serving_grams,
      default_portion_label = p_default_portion_label,
      primary_source_type = COALESCE(p_primary_source_type, primary_source_type, 'manual'),
      primary_source_confidence = COALESCE(p_primary_source_confidence, primary_source_confidence, 1),
      editor_notes = p_editor_notes,
      is_active = COALESCE(p_is_active, TRUE),
      updated_at = NOW()
    WHERE id = v_food_id;
  END IF;

  RETURN v_food_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_alias_upsert(
  p_food_id BIGINT,
  p_alias TEXT,
  p_alias_type TEXT DEFAULT 'common_name',
  p_is_primary BOOLEAN DEFAULT FALSE,
  p_source_type TEXT DEFAULT 'manual',
  p_confidence NUMERIC DEFAULT 1
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alias_id BIGINT;
  v_alias TEXT := NULLIF(TRIM(COALESCE(p_alias, '')), '');
  v_alias_norm TEXT;
BEGIN
  PERFORM public.require_current_admin();

  IF p_food_id IS NULL THEN
    RAISE EXCEPTION 'food_id is required';
  END IF;

  IF v_alias IS NULL THEN
    RAISE EXCEPTION 'alias is required';
  END IF;

  v_alias_norm := public.normalize_food_text(v_alias);

  SELECT fa.id
  INTO v_alias_id
  FROM public.food_aliases fa
  WHERE fa.food_id = p_food_id
    AND fa.alias_norm = v_alias_norm
  LIMIT 1;

  IF COALESCE(p_is_primary, FALSE) THEN
    UPDATE public.food_aliases
    SET is_primary = FALSE
    WHERE food_id = p_food_id;
  END IF;

  IF v_alias_id IS NULL THEN
    INSERT INTO public.food_aliases (
      food_id,
      alias,
      alias_norm,
      language,
      alias_type,
      is_primary,
      source_type,
      confidence,
      created_at
    )
    VALUES (
      p_food_id,
      v_alias,
      v_alias_norm,
      'vi',
      COALESCE(p_alias_type, 'common_name'),
      COALESCE(p_is_primary, FALSE),
      COALESCE(p_source_type, 'manual'),
      COALESCE(p_confidence, 1),
      NOW()
    )
    RETURNING id INTO v_alias_id;
  ELSE
    UPDATE public.food_aliases
    SET
      alias = v_alias,
      alias_norm = v_alias_norm,
      alias_type = COALESCE(p_alias_type, alias_type, 'common_name'),
      is_primary = COALESCE(p_is_primary, is_primary, FALSE),
      source_type = COALESCE(p_source_type, source_type, 'manual'),
      confidence = COALESCE(p_confidence, confidence, 1)
    WHERE id = v_alias_id;
  END IF;

  RETURN v_alias_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_nutrition_upsert(
  p_food_id BIGINT,
  p_serving_label TEXT DEFAULT '100g',
  p_serving_grams NUMERIC DEFAULT 100,
  p_calories NUMERIC DEFAULT 0,
  p_protein NUMERIC DEFAULT 0,
  p_carbs NUMERIC DEFAULT 0,
  p_fat NUMERIC DEFAULT 0,
  p_fiber NUMERIC DEFAULT NULL,
  p_source_type TEXT DEFAULT 'manual',
  p_source_ref TEXT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT 1,
  p_is_primary BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
  v_scale NUMERIC := CASE WHEN COALESCE(p_serving_grams, 0) > 0 THEN 100 / p_serving_grams ELSE NULL END;
BEGIN
  PERFORM public.require_current_admin();

  IF p_food_id IS NULL THEN
    RAISE EXCEPTION 'food_id is required';
  END IF;

  IF COALESCE(p_is_primary, TRUE) THEN
    UPDATE public.food_nutrition
    SET is_primary = FALSE
    WHERE food_id = p_food_id;
  END IF;

  UPDATE public.food_nutrition
  SET
    serving_label = COALESCE(p_serving_label, serving_label, '100g'),
    serving_grams = COALESCE(p_serving_grams, serving_grams, 100),
    calories = COALESCE(p_calories, calories, 0),
    protein = COALESCE(p_protein, protein, 0),
    carbs = COALESCE(p_carbs, carbs, 0),
    fat = COALESCE(p_fat, fat, 0),
    fiber = COALESCE(p_fiber, fiber),
    kcal_per_100g = CASE WHEN v_scale IS NULL THEN kcal_per_100g ELSE ROUND(COALESCE(p_calories, 0) * v_scale, 2) END,
    protein_per_100g = CASE WHEN v_scale IS NULL THEN protein_per_100g ELSE ROUND(COALESCE(p_protein, 0) * v_scale, 2) END,
    carbs_per_100g = CASE WHEN v_scale IS NULL THEN carbs_per_100g ELSE ROUND(COALESCE(p_carbs, 0) * v_scale, 2) END,
    fat_per_100g = CASE WHEN v_scale IS NULL THEN fat_per_100g ELSE ROUND(COALESCE(p_fat, 0) * v_scale, 2) END,
    fiber_per_100g = CASE WHEN v_scale IS NULL OR p_fiber IS NULL THEN fiber_per_100g ELSE ROUND(COALESCE(p_fiber, 0) * v_scale, 2) END,
    source = COALESCE(p_source_type, source, 'manual'),
    source_type = COALESCE(p_source_type, source_type, 'manual'),
    source_ref = COALESCE(p_source_ref, source_ref),
    confidence = COALESCE(p_confidence, confidence, 1),
    is_primary = COALESCE(p_is_primary, TRUE),
    updated_at = NOW()
  WHERE food_id = p_food_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    INSERT INTO public.food_nutrition (
      food_id,
      kcal_per_100g,
      protein_per_100g,
      carbs_per_100g,
      fat_per_100g,
      fiber_per_100g,
      source,
      confidence,
      updated_at,
      serving_grams,
      serving_label,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      source_type,
      source_ref,
      is_primary
    )
    VALUES (
      p_food_id,
      CASE WHEN v_scale IS NULL THEN NULL ELSE ROUND(COALESCE(p_calories, 0) * v_scale, 2) END,
      CASE WHEN v_scale IS NULL THEN NULL ELSE ROUND(COALESCE(p_protein, 0) * v_scale, 2) END,
      CASE WHEN v_scale IS NULL THEN NULL ELSE ROUND(COALESCE(p_carbs, 0) * v_scale, 2) END,
      CASE WHEN v_scale IS NULL THEN NULL ELSE ROUND(COALESCE(p_fat, 0) * v_scale, 2) END,
      CASE WHEN v_scale IS NULL OR p_fiber IS NULL THEN NULL ELSE ROUND(COALESCE(p_fiber, 0) * v_scale, 2) END,
      COALESCE(p_source_type, 'manual'),
      COALESCE(p_confidence, 1),
      NOW(),
      COALESCE(p_serving_grams, 100),
      COALESCE(p_serving_label, '100g'),
      COALESCE(p_calories, 0),
      COALESCE(p_protein, 0),
      COALESCE(p_carbs, 0),
      COALESCE(p_fat, 0),
      p_fiber,
      COALESCE(p_source_type, 'manual'),
      p_source_ref,
      COALESCE(p_is_primary, TRUE)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_portion_upsert(
  p_food_id BIGINT,
  p_label TEXT,
  p_grams NUMERIC,
  p_quantity_value NUMERIC DEFAULT 1,
  p_quantity_unit TEXT DEFAULT NULL,
  p_portion_type TEXT DEFAULT 'serving',
  p_source_type TEXT DEFAULT 'manual',
  p_confidence NUMERIC DEFAULT 1,
  p_is_default BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portion_id BIGINT;
  v_label TEXT := NULLIF(TRIM(COALESCE(p_label, '')), '');
  v_label_norm TEXT;
BEGIN
  PERFORM public.require_current_admin();

  IF p_food_id IS NULL THEN
    RAISE EXCEPTION 'food_id is required';
  END IF;

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'portion label is required';
  END IF;

  v_label_norm := public.normalize_food_text(v_label);

  IF COALESCE(p_is_default, FALSE) THEN
    UPDATE public.food_portions
    SET is_default = FALSE
    WHERE food_id = p_food_id;
  END IF;

  SELECT fp.id
  INTO v_portion_id
  FROM public.food_portions fp
  WHERE fp.food_id = p_food_id
    AND fp.label_norm = v_label_norm
  LIMIT 1;

  IF v_portion_id IS NULL THEN
    INSERT INTO public.food_portions (
      food_id,
      label,
      label_norm,
      grams,
      is_verified,
      created_at,
      quantity_value,
      quantity_unit,
      portion_type,
      source_type,
      confidence,
      is_default
    )
    VALUES (
      p_food_id,
      v_label,
      v_label_norm,
      p_grams,
      TRUE,
      NOW(),
      COALESCE(p_quantity_value, 1),
      p_quantity_unit,
      COALESCE(p_portion_type, 'serving'),
      COALESCE(p_source_type, 'manual'),
      COALESCE(p_confidence, 1),
      COALESCE(p_is_default, FALSE)
    )
    RETURNING id INTO v_portion_id;
  ELSE
    UPDATE public.food_portions
    SET
      label = v_label,
      label_norm = v_label_norm,
      grams = p_grams,
      is_verified = TRUE,
      quantity_value = COALESCE(p_quantity_value, quantity_value, 1),
      quantity_unit = COALESCE(p_quantity_unit, quantity_unit),
      portion_type = COALESCE(p_portion_type, portion_type, 'serving'),
      source_type = COALESCE(p_source_type, source_type, 'manual'),
      confidence = COALESCE(p_confidence, confidence, 1),
      is_default = COALESCE(p_is_default, is_default, FALSE)
    WHERE id = v_portion_id;
  END IF;

  RETURN v_portion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_candidate_promote(
  p_candidate_id BIGINT,
  p_name TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_food_type TEXT DEFAULT NULL,
  p_brand_name TEXT DEFAULT NULL,
  p_serving_label TEXT DEFAULT '100g',
  p_serving_grams NUMERIC DEFAULT 100,
  p_calories NUMERIC DEFAULT 0,
  p_protein NUMERIC DEFAULT 0,
  p_carbs NUMERIC DEFAULT 0,
  p_fat NUMERIC DEFAULT 0,
  p_aliases TEXT[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate RECORD;
  v_food_id BIGINT;
  v_alias TEXT;
BEGIN
  PERFORM public.require_current_admin();

  SELECT *
  INTO v_candidate
  FROM public.food_candidates
  WHERE id = p_candidate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'food_candidate % not found', p_candidate_id;
  END IF;

  v_food_id := public.admin_food_upsert(
    NULL,
    COALESCE(NULLIF(TRIM(COALESCE(p_name, '')), ''), v_candidate.suggested_food_name, v_candidate.raw_name),
    p_category,
    COALESCE(p_food_type, public.resolve_food_type(COALESCE(p_name, v_candidate.raw_name), p_brand_name)),
    p_brand_name,
    p_serving_grams,
    p_serving_label,
    'candidate_promotion',
    COALESCE(v_candidate.match_confidence, 0.8),
    CONCAT('Promoted from candidate #', p_candidate_id),
    TRUE
  );

  PERFORM public.admin_food_nutrition_upsert(
    v_food_id,
    p_serving_label,
    p_serving_grams,
    p_calories,
    p_protein,
    p_carbs,
    p_fat,
    NULL,
    'candidate_promotion',
    CONCAT('food_candidate:', p_candidate_id),
    COALESCE(v_candidate.match_confidence, 0.8),
    TRUE
  );

  IF p_serving_label IS NOT NULL AND p_serving_grams IS NOT NULL THEN
    PERFORM public.admin_food_portion_upsert(
      v_food_id,
      p_serving_label,
      p_serving_grams,
      1,
      NULL,
      'serving',
      'candidate_promotion',
      COALESCE(v_candidate.match_confidence, 0.8),
      TRUE
    );
  END IF;

  PERFORM public.admin_food_alias_upsert(v_food_id, v_candidate.raw_name, 'candidate_raw', TRUE, 'candidate_promotion', COALESCE(v_candidate.match_confidence, 0.8));

  IF v_candidate.normalized_name IS NOT NULL AND v_candidate.normalized_name <> public.normalize_food_text(v_candidate.raw_name) THEN
    PERFORM public.admin_food_alias_upsert(v_food_id, v_candidate.normalized_name, 'candidate_norm', FALSE, 'candidate_promotion', COALESCE(v_candidate.match_confidence, 0.8));
  END IF;

  IF p_aliases IS NOT NULL THEN
    FOREACH v_alias IN ARRAY p_aliases
    LOOP
      IF NULLIF(TRIM(COALESCE(v_alias, '')), '') IS NOT NULL THEN
        PERFORM public.admin_food_alias_upsert(v_food_id, v_alias, 'manual_alias', FALSE, 'candidate_promotion', COALESCE(v_candidate.match_confidence, 0.8));
      END IF;
    END LOOP;
  END IF;

  UPDATE public.food_candidates
  SET
    match_food_id = v_food_id,
    match_confidence = COALESCE(match_confidence, 1),
    status = 'promoted',
    promotion_status = 'promoted',
    last_seen_at = NOW()
  WHERE id = p_candidate_id;

  IF NOT EXISTS (SELECT 1 FROM public.food_usage_stats fus WHERE fus.food_id = v_food_id) THEN
    INSERT INTO public.food_usage_stats (food_id, total_logs, unique_users, last_used_at, popularity_score)
    VALUES (v_food_id, 0, 0, NOW(), 0);
  END IF;

  RETURN v_food_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_csv_import_dry_run(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_name TEXT;
  v_brand TEXT;
  v_serving_label TEXT;
  v_serving_grams NUMERIC;
  v_existing_id BIGINT;
  v_preview JSONB := '[]'::JSONB;
  v_total INTEGER := 0;
  v_valid INTEGER := 0;
  v_errors INTEGER := 0;
  v_duplicates INTEGER := 0;
  v_new INTEGER := 0;
BEGIN
  PERFORM public.require_current_admin();

  IF COALESCE(JSONB_TYPEOF(p_rows), '') <> 'array' THEN
    RAISE EXCEPTION 'CSV rows payload must be a JSON array';
  END IF;

  FOR v_row IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_rows)
  LOOP
    v_total := v_total + 1;
    v_name := NULLIF(TRIM(COALESCE(v_row ->> 'food_name', '')), '');
    v_brand := NULLIF(TRIM(COALESCE(v_row ->> 'brand_name', '')), '');
    v_serving_label := NULLIF(TRIM(COALESCE(v_row ->> 'serving_label', '')), '');
    v_serving_grams := NULLIF(TRIM(COALESCE(v_row ->> 'serving_grams', '')), '')::NUMERIC;

    IF v_name IS NULL THEN
      v_errors := v_errors + 1;
      IF JSONB_ARRAY_LENGTH(v_preview) < 50 THEN
        v_preview := v_preview || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
          'row_number', v_total,
          'status', 'error',
          'message', 'food_name is required'
        ));
      END IF;
      CONTINUE;
    END IF;

    SELECT f.id
    INTO v_existing_id
    FROM public.foods f
    WHERE f.name_norm = public.normalize_food_text(v_name)
      AND COALESCE(LOWER(f.brand_name), '') = COALESCE(LOWER(v_brand), '')
    LIMIT 1;

    v_valid := v_valid + 1;
    IF v_existing_id IS NULL THEN
      v_new := v_new + 1;
    ELSE
      v_duplicates := v_duplicates + 1;
    END IF;

    IF JSONB_ARRAY_LENGTH(v_preview) < 50 THEN
      v_preview := v_preview || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
        'row_number', v_total,
        'food_name', v_name,
        'brand_name', v_brand,
        'serving_label', v_serving_label,
        'serving_grams', v_serving_grams,
        'status', CASE WHEN v_existing_id IS NULL THEN 'new' ELSE 'existing' END,
        'existing_food_id', v_existing_id
      ));
    END IF;
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'total_rows', v_total,
    'valid_count', v_valid,
    'error_count', v_errors,
    'duplicate_count', v_duplicates,
    'new_count', v_new,
    'preview', v_preview
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_food_csv_import_commit(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_food_id BIGINT;
  v_existing_id BIGINT;
  v_alias TEXT;
  v_aliases TEXT[];
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_skipped INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  PERFORM public.require_current_admin();

  IF COALESCE(JSONB_TYPEOF(p_rows), '') <> 'array' THEN
    RAISE EXCEPTION 'CSV rows payload must be a JSON array';
  END IF;

  FOR v_row IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_rows)
  LOOP
    DECLARE
      row_name TEXT := NULLIF(TRIM(COALESCE(v_row ->> 'food_name', '')), '');
      row_category TEXT := NULLIF(TRIM(COALESCE(v_row ->> 'category', '')), '');
      row_brand TEXT := NULLIF(TRIM(COALESCE(v_row ->> 'brand_name', '')), '');
      row_serving_label TEXT := NULLIF(TRIM(COALESCE(v_row ->> 'serving_label', '')), '');
      row_serving_grams NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'serving_grams', '')), '')::NUMERIC, 100);
      row_calories NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'calories', '')), '')::NUMERIC, 0);
      row_protein NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'protein', '')), '')::NUMERIC, 0);
      row_carbs NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'carbs', '')), '')::NUMERIC, 0);
      row_fat NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'fat', '')), '')::NUMERIC, 0);
      row_source_type TEXT := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'source_type', '')), ''), 'manual_csv');
      row_confidence NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(v_row ->> 'confidence', '')), '')::NUMERIC, 1);
      row_alias_list TEXT := COALESCE(v_row ->> 'alias_list', '');
    BEGIN
      v_total := v_total + 1;

      IF row_name IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT f.id
      INTO v_existing_id
      FROM public.foods f
      WHERE f.name_norm = public.normalize_food_text(row_name)
        AND COALESCE(LOWER(f.brand_name), '') = COALESCE(LOWER(row_brand), '')
      LIMIT 1;

      v_food_id := public.admin_food_upsert(
        v_existing_id,
        row_name,
        row_category,
        public.resolve_food_type(row_name, row_brand),
        row_brand,
        row_serving_grams,
        row_serving_label,
        row_source_type,
        row_confidence,
        'Imported from CSV',
        TRUE
      );

      PERFORM public.admin_food_nutrition_upsert(
        v_food_id,
        COALESCE(row_serving_label, '100g'),
        row_serving_grams,
        row_calories,
        row_protein,
        row_carbs,
        row_fat,
        NULL,
        row_source_type,
        'csv_import',
        row_confidence,
        TRUE
      );

      PERFORM public.admin_food_portion_upsert(
        v_food_id,
        COALESCE(row_serving_label, '100g'),
        row_serving_grams,
        1,
        NULL,
        CASE WHEN COALESCE(row_serving_label, '') ILIKE '%ml%' THEN 'volume' ELSE 'serving' END,
        row_source_type,
        row_confidence,
        TRUE
      );

      PERFORM public.admin_food_alias_upsert(v_food_id, row_name, 'canonical_name', TRUE, row_source_type, row_confidence);

      IF NULLIF(TRIM(row_alias_list), '') IS NOT NULL THEN
        v_aliases := STRING_TO_ARRAY(row_alias_list, ',');
        FOREACH v_alias IN ARRAY v_aliases
        LOOP
          IF NULLIF(TRIM(COALESCE(v_alias, '')), '') IS NOT NULL THEN
            PERFORM public.admin_food_alias_upsert(v_food_id, TRIM(v_alias), 'csv_alias', FALSE, row_source_type, row_confidence);
          END IF;
        END LOOP;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.food_usage_stats fus WHERE fus.food_id = v_food_id) THEN
        INSERT INTO public.food_usage_stats (food_id, total_logs, unique_users, last_used_at, popularity_score)
        VALUES (v_food_id, 0, 0, NOW(), 0);
      END IF;

      IF v_existing_id IS NULL THEN
        v_inserted := v_inserted + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    END;
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'total_rows', v_total,
    'inserted_count', v_inserted,
    'updated_count', v_updated,
    'skipped_count', v_skipped
  );
END;
$$;
