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
  buildSiteUrl,
  buildVietQrImageUrl,
  getTelegramLinkHref,
} from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

function cleanClientEnv(value: string | undefined): string {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

const SUPABASE_URL = cleanClientEnv(import.meta.env.VITE_SUPABASE_URL || "");
const SUPABASE_ANON_KEY = cleanClientEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
);

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
  zaloAutoLinked: boolean;
  bridgeStatus: string | null;
  linkedChannelCount: number;
  zaloLinkStatus: string | null;
  claimCode: string | null;
  claimStatus: string | null;
  nextAction: string | null;
  profileReady: boolean;
  profileMissingFields: string[];
};

export type PortalMacroDay = {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  calorieGoal: number | null;
};

export type PortalDashboardProfile = {
  customerId: number | null;
  linkedUserId: number | null;
  onboardingStatus: string | null;
  primaryGoal: string;
  goalLabel: string;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: string | null;
  activityLevel: string | null;
  tdee: number | null;
  dailyGoalKcal: number;
  gymModeEnabled: boolean;
};

export type PortalDashboardDaily = {
  intakeKcal: number;
  exerciseKcal: number;
  netKcal: number;
  goalKcal: number;
  consumedProteinG: number;
  consumedCarbsG: number;
  consumedFatG: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  mealCount: number;
  date: string;
};

export type PortalDashboardWeekly = {
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  consumedKcal: number;
  consumedProteinG: number;
  consumedCarbsG: number;
  consumedFatG: number;
  remainingKcal: number;
  remainingProteinG: number;
  remainingCarbsG: number;
  remainingFatG: number;
  daysLogged: number;
  startDate: string;
  endDate: string;
};

export type PortalGoalPlan = {
  primaryGoal: string;
  targetMetric: string | null;
  targetWeightKg: number | null;
  targetBodyFatPct: number | null;
  currentWeightKg: number | null;
  currentBodyFatPct: number | null;
  dailyGoalKcal: number;
  weeklyRateKg: number | null;
  deltaKg: number;
  estimatedWeeksToGoal: number | null;
  kcalDeltaPerDay: number;
};

export type PortalBodyCompositionSummary = {
  measuredAt: string | null;
  age: number | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  skeletalMuscleMassKg: number | null;
  bodyFatMassKg: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  bmr: number | null;
  visceralFatLevel: number | null;
  waistHipRatio: number | null;
  inbodyScore: number | null;
  targetWeightKg: number | null;
};

export type PortalRequestedPeriod = {
  period: "day" | "week" | "month";
  startDate: string;
  endDate: string;
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  consumedKcal: number;
  consumedProteinG: number;
  consumedCarbsG: number;
  consumedFatG: number;
  exerciseKcal: number;
  netKcal: number;
  daysLogged: number;
};

export type PortalDashboardSummary = {
  profile: PortalDashboardProfile;
  daily: PortalDashboardDaily;
  weekly: PortalDashboardWeekly;
  goalPlan: PortalGoalPlan;
  latestBodyComposition: PortalBodyCompositionSummary | null;
  chart7d: PortalMacroDay[];
  requestedPeriod: PortalRequestedPeriod;
};

export type PortalPhoneAuthStartResult = {
  phoneE164: string;
  status: "otp_sent" | "fallback_required";
  deliveryChannel: "zalo" | "support";
  helperText: string;
  expiresInSeconds: number | null;
  cooldownSeconds: number | null;
  fallbackReason: string | null;
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
  helperText: string;
  expiresAt: string | null;
  reused: boolean;
  status: "ready" | "already_linked" | "fallback";
};

export type ZaloLinkResult = {
  status: "ready" | "already_linked" | "linked" | "pending_review" | "needs_support" | string;
  requestId: string | null;
  linkToken: string | null;
  linkCode: string | null;
  helperText: string;
  zaloUrl: string;
  expiresAt: string | null;
  reused: boolean;
};

