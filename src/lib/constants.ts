/**
 * Application Constants
 */

export const APP_NAME = 'CaloTrack';
export const APP_TAGLINE = 'Track Calories with AI';

/**
 * Pricing Plans
 */
export const PLANS = {
  TRIAL: {
    id: 'trial',
    name: 'Trial 1 Ngày',
    price: 10000,
    duration: 1,
    features: [
      '✅ Full tính năng',
      '✅ 10 lần phân tích AI',
      '✅ Truy cập mọi Bot'
    ],
    badge: 'Dùng Thử',
    highlighted: false
  },
  PRO: {
    id: 'pro',
    name: 'Pro 1 Tháng',
    price: 199000,
    duration: 30,
    features: [
      '✅ Phân tích AI không giới hạn',
      '✅ Streak tracking',
      '✅ Badges & Leaderboard',
      '✅ Priority support'
    ],
    badge: 'Best Value',
    highlighted: true
  },
  LIFETIME: {
    id: 'lifetime',
    name: 'Lifetime',
    price: 1000000,
    duration: -1,
    features: [
      '✅ Tất cả tính năng Pro',
      '✅ Trả 1 lần - Dùng mãi mãi',
      '✅ VIP support',
      '✅ Early access tính năng mới'
    ],
    badge: 'VIP',
    highlighted: false
  }
} as const;

/**
 * User Status
 */
export const USER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  BANNED: 'banned'
} as const;

/**
 * Payment Methods
 */
export const PAYMENT_METHODS = {
  STRIPE: 'stripe',
  BANK: 'bank_transfer'
} as const;

/**
 * Routes
 */
export const ROUTES = {
  HOME: '/',
  PRICING: '/pricing',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  ADMIN: '/admin',
  PRIVACY: '/privacy',
  TERMS: '/terms'
} as const;
