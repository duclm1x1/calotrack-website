export type PlanTier = "free" | "pro" | "lifetime";

export type BillingSku =
  | "weekly"
  | "monthly"
  | "semiannual"
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
export const MARKETING_SKUS: BillingSku[] = ["monthly", "semiannual", "yearly", "lifetime"];
export const PUBLIC_CHECKOUT_SKUS: BillingSku[] = ["monthly", "semiannual", "yearly", "lifetime"];

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
    highlighted: true,
    badge: "Phổ biến nhất",
  },
  semiannual: {
    sku: "semiannual",
    tier: "pro",
    days: 180,
    priceVnd: 459000,
    label: "Pro 6 tháng",
    shortLabel: "Pro 6 tháng",
    description: "Phù hợp cho người theo dõi nghiêm túc và muốn tiết kiệm hơn gói tháng.",
    badge: "Tiết kiệm hơn",
  },
  quarterly: {
    sku: "quarterly",
    tier: "pro",
    days: 90,
    priceVnd: 239000,
    label: "Pro 90 ngày",
    shortLabel: "Pro quý",
    description: "Legacy offer giữ để tương thích với dữ liệu cũ.",
  },
  yearly: {
    sku: "yearly",
    tier: "pro",
    days: 365,
    priceVnd: 889000,
    label: "Pro 12 tháng",
    shortLabel: "Pro năm",
    description: "Mức tối ưu chi phí cho người muốn dùng trọn năm.",
    badge: "Giá tốt nhất",
  },
  lifetime: {
    sku: "lifetime",
    tier: "lifetime",
    days: null,
    priceVnd: 1980000,
    label: "Lifetime",
    shortLabel: "Lifetime",
    description: "Mua một lần, giữ entitlement dài hạn trên customer.",
    badge: "Một lần thanh toán",
  },
};

export const BILLING_SKU_OPTIONS = Object.values(BILLING_OFFERS);

export const PUBLIC_PLAN_CARDS: PublicPlanCard[] = [
  {
    id: "free",
    plan: "free",
    label: "Free",
    priceLabel: "0đ",
    helper: "Làm quen với CaloTrack bằng quota nhỏ, đủ để thử flow chat và tránh abuse cost.",
    defaultSku: null,
    badge: "Dùng thử",
    features: [
      "2 lượt phân tích ảnh mỗi ngày",
      "5 lượt tin nhắn mỗi ngày",
      "Dashboard cơ bản để theo dõi nhanh",
      "Phù hợp để thử flow trước khi nâng cấp",
    ],
  },
  {
    id: "pro",
    plan: "pro",
    label: "Pro",
    priceLabel: "Từ 89.000đ / tháng",
    helper: "Một tier Pro duy nhất. Chọn chu kỳ 1 tháng, 6 tháng hoặc 12 tháng trong checkout.",
    defaultSku: "monthly",
    badge: "Phổ biến nhất",
    features: [
      "Theo dõi bữa ăn qua chat và ảnh",
      "Dashboard ngày / tuần / tháng đầy đủ",
      "Cập nhật cân nặng và tiến độ",
      "Gym mode và coach chuyên sâu",
      "Lịch sử đầy đủ, quota cao hơn, ưu tiên xử lý",
    ],
  },
  {
    id: "lifetime",
    plan: "lifetime",
    label: "Lifetime",
    priceLabel: "1.980.000đ / một lần",
    helper: "Phù hợp nếu bạn muốn chốt entitlement dài hạn ngay từ đầu.",
    defaultSku: "lifetime",
    badge: "Giới hạn slot",
    features: [
      "Mở toàn bộ quyền lợi Pro",
      "Không cần gia hạn định kỳ",
      "Giữ entitlement dài hạn ở cấp customer",
      "Ưu tiên cho các capability AI mới",
    ],
  },
];

export const PUBLIC_PRO_CADENCE_OPTIONS: PublicProCadenceOption[] = [
  {
    sku: "monthly",
    label: "1 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.monthly.priceVnd),
    helper: "Linh hoạt để bắt đầu nhanh.",
    badge: "Phổ biến nhất",
  },
  {
    sku: "semiannual",
    label: "6 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.semiannual.priceVnd),
    helper: "Tiết kiệm hơn nếu bạn dùng đều.",
  },
  {
    sku: "yearly",
    label: "12 tháng",
    priceLabel: formatBillingPriceVnd(BILLING_OFFERS.yearly.priceVnd),
    helper: "Mức tối ưu cho hành trình dài hạn.",
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
  return "Bắt đầu miễn phí với quota nhỏ để thử flow thật và giảm rủi ro spam.";
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
  if (sku === "semiannual") {
    return `Chọn Pro 6 tháng ${formatBillingPriceVnd(BILLING_OFFERS[sku].priceVnd)}`;
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
  return `Chọn ${BILLING_OFFERS[sku].shortLabel}`;
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
  return 5;
}

export function getFreeImageDailyLimit(): number {
  return 2;
}