function formatErrorMessage(error: unknown): string {
  const message = String((error as { message?: string })?.message || error || "Unknown error");
  const normalized = message.toLowerCase();

  if (message.includes("phone_verification_required")) {
    return "Bạn cần xác thực số điện thoại qua Zalo trước khi dùng portal, dashboard hoặc checkout.";
  }
  if (message.includes("verified_phone_mismatch")) {
    return "Số điện thoại checkout phải trùng với số đã xác thực trên tài khoản của bạn.";
  }
  if (message.includes("auth_required")) {
    return "Bạn cần đăng nhập trước khi tiếp tục.";
  }
  if (normalized.includes("otp_cooldown_active")) {
    return "Bạn vừa yêu cầu mã quá nhanh. Hãy chờ một chút rồi thử lại.";
  }
  if (normalized.includes("otp_invalid_format")) {
    return "Mã xác thực cần đúng 6 chữ số.";
  }
  if (normalized.includes("otp_invalid")) {
    return "Mã xác thực chưa đúng. Hãy kiểm tra lại rồi thử thêm.";
  }
  if (normalized.includes("otp_locked")) {
    return "Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu mã mới để thử lại.";
  }
  if (normalized.includes("otp_not_found") || normalized.includes("otp_already_used")) {
    return "Mã xác thực này không còn hợp lệ. Hãy gọi lại mã mới.";
  }
  if (normalized.includes("otp_expired")) {
    return "Mã xác thực đã hết hạn. Hãy yêu cầu một mã mới trên Zalo.";
  }
  if (normalized.includes("phone_number_invalid")) {
    return "Số điện thoại chưa đúng định dạng. Hãy nhập số Việt Nam theo dạng 09... hoặc +84...";
  }
  if (normalized.includes("zalo_phone_not_linked")) {
    return "Số điện thoại này chưa nhận được OTP qua Zalo. Hãy mở Zalo OA Calo Track rồi thử lại.";
  }
  if (normalized.includes("zalo_otp_not_configured")) {
    return "Kênh xác thực qua Zalo chưa được cấu hình đầy đủ. Hãy thử lại sau hoặc liên hệ hỗ trợ.";
  }
  if (normalized.includes("zalo_token_invalid")) {
    return "Kênh xác thực Zalo đang cần cập nhật lại quyền truy cập. Hãy thử lại sau hoặc liên hệ hỗ trợ.";
  }
  if (normalized.includes("zalo_template_invalid")) {
    return "Template xác thực Zalo chưa hợp lệ. Hãy thử lại sau hoặc liên hệ hỗ trợ.";
  }
  if (normalized.includes("zalo_quota_exceeded")) {
    return "Hạn mức gửi mã qua Zalo đã tạm hết. Hãy thử lại sau ít phút.";
  }
  if (normalized.includes("zalo_otp_send_failed") || normalized.includes("otp_delivery_failed")) {
    return "Không thể gửi mã xác thực qua Zalo lúc này. Hãy thử lại sau ít phút hoặc liên hệ hỗ trợ.";
  }
  if (normalized.includes("session_issue_failed")) {
    return "Đã xác thực mã nhưng chưa thể tạo phiên đăng nhập. Hãy thử lại.";
  }
  if (normalized.includes("token has expired or is invalid")) {
    return "Liên kết đăng nhập đã hết hạn hoặc không còn hợp lệ.";
  }
  if (normalized.includes("unsupported phone provider")) {
    return "Kênh phone OTP chưa sẵn sàng. Hãy thử lại sau hoặc liên hệ hỗ trợ.";
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
    return "Pro dùng thử 7 ngày đang hoạt động.";
  }
  if (accessState === "free_limited") {
    return "Free linh hoạt đang hoạt động sau giai đoạn dùng thử.";
  }
  if (accessState === "blocked") {
    return "Tài khoản đang bị chặn.";
  }
  if (plan === "lifetime" || premiumUntil === LIFETIME_SENTINEL_ISO) {
    return "Lifetime entitlement đang hoạt động ở cấp customer.";
  }
  if (plan === "pro" && premiumUntil) {
    return "Pro đang hoạt động tới " + new Date(premiumUntil).toLocaleDateString("vi-VN") + ".";
  }
  if (entitlementSource) {
    return "Free linh hoạt từ " + entitlementSource;
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
    return String(usage) + " lượt dùng hôm nay • Pro dùng thử 7 ngày đang chạy";
  }
  if (accessState === "free_limited" || plan === "free") {
    return String(usage) + "/" + getFreeDailyLimit() + " tin nhắn hôm nay • " + getFreeImageDailyLimit() + " ảnh/ngày";
  }
  return String(usage) + " lượt AI đã dùng hôm nay • quota chia sẻ theo customer";
}

