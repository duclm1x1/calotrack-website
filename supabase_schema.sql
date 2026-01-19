-- CaloTrack Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USER MANAGEMENT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_management (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  telegram_id TEXT,
  telegram_username TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'trial', 'pro', 'lifetime')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'banned', 'suspended')),
  expiry_date TIMESTAMPTZ,
  credits INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_management(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('stripe', 'bank_transfer')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'disputed')),
  stripe_payment_id TEXT,
  bank_transaction_code TEXT,
  bank_screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BADGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  unlock_condition TEXT
);

-- ============================================
-- USER BADGES (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_management(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- ============================================
-- REFERRALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES user_management(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES user_management(id) ON DELETE SET NULL,
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'reversed')),
  reward_amount INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_telegram ON user_management(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_status ON user_management(status);
CREATE INDEX IF NOT EXISTS idx_user_email ON user_management(email);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_management ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- USER MANAGEMENT POLICIES
-- Users can read their own data
CREATE POLICY "Users can view own data" ON user_management
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own non-sensitive data
CREATE POLICY "Users can update own profile" ON user_management
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users" ON user_management
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_management WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update any user
CREATE POLICY "Admins can update any user" ON user_management
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_management WHERE id = auth.uid() AND role = 'admin')
  );

-- TRANSACTIONS POLICIES
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own transactions (for bank transfer uploads)
CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions" ON transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_management WHERE id = auth.uid() AND role = 'admin')
  );

-- BADGES POLICIES (public read)
CREATE POLICY "Anyone can view badges" ON badges
  FOR SELECT USING (true);

-- USER BADGES POLICIES
CREATE POLICY "Users can view own badges" ON user_badges
  FOR SELECT USING (auth.uid() = user_id);

-- REFERRALS POLICIES
CREATE POLICY "Users can view own referrals" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id);

CREATE POLICY "Users can insert referrals" ON referrals
  FOR INSERT WITH CHECK (auth.uid() = referrer_id);

-- ============================================
-- TRIGGER: Auto-create user_management on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_management (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SEED DATA: Default badges
-- ============================================
INSERT INTO badges (code, name, description, icon, unlock_condition) VALUES
  ('first_log', 'First Log', 'Ghi nhận bữa ăn đầu tiên', '🥇', 'Log 1 meal'),
  ('streak_7', 'Streak 7', 'Duy trì 7 ngày liên tiếp', '🔥', '7 day streak'),
  ('streak_30', 'Streak 30', 'Duy trì 30 ngày liên tiếp', '💪', '30 day streak'),
  ('calorie_master', 'Calorie Master', 'Đạt mục tiêu 7 ngày', '🎯', 'Hit goal 7 days'),
  ('social_butterfly', 'Social Butterfly', 'Mời 3 bạn bè', '🦋', 'Refer 3 friends')
ON CONFLICT (code) DO NOTHING;
