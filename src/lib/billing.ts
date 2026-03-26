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
    priceVnd: 99000,
    label: "Pro 30 ngày",
    shortLabel: "Pro tháng",
    description: "Gói Pro tiêu chuẩn để dùng AI nutrition và dashboard chi tiết mỗi ngày.",
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
    priceVnd: 799000,
    label: "Pro 365 ngày",
    shortLabel: "Pro năm",
    description: "Gói dài hạn cho người dùng muốn tracking nghiêm túc quanh năm.",
  },
  lifetime: {
    sku: "lifetime",
    tier: "lifetime",
    days: null,
    priceVnd: 990000,
    label: "Lifetime",
    shortLabel: "Lifetime",
    description: "Thanh toán một lần, giữ entitlement dài hạn ở cấp customer.",
    badge: "One-time",
  },
};

export const BILLING_SKU_OPTIONS = Object.values(BILLING_OFFERS);

export const PUBLIC_PLAN_CARDS: PublicPlanCard[] = [
  {
    plan: "free",
    label: "Free",
    priceLabel: "0đ",
    helper: "Bắt đầu miễn phí để làm quen flow tracking.",
    defaultSku: null,
    badge: "Start free",
    features: [
      "Log bữa ăn cơ bản",
      `Giới hạn ${getFreeDailyLimit()} lượt AI mỗi ngày`,
      "Không có advanced analytics",
      "Không export dữ liệu",
    ],
  },
  {
    plan: "pro",
    label: "Pro",
    priceLabel: `${formatBillingPriceVnd(BILLING_OFFERS.monthly.priceVnd)} / tháng`,
    helper: "Nâng quota AI và mở dashboard, progress insight, export.",
    defaultSku: "monthly",
    badge: "Telegram-first",
    features: [
      "AI meal analysis quota cao hơn",
      "Meal plan cá nhân hóa",
      "Dashboard calories và macro chi tiết",
      "Export PDF / CSV",
      "Priority support",
    ],
  },
  {
    plan: "lifetime",
    label: "Lifetime",
    priceLabel: `${formatBillingPriceVnd(BILLING_OFFERS.lifetime.priceVnd)} một lần`,
    helper: "Entitlement dài hạn theo customer, không phụ thuộc renewal.",
    defaultSku: "lifetime",
    badge: "One-time",
    features: [
      "One-time payment",
      "Giữ entitlement theo số điện thoại canonical",
      "Dùng chung trên Telegram, Zalo và portal khi đã link",
      "Phù hợp với heavy users và internal operators",
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