function hasActiveTrialWindow(value: string | null | undefined): boolean {
  const iso = String(value || "").trim();
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp > Date.now() : false;
}

function deriveEmailFirstAccessState(params: {
  accessState: string | null | undefined;
  entitlementSource: string | null | undefined;
  trialEndsAt: string | null | undefined;
  plan: PlanTier;
  premiumUntil: string | null | undefined;
}): PortalAccessState {
  const raw = String(params.accessState || "pending_verification").toLowerCase() as PortalAccessState;
  if (!SITE_CONFIG.emailDevBypassEnabled) {
    return raw;
  }
  if (raw === "blocked" || raw === "active_paid") {
    return raw;
  }
  if (params.plan === "pro" || params.plan === "lifetime" || params.premiumUntil === LIFETIME_SENTINEL_ISO) {
    return raw === "pending_verification" ? "active_paid" : raw;
  }
  if (String(params.entitlementSource || "").trim().toLowerCase() !== "email_dev_trial") {
    return raw;
  }
  return hasActiveTrialWindow(params.trialEndsAt) ? "trialing" : "free_limited";
}

function shouldIgnoreProvisionError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || "").toLowerCase();
  return (
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist")) ||
    message.includes("42883")
  );
}

async function maybeEnsureEmailDevCustomer(): Promise<void> {
  if (!SITE_CONFIG.emailDevBypassEnabled) {
    return;
  }

  const { error } = await supabase.rpc("portal_ensure_email_dev_customer");
  if (!error) {
    return;
  }

  if (!shouldIgnoreProvisionError(error)) {
    throw error;
  }

  await invokeWebsiteApi("/api/portal-ensure-email-dev-customer");
}

async function invokeWebsiteApi<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("auth_required");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; message?: string; data?: T }
    | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.message || payload?.error || `website_api_failed_${response.status}`));
  }

  return (payload?.data as T) ?? (payload as T);
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

type EdgeErrorPayload = {
  error?: string;
  message?: string;
  retry_after_seconds?: number;
  remaining_attempts?: number;
};

async function invokePortalEdge<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase client config missing");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as EdgeErrorPayload & T;
  if (!response.ok) {
    const message = payload.error || payload.message || response.statusText;
    throw new Error(formatErrorMessage(message));
  }

  return payload as T;
}

