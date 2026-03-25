-- ============================================================
-- Calo Track SaaS: Admin Panel Migration
-- Run once in Supabase SQL Editor
-- ============================================================

-- Add premium control columns to existing `users` table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS premium_plan TEXT DEFAULT 'free' CHECK (premium_plan IN ('free', 'weekly', 'monthly', 'yearly', 'lifetime')),
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;

-- Sync is_premium based on expiry (convenience)
-- When you update premium_expires_at, also set is_premium = true/false in app code

-- ============================================================
-- PAYMENT HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,               -- VNĐ amount (e.g. 129000)
  plan TEXT NOT NULL,                    -- 'weekly'|'monthly'|'yearly'|'lifetime'
  days_added INTEGER NOT NULL,           -- How many days were added
  payment_method TEXT DEFAULT 'bank_transfer',
  transaction_code TEXT,                 -- Bank transfer code e.g. FT221345
  note TEXT,                             -- Admin manual note
  created_by TEXT DEFAULT 'system',      -- Admin email or 'system' for auto
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_payment_history_user ON public.payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_date ON public.payment_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- Service role (n8n / API) can do everything
CREATE POLICY "Service role full access" ON public.payment_history
  FOR ALL USING (true) WITH CHECK (true);
