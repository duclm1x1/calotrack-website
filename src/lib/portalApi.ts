import {
  LIFETIME_SENTINEL_ISO,
  PUBLIC_CHECKOUT_PROVIDERS,
  getDefaultSkuForTier,
  getFreeDailyLimit,
  normalizePlanTier,
  type BillingSku,
  type PlanTier,
  type PublicCheckoutProvider,
} from "@/lib/billing";
import {
  SITE_CONFIG,
  buildSiteUrl,
  buildVietQrImageUrl,
  getPrimaryChannelHref,
  getTelegramLinkHref,
  hasConfiguredBankTransfer,
  hasConfiguredMomoCheckout,
} from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

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
  dailyAiUsageCount: number;
  entitlementSource: string | null;
  entitlementLabel: string;
  quotaLabel: string;
  source: "customer_linked" | "linked_user" | "phone_match" | "email_match" | "auth_only";
  payments: PortalPaymentSummary[];
  linkedChannels: PortalChannelLink[];
  lastSyncAt: string;
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
  helperText: string;
  createdAt: string;
};

export type PortalOrderStatus = {
  orderId: string;
  status: string;
  entitlementActive: boolean;
  premiumUntil: string | null;
  provider: string | null;
  updatedAt: string;
};

export type TelegramLinkResult = {
  linkToken: string | null;
  url: string;
  status: "ready" | "fallback";
};

export type ZaloLinkRequestResult = {
  status: "pending_review" | "linked";
  requestId: string | null;
  helperText: string;
};

type PortalUserRow = {
  id: number;
  email: string | null;
  plan: string | null;
  premium_until: string | null;
  daily_ai_usage_count: number | null;
  customer_id?: number | null;
};

type MomoCheckoutResponse = {
  payUrl?: string | null;
  paymentUrl?: string | null;
  deeplink?: string | null;
  resultCode?: number | string | null;
  message?: string | null;
};

function describeError(error: unknown): string {
  return String((error as { message?: string })?.message || error || "Unknown error");
}

function isMissingFunctionError(error: unknown): boolean {
  const message = describeError(error);
  return message.includes("Could not find the function") || message.includes("does not exist");
}

function buildEntitlementLabel(
  plan: PlanTier,
  premiumUntil: string | null,
  entitlementSource?: string | null,
): string {
  if (plan === "lifetime" || premiumUntil === LIFETIME_SENTINEL_ISO) {
    return "Lifetime entitlement đang active ở cấp customer";
  }
  if (plan === "pro" && premiumUntil) {
    return `Pro active tới ${new Date(premiumUntil).toLocaleDateString("vi-VN")}`;
  }
  if (entitlementSource) {
    return `Free tier • ${entitlementSource}`;
  }
  return "Free tier";
}

