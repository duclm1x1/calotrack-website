import {
  LIFETIME_SENTINEL_ISO,
  getDefaultSkuForTier,
  getFreeDailyLimit,
  getFreeImageDailyLimit,
  normalizePlanTier,
  type BillingSku,
  type PlanTier,
  type PublicCheckoutProvider,
} from "@/lib/billing";
import {
  SITE_CONFIG,
  buildVietQrImageUrl,
  getTelegramLinkHref,
} from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

export type PortalAccessState =
  | "pending_verification"
  | "trialing"
  | "free_limited"
  | "active_paid"
  | "blocked"
  | string;

export type PortalPaymentSummary = {
  id: string;
  amount: number;
  status: string;
  paymentMethod: string | null;
  billingSku: string | null;
  provider: string | null;
  createdAt: string | null;
  transactionCode: string | null;
};

export type PortalChannelLink = {
  id: string;
  channel: "telegram" | "zalo" | "web" | string;
  displayName: string | null;
  linkStatus: string;
  platformUserId: string | null;
  linkedAt?: string | null;
};

export type PortalSnapshot = {
  customerId: number | null;
  linkedUserId: number | null;
  email: string | null;
  phoneE164: string | null;
  phoneDisplay: string | null;
  fullName: string | null;
  plan: PlanTier;
  premiumUntil: string | null;
  trialEndsAt: string | null;
  accessState: PortalAccessState;
  onboardingStatus: string | null;
  dailyAiUsageCount: number;
  entitlementSource: string | null;
  entitlementLabel: string;
  quotaLabel: string;
  source: "customer_linked" | "linked_user" | "phone_match" | "email_match" | "auth_only";
  payments: PortalPaymentSummary[];
  linkedChannels: PortalChannelLink[];
  lastSyncAt: string;
};

export type PortalVerificationResult = {
  phoneE164: string;
  customerId: number | null;
  accessState: PortalAccessState;
  trialEndsAt: string | null;
};

export type PortalCheckoutOrder = {
  id: string;
  orderCode: string;
  provider: PublicCheckoutProvider;
  status: string;
  plan: PlanTier;
  billingSku: BillingSku | null;
  amount: number;
  phoneE164: string | null;
  paymentUrl: string | null;
  qrContent: string | null;
  qrImageUrl: string | null;
  bankTransferNote: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  telegramLinkToken: string | null;
  telegramLinkUrl: string | null;
  helperText: string;
  createdAt: string;
};

export type PortalOrderStatus = {
  orderId: string;
  orderCode?: string | null;
  status: string;
  entitlementActive: boolean;
  premiumUntil: string | null;
  provider: string | null;
  amount?: number | null;
  phoneE164?: string | null;
  telegramLinkToken?: string | null;
  telegramLinkUrl?: string | null;
  updatedAt: string;
};

export type TelegramLinkResult = {
  linkToken: string | null;
  url: string;
  status: "ready" | "fallback";
};

export type ZaloLinkResult = {
  status: "ready" | "linked" | "pending_review" | "needs_support" | string;
  requestId: string | null;
  linkToken: string | null;
  linkCode: string | null;
  helperText: string;
  zaloUrl: string;
};

function describeError(error: unknown): string {
  const message = String((error as { message?: string })?.message || error || "Unknown error");
  const normalized = message.toLowerCase();
  if (message.includes("phone_verification_required")) {
    return "Bạn cần xác thực số điện thoại trước khi dùng portal, checkout hoặc bot.";
  }
  if (message.includes("verified_phone_mismatch")) {
    return "Số điện thoại checkout phải trùng với số đã xác thực trên tài khoản của bạn.";
  }
  if (message.includes("auth_required")) {
    return "Bạn cần đăng nhập bằng OTP trước khi tiếp tục.";
  }
  if (normalized.includes("otp_expired") || normalized.includes("token has expired or is invalid")) {
    return "Mã OTP đã hết hạn hoặc không còn hợp lệ. Bạn hãy gửi lại mã mới rồi thử lại.";
  }
  if (normalized.includes("sms send rate limit") || normalized.includes("over_sms_send_rate_limit")) {
    return "Bạn vừa yêu cầu mã quá nhanh. Hãy chờ một chút rồi gửi lại OTP.";
  }
  if (normalized.includes("phone provider is disabled") || normalized.includes("unsupported phone provider")) {
    return "Hệ thống gửi mã xác thực đang tạm bảo trì. Bạn thử lại sau hoặc liên hệ hỗ trợ.";
  }
  if (normalized.includes("invalid phone number")) {
    return "Số điện thoại chưa đúng định dạng. Hãy nhập số Việt Nam theo dạng 09... hoặc +84...";
  }
  if (normalized.includes("captcha")) {
    return "Yêu cầu xác thực cần thêm bước bảo mật. Hãy thử lại sau ít phút.";
  }
  return message;
}

