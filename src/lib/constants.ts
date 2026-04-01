import { BILLING_OFFERS, getFreeDailyLimit, getFreeImageDailyLimit } from "@/lib/billing";

export const APP_NAME = "CaloTrack";
export const APP_TAGLINE = "AI coach theo bữa ăn, calories và tập luyện qua chat";

export const PLANS = {
  FREE: {
    id: "free",
    name: "Free",
    price: 0,
    duration: 0,
    features: [
      `${getFreeImageDailyLimit()} lượt ảnh mỗi ngày`,
      `${getFreeDailyLimit()} lượt tin nhắn mỗi ngày`,
      "Phù hợp để thử flow chat trước khi nâng cấp",
    ],
    badge: "Dùng thử",
    highlighted: false,
  },
  PRO: {
    id: "pro",
    name: "Pro",
    price: BILLING_OFFERS.monthly.priceVnd,
    duration: BILLING_OFFERS.monthly.days ?? 30,
    features: [
      "Dashboard ngày / tuần / tháng",
      "Gym mode và coach chuyên sâu",
      "Quota cao hơn, lịch sử đầy đủ và support nhanh hơn",
    ],
    badge: "Phổ biến nhất",
    highlighted: true,
  },
  LIFETIME: {
    id: "lifetime",
    name: BILLING_OFFERS.lifetime.label,
    price: BILLING_OFFERS.lifetime.priceVnd,
    duration: -1,
    features: [
      "Mở trọn quyền lợi Pro",
      "Thanh toán một lần, không cần gia hạn định kỳ",
      "Giữ entitlement dài hạn theo customer",
    ],
    badge: "Giới hạn slot",
    highlighted: false,
  },
} as const;

export const USER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  EXPIRED: "expired",
  BANNED: "banned",
} as const;

export const PAYMENT_METHODS = {
  STRIPE: "stripe",
  BANK: "bank_transfer",
} as const;

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
