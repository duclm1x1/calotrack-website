/**
 * Database Types
 * These will be auto-generated from Supabase later
 * For now, we define them manually
 */

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
  plan?: string | null;
  status?: string | null;
  expiry_date?: string | null;
  credits?: number | null;
  streak?: number | null;
  stripe_customer_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Joined from user_roles table
  role?: 'user' | 'admin';
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
