export type PlanTier = "free" | "pro" | "lifetime";

export type BillingSku =
  | "weekly"
  | "monthly"
  | "quarterly_promo"
  | "four_months"
  | "yearly"
  | "lifetime";

export type PublicCheckoutProvider = "momo" | "bank_transfer";

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

export type PublicPlanCard = {
  id: string;
  plan: PlanTier;
  label: string;
  priceLabel: string;
  helper: string;
  defaultSku: BillingSku | null;
  badge?: string;
  features: string[];
};

export type PublicProCadenceOption = {
  sku: BillingSku;
  label: string;
  priceLabel: string;
  helper: string;
  badge?: string;
};

export type CheckoutProviderOption = {
  value: PublicCheckoutProvider;
  label: string;
  helper: string;
  accent: "primary" | "accent" | "neutral";
};

export const LIFETIME_SENTINEL_ISO = "2099-12-31T23:59:59.000Z";
export const MARKETING_SKUS: BillingSku[] = ["monthly", "quarterly_promo", "four_months", "yearly", "lifetime"];
export const PUBLIC_CHECKOUT_SKUS: BillingSku[] = ["monthly", "quarterly_promo", "four_months", "yearly", "lifetime"];

export const BILLING_OFFERS: Record<BillingSku, BillingOffer> = {
  weekly: {
    sku: "weekly",
    tier: "pro",
    days: 7,
    priceVnd: 39000,
    label: "Pro 7 ngày",
    shortLabel: "Pro tuần",
    description: "Legacy offer giữ để tương thích với dữ liệu cũ.",
  },
  monthly: {
    sku: "monthly",
    tier: "pro",
    days: 30,
    priceVnd: 89000,
    label: "Pro 1 tháng",
    shortLabel: "Pro tháng",
    description: "Chu kỳ linh hoạt để bắt đầu nhanh và nâng cấp ngay trong chat.",
  },
  quarterly_promo: {
    sku: "quarterly_promo",
    tier: "pro",
    days: 90,
    priceVnd: 89000,
    label: "Pro 3 tháng (Lần đầu)",
    shortLabel: "Pro 3 tháng",
    description: "Gói ưu đãi lần đầu cho người dùng mới để kích cầu.",
    highlighted: true,
    badge: "Mua lần đầu",
  },
  four_months: {
    sku: "four_months",
    tier: "pro",
    days: 120,
    priceVnd: 289000,
    label: "Pro 4 tháng",
    shortLabel: "Pro 4 tháng",
    description: "Bán theo chu kỳ trung hạn, giá 72.25k/tháng.",
  },
  yearly: {
    sku: "yearly",
    tier: "pro",
    days: 365,
    priceVnd: 489000,
    label: "Pro 12 tháng",
    shortLabel: "Pro năm",
    description: "Mức tối ưu chi phí cho lộ trình nguyên năm (chuẩn bị body hè dài hạn).",
    badge: "Chỉ 40.75k/tháng",
  },
  lifetime: {
    sku: "lifetime",
    tier: "lifetime",
    days: null,
    priceVnd: 1890000,
    label: "Lifetime",
    shortLabel: "Lifetime",
    description: "Mua một lần, giữ entitlement dài hạn trên customer.",
    badge: "Chỉ 50 slot",
  },
};

export const BILLING_SKU_OPTIONS = Object.values(BILLING_OFFERS);

export const PUBLIC_PLAN_CARDS: PublicPlanCard[] = [
  {
    id: "free",
    plan: "free",
    label: "Free",
    priceLabel: "0đ",
    helper: "Dùng hằng ngày với logging, dashboard và quota AI vừa đủ trước khi cần nâng cấp sâu hơn.",
    defaultSku: null,
    badge: "Dùng thử",
    features: [
      "4 lượt phân tích ảnh mỗi ngày",
      "20 lượt tin nhắn mỗi ngày",
      "Giữ đủ flow cốt lõi: log món, stats, water, weight và chat cơ bản",
    ],
  },
  {
    id: "pro",
    plan: "pro",
    label: "Pro",
    priceLabel: "Từ 89.000đ / tháng",
    helper: "Một tier Pro duy nhất với nhiều lựa chọn linh hoạt (1-3-4-12 tháng).",
    defaultSku: "quarterly_promo",
    badge: "Phổ biến nhất",
    features: [
      "Theo dõi bữa ăn qua chat và ảnh",
      "Dashboard ngày / tuần / tháng đầy đủ",
      "Cập nhật cân nặng và tiến độ",
      "Gym mode và coach chuyên sâu",
    ],
  },
  {
    id: "lifetime",
    plan: "lifetime",
    label: "Lifetime",
    priceLabel: "1.890.000đ / một lần",
    helper: "Phù hợp nếu bạn muốn chốt entitlement dài hạn.",
    defaultSku: "lifetime",
    badge: "Giới hạn 50 slot",
    features: [
      "Không cần gia hạn định kỳ",
      "Mua 1 lần dùng mãi mãi",
    ],
  },
];