function buildEntitlementLabel(
  plan: PlanTier,
  premiumUntil: string | null,
  accessState: PortalAccessState,
  entitlementSource?: string | null,
): string {
  if (accessState === "trialing") {
    return "Dùng thử 7 ngày đang hoạt động.";
  }
  if (accessState === "free_limited") {
    return "Gói Free giới hạn đang hoạt động sau khi trial kết thúc.";
  }
  if (accessState === "blocked") {
    return "Tài khoản đang bị chặn.";
  }
  if (plan === "lifetime" || premiumUntil === LIFETIME_SENTINEL_ISO) {
    return "Lifetime entitlement đang hoạt động ở cấp customer.";
  }
  if (plan === "pro" && premiumUntil) {
    return `Pro đang hoạt động tới ${new Date(premiumUntil).toLocaleDateString("vi-VN")}.`;
  }
  if (entitlementSource) {
    return `Free limited • ${entitlementSource}`;
  }
  return "Xác thực số điện thoại để bắt đầu dùng.";
}

function buildQuotaLabel(accessState: PortalAccessState, plan: PlanTier, usage: number): string {
  if (accessState === "pending_verification") {
    return "Chưa có quyền truy cập. Xác thực số điện thoại để mở dùng thử 7 ngày.";
  }
  if (accessState === "blocked") {
    return "Tài khoản đang bị chặn.";
  }
  if (accessState === "trialing") {
    return `${usage} lượt dùng hôm nay • đang trong trial 7 ngày`;
  }
  if (accessState === "free_limited" || plan === "free") {
    return `${usage}/${getFreeDailyLimit()} tin nhắn hôm nay • ${getFreeImageDailyLimit()} ảnh/ngày`;
  }
  return `${usage} lượt AI đã dùng hôm nay • quota chia sẻ theo customer`;
}

function mapPortalPayments(items: unknown[]): PortalPaymentSummary[] {
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      amount: Number(row.amount ?? 0),
      status: String(row.status ?? "unknown"),
      paymentMethod: (row.payment_method as string | null) ?? null,
      billingSku: (row.billing_sku as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
      transactionCode: (row.transaction_code as string | null) ?? null,
    };
  });
}

function mapPortalChannels(items: unknown[]): PortalChannelLink[] {
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      channel: String(row.channel ?? "telegram"),
      displayName: (row.display_name as string | null) ?? null,
      linkStatus: String(row.link_status ?? "unlinked"),
      platformUserId: (row.platform_user_id as string | null) ?? null,
      linkedAt: (row.linked_at as string | null) ?? null,
    };
  });
}

export function normalizeVietnamPhoneInput(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+84")) return `+84${digits.slice(3).replace(/\D/g, "")}`;
  if (digits.startsWith("84")) return `+84${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) return `+84${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function portalStartPhoneAuth(phoneInput: string): Promise<{ phoneE164: string }> {
  const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
  if (error) {
    throw new Error(describeError(error));
  }
  return { phoneE164 };
}

export async function portalVerifyPhoneOtp(
  phoneInput: string,
  otp: string,
): Promise<PortalVerificationResult> {
  const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token: otp,
    type: "sms",
  });
  if (error) {
    throw new Error(describeError(error));
  }

  const { data, error: completeError } = await supabase.rpc("portal_complete_phone_verification", {
    p_phone_input: phoneE164,
  });
  if (completeError) {
    throw new Error(describeError(completeError));
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    phoneE164: (row.phone_e164 as string | null) ?? phoneE164,
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    accessState: String(row.access_state ?? "pending_verification"),
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
  };
}