async function invokePublicPortalApi<T>(
  path: string,
  body: Record<string, unknown>,
  options?: { accessToken?: string | null },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const accessToken = String(options?.accessToken || "").trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as EdgeErrorPayload & {
    ok?: boolean;
  };
  if (!response.ok || payload?.ok === false) {
    const message = payload.error || payload.message || `website_api_failed_${response.status}`;
    throw new Error(formatErrorMessage(message));
  }

  return payload as T;
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

export async function portalStartPhoneAuth(phoneInput: string): Promise<PortalPhoneAuthStartResult> {
  const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
  const payload = await invokePublicPortalApi<{
    ok?: boolean;
    status: "otp_sent" | "fallback_required";
    phone_e164: string;
    expires_in_seconds?: number;
    cooldown_seconds?: number;
    fallback?: string;
    reason?: string;
  }>("/api/portal-start-zalo-phone-otp", { phone: phoneE164 });

  if (payload.status === "fallback_required") {
    return {
      phoneE164: payload.phone_e164 || phoneE164,
      status: "fallback_required",
      deliveryChannel: "support",
      helperText:
        "Không thể gửi mã qua Zalo cho số này ngay lúc này. Hãy thử lại sau ít phút hoặc liên hệ hỗ trợ.",
      expiresInSeconds: null,
      cooldownSeconds: payload.cooldown_seconds ?? null,
      fallbackReason: payload.reason ?? "zalo_otp_send_failed",
    };
  }

  return {
    phoneE164: payload.phone_e164 || phoneE164,
    status: "otp_sent",
    deliveryChannel: "zalo",
    helperText: "Mã xác thực đã được gửi qua Zalo. Xác thực xong bạn chỉ cần mở lại chat Zalo và confirm mã vừa được gửi ở ngay ở trên nhé.",
    expiresInSeconds: payload.expires_in_seconds ?? 180,
    cooldownSeconds: payload.cooldown_seconds ?? null,
    fallbackReason: null,
  };
}

export async function portalVerifyPhoneOtp(
  phoneInput: string,
  otp: string,
  options?: {
    bridge?: string | null;
  },
): Promise<PortalVerificationResult> {
  const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  const verifyPayload = await invokePublicPortalApi<{
    ok?: boolean;
    status: "verified";
    phone_e164: string;
    issued_session: boolean;
    session?: {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    } | null;
  }>("/api/portal-verify-zalo-phone-otp", {
    phone: phoneE164,
    code: otp,
    issue_session: !currentSession,
  }, {
    accessToken: currentSession?.access_token ?? null,
  });

  if (!currentSession && verifyPayload.session?.access_token && verifyPayload.session?.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: verifyPayload.session.access_token,
      refresh_token: verifyPayload.session.refresh_token,
    });
    if (sessionError) {
      throw new Error(formatErrorMessage(sessionError));
    }
  }

  const completionPayload = await invokePublicPortalApi<{
    ok?: boolean;
    data?: {
      customer_id?: number | null;
      phone_e164?: string | null;
      access_state?: string | null;
      trial_ends_at?: string | null;
      zalo_auto_linked?: boolean;
      bridge_status?: string | null;
      linked_channel_count?: number | null;
      zalo_link_status?: string | null;
      claim_code?: string | null;
      claim_status?: string | null;
      next_action?: string | null;
      profile_ready?: boolean;
      profile_missing_fields?: string[] | null;
    };
  }>(
    "/api/portal-complete-phone-onboarding",
    {
      phone: phoneE164,
      bridge: String(options?.bridge || "").trim() || null,
    },
    {
      accessToken:
        currentSession?.access_token ??
        verifyPayload.session?.access_token ??
        null,
    },
  );

  const row = (completionPayload.data ?? {}) as Record<string, unknown>;
  return {
    phoneE164: (row.phone_e164 as string | null) ?? verifyPayload.phone_e164 ?? phoneE164,
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    accessState: String(row.access_state ?? "pending_verification"),
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
    zaloAutoLinked: row.zalo_auto_linked === true,
    bridgeStatus: (row.bridge_status as string | null) ?? null,
    linkedChannelCount: row.linked_channel_count == null ? 0 : Number(row.linked_channel_count),
    zaloLinkStatus: (row.zalo_link_status as string | null) ?? null,
    claimCode: (row.claim_code as string | null) ?? null,
    claimStatus: (row.claim_status as string | null) ?? null,
    nextAction: (row.next_action as string | null) ?? null,
    profileReady: row.profile_ready === true,
    profileMissingFields: Array.isArray(row.profile_missing_fields)
      ? (row.profile_missing_fields as string[])
      : [],
  };
}

export async function portalStartEmailMagicLink(email: string, phoneInput?: string): Promise<void> {
  const phoneE164 = phoneInput ? normalizeVietnamPhoneInput(phoneInput) : "";
  if (typeof window !== "undefined" && phoneE164) {
    window.localStorage.setItem("calotrack.pending_phone_e164", phoneE164);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: buildSiteUrl(SITE_CONFIG.dashboardPath),
      shouldCreateUser: true,
      data: phoneE164 ? { pending_phone_e164: phoneE164 } : undefined,
    },
  });

  if (error) {
    throw new Error(formatErrorMessage(error));
  }
}

export async function fetchPortalMacroTracker7d(): Promise<PortalMacroDay[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    const response = await fetch("/api/portal-macro-tracker", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as { data?: unknown[] };
      const rows = Array.isArray(payload.data) ? payload.data : [];

      return rows.map((row) => {
        const record = row as Record<string, unknown>;
        return {
          date: String(record.date ?? ""),
          totalCalories: Number(record.total_calories ?? 0),
          totalProtein: Number(record.total_protein ?? 0),
          totalCarbs: Number(record.total_carbs ?? 0),
          totalFat: Number(record.total_fat ?? 0),
          calorieGoal: record.calorie_goal == null ? null : Number(record.calorie_goal),
        };
      });
    }
  }

  const { data, error } = await supabase.rpc("portal_get_macro_tracker_7d");
  if (error) {
    throw new Error(formatErrorMessage(error));
  }

  return Array.isArray(data)
    ? data.map((row) => {
        const record = row as Record<string, unknown>;
        return {
          date: String(record.date ?? ""),
          totalCalories: Number(record.total_calories ?? 0),
          totalProtein: Number(record.total_protein ?? 0),
          totalCarbs: Number(record.total_carbs ?? 0),
          totalFat: Number(record.total_fat ?? 0),
          calorieGoal: record.calorie_goal == null ? null : Number(record.calorie_goal),
        };
      })
    : [];
}

