/**
 * Database Types
 * These will be auto-generated from Supabase later
 * For now, we define them manually
 */

export interface User {
  id: string;
  email: string;
  name: string;
  telegram_id?: string;
  telegram_username?: string;
  plan: 'trial' | 'pro' | 'lifetime' | 'free';
  status: 'pending' | 'active' | 'expired' | 'banned';
  expiry_date?: string;
  credits: number;
  streak: number;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  method: 'stripe' | 'bank_transfer';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  stripe_payment_id?: string;
  bank_transaction_code?: string;
  bank_screenshot_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
 unlocked_at?: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  status: 'pending' | 'completed';
  reward_amount: number;
  created_at: string;
}

export interface UserStats {
  user_id: string;
  total_logs: number;
  current_streak: number;
  longest_streak: number;
  total_calories_tracked: number;
  badges_earned: number;
}
