import { BILLING_OFFERS, getFreeDailyLimit } from "@/lib/billing";

/**
 * Application Constants
 */
export const APP_NAME = "CaloTrack";
export const APP_TAGLINE = "Track Calories with AI";

/**
 * Legacy pricing constants kept for compatibility.
 * Canonical pricing must stay in billing.ts.
 */
export const PLANS = {
  TRIAL: {
    id: "trial",
    name: "Pro 7 Ngay",
    price: BILLING_OFFERS.weekly.priceVnd,
    duration: BILLING_OFFERS.weekly.days ?? 7,
    features: [
      "Full tinh nang Pro trong 7 ngay",
      `Free tier mac dinh ${getFreeDailyLimit()} luot AI/ngay truoc khi nang cap`,
      "Truy cap bot Telegram production",
    ],
    badge: "Dung Thu",
    highlighted: false,
  },
  PRO: {
    id: "pro",
    name: BILLING_OFFERS.monthly.label,
    price: BILLING_OFFERS.monthly.priceVnd,
    duration: BILLING_OFFERS.monthly.days ?? 30,
    features: [
      "Phan tich AI va bot usage theo billing source of truth",
      "Entitlement tier Pro cho payment online va admin fallback",
      "Priority support va higher usage policy",
    ],
    badge: "Best Value",
    highlighted: true,
  },
  LIFETIME: {
    id: "lifetime",
    name: BILLING_OFFERS.lifetime.label,
    price: BILLING_OFFERS.lifetime.priceVnd,
    duration: -1,
    features: [
      "Tat ca tinh nang Pro",
      "Tra mot lan, dung dai han",
      "VIP support va early access",
    ],
    badge: "VIP",
    highlighted: false,
  },
} as const;

/**
 * User Status
 */
export const USER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  EXPIRED: "expired",
  BANNED: "banned",
} as const;

/**
 * Payment Methods
 */
export const PAYMENT_METHODS = {
  STRIPE: "stripe",
  BANK: "bank_transfer",
} as const;

/**
 * Routes
 */
export const ROUTES = {
  HOME: "/",
  PRICING: "/pricing",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  ADMIN: "/admin",
  PRIVACY: "/privacy",
  TERMS: "/terms",
} as const;