function mapPortalDashboardSummary(payload: Record<string, unknown>): PortalDashboardSummary {
  const profile = (payload.profile as Record<string, unknown> | null) ?? {};
  const daily = (payload.daily as Record<string, unknown> | null) ?? {};
  const weekly = (payload.weekly as Record<string, unknown> | null) ?? {};
  const goalPlan = (payload.goalPlan as Record<string, unknown> | null) ?? {};
  const latestBodyComposition = (payload.latestBodyComposition as Record<string, unknown> | null) ?? null;
  const requestedPeriod = (payload.requestedPeriod as Record<string, unknown> | null) ?? {};
  const chartRows = Array.isArray(payload.chart7d) ? payload.chart7d : [];

  return {
    profile: {
      customerId: profile.customerId == null ? null : Number(profile.customerId),
      linkedUserId: profile.linkedUserId == null ? null : Number(profile.linkedUserId),
      onboardingStatus: (profile.onboardingStatus as string | null) ?? null,
      primaryGoal: String(profile.primaryGoal ?? "maintain"),
      goalLabel: String(profile.goalLabel ?? "Duy trì"),
      weightKg: profile.weightKg == null ? null : Number(profile.weightKg),
      heightCm: profile.heightCm == null ? null : Number(profile.heightCm),
      age: profile.age == null ? null : Number(profile.age),
      gender: (profile.gender as string | null) ?? null,
      activityLevel: (profile.activityLevel as string | null) ?? null,
      tdee: profile.tdee == null ? null : Number(profile.tdee),
      dailyGoalKcal: Number(profile.dailyGoalKcal ?? 0),
      gymModeEnabled: profile.gymModeEnabled === true,
    },
    daily: {
      intakeKcal: Number(daily.intakeKcal ?? 0),
      exerciseKcal: Number(daily.exerciseKcal ?? 0),
      netKcal: Number(daily.netKcal ?? 0),
      goalKcal: Number(daily.goalKcal ?? 0),
      consumedProteinG: Number(daily.consumedProteinG ?? 0),
      consumedCarbsG: Number(daily.consumedCarbsG ?? 0),
      consumedFatG: Number(daily.consumedFatG ?? 0),
      targetProteinG: Number(daily.targetProteinG ?? 0),
      targetCarbsG: Number(daily.targetCarbsG ?? 0),
      targetFatG: Number(daily.targetFatG ?? 0),
      mealCount: Number(daily.mealCount ?? 0),
      date: String(daily.date ?? ""),
    },
    weekly: {
      targetKcal: Number(weekly.targetKcal ?? 0),
      targetProteinG: Number(weekly.targetProteinG ?? 0),
      targetCarbsG: Number(weekly.targetCarbsG ?? 0),
      targetFatG: Number(weekly.targetFatG ?? 0),
      consumedKcal: Number(weekly.consumedKcal ?? 0),
      consumedProteinG: Number(weekly.consumedProteinG ?? 0),
      consumedCarbsG: Number(weekly.consumedCarbsG ?? 0),
      consumedFatG: Number(weekly.consumedFatG ?? 0),
      remainingKcal: Number(weekly.remainingKcal ?? 0),
      remainingProteinG: Number(weekly.remainingProteinG ?? 0),
      remainingCarbsG: Number(weekly.remainingCarbsG ?? 0),
      remainingFatG: Number(weekly.remainingFatG ?? 0),
      daysLogged: Number(weekly.daysLogged ?? 0),
      startDate: String(weekly.startDate ?? ""),
      endDate: String(weekly.endDate ?? ""),
    },
    goalPlan: {
      primaryGoal: String(goalPlan.primaryGoal ?? "maintain"),
      targetMetric: (goalPlan.targetMetric as string | null) ?? null,
      targetWeightKg: goalPlan.targetWeightKg == null ? null : Number(goalPlan.targetWeightKg),
      targetBodyFatPct: goalPlan.targetBodyFatPct == null ? null : Number(goalPlan.targetBodyFatPct),
      currentWeightKg: goalPlan.currentWeightKg == null ? null : Number(goalPlan.currentWeightKg),
      currentBodyFatPct: goalPlan.currentBodyFatPct == null ? null : Number(goalPlan.currentBodyFatPct),
      dailyGoalKcal: Number(goalPlan.dailyGoalKcal ?? 0),
      weeklyRateKg: goalPlan.weeklyRateKg == null ? null : Number(goalPlan.weeklyRateKg),
      deltaKg: Number(goalPlan.deltaKg ?? 0),
      estimatedWeeksToGoal: goalPlan.estimatedWeeksToGoal == null ? null : Number(goalPlan.estimatedWeeksToGoal),
      kcalDeltaPerDay: Number(goalPlan.kcalDeltaPerDay ?? 0),
    },
    latestBodyComposition: latestBodyComposition
      ? {
          measuredAt: (latestBodyComposition.measuredAt as string | null) ?? null,
          age: latestBodyComposition.age == null ? null : Number(latestBodyComposition.age),
          gender: (latestBodyComposition.gender as string | null) ?? null,
          heightCm: latestBodyComposition.heightCm == null ? null : Number(latestBodyComposition.heightCm),
          weightKg: latestBodyComposition.weightKg == null ? null : Number(latestBodyComposition.weightKg),
          skeletalMuscleMassKg:
            latestBodyComposition.skeletalMuscleMassKg == null
              ? null
              : Number(latestBodyComposition.skeletalMuscleMassKg),
          bodyFatMassKg:
            latestBodyComposition.bodyFatMassKg == null ? null : Number(latestBodyComposition.bodyFatMassKg),
          bodyFatPct: latestBodyComposition.bodyFatPct == null ? null : Number(latestBodyComposition.bodyFatPct),
          bmi: latestBodyComposition.bmi == null ? null : Number(latestBodyComposition.bmi),
          bmr: latestBodyComposition.bmr == null ? null : Number(latestBodyComposition.bmr),
          visceralFatLevel:
            latestBodyComposition.visceralFatLevel == null ? null : Number(latestBodyComposition.visceralFatLevel),
          waistHipRatio:
            latestBodyComposition.waistHipRatio == null ? null : Number(latestBodyComposition.waistHipRatio),
          inbodyScore: latestBodyComposition.inbodyScore == null ? null : Number(latestBodyComposition.inbodyScore),
          targetWeightKg:
            latestBodyComposition.targetWeightKg == null ? null : Number(latestBodyComposition.targetWeightKg),
        }
      : null,
    chart7d: chartRows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        date: String(record.date ?? ""),
        totalCalories: Number(record.totalCalories ?? 0),
        totalProtein: Number(record.totalProtein ?? 0),
        totalCarbs: Number(record.totalCarbs ?? 0),
        totalFat: Number(record.totalFat ?? 0),
        calorieGoal: null,
      };
    }),
    requestedPeriod: {
      period:
        String(requestedPeriod.period ?? "week") === "day" || String(requestedPeriod.period ?? "week") === "month"
          ? (String(requestedPeriod.period) as "day" | "month")
          : "week",
      startDate: String(requestedPeriod.startDate ?? ""),
      endDate: String(requestedPeriod.endDate ?? ""),
      targetKcal: Number(requestedPeriod.targetKcal ?? 0),
      targetProteinG: Number(requestedPeriod.targetProteinG ?? 0),
      targetCarbsG: Number(requestedPeriod.targetCarbsG ?? 0),
      targetFatG: Number(requestedPeriod.targetFatG ?? 0),
      consumedKcal: Number(requestedPeriod.consumedKcal ?? 0),
      consumedProteinG: Number(requestedPeriod.consumedProteinG ?? 0),
      consumedCarbsG: Number(requestedPeriod.consumedCarbsG ?? 0),
      consumedFatG: Number(requestedPeriod.consumedFatG ?? 0),
      exerciseKcal: Number(requestedPeriod.exerciseKcal ?? 0),
      netKcal: Number(requestedPeriod.netKcal ?? 0),
      daysLogged: Number(requestedPeriod.daysLogged ?? 0),
    },
  };
}