export const PUBLIC_PRO_CADENCE_OPTIONS: PublicProCadenceOption[] = [
  {
    sku: "monthly",
    label: "1 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.monthly.priceVnd),
    helper: "Linh hoạt.",
  },
  {
    sku: "quarterly_promo",
    label: "3 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.quarterly_promo.priceVnd),
    helper: "Lần đầu (mua kích cầu).",
    badge: "Khuyên dùng",
  },
  {
    sku: "four_months",
    label: "4 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.four_months.priceVnd),
    helper: "Bán theo quý (72.25k/th).",
  },
  {
    sku: "yearly",
    label: "12 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.yearly.priceVnd),
    helper: "Năm (40.75k/th).",
    badge: "Giá tốt nhất",
  },
];

export const PUBLIC_CHECKOUT_PROVIDERS: CheckoutProviderOption[] = [
  {
    value: "momo",
    label: "MoMo",
    helper: "Redirect sang ví MoMo, backend xác nhận bằng IPN và tự kích hoạt khi merchant setup xong.",
    accent: "primary",
  },
  {
    value: "bank_transfer",
    label: "Chuyển khoản Ngân Hàng",
    helper: "VietQR + mã đơn hàng để đối soát và kích hoạt tự động.",
    accent: "neutral",
  },
];

export function resolveTierFromSku(sku: BillingSku): PlanTier {
  return BILLING_OFFERS[sku].tier;
}

export function resolveOffer(sku: BillingSku): BillingOffer {
  return BILLING_OFFERS[sku];
}

export function getDefaultSkuForTier(tier: PlanTier): BillingSku | null {
  if (tier === "free") return null;
  if (tier === "lifetime") return "lifetime";
  return "monthly";
}

export function normalizePublicBillingSku(
  value: string | null | undefined,
  options?: { plan?: PlanTier | null },
): BillingSku | null {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (!text) {
    return options?.plan === "lifetime" ? "lifetime" : null;
  }

  const aliases: Record<string, BillingSku> = {
    week: "weekly",
    weekly: "weekly",
    month: "monthly",
    monthly: "monthly",
    quarter: "quarterly_promo",
    quarterly: "quarterly_promo",
    quarterly_promo: "quarterly_promo",
    three_months: "quarterly_promo",
    "3_months": "quarterly_promo",
    four_months: "four_months",
    "4_months": "four_months",
    year: "yearly",
    yearly: "yearly",
    annual: "yearly",
    lifetime: "lifetime",
  };

  const normalized = aliases[text] || (PUBLIC_CHECKOUT_SKUS.includes(text as BillingSku) ? (text as BillingSku) : null);
  if (!normalized) return null;
  if (options?.plan === "lifetime") return "lifetime";
  if (options?.plan === "free") return null;
  return normalized;
}

export function getBillingDurationDays(sku: BillingSku): number {
  if (sku === "lifetime") return 36500;
  return BILLING_OFFERS[sku].days ?? 0;
}

export function getPlanCard(tier: PlanTier): PublicPlanCard {
  return PUBLIC_PLAN_CARDS.find((card) => card.plan === tier) ?? PUBLIC_PLAN_CARDS[0];
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
  if (tier === "lifetime") return "Thanh toán một lần, giữ entitlement dài hạn theo customer.";
  if (tier === "pro") return "Mở quota cao hơn, analytics tốt hơn, gym mode đầy đủ và support nhanh hơn.";
  return "Bắt đầu miễn phí với flow cốt lõi đủ dùng hằng ngày, còn lane AI nặng sẽ có hạn mức nhẹ.";
}

export function formatBillingPriceVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function formatBillingSkuLabel(sku: BillingSku): string {
  return BILLING_OFFERS[sku].label;
}

export function getBillingCheckoutLabel(sku: BillingSku): string {
  if (sku === "monthly") {
    return `Chọn Pro 1 tháng ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "quarterly_promo") {
    return `Kích hoạt gói 3 tháng ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "four_months") {
    return `Chọn Pro 4 tháng ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "yearly") {
    return `Chọn Pro 12 tháng ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "lifetime") {
    return `Mở Lifetime ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "weekly") {
    return `Dùng thử Pro ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  return `Chọn ${(BILLING_OFFERS as any)[sku]?.shortLabel || "gói này"}`;
}

export function getBillingTierBadge(tier: PlanTier): string {
  if (tier === "lifetime") return "One-time";
  if (tier === "pro") return "Priority";
  return "Free tier";
}

export function getBillingProviderSummary(): string {
  return "MoMo • Chuyển khoản Ngân Hàng";
}

export function getFreeDailyLimit(): number {
  return 20;
}

export function getFreeImageDailyLimit(): number {
  return 4;
}