export async function fetchPortalSnapshot(authUser: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<PortalSnapshot> {
  try {
    const { data, error } = await supabase.rpc("portal_get_customer_snapshot");
    if (error) {
      throw error;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const plan = normalizePlanTier((row.plan as string | null) ?? null);
    const accessState = String(row.access_state ?? "pending_verification");
    const usage = Number(row.quota_used_today ?? row.daily_ai_usage_count ?? 0);

    return {
      customerId: row.customer_id == null ? null : Number(row.customer_id),
      linkedUserId: row.linked_user_id == null ? null : Number(row.linked_user_id),
      email: (row.email as string | null) ?? authUser.email ?? null,
      phoneE164: (row.phone_e164 as string | null) ?? authUser.phone ?? null,
      phoneDisplay: (row.phone_display as string | null) ?? authUser.phone ?? null,
      fullName: (row.full_name as string | null) ?? null,
      plan,
      premiumUntil: (row.premium_until as string | null) ?? null,
      trialEndsAt: (row.trial_ends_at as string | null) ?? null,
      accessState,
      onboardingStatus: (row.onboarding_status as string | null) ?? null,
      dailyAiUsageCount: usage,
      entitlementSource: (row.entitlement_source as string | null) ?? null,
      entitlementLabel:
        (row.entitlement_label as string | null) ??
        buildEntitlementLabel(
          plan,
          (row.premium_until as string | null) ?? null,
          accessState,
          (row.entitlement_source as string | null) ?? null,
        ),
      quotaLabel:
        (row.quota_label as string | null) ??
        buildQuotaLabel(accessState, plan, usage),
      source: ((row.source as PortalSnapshot["source"]) ?? "customer_linked"),
      payments: Array.isArray(row.payments) ? mapPortalPayments(row.payments as unknown[]) : [],
      linkedChannels: Array.isArray(row.linked_channels)
        ? mapPortalChannels(row.linked_channels as unknown[])
        : [],
      lastSyncAt: String(row.last_sync_at ?? new Date().toISOString()),
    };
  } catch (error) {
    throw new Error(`Không thể lấy dữ liệu khách hàng: ${describeError(error)}`);
  }
}

export async function linkPortalCustomerByPhone(phoneInput: string): Promise<void> {
  const { error } = await supabase.rpc("portal_link_customer_by_phone", {
    p_phone_input: normalizeVietnamPhoneInput(phoneInput),
  });
  if (error) {
    throw new Error(describeError(error));
  }
}

export async function portalStartCheckout(params: {
  plan: PlanTier;
  billingSku?: BillingSku | null;
  provider: PublicCheckoutProvider;
  phoneInput: string;
}): Promise<PortalCheckoutOrder> {
  const phoneE164 = normalizeVietnamPhoneInput(params.phoneInput);
  const billingSku = params.billingSku ?? getDefaultSkuForTier(params.plan);

  try {
    const { data, error } = await supabase.rpc("portal_start_checkout", {
      p_plan: params.plan,
      p_billing_sku: billingSku,
      p_provider: params.provider,
      p_phone_e164: phoneE164,
    });
    if (error) {
      throw error;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? row.order_id ?? ""),
      orderCode: String(row.order_code ?? row.id ?? ""),
      provider: (row.provider as PublicCheckoutProvider) ?? params.provider,
      status: String(row.status ?? "pending_confirmation"),
      plan: normalizePlanTier((row.plan as string | null) ?? params.plan),
      billingSku: (row.billing_sku as BillingSku | null) ?? billingSku,
      amount: Number(row.amount ?? 0),
      phoneE164: (row.phone_e164 as string | null) ?? phoneE164,
      paymentUrl: (row.payment_url as string | null) ?? null,
      qrContent: (row.qr_content as string | null) ?? null,
      qrImageUrl:
        ((row.qr_image_url as string | null) ?? null) ||
        (params.provider === "bank_transfer"
          ? buildVietQrImageUrl(
              Number(row.amount ?? 0),
              String(row.bank_transfer_note ?? row.order_code ?? ""),
            )
          : null),
      bankTransferNote: (row.bank_transfer_note as string | null) ?? null,
      bankName:
        (row.bank_name as string | null) ??
        (params.provider === "bank_transfer" ? SITE_CONFIG.bankName : null),
      bankAccountNumber:
        (row.bank_account_number as string | null) ??
        (params.provider === "bank_transfer" ? SITE_CONFIG.bankAccountNumber : null),
      bankAccountName:
        (row.bank_account_name as string | null) ??
        (params.provider === "bank_transfer" ? SITE_CONFIG.bankAccountName || null : null),
      helperText: String(row.helper_text ?? "Đơn hàng đã được tạo và đang chờ backend xác nhận."),
      telegramLinkToken: (row.telegram_link_token as string | null) ?? null,
      telegramLinkUrl: getTelegramLinkHref((row.telegram_link_token as string | null) ?? null),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    };
  } catch (error) {
    throw new Error(`Không thể tạo đơn hàng: ${describeError(error)}`);
  }
}

export async function portalGetOrderStatus(orderId: string): Promise<PortalOrderStatus> {
  try {
    const { data, error } = await supabase.rpc("portal_get_order_status", {
      p_order_id: orderId,
    });
    if (error) {
      throw error;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      orderId: String(row.order_id ?? orderId),
      orderCode: (row.order_code as string | null) ?? null,
      status: String(row.status ?? "pending_confirmation"),
      entitlementActive: row.entitlement_active === true,
      premiumUntil: (row.premium_until as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      amount: row.amount == null ? null : Number(row.amount),
      phoneE164: (row.phone_e164 as string | null) ?? null,
      telegramLinkToken: (row.telegram_link_token as string | null) ?? null,
      telegramLinkUrl: getTelegramLinkHref((row.telegram_link_token as string | null) ?? null),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  } catch (error) {
    throw new Error(`Không thể tải trạng thái đơn hàng: ${describeError(error)}`);
  }
}

export async function portalCreateTelegramLinkToken(): Promise<TelegramLinkResult> {
  try {
    const { data, error } = await supabase.rpc("portal_create_telegram_link_token");
    if (error) {
      throw error;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const linkToken = (row.link_token as string | null) ?? null;
    return {
      linkToken,
      url: getTelegramLinkHref(linkToken),
      status: "ready",
    };
  } catch (error) {
    throw new Error(`Lỗi kết nối nền tảng: ${describeError(error)}`);
  }
}

export async function portalCreateZaloLinkToken(): Promise<ZaloLinkResult> {
  try {
    const next = await supabase.rpc("portal_create_zalo_link_token");
    if (!next.error) {
      const row = (next.data ?? {}) as Record<string, unknown>;
      return {
        status: (row.status as ZaloLinkResult["status"]) ?? "ready",
        requestId: (row.request_id as string | null) ?? null,
        linkToken: (row.link_token as string | null) ?? null,
        linkCode: (row.link_code as string | null) ?? null,
        helperText:
          (row.helper_text as string | null) ??
          "Mo Zalo OA Calo Track va gui ma lien ket nay mot lan de noi tai khoan.",
        zaloUrl: SITE_CONFIG.primaryChannelHref,
      };
    }

    const legacy = await supabase.rpc("portal_request_zalo_link");
    if (legacy.error) {
      throw legacy.error;
    }

    const row = (legacy.data ?? {}) as Record<string, unknown>;
    return {
      status: (row.status as ZaloLinkResult["status"]) ?? "pending_review",
      requestId: (row.request_id as string | null) ?? null,
      linkToken: null,
      linkCode: null,
      zaloUrl: SITE_CONFIG.primaryChannelHref,
      helperText:
        (row.helper_text as string | null) ??
        "Yêu cầu link Zalo đã được ghi nhận để đội quản trị xác nhận.",
    };
  } catch (error) {
    throw new Error(`Không thể gửi yêu cầu: ${describeError(error)}`);
  }
}

export function getPortalChannelCards(snapshot?: PortalSnapshot | null) {
  const linkedChannels = new Set((snapshot?.linkedChannels ?? []).map((item) => item.channel));
  return [
    {
      key: "zalo",
      label: SITE_CONFIG.primaryChannelLabel,
      status: linkedChannels.has("zalo") ? "Đã liên kết" : "Sẵn sàng kết nối",
      helper: linkedChannels.has("zalo")
        ? "Kênh này đã nối vào customer truth."
        : "Kênh chat chính cho người dùng Việt, đi cùng flow kích hoạt và support hiện tại.",
      tone: "primary" as const,
    },
    {
      key: "telegram",
      label: SITE_CONFIG.secondaryChannelLabel,
      status: linkedChannels.has("telegram") ? "Đã liên kết" : SITE_CONFIG.secondaryChannelStatus,
      helper: linkedChannels.has("telegram")
        ? "Kênh này đã nằm trong shared entitlement của customer."
        : "Giữ cùng entitlement và hữu ích cho người dùng muốn tracking liên tục trên Telegram.",
      tone: "accent" as const,
    },
    {
      key: "web",
      label: SITE_CONFIG.webPortalLabel,
      status: linkedChannels.has("web") ? "Portal đã liên kết" : SITE_CONFIG.webPortalStatus,
      helper: "Portal dùng cho account, payment, activation và khu admin.",
      tone: "neutral" as const,
    },
  ];
}
