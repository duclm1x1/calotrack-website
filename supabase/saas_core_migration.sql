-- Migration: SaaS Core & Quota Management
-- Extends the existing user_management table to support daily bot limits

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_id TEXT UNIQUE,
  scans_used_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_user_management
    FOREIGN KEY(user_id) 
    REFERENCES user_management(id)
    ON DELETE CASCADE
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quotas" ON user_quotas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service Role can update quotas" ON user_quotas
  FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGER: Auto-create user_quotas on new user
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_quota()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_quotas (user_id, telegram_id)
  VALUES (NEW.id, NEW.telegram_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_management_created ON public.user_management;

CREATE TRIGGER on_user_management_created
  AFTER INSERT ON public.user_management
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_quota();
