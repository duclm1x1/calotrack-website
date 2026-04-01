export type PlanTier = "free" | "pro" | "lifetime";

export type BillingSku =
  | "weekly"
  | "monthly"
  | "quarterly"
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

export type CheckoutProviderOption = {
  value: PublicCheckoutProvider;
  label: string;
  helper: string;
  accent: "primary" | "accent" | "neutral";
};

export const LIFETIME_SENTINEL_ISO = "2099-12-31T23:59:59.000Z";
export const MARKETING_SKUS: BillingSku[] = ["monthly", "lifetime"];
export const PUBLIC_CHECKOUT_SKUS: BillingSku[] = ["monthly", "lifetime"];

export const BILLING_OFFERS: Record<BillingSku, BillingOffer> = {
  weekly: {
    sku: "weekly",
    tier: "pro",
    days: 7,
    priceVnd: 39000,
    label: "Pro 7 ngày",
    shortLabel: "Pro tuần",
    description: "Gói ngắn hạn để trải nghiệm CaloTrack trong 7 ngày.",
  },
  monthly: {
    sku: "monthly",
    tier: "pro",
    days: 30,
    priceVnd: 89000,
    label: "Pro 30 ngày",
    shortLabel: "Pro tháng",
    description: "Gói Pro tiêu chuẩn để mở khóa toàn bộ tính năng theo tháng.",
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
    description: "Tiết kiệm hơn khi dùng theo chu kỳ quý.",
  },
  yearly: {
    sku: "yearly",
    tier: "pro",
    days: 365,
    priceVnd: 889000,
    label: "Pro 365 ngày",
    shortLabel: "Pro năm",
    description: "Tiết kiệm hơn khi đăng ký trọn gói 1 năm sử dụng.",
  },
  lifetime: {
    sku: "lifetime",
    tier: "lifetime",
    days: null,
    priceVnd: 1980000,
    label: "Lifetime",
    shortLabel: "Lifetime",
    description: "Đầu tư một lần, sử dụng CaloTrack trọn đời.",
    badge: "One-time",
  },
};

export const BILLING_SKU_OPTIONS = Object.values(BILLING_OFFERS);

export const PUBLIC_PLAN_CARDS: PublicPlanCard[] = [
  {
    id: "free",
    plan: "free",
    label: "Free",
    priceLabel: "0đ",
    helper: "Làm quen với việc theo dõi bữa ăn nhanh chóng trong 7 ngày.",
    defaultSku: null,
    badge: "Start free",
    features: [
      "Trải nghiệm AI miễn phí trong 7 ngày",
      "Giới hạn 2 lượt phân tích ảnh mỗi ngày",
      "Giới hạn 5 lượt tin nhắn mỗi ngày",
      "Không có Dashboard phân tích sâu",
    ],
  },
  {
    id: "monthly",
    plan: "pro",
    label: "Pro Tháng",
    priceLabel: `${formatBillingPriceVnd(BILLING_OFFERS.monthly.priceVnd)} / tháng`,
    helper: "Nâng cấp trải nghiệm toàn diện.",
    defaultSku: "monthly",
    badge: "Phổ biến nhất",
    features: [
      "Không giới hạn AI tracking",
      "Gym mode chuyên sâu cho tập luyện",
      "Log tuần, log tháng và báo cáo chi tiết",
      "Hỗ trợ tính toán định mức dinh dưỡng",
    ],
  },
  {
    id: "yearly",
    plan: "pro",
    label: "Pro Năm",
    priceLabel: `${formatBillingPriceVnd(BILLING_OFFERS.yearly.priceVnd)} / năm`,
    helper: "Tiết kiệm tối đa cho việc duy trì vóc dáng.",
    defaultSku: "yearly",
    badge: "Giá ưu đãi nhất",
    features: [
      "Bao gồm toàn bộ tính năng Pro",
      "Gym mode, báo cáo tuần & tháng",
      "Hỗ trợ tính toán định mức dinh dưỡng chi tiết",
      "Chỉ khoảng ~74k/tháng siêu tiết kiệm",
    ],
  },
  {
    id: "lifetime",
    plan: "lifetime",
    label: "Lifetime",
    priceLabel: `${formatBillingPriceVnd(BILLING_OFFERS.lifetime.priceVnd)} một lần`,
    helper: "Số lượng có hạn. Mua một lần, sử dụng vĩnh viễn không cần gia hạn.",
    defaultSku: "lifetime",
    badge: "Chỉ 50 slot",
    features: [
      "Thanh toán duy nhất một lần",
      "Mở khóa vĩnh viễn mọi chức năng",
      "Gym mode, log tuần tháng, nutrition",
      "Hưởng ưu đãi cho toàn bộ tính năng AI mới",
    ],
  },
];

export const PUBLIC_CHECKOUT_PROVIDERS: CheckoutProviderOption[] = [
  {
    value: "momo",
    label: "MoMo",
    helper: "Redirect sang ví MoMo, backend xác nhận bằng IPN và auto-activate khi merchant setup xong.",
    accent: "primary",
  },
  {
    value: "bank_transfer",
    label: "Techcombank chuyển khoản",
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
  if (tier === "lifetime") return "One-time payment, giữ entitlement dài hạn theo customer.";
  if (tier === "pro") return "Mở quota AI cao hơn, analytics tốt hơn và support ưu tiên.";
  return "Bắt đầu miễn phí với quota hằng ngày vừa đủ để trải nghiệm.";
}

export function formatBillingPriceVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function formatBillingSkuLabel(sku: BillingSku): string {
  return BILLING_OFFERS[sku].label;
}

export function getBillingCheckoutLabel(sku: BillingSku): string {
  if (sku === "monthly") {
    return `Nâng cấp Pro ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "lifetime") {
    return `Mở Lifetime ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  if (sku === "weekly") {
    return `Dùng thử Pro ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
  }
  return `Chọn ${BILLING_OFFERS[sku].shortLabel}`;
}

export function getBillingTierBadge(tier: PlanTier): string {
  if (tier === "lifetime") return "One-time";
  if (tier === "pro") return "Priority";
  return "Free tier";
}

export function getBillingProviderSummary(): string {
  return "MoMo • Techcombank chuyển khoản";
}

export function getFreeDailyLimit(): number {
  return 5;
}
