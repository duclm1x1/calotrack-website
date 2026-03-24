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

export const BILLING_OFFERS: Record<BillingSku, BillingOffer> = {
  weekly: {
    sku: "weekly",
    tier: "pro",
    days: 7,
    priceVnd: 39000,
    label: "Pro 7 ngày",
    shortLabel: "Weekly",
    description: "Dùng thử gói Pro trong 7 ngày.",
  },
  monthly: {
    sku: "monthly",
    tier: "pro",
    days: 30,
    priceVnd: 89000,
    label: "Pro 30 ngày",
    shortLabel: "Monthly",
    description: "Gói Pro tiêu chuẩn cho người dùng Telegram-first.",
    highlighted: true,
    badge: "Phổ biến nhất",
  },
  quarterly: {
    sku: "quarterly",
    tier: "pro",
    days: 90,
    priceVnd: 239000,
    label: "Pro 90 ngày",
    shortLabel: "Quarterly",
    description: "Tiết kiệm hơn khi dùng theo quý.",
  },
  yearly: {
    sku: "yearly",
    tier: "pro",
    days: 365,
    priceVnd: 799000,
    label: "Pro 365 ngày",
    shortLabel: "Yearly",
    description: "Phù hợp cho người dùng dài hạn.",
  },
  lifetime: {
    sku: "lifetime",
    tier: "lifetime",
    days: null,
    priceVnd: 1899000,
    label: "Lifetime",
    shortLabel: "Lifetime",
    description: "Thanh toán 1 lần, dùng trọn đời.",
    badge: "Best value",
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

export function getFreeDailyLimit(): number {
  return 5;
}
