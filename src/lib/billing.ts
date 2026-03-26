export type PlanTier = "free" | "pro" | "lifetime";

export type BillingSku =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "lifetime";

export type BillingOffer = {
  sku: BillingSku;
  tier: PlanTier;
  days: number | null;
  priceVnd: number;
  label: string;
  shortLabel: string;
  description: string;
  highlighted?: boolean;
  badge?: string;
};

export const LIFETIME_SENTINEL_ISO = "2099-12-31T23:59:59.000Z";
export const MARKETING_SKUS: BillingSku[] = ["monthly", "lifetime"];

export const BILLING_OFFERS: Record<BillingSku, BillingOffer> = {
  weekly: {
    sku: "weekly",
    tier: "pro",
    days: 7,
    priceVnd: 39000,
    label: "Pro 7 ngày",
    shortLabel: "Pro tuần",
    description: "Gói ngắn hạn để thử CaloTrack trong 7 ngày.",
  },
  monthly: {
    sku: "monthly",
    tier: "pro",
    days: 30,
    priceVnd: 99000,
    label: "Pro 30 ngày",
    shortLabel: "Pro tháng",
    description: "Gói Pro tiêu chuẩn để theo dõi bữa ăn đều đặn mỗi ngày.",
    highlighted: true,
    badge: "Phổ biến nhất",
  },
  quarterly: {
    sku: "quarterly",
    tier: "pro",
    days: 90,
    priceVnd: 239000,
    label: "Pro 90 ngày",
    shortLabel: "Pro quý",
    description: "Tiết kiệm hơn khi dùng theo quý.",
  },
  yearly: {
    sku: "yearly",
    tier: "pro",
    days: 365,
    priceVnd: 799000,
    label: "Pro 365 ngày",
    shortLabel: "Pro năm",
    description: "Phù hợp cho người dùng dài hạn.",
  },
  lifetime: {
    sku: "lifetime",
    tier: "lifetime",
    days: null,
    priceVnd: 990000,
    label: "Lifetime",
    shortLabel: "Lifetime",
    description: "Thanh toán một lần, dùng dài hạn với toàn bộ quyền lợi trả phí.",
    badge: "Thanh toán một lần",
  },
};

export const BILLING_SKU_OPTIONS = Object.values(BILLING_OFFERS);

export function resolveTierFromSku(sku: BillingSku): PlanTier {
  return BILLING_OFFERS[sku].tier;
}

export function resolveOffer(sku: BillingSku): BillingOffer {
  return BILLING_OFFERS[sku];
}

export function computePremiumUntil(
  sku: BillingSku,
  currentPremiumUntil?: string | null,
  now = new Date(),
): string | null {
  if (sku === "lifetime") {
    return LIFETIME_SENTINEL_ISO;
  }

  const days = BILLING_OFFERS[sku].days ?? 0;
  const current =
    currentPremiumUntil && new Date(currentPremiumUntil) > now
      ? new Date(currentPremiumUntil)
      : now;
  return new Date(current.getTime() + days * 86400 * 1000).toISOString();
}

export function normalizePlanTier(value: string | null | undefined): PlanTier {
  if (value === "lifetime") return "lifetime";
  if (value === "pro") return "pro";
  return "free";
}

export function formatTierLabel(tier: PlanTier): string {
  if (tier === "lifetime") return "Lifetime";
  if (tier === "pro") return "Pro";
  return "Free";
}

export function describeTier(tier: PlanTier): string {
  if (tier === "lifetime") return "Thanh toán một lần, dùng dài hạn.";
  if (tier === "pro") return "Ưu tiên trải nghiệm trả phí và entitlement có thời hạn.";
  return "Bắt đầu miễn phí với giới hạn dùng hàng ngày.";
}

export function formatBillingPriceVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function formatBillingSkuLabel(sku: BillingSku): string {
  return BILLING_OFFERS[sku].label;
}

export function getBillingCheckoutLabel(sku: BillingSku): string {
  if (sku === "monthly") return `Nâng cấp Pro ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  if (sku === "lifetime") return `Mở Lifetime ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  if (sku === "weekly") return `Dùng thử Pro ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  return `Chọn ${BILLING_OFFERS[sku].shortLabel}`;
}

export function getBillingTierBadge(tier: PlanTier): string {
  if (tier === "lifetime") return "One-time";
  if (tier === "pro") return "Priority";
  return "Free tier";
}

export function getBillingProviderSummary(): string {
  return "PayOS • VietQR • Chuyển khoản • Stripe";
}

export function getFreeDailyLimit(): number {
  return 5;
}