export async function fetchPortalDashboardSummary(
  period: "day" | "week" | "month" = "week",
): Promise<PortalDashboardSummary> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Bạn cần đăng nhập lại để tải dashboard.");
  }

  const response = await fetch("/api/portal-dashboard-summary", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ period }),
  });

  const payload = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: string };
  if (!response.ok || !payload.data) {
    throw new Error(formatErrorMessage(payload.error || "portal_dashboard_summary_failed"));
  }

  return mapPortalDashboardSummary(payload.data);
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
    const accessState = String(row.access_state ?? "pending_verification").toLowerCase() as PortalAccessState;
    const usage = Number(row.quota_used_today ?? row.daily_ai_usage_count ?? 0);
    const entitlementSource = (row.entitlement_source as string | null) ?? null;
    const premiumUntil = (row.premium_until as string | null) ?? null;
    const trialEndsAt = (row.trial_ends_at as string | null) ?? null;

    return {
      customerId: row.customer_id == null ? null : Number(row.customer_id),
      linkedUserId: row.linked_user_id == null ? null : Number(row.linked_user_id),
      email: (row.email as string | null) ?? authUser.email ?? null,
      phoneE164: (row.phone_e164 as string | null) ?? authUser.phone ?? null,
      phoneDisplay: (row.phone_display as string | null) ?? authUser.phone ?? null,
      fullName: (row.full_name as string | null) ?? null,
      plan,
      premiumUntil,
      trialEndsAt,
      accessState,
      onboardingStatus: (row.onboarding_status as string | null) ?? null,
      dailyAiUsageCount: usage,
      entitlementSource,
      entitlementLabel: buildEntitlementLabel(plan, premiumUntil, accessState, entitlementSource),
      quotaLabel: buildQuotaLabel(accessState, plan, usage),
      source: ((row.source as PortalSnapshot["source"]) ?? "customer_linked"),
      payments: Array.isArray(row.payments) ? mapPortalPayments(row.payments as unknown[]) : [],
      linkedChannels: Array.isArray(row.linked_channels)
        ? mapPortalChannels(row.linked_channels as unknown[])
        : [],
      lastSyncAt: String(row.last_sync_at ?? new Date().toISOString()),
    };
  } catch (error) {
    throw new Error("Không thể lấy dữ liệu khách hàng: " + formatErrorMessage(error));
  }
}