function buildQuotaLabel(plan: PlanTier, usage: number): string {
  if (plan === "free") {
    return `${usage}/${getFreeDailyLimit()} lượt AI hôm nay`;
  }
  return `${usage} lượt AI đã dùng hôm nay • quota shared theo customer`;
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

function buildFallbackOrder(
  plan: PlanTier,
  provider: PublicCheckoutProvider,
  phoneE164: string | null,
): PortalCheckoutOrder {
  const billingSku = getDefaultSkuForTier(plan);
  const amount = billingSku ? Number(billingSku === "lifetime" ? 990000 : 99000) : 0;
  const orderCode = `CT${Date.now()}`;
  const providerOption = PUBLIC_CHECKOUT_PROVIDERS.find((item) => item.value === provider);
  return {
    id: orderCode,
    orderCode,
    provider,
    status: plan === "free" ? "active" : "pending_confirmation",
    plan,
    billingSku,
    amount,
    phoneE164,
    paymentUrl: null,
    qrContent: provider === "bank_transfer" ? orderCode : null,
    qrImageUrl:
      provider === "bank_transfer" && hasConfiguredBankTransfer()
        ? buildVietQrImageUrl(amount, orderCode)
        : null,
    bankTransferNote: provider === "bank_transfer" ? orderCode : null,
    bankName: provider === "bank_transfer" ? SITE_CONFIG.bankName : null,
    bankAccountNumber:
      provider === "bank_transfer" ? SITE_CONFIG.bankAccountNumber : null,
    bankAccountName:
      provider === "bank_transfer" ? SITE_CONFIG.bankAccountName || null : null,
    helperText:
      provider === "bank_transfer"
        ? `Chuyển khoản đúng nội dung ${orderCode} để backend đối soát và kích hoạt tự động.`
        : providerOption?.helper ?? "Đơn hàng đang ở trạng thái chờ backend xác nhận.",
    createdAt: new Date().toISOString(),
  };
}

async function enrichMomoOrder(order: PortalCheckoutOrder): Promise<PortalCheckoutOrder> {
  if (order.provider !== "momo" || order.plan === "free" || order.paymentUrl) {
    return order;
  }

  if (!hasConfiguredMomoCheckout()) {
    return {
      ...order,
      helperText:
        "MoMo đang chờ cấu hình webhook tạo payment session. Tạm thời dùng Techcombank chuyển khoản để đi live ngay.",
    };
  }

  const response = await fetch(SITE_CONFIG.momoCreateOrderWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId: order.id,
      orderCode: order.orderCode,
      amount: order.amount,
      billingSku: order.billingSku,
      phoneE164: order.phoneE164,
      returnUrl: buildSiteUrl(
        `${SITE_CONFIG.activatePath}?order=${encodeURIComponent(
          order.id,
        )}&provider=momo&status=pending_confirmation`,
      ),
      origin: buildSiteUrl("/"),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as MomoCheckoutResponse;
  if (!response.ok) {
    throw new Error(
      String(
        payload.message ||
          "Khong the tao payment session MoMo. Kiem tra webhook hoac merchant config.",
      ),
    );
  }

  return {
    ...order,
    paymentUrl: payload.payUrl || payload.paymentUrl || payload.deeplink || null,
    helperText:
      String(payload.message || "").trim() ||
      "Đơn hàng MoMo đã được tạo. Hệ thống sẽ cấp quyền sau khi IPN xác nhận thành công.",
  };
}

async function findLinkedUser(
  authUserId: string,
  phone: string | null | undefined,
  email: string | null | undefined,
) {
  const byAuth = await supabase
    .from("users")
    .select("id,email,plan,premium_until,daily_ai_usage_count,customer_id")
    .eq("auth_user_id", authUserId)
    .limit(1)
    .maybeSingle<PortalUserRow>();

  if (!byAuth.error && byAuth.data) {
    return { row: byAuth.data, source: "linked_user" as const };
  }

  if (phone) {
    const byPhone = await supabase
      .from("customers")
      .select("id,plan,premium_until,phone_e164,phone_display,full_name")
      .eq("phone_e164", phone)
      .limit(1)
      .maybeSingle<Record<string, unknown>>();

    if (!byPhone.error && byPhone.data) {
      return {
        row: {
          id: Number(byPhone.data.id),
          email: email ?? null,
          plan: String(byPhone.data.plan ?? "free"),
          premium_until: (byPhone.data.premium_until as string | null) ?? null,
          daily_ai_usage_count: 0,
          customer_id: Number(byPhone.data.id),
        },
        source: "phone_match" as const,
      };
    }
  }

  if (!email) {
    return { row: null, source: "auth_only" as const };
  }

  const byEmail = await supabase
    .from("users")
    .select("id,email,plan,premium_until,daily_ai_usage_count,customer_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle<PortalUserRow>();

  if (!byEmail.error && byEmail.data) {
    return { row: byEmail.data, source: "email_match" as const };
  }

  return { row: null, source: "auth_only" as const };
}

async function fallbackPortalSnapshot(authUser: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<PortalSnapshot> {
  const linked = await findLinkedUser(authUser.id, authUser.phone ?? null, authUser.email ?? null);
  const row = linked.row;
  const plan = normalizePlanTier(row?.plan);
  let payments: PortalPaymentSummary[] = [];

  if (row?.id) {
    const paymentQuery = await supabase
      .from("transaction_history")
      .select("id,amount,status,payment_method,billing_sku,created_at,transaction_code")
      .eq("user_id", row.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!paymentQuery.error && Array.isArray(paymentQuery.data)) {
      payments = paymentQuery.data.map((item) => ({
        id: String(item.id),
        amount: Number(item.amount ?? 0),
        status: String(item.status ?? "unknown"),
        paymentMethod: (item.payment_method as string | null) ?? null,
        billingSku: (item.billing_sku as string | null) ?? null,
        provider: null,
        createdAt: (item.created_at as string | null) ?? null,
        transactionCode: (item.transaction_code as string | null) ?? null,
      }));
    }
  }

  return {
    customerId: row?.customer_id ?? null,
    linkedUserId: row?.id ?? null,
    email: row?.email ?? authUser.email ?? null,
    phoneE164: authUser.phone ?? null,
    phoneDisplay: authUser.phone ?? null,
    fullName: null,
    plan,
    premiumUntil: row?.premium_until ?? null,
    dailyAiUsageCount: Number(row?.daily_ai_usage_count ?? 0),
    entitlementSource: linked.source === "linked_user" ? "compat_user" : linked.source,
    entitlementLabel: buildEntitlementLabel(plan, row?.premium_until ?? null, linked.source),
    quotaLabel: buildQuotaLabel(plan, Number(row?.daily_ai_usage_count ?? 0)),
    source: linked.source,
    payments,
    linkedChannels: [
      {
        id: row?.id ? String(row.id) : "telegram-fallback",
        channel: authUser.phone ? "web" : "telegram",
        displayName: authUser.phone ?? authUser.email ?? null,
        linkStatus: row ? "linked" : "unlinked",
        platformUserId: row?.id ? String(row.id) : null,
      },
    ],
    lastSyncAt: new Date().toISOString(),
  };
}

export function normalizeVietnamPhoneInput(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("+84")) {
    return `+84${digits.slice(3).replace(/\D/g, "")}`;
  }
  if (digits.startsWith("84")) {
    return `+84${digits.slice(2)}`;
  }
  if (digits.startsWith("0")) {
    return `+84${digits.slice(1)}`;
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return `+84${digits}`;
  }
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
): Promise<{ phoneE164: string }> {
  const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token: otp,
    type: "sms",
  });
  if (error) {
    throw new Error(describeError(error));
  }
  return { phoneE164 };
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
    return {
      customerId: row.customer_id == null ? null : Number(row.customer_id),
      linkedUserId: row.linked_user_id == null ? null : Number(row.linked_user_id),
      email: (row.email as string | null) ?? authUser.email ?? null,
      phoneE164: (row.phone_e164 as string | null) ?? authUser.phone ?? null,
      phoneDisplay: (row.phone_display as string | null) ?? authUser.phone ?? null,
      fullName: (row.full_name as string | null) ?? null,
      plan,
      premiumUntil: (row.premium_until as string | null) ?? null,
      dailyAiUsageCount: Number(row.quota_used_today ?? row.daily_ai_usage_count ?? 0),
      entitlementSource: (row.entitlement_source as string | null) ?? null,
      entitlementLabel:
        (row.entitlement_label as string | null) ??
        buildEntitlementLabel(
          plan,
          (row.premium_until as string | null) ?? null,
          (row.entitlement_source as string | null) ?? null,
        ),
      quotaLabel:
        (row.quota_label as string | null) ??
        buildQuotaLabel(plan, Number(row.quota_used_today ?? row.daily_ai_usage_count ?? 0)),
      source: ((row.source as PortalSnapshot["source"]) ?? "customer_linked"),
      payments: Array.isArray(row.payments) ? mapPortalPayments(row.payments as unknown[]) : [],
      linkedChannels: Array.isArray(row.linked_channels)
        ? mapPortalChannels(row.linked_channels as unknown[])
        : [],
      lastSyncAt: String(row.last_sync_at ?? new Date().toISOString()),
    };
  } catch (error) {
    if (isMissingFunctionError(error)) {
      return fallbackPortalSnapshot(authUser);
    }
    throw error;
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
    const nextOrder: PortalCheckoutOrder = {
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
      createdAt: String(row.created_at ?? new Date().toISOString()),
    };
    return await enrichMomoOrder(nextOrder);
  } catch (error) {
    if (isMissingFunctionError(error)) {
      return await enrichMomoOrder(
        buildFallbackOrder(params.plan, params.provider, phoneE164),
      );
    }
    throw error;
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
      status: String(row.status ?? "pending_confirmation"),
      entitlementActive: row.entitlement_active === true,
      premiumUntil: (row.premium_until as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  } catch (error) {
    if (isMissingFunctionError(error)) {
      return {
        orderId,
        status: "pending_confirmation",
        entitlementActive: false,
        premiumUntil: null,
        provider: null,
        updatedAt: new Date().toISOString(),
      };
    }
    throw error;
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
    if (isMissingFunctionError(error)) {
      return {
        linkToken: null,
        url: getPrimaryChannelHref(),
        status: "fallback",
      };
    }
    throw error;
  }
}

export async function portalRequestZaloLink(): Promise<ZaloLinkRequestResult> {
  try {
    const { data, error } = await supabase.rpc("portal_request_zalo_link");
    if (error) {
      throw error;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      status: (row.status as ZaloLinkRequestResult["status"]) ?? "pending_review",
      requestId: (row.request_id as string | null) ?? null,
      helperText:
        (row.helper_text as string | null) ??
        "Yêu cầu link Zalo đã được ghi nhận để đội vận hành nối workflow riêng.",
    };
  } catch (error) {
    if (isMissingFunctionError(error)) {
      return {
        status: "pending_review",
        requestId: null,
        helperText: "Frontend và admin đã sẵn cho Zalo. Workflow n8n sẽ được nối ở phase sau.",
      };
    }
    throw error;
  }
}

export function getPortalChannelCards(snapshot?: PortalSnapshot | null) {
  const linkedChannels = new Set((snapshot?.linkedChannels ?? []).map((item) => item.channel));
  return [
    {
      key: "telegram",
      label: SITE_CONFIG.primaryChannelLabel,
      status: linkedChannels.has("telegram") ? "Đã linked" : "Sẵn sàng kết nối",
      helper: linkedChannels.has("telegram")
        ? "Kênh này đã nối vào customer canonical."
        : "Kênh tracking mạnh nhất hiện tại và là lựa chọn nhanh nhất để dùng ngay.",
      tone: "primary" as const,
    },
    {
      key: "zalo",
      label: SITE_CONFIG.secondaryChannelLabel,
      status: linkedChannels.has("zalo") ? "Đã linked" : SITE_CONFIG.secondaryChannelStatus,
      helper: linkedChannels.has("zalo")
        ? "Kênh này đã nằm trong shared entitlement của customer."
        : "UI và data model đã sẵn, workflow riêng sẽ được cắm bằng n8n.",
      tone: "accent" as const,
    },
    {
      key: "web",
      label: SITE_CONFIG.webPortalLabel,
      status: linkedChannels.has("web") ? "Portal linked" : SITE_CONFIG.webPortalStatus,
      helper: "Portal dùng cho account, payment, activation và admin surfaces.",
      tone: "neutral" as const,
    },
  ];
}