export async function linkPortalCustomerByPhone(phoneInput: string): Promise<void> {
  const { error } = await supabase.rpc("portal_link_customer_by_phone", {
    p_phone_input: normalizeVietnamPhoneInput(phoneInput),
  });
  if (error) {
    throw new Error(formatErrorMessage(error));
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
    throw new Error("Không thể tạo đơn hàng: " + formatErrorMessage(error));
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
    throw new Error("Không thể tải trạng thái đơn hàng: " + formatErrorMessage(error));
  }
}

export async function portalCreateTelegramLinkToken(): Promise<TelegramLinkResult> {
  try {
    try {
      const payload = await invokeWebsiteApi<{
        channel: "telegram";
        status: "ready" | "already_linked";
        link_token: string | null;
        expires_at?: string | null;
        helper_text?: string | null;
        reused?: boolean;
        url?: string | null;
      }>("/api/portal-channel-link", { channel: "telegram" });

      return {
        linkToken: payload.link_token ?? null,
        url: payload.url || getTelegramLinkHref(payload.link_token ?? null),
        helperText:
          payload.helper_text ||
          "Mở Telegram bot, bot sẽ tự nhận token và nối vào account của bạn.",
        expiresAt:
          payload.expires_at ?? new Date(Date.now() + 30 * 60_000).toISOString(),
        reused: payload.reused === true,
        status: payload.status || "ready",
      };
    } catch (websiteError) {
      void websiteError;
    }

    // dashboard self-link prefers the website API so it can reuse active tokens and expose expiry
    const { data, error } = await supabase.rpc("portal_create_telegram_link_token");
    if (error) {
      throw error;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const linkToken = (row.link_token as string | null) ?? null;
    return {
      linkToken,
      url: getTelegramLinkHref(linkToken),
      helperText: "Mở Telegram bot, bot sẽ tự nhận token và nối vào account của bạn.",
      expiresAt:
        (row.expires_at as string | null) ??
        new Date(Date.now() + 30 * 60_000).toISOString(),
      reused: false,
      status: "ready",
    };
  } catch (error) {
    throw new Error("Lỗi kết nối nền tảng: " + formatErrorMessage(error));
  }
}

export async function portalCreateZaloLinkToken(): Promise<ZaloLinkResult> {
  try {
    try {
      const payload = await invokeWebsiteApi<{
        channel: "zalo";
        status: "ready" | "already_linked";
        link_token: string | null;
        link_code?: string | null;
        expires_at?: string | null;
        helper_text?: string | null;
        reused?: boolean;
        url?: string | null;
      }>("/api/portal-channel-link", { channel: "zalo" });

      return {
        status: payload.status || "ready",
        requestId: null,
        linkToken: payload.link_token ?? null,
        linkCode: payload.link_code ?? null,
        helperText:
          payload.helper_text ||
          "Mở Zalo OA Calo Track và gửi mã liên kết một lần để nối account.",
        zaloUrl: payload.url || SITE_CONFIG.zaloOaUrl,
        expiresAt:
          payload.expires_at ?? new Date(Date.now() + 30 * 60_000).toISOString(),
        reused: payload.reused === true,
      };
    } catch (websiteError) {
      void websiteError;
    }

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
          "Mở Zalo OA CaloTrack và gửi mã liên kết này để nối channel vào customer truth của bạn.",
        zaloUrl: SITE_CONFIG.zaloOaUrl,
        expiresAt:
          (row.expires_at as string | null) ??
          new Date(Date.now() + 30 * 60_000).toISOString(),
        reused: true,
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
      zaloUrl: SITE_CONFIG.zaloOaUrl,
      expiresAt: null,
      reused: false,
      helperText:
        (row.helper_text as string | null) ??
        "Yêu cầu link Zalo đã được ghi nhận để đội quản trị xác nhận.",
    };
  } catch (error) {
    throw new Error("Không thể gửi yêu cầu: " + formatErrorMessage(error));
  }
}

export function getPortalChannelLink(
  snapshot: PortalSnapshot | null | undefined,
  channel: PortalChannelLink["channel"],
): PortalChannelLink | null {
  return (snapshot?.linkedChannels ?? []).find((item) => item.channel === channel) ?? null;
}

export function normalizePortalChannelStatus(
  value: string | null | undefined,
): "linked" | "unlinked" | "pending_review" | "needs_support" | "invalid" | "expired" {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unlinked";
  if (normalized === "linked" || normalized === "already_linked") return "linked";
  if (normalized === "pending_review") return "pending_review";
  if (normalized === "needs_support") return "needs_support";
  if (normalized === "token_expired" || normalized === "expired") return "expired";
  if (
    normalized === "token_invalid" ||
    normalized === "token_missing" ||
    normalized === "token_not_found" ||
    normalized === "token_not_active" ||
    normalized === "invalid"
  ) {
    return "invalid";
  }
  return "unlinked";
}

export function getPortalChannelCards(snapshot?: PortalSnapshot | null) {
  const linkedChannels = new Set((snapshot?.linkedChannels ?? []).map((item) => item.channel));
  return [
    {
      key: "zalo",
      label: SITE_CONFIG.primaryChannelLabel,
      status: linkedChannels.has("zalo") ? "Đã liên kết" : "Sẵn sàng kết nối",
      helper: linkedChannels.has("zalo")
        ? "Zalo đã dùng chung trial, quota và customer truth với portal."
        : "Kênh chat chính cho người dùng Việt, dùng chung trial và entitlement sau khi link xong.",
      tone: "primary" as const,
    },
    {
      key: "telegram",
      label: SITE_CONFIG.secondaryChannelLabel,
      status: linkedChannels.has("telegram") ? "Đã liên kết" : SITE_CONFIG.secondaryChannelStatus,
      helper: linkedChannels.has("telegram")
        ? "Telegram đã nằm trong shared entitlement của customer."
        : "Phù hợp cho người muốn tracking liên tục trên Telegram nhưng vẫn dùng chung quyền với portal.",
      tone: "accent" as const,
    },
    {
      key: "web",
      label: SITE_CONFIG.webPortalLabel,
      status: linkedChannels.has("web") ? "Portal đã liên kết" : SITE_CONFIG.webPortalStatus,
      helper: "Portal dùng cho phone OTP, payment, linked channels và backoffice.",
      tone: "neutral" as const,
    },
  ];
}
