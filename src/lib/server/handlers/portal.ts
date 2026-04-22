import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import {
  cleanEnv,
  createServiceRoleClient,
  maybeSingle,
  readBody,
  requireAdminAccess,
  requireAuthenticatedUser,
  safeString,
  sendJson,
  writeAdminAuditLog,
} from "../adminServer.js";
import {
  computeCoreProfileDerivedMetrics,
  getDashboardSummary,
  resolveCanonicalPortalCustomerForAuthUser,
  resolveDashboardAccess,
  type DashboardPeriod,
  type PrimaryGoal,
} from "../dashboardSummaryServer.js";
import {
  buildAsciiOtpMessage,
  getOtpMaxAttempts,
  getOtpResendCooldownSeconds,
  getOtpTtlSeconds,
  hashOtp,
  issueSessionForPhone,
  maskOtpMessage,
  normalizeVietnamPhoneInput,
  randomOtp,
} from "../portalPhoneAuthServer.js";
import {
  BILLING_OFFERS,
  normalizePublicBillingSku,
  type BillingSku,
  type PlanTier,
} from "../../billing.js";
import {
  PORTAL_SITE_CONFIG_AUDIT_ACTION,
  PORTAL_SITE_CONFIG_TARGET_ID,
  PORTAL_SITE_CONFIG_TARGET_TYPE,
  PUBLIC_PORTAL_SITE_SETTING_KEYS,
  normalizePublicPortalSiteUrl,
  normalizePortalSiteSettings,
  readLatestPortalSiteSettings,
} from "../portalSiteConfigServer.js";
import { handleAdminIdentitiesRequest } from "../adminIdentitiesApiServer.js";
import { handleAdminMembersRequest } from "../adminMembersApiServer.js";
import {
  autoLinkZaloBridgeToCustomer,
  buildZaloPhoneAuthGateText,
  createOrReuseZaloAuthBridge,
  readZaloAuthBridgeToken,
} from "../zaloAuthBridgeServer.js";
import {
  readRetentionNotificationSettings,
  setRetentionNotificationSetting,
} from "../zaloRetentionServer.js";
import { sendZaloTemplateMessage } from "../zaloOaServer.js";

type AnyRecord = Record<string, unknown>;
type ChannelKey = "telegram" | "zalo";

const DEFAULT_TELEGRAM_BOT_URL = safeString(process.env.VITE_TELEGRAM_BOT_URL) || "https://t.me/CaloTrack_bot";
const DEFAULT_ZALO_OA_URL = safeString(process.env.VITE_ZALO_OA_URL) || "https://zalo.me/4423588403113387176";
const TOKEN_TTL_MINUTES = 30;
const CHECKOUT_PENDING_TTL_MS = 6 * 60 * 60 * 1000;
const CHECKOUT_HANDOFF_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHECKOUT_HANDOFF_CODE_LENGTH = 8;
const CLAIM_CODE_ALPHABET = "ABCDEF0123456789";
const CLAIM_CODE_LENGTH = 8;
const CLAIM_WINDOW_HOURS = 4;
const CLAIM_FALLBACK_WINDOW_MINUTES = 30;
const ORDER_STATUS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const CHECKOUT_PENDING_STATUSES = [
  "pending",
  "pending_confirmation",
  "processing",
  "awaiting_payment",
] as const;
type CheckoutBillingSku = Extract<
  BillingSku,
  "monthly" | "firsttime_promo" | "quarterly_promo" | "yearly" | "lifetime"
>;

function isPgUniqueViolation(error: unknown) {
  const code = String((error as { code?: string })?.code || "").trim();
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique constraint");
}

function cleanEnv(value: string | undefined) {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

function getAction(req: any) {
  return String(req.query?.action || "").trim().toLowerCase();
}

function getPeriod(req: any, body: Record<string, unknown>): DashboardPeriod {
  const fromQuery = String(req.query?.period || "").trim().toLowerCase();
  const fromBody = String(body.period || "").trim().toLowerCase();
  const value = fromQuery || fromBody;
  return value === "day" || value === "month" ? (value as DashboardPeriod) : "week";
}

function normalizeChannel(value: unknown): ChannelKey | null {
  const text = safeString(value)?.toLowerCase();
  if (text === "telegram" || text === "zalo") {
    return text;
  }
  return null;
}

function normalizeNotificationEnabled(value: unknown) {
  if (value === true || value === false) return value;
  const text = safeString(value)?.toLowerCase();
  if (["true", "1", "yes", "on"].includes(text || "")) return true;
  if (["false", "0", "no", "off"].includes(text || "")) return false;
  return null;
}

function normalizeCheckoutPlan(value: unknown): PlanTier {
  const text = safeString(value)?.toLowerCase();
  if (text === "lifetime") return "lifetime";
  if (text === "pro") return "pro";
  return "free";
}

function normalizeCheckoutBillingSku(
  plan: PlanTier,
  value: unknown,
): CheckoutBillingSku | null {
  const normalized = normalizePublicBillingSku(safeString(value), { plan });
  if (!normalized || normalized === "weekly") {
    return plan === "lifetime" ? "lifetime" : plan === "pro" ? "monthly" : null;
  }
  return normalized as CheckoutBillingSku;
}

function resolveCheckoutAmountVnd(plan: PlanTier, billingSku: CheckoutBillingSku | null): number {
  if (plan === "free" || !billingSku) return 0;
  return BILLING_OFFERS[billingSku].priceVnd;
}

function resolveCheckoutBillingCycle(billingSku: CheckoutBillingSku | null) {
  if (billingSku === "yearly") return "yearly";
  if (billingSku === "lifetime") return "lifetime";
  return "monthly";
}

function createCheckoutOrderCode() {
  const timePart = new Date()
    .toISOString()
    .replace(/[^\d]/g, "")
    .slice(2, 14);
  const randomPart = randomBytes(4).toString("hex").toUpperCase();
  return `CT${timePart}${randomPart}`;
}

function getOrderStatusSecret() {
  return (
    cleanEnv(process.env.PORTAL_ORDER_STATUS_SECRET) ||
    cleanEnv(process.env.SEPAY_WEBHOOK_SECRET) ||
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

function signOrderStatusToken(orderId: string | number, orderCode: string | null) {
  const secret = getOrderStatusSecret();
  if (!secret) return null;

  const payload = {
    orderId: String(orderId),
    orderCode: safeString(orderCode),
    exp: Math.floor(Date.now() / 1000) + ORDER_STATUS_TOKEN_TTL_SECONDS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function buildCheckoutHelperText(orderCode: string) {
  return `Hệ thống sẽ tự kích hoạt khi chuyển đúng hoặc dư tiền và giữ nguyên nội dung ${orderCode}. Nếu thiếu tiền hoặc sai nội dung chuyển khoản, bạn chỉ cần tạo lại đơn hoặc QR mới để hệ thống tự nhận đúng.`;
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildCompatWebPlatformId(email: string | null, authUserId: string) {
  return email ? `web:${email}` : `web:${authUserId}`;
}

function hasFutureIso(value: unknown) {
  const iso = safeString(value);
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp > Date.now() : false;
}

function hasPaidPlan(customer: AnyRecord | null | undefined) {
  const plan = safeString(customer?.plan)?.toLowerCase();
  return plan === "lifetime" || (plan === "pro" && hasFutureIso(customer?.premium_until));
}

function deriveCustomerAccessState(customer: AnyRecord | null | undefined) {
  if (!customer) return "pending_verification";

  const isBanned =
    customer.is_banned === true ||
    (hasFutureIso(customer.ban_until) && safeString(customer.status)?.toLowerCase() === "blocked");
  if (isBanned || safeString(customer.status)?.toLowerCase() === "blocked") {
    return "blocked";
  }

  if (!safeString(customer.phone_verified_at)) {
    return "pending_verification";
  }

  if (hasPaidPlan(customer)) {
    return "active_paid";
  }

  if (hasFutureIso(customer.trial_ends_at)) {
    return "trialing";
  }

  return "free_limited";
}

function toFinitePortalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number.parseFloat(String(value).replace(",", ".").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePendingIntentState(value: unknown): AnyRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as AnyRecord) };
  }
  const raw = safeString(value);
  if (!raw || raw === "{}" || raw === "=") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as AnyRecord) }
      : {};
  } catch {
    return {};
  }
}

function collectMissingCoreProfileFields(userRow: AnyRecord | null | undefined) {
  const missing: string[] = [];
  if (!safeString(userRow?.gender)) missing.push("giới tính");
  if (toFinitePortalNumber(userRow?.age) === null) missing.push("tuổi");
  if (toFinitePortalNumber(userRow?.height_cm) === null) missing.push("chiều cao");
  if (toFinitePortalNumber(userRow?.weight_kg) === null) missing.push("cân nặng");
  const activityRaw = safeString(userRow?.activity_level);
  if (!activityRaw && userRow?.activity_level !== 0) missing.push("mức vận động");
  return missing;
}

type CoreProfilePatch = {
  gender: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: number | null;
};

function buildCheckoutHandoffCode(length = CHECKOUT_HANDOFF_CODE_LENGTH) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += CHECKOUT_HANDOFF_CODE_ALPHABET[Math.floor(Math.random() * CHECKOUT_HANDOFF_CODE_ALPHABET.length)];
  }
  return output;
}

function buildClaimCode(length = CLAIM_CODE_LENGTH) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += CLAIM_CODE_ALPHABET[Math.floor(Math.random() * CLAIM_CODE_ALPHABET.length)];
  }
  return output;
}

function normalizeClaimCode(value: unknown) {
  return safeString(value)?.replace(/\s+/g, "").toUpperCase() || null;
}

function hashClaimCode(value: unknown) {
  const normalized = normalizeClaimCode(value);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

function addClaimWindowHours(hours = CLAIM_WINDOW_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function maskPhoneForDisplay(value: unknown) {
  const phone = safeString(value) || "";
  if (!phone) return "số điện thoại của bạn";
  const suffix = phone.slice(-4);
  return `***${suffix}`;
}

function buildCheckoutHandoffToken() {
  return randomBytes(18).toString("base64url");
}

function normalizePortalRelativePath(value: unknown, fallback = "/checkout") {
  const raw = safeString(value);
  if (!raw) return fallback;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      return `${parsed.pathname || fallback}${parsed.search || ""}` || fallback;
    }
  } catch {
    return fallback;
  }
  if (!raw.startsWith("/")) return fallback;
  return raw;
}

function normalizeCoreProfileGender(value: unknown) {
  const raw = (safeString(value) || "").toLowerCase().trim();
  if (!raw) return null;
  if (/(male|nam|man|m)\b/.test(raw)) return "male";
  if (/(female|nu|nữ|woman|f)\b/.test(raw)) return "female";
  return null;
}

function normalizeCoreProfileActivityLevel(value: unknown) {
  const raw = (safeString(value) || "").toLowerCase().trim();
  if (!raw) return null;
  const explicit = raw.match(/\b(?:muc|mức|level|lv)\s*([1-5])\b/u);
  if (explicit) return Number(explicit[1]);
  if (/^[1-5]$/.test(raw)) {
    const numeric = Number.parseInt(raw, 10);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function normalizeCoreProfileAge(value: unknown) {
  const numeric = toFinitePortalNumber(value);
  if (numeric === null) return null;
  const rounded = Math.round(numeric);
  return rounded >= 13 && rounded <= 100 ? rounded : null;
}

function normalizeCoreProfileHeightCm(value: unknown) {
  const numeric = toFinitePortalNumber(value);
  if (numeric === null) return null;
  if (numeric >= 1.2 && numeric <= 2.5) return Math.round(numeric * 100);
  const rounded = Math.round(numeric);
  return rounded >= 120 && rounded <= 250 ? rounded : null;
}

function normalizeCoreProfileWeightKg(value: unknown) {
  const numeric = toFinitePortalNumber(value);
  if (numeric === null) return null;
  const rounded = Math.round(numeric * 10) / 10;
  return rounded >= 20 && rounded <= 400 ? rounded : null;
}

function countFilledCoreProfileFields(profile: CoreProfilePatch) {
  return [
    profile.gender,
    profile.age,
    profile.heightCm,
    profile.weightKg,
    profile.activityLevel,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

function mergeCoreProfilePatch(existing: AnyRecord | null | undefined, input: Record<string, unknown>) {
  const gender = normalizeCoreProfileGender(input.gender) ?? normalizeCoreProfileGender(existing?.gender);
  const age = normalizeCoreProfileAge(input.age) ?? normalizeCoreProfileAge(existing?.age);
  const heightCm = normalizeCoreProfileHeightCm(input.height_cm ?? input.heightCm) ?? normalizeCoreProfileHeightCm(existing?.height_cm);
  const weightKg = normalizeCoreProfileWeightKg(input.weight_kg ?? input.weightKg) ?? normalizeCoreProfileWeightKg(existing?.weight_kg);
  const activityLevel =
    normalizeCoreProfileActivityLevel(input.activity_level ?? input.activityLevel) ??
    normalizeCoreProfileActivityLevel(existing?.activity_level);

  return {
    gender,
    age,
    heightCm,
    weightKg,
    activityLevel,
  } satisfies CoreProfilePatch;
}

function normalizeProfileIntakeText(value: unknown) {
  return (safeString(value) || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, (char) => (char === "\u0111" ? "d" : "D"))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeProfileIntakeText(value: unknown) {
  return safeString(value)
    .split(/[,\n;|]+/)
    .flatMap((segment) => segment.split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);
}

function extractCoreProfileHeightCmFromText(value: unknown) {
  const raw = safeString(value);
  const normalized = normalizeProfileIntakeText(value);
  const hybridMatch = normalized.match(/\b(\d)\s*m\s*(\d{1,2})\b/);
  if (hybridMatch) {
    return normalizeCoreProfileHeightCm(Number(hybridMatch[1]) * 100 + Number(hybridMatch[2]));
  }
  const meterMatch = raw.match(/(\d(?:[.,]\d{1,2})?)\s*m\b/i);
  if (meterMatch) {
    return normalizeCoreProfileHeightCm(Number(String(meterMatch[1]).replace(",", ".")));
  }
  const cmMatch = normalized.match(/\b(\d{3})\s*cm\b/);
  if (cmMatch) {
    return normalizeCoreProfileHeightCm(Number(cmMatch[1]));
  }
  return null;
}

function extractCoreProfileWeightKgFromText(value: unknown) {
  const normalized = normalizeProfileIntakeText(value);
  const match = normalized.match(/\b(\d{2,3}(?:[.,]\d)?)\s*kg\b/);
  if (!match) return null;
  return normalizeCoreProfileWeightKg(Number(String(match[1]).replace(",", ".")));
}

function extractCoreProfileAgeFromText(value: unknown) {
  const normalized = normalizeProfileIntakeText(value);
  const match =
    normalized.match(/\b(\d{1,3})\s*(tuoi|y\/o|yrs?|years? old)\b/) ||
    normalized.match(/\btuoi\s*(\d{1,3})\b/) ||
    normalized.match(/\bage\s*(\d{1,3})\b/);
  if (!match?.[1]) return null;
  return normalizeCoreProfileAge(Number(match[1]));
}

export function parseCoreProfileInputText(
  messageText: string,
  currentUserRow: AnyRecord | null | undefined,
) {
  const patch: Record<string, unknown> = {};
  const matchedFields = new Set<string>();
  const normalized = normalizeProfileIntakeText(messageText);
  const currentMissingFields = collectMissingCoreProfileFields(currentUserRow);
  const onlyMissingField = currentMissingFields.length === 1 ? currentMissingFields[0] : null;
  const ageMissing = currentMissingFields.includes("tuổi");
  const heightMissing = currentMissingFields.includes("chiều cao");
  const weightMissing = currentMissingFields.includes("cân nặng");
  const activityMissing = currentMissingFields.includes("mức vận động");

  const gender = normalizeCoreProfileGender(messageText);
  if (gender) {
    patch.gender = gender;
    matchedFields.add("gender");
  }

  const explicitActivityLevel = normalizeCoreProfileActivityLevel(messageText);
  if (explicitActivityLevel !== null) {
    patch.activity_level = explicitActivityLevel;
    matchedFields.add("activity_level");
  }

  const explicitHeightCm = extractCoreProfileHeightCmFromText(messageText);
  if (explicitHeightCm !== null) {
    patch.height_cm = explicitHeightCm;
    matchedFields.add("height_cm");
  }

  const explicitWeightKg = extractCoreProfileWeightKgFromText(messageText);
  if (explicitWeightKg !== null) {
    patch.weight_kg = explicitWeightKg;
    matchedFields.add("weight_kg");
  }

  const explicitAge = extractCoreProfileAgeFromText(messageText);
  if (explicitAge !== null) {
    patch.age = explicitAge;
    matchedFields.add("age");
  }

  const bareNumericTokens = tokenizeProfileIntakeText(messageText)
    .map((token) => token.replace(",", "."))
    .filter((token) => /^\d{1,3}(?:\.\d)?$/.test(token))
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token));

  const consumeBareToken = (predicate: (numeric: number) => boolean) => {
    const index = bareNumericTokens.findIndex(predicate);
    if (index < 0) return null;
    const [value] = bareNumericTokens.splice(index, 1);
    return value ?? null;
  };

  if (!matchedFields.has("age") && ageMissing) {
    const bareAge = consumeBareToken((numeric) => numeric >= 13 && numeric <= 100);
    if (bareAge !== null) {
      patch.age = normalizeCoreProfileAge(bareAge);
      matchedFields.add("age");
    }
  }

  if (!matchedFields.has("height_cm") && heightMissing) {
    const bareHeight = consumeBareToken((numeric) => numeric >= 120 && numeric <= 250);
    if (bareHeight !== null) {
      patch.height_cm = normalizeCoreProfileHeightCm(bareHeight);
      matchedFields.add("height_cm");
    }
  }

  if (!matchedFields.has("weight_kg") && weightMissing) {
    const bareWeight = consumeBareToken((numeric) => numeric >= 20 && numeric <= 400);
    if (bareWeight !== null) {
      patch.weight_kg = normalizeCoreProfileWeightKg(bareWeight);
      matchedFields.add("weight_kg");
    }
  }

  if (!matchedFields.has("activity_level") && activityMissing) {
    const bareActivity = consumeBareToken((numeric) => numeric >= 1 && numeric <= 5);
    if (bareActivity !== null) {
      patch.activity_level = normalizeCoreProfileActivityLevel(bareActivity);
      matchedFields.add("activity_level");
    }
  }

  if (onlyMissingField === "tuổi" && !matchedFields.has("age") && /^\d{1,3}$/.test(normalized)) {
    const age = normalizeCoreProfileAge(Number(normalized));
    if (age !== null) {
      patch.age = age;
      matchedFields.add("age");
    }
  }

  if (
    onlyMissingField === "mức vận động" &&
    !matchedFields.has("activity_level") &&
    explicitActivityLevel !== null
  ) {
    patch.activity_level = explicitActivityLevel;
    matchedFields.add("activity_level");
  }

  return {
    patch,
    matchedFields: Array.from(matchedFields),
  };
}

function buildForcedOnboardingPendingIntent(
  existing: unknown,
  phoneE164: string,
  missingFields: string[],
) {
  const pendingIntent = parsePendingIntentState(existing);
  const interactionContext =
    pendingIntent.interaction_context && typeof pendingIntent.interaction_context === "object"
      ? { ...(pendingIntent.interaction_context as AnyRecord) }
      : {};

  pendingIntent.schema_version = Number(pendingIntent.schema_version ?? 1) > 0
    ? Number(pendingIntent.schema_version ?? 1)
    : 1;
  pendingIntent.active_surface = "onboarding_profile";
  pendingIntent.onboarding_profile = {
    forced: true,
    source: "phone_completion",
    phone_e164: phoneE164,
    missing_fields: missingFields,
    required_fields: ["gender", "age", "height_cm", "weight_kg", "activity_level"],
    updated_at: new Date().toISOString(),
  };
  pendingIntent.interaction_context = {
    ...interactionContext,
    last_surface: "onboarding_profile",
    last_action: "phone_completion_onboarding_gate",
    last_non_error_reply_at: new Date().toISOString(),
  };
  return pendingIntent;
}

function clearForcedOnboardingPendingIntent(existing: unknown) {
  const pendingIntent = parsePendingIntentState(existing);
  delete pendingIntent.onboarding_profile;
  if (safeString(pendingIntent.active_surface) === "onboarding_profile") {
    delete pendingIntent.active_surface;
  }
  return pendingIntent;
}

function isMissingFunctionSchemaCacheError(error: unknown, functionName: string) {
  const message = String((error as Error)?.message || error || "");
  return message.includes(`Could not find the function public.${functionName}`) && message.includes("schema cache");
}

async function refreshCustomerTruthBestEffort(admin: any, customerId: number) {
  const rpcCalls = [
    admin.rpc("refresh_customer_access_state", { p_customer_id: customerId }),
    admin.rpc("sync_customer_to_compat_users", { p_customer_id: customerId }),
  ];

  for (const call of rpcCalls) {
    try {
      await call;
    } catch {
      // Best-effort only. Direct table writes remain the source of truth.
    }
  }
}

export type PhoneOnboardingTruthState =
  | "auth_only"
  | "customer_linked"
  | "zalo_linked"
  | "repair_required";

export type PhoneOnboardingTruth = {
  truthState: PhoneOnboardingTruthState;
  repairRequired: boolean;
  customerId: number | null;
  phoneVerifiedAt: string | null;
  authLinked: boolean;
  compatLinked: boolean;
  webLinked: boolean;
  zaloLinked: boolean;
  linkedChannelCount: number;
  zaloLinkStatus: string;
};

type PhoneChallengeIdentityContext = {
  sourceChannel: string | null;
  platformUserId: string | null;
  platformChatId: string | null;
  platformDisplayName: string | null;
  bridgeToken: string | null;
  sourceOrigin: string | null;
};

type PhoneChallengeClaimContext = {
  claimCode: string | null;
  claimCodeHash: string | null;
  claimWindowExpiresAt: string | null;
};

const AUTH_PHONE_CHALLENGE_BASE_SELECT =
  "id, phone_e164, auth_user_id, customer_id, status, provider_request_payload, provider_response_payload, created_at, expires_at, consumed_at";
const AUTH_PHONE_CHALLENGE_IDENTITY_SELECT = `${AUTH_PHONE_CHALLENGE_BASE_SELECT}, source_channel, platform_user_id, platform_chat_id, platform_display_name, bridge_token, source_origin, chat_identity_snapshot`;

let authPhoneChallengeIdentitySchemaAvailable: boolean | null = null;
let authPhoneChallengeClaimSchemaAvailable: boolean | null = null;

function isLinkedRowStatus(value: unknown) {
  const normalized = safeString(value)?.toLowerCase();
  return normalized === "linked" || normalized === "active";
}

function isAuthPhoneChallengeIdentitySchemaError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (!message.includes("auth_phone_challenges")) return false;
  return [
    "source_channel",
    "platform_user_id",
    "platform_chat_id",
    "platform_display_name",
    "bridge_token",
    "source_origin",
    "chat_identity_snapshot",
  ].some((column) => message.includes(column));
}

function isAuthPhoneChallengeClaimSchemaError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (!message.includes("auth_phone_challenges")) return false;
  return ["claim_code", "claim_code_hash", "claim_window_expires_at"].some((column) =>
    message.includes(column),
  );
}

function markAuthPhoneChallengeIdentitySchemaAvailable(available: boolean) {
  authPhoneChallengeIdentitySchemaAvailable = available;
}

function canUseAuthPhoneChallengeIdentitySchema() {
  return authPhoneChallengeIdentitySchemaAvailable !== false;
}

function markAuthPhoneChallengeClaimSchemaAvailable(available: boolean) {
  authPhoneChallengeClaimSchemaAvailable = available;
}

function canUseAuthPhoneChallengeClaimSchema() {
  return authPhoneChallengeClaimSchemaAvailable !== false;
}

function normalizeOnboardingSourceChannel(value: unknown) {
  const normalized = safeString(value)?.toLowerCase();
  if (normalized === "zalo" || normalized === "telegram" || normalized === "web") {
    return normalized;
  }
  return null;
}

function buildPhoneChallengeIdentityContext(params: {
  sourceChannel?: string | null;
  platformUserId?: string | null;
  platformChatId?: string | null;
  platformDisplayName?: string | null;
  bridgeToken?: string | null;
  sourceOrigin?: string | null;
}) {
  return {
    sourceChannel: normalizeOnboardingSourceChannel(params.sourceChannel),
    platformUserId: safeString(params.platformUserId),
    platformChatId: safeString(params.platformChatId),
    platformDisplayName: safeString(params.platformDisplayName),
    bridgeToken: safeString(params.bridgeToken),
    sourceOrigin: safeString(params.sourceOrigin),
  } satisfies PhoneChallengeIdentityContext;
}

function buildPhoneChallengeClaimContext(params: {
  claimCode?: string | null;
  claimCodeHash?: string | null;
  claimWindowExpiresAt?: string | null;
}) {
  return {
    claimCode: normalizeClaimCode(params.claimCode),
    claimCodeHash: safeString(params.claimCodeHash),
    claimWindowExpiresAt: safeString(params.claimWindowExpiresAt),
  } satisfies PhoneChallengeClaimContext;
}

function readPhoneChallengeIdentityContext(challenge: AnyRecord | null | undefined) {
  const snapshot =
    challenge?.chat_identity_snapshot && typeof challenge.chat_identity_snapshot === "object"
      ? (challenge.chat_identity_snapshot as AnyRecord)
      : {};
  const requestPayload =
    challenge?.provider_request_payload && typeof challenge.provider_request_payload === "object"
      ? (challenge.provider_request_payload as AnyRecord)
      : {};
  const responsePayload =
    challenge?.provider_response_payload && typeof challenge.provider_response_payload === "object"
      ? (challenge.provider_response_payload as AnyRecord)
      : {};
  const legacySnapshot =
    requestPayload?._challenge_identity && typeof requestPayload._challenge_identity === "object"
      ? (requestPayload._challenge_identity as AnyRecord)
      : responsePayload?._challenge_identity && typeof responsePayload._challenge_identity === "object"
        ? (responsePayload._challenge_identity as AnyRecord)
        : {};

  return buildPhoneChallengeIdentityContext({
    sourceChannel: safeString(challenge?.source_channel ?? snapshot.source_channel ?? legacySnapshot.source_channel),
    platformUserId: safeString(challenge?.platform_user_id ?? snapshot.platform_user_id ?? legacySnapshot.platform_user_id),
    platformChatId: safeString(challenge?.platform_chat_id ?? snapshot.platform_chat_id ?? legacySnapshot.platform_chat_id),
    platformDisplayName: safeString(
      challenge?.platform_display_name ?? snapshot.platform_display_name ?? legacySnapshot.platform_display_name,
    ),
    bridgeToken: safeString(challenge?.bridge_token ?? snapshot.bridge_token ?? legacySnapshot.bridge_token),
    sourceOrigin: safeString(challenge?.source_origin ?? snapshot.source_origin ?? legacySnapshot.source_origin),
  });
}

function buildAuthPhoneChallengeIdentitySnapshot(
  identity: PhoneChallengeIdentityContext,
  bridgeStatus?: string | null,
) {
  return {
    source_channel: identity.sourceChannel,
    platform_user_id: identity.platformUserId,
    platform_chat_id: identity.platformChatId,
    platform_display_name: identity.platformDisplayName,
    bridge_token: identity.bridgeToken,
    source_origin: identity.sourceOrigin,
    ...(bridgeStatus ? { bridge_status: bridgeStatus } : {}),
  };
}

function buildAuthPhoneChallengeClaimSnapshot(claim: PhoneChallengeClaimContext) {
  return {
    claim_code: claim.claimCode,
    claim_code_hash: claim.claimCodeHash,
    claim_window_expires_at: claim.claimWindowExpiresAt,
  };
}

function buildAuthPhoneChallengeIdentityFields(
  identity: PhoneChallengeIdentityContext,
  bridgeStatus?: string | null,
) {
  return {
    source_channel: identity.sourceChannel,
    platform_user_id: identity.platformUserId,
    platform_chat_id: identity.platformChatId,
    platform_display_name: identity.platformDisplayName,
    bridge_token: identity.bridgeToken,
    source_origin: identity.sourceOrigin,
    chat_identity_snapshot: buildAuthPhoneChallengeIdentitySnapshot(identity, bridgeStatus),
  };
}

function mergeLegacyChallengeIdentityPayloads(
  challenge: AnyRecord | null | undefined,
  identity: PhoneChallengeIdentityContext,
  bridgeStatus?: string | null,
) {
  const snapshot = buildAuthPhoneChallengeIdentitySnapshot(identity, bridgeStatus);
  const requestPayload =
    challenge?.provider_request_payload && typeof challenge.provider_request_payload === "object"
      ? (challenge.provider_request_payload as AnyRecord)
      : {};
  const responsePayload =
    challenge?.provider_response_payload && typeof challenge.provider_response_payload === "object"
      ? (challenge.provider_response_payload as AnyRecord)
      : {};

  return {
    provider_request_payload: {
      ...requestPayload,
      _challenge_identity: snapshot,
    },
    provider_response_payload: {
      ...responsePayload,
      _challenge_identity: snapshot,
    },
  };
}

function readPhoneChallengeClaimContextFromChallenge(challenge: AnyRecord | null | undefined) {
  const requestPayload =
    challenge?.provider_request_payload && typeof challenge.provider_request_payload === "object"
      ? (challenge.provider_request_payload as AnyRecord)
      : {};
  const responsePayload =
    challenge?.provider_response_payload && typeof challenge.provider_response_payload === "object"
      ? (challenge.provider_response_payload as AnyRecord)
      : {};
  const legacySnapshot =
    requestPayload?._claim_context && typeof requestPayload._claim_context === "object"
      ? (requestPayload._claim_context as AnyRecord)
      : responsePayload?._claim_context && typeof responsePayload._claim_context === "object"
        ? (responsePayload._claim_context as AnyRecord)
        : {};

  return buildPhoneChallengeClaimContext({
    claimCode: safeString(challenge?.claim_code ?? legacySnapshot.claim_code),
    claimCodeHash: safeString(challenge?.claim_code_hash ?? legacySnapshot.claim_code_hash),
    claimWindowExpiresAt: safeString(
      challenge?.claim_window_expires_at ?? legacySnapshot.claim_window_expires_at,
    ),
  });
}

function mergeLegacyChallengeClaimPayloads(
  challenge: AnyRecord | null | undefined,
  claim: PhoneChallengeClaimContext,
) {
  const snapshot = buildAuthPhoneChallengeClaimSnapshot(claim);
  const requestPayload =
    challenge?.provider_request_payload && typeof challenge.provider_request_payload === "object"
      ? (challenge.provider_request_payload as AnyRecord)
      : {};
  const responsePayload =
    challenge?.provider_response_payload && typeof challenge.provider_response_payload === "object"
      ? (challenge.provider_response_payload as AnyRecord)
      : {};

  return {
    provider_request_payload: {
      ...requestPayload,
      _claim_context: snapshot,
    },
    provider_response_payload: {
      ...responsePayload,
      _claim_context: snapshot,
    },
  };
}

async function readLatestPhoneChallengeForAuth(
  admin: any,
  params: {
    authUserId: string;
    phoneE164: string;
  },
) {
  const buildQuery = (selectClause: string) =>
    admin
      .from("auth_phone_challenges")
      .select(selectClause)
      .eq("auth_user_id", params.authUserId)
      .eq("phone_e164", params.phoneE164)
      .eq("channel", "zalo_phone_template")
      .order("created_at", { ascending: false })
      .limit(1);

  if (canUseAuthPhoneChallengeIdentitySchema()) {
    try {
      const row = await maybeSingle<AnyRecord>(buildQuery(AUTH_PHONE_CHALLENGE_IDENTITY_SELECT));
      markAuthPhoneChallengeIdentitySchemaAvailable(true);
      return row || null;
    } catch (error) {
      if (!isAuthPhoneChallengeIdentitySchemaError(error)) throw error;
      markAuthPhoneChallengeIdentitySchemaAvailable(false);
    }
  }

  return (await maybeSingle<AnyRecord>(buildQuery(AUTH_PHONE_CHALLENGE_BASE_SELECT))) || null;
}

async function readPhoneChallengeClaimContext(
  admin: any,
  challengeId: string | null | undefined,
): Promise<PhoneChallengeClaimContext> {
  const normalizedId = safeString(challengeId);
  if (!normalizedId) {
    return {
      claimCode: null,
      claimCodeHash: null,
      claimWindowExpiresAt: null,
    };
  }

  try {
    const row =
      (await maybeSingle<AnyRecord>(
        admin
          .from("auth_phone_challenges")
          .select("claim_code, claim_code_hash, claim_window_expires_at")
          .eq("id", normalizedId)
          .limit(1),
      )) || null;
    markAuthPhoneChallengeClaimSchemaAvailable(true);
    return readPhoneChallengeClaimContextFromChallenge(row);
  } catch (error) {
    if (!isAuthPhoneChallengeClaimSchemaError(error)) throw error;
    markAuthPhoneChallengeClaimSchemaAvailable(false);
    const row =
      (await maybeSingle<AnyRecord>(
        admin
          .from("auth_phone_challenges")
          .select("id, provider_request_payload, provider_response_payload")
          .eq("id", normalizedId)
          .limit(1),
      )) || null;
    return readPhoneChallengeClaimContextFromChallenge(row);
  }
}

async function insertAuthPhoneChallenge(
  admin: any,
  baseRecord: AnyRecord,
  identity: PhoneChallengeIdentityContext,
  bridgeStatus: string | null,
) {
  const claimContext = buildPhoneChallengeClaimContext({
    claimCode: safeString(baseRecord.claim_code),
    claimCodeHash: safeString(baseRecord.claim_code_hash),
    claimWindowExpiresAt: safeString(baseRecord.claim_window_expires_at),
  });
  const {
    claim_code: _claimCode,
    claim_code_hash: _claimCodeHash,
    claim_window_expires_at: _claimWindowExpiresAt,
    ...baseRecordWithoutClaimColumns
  } = baseRecord;

  const buildInsertRecord = (includeIdentityColumns: boolean, includeClaimColumns: boolean) => {
    let record: AnyRecord = { ...baseRecordWithoutClaimColumns };

    record = includeIdentityColumns
      ? {
          ...record,
          ...buildAuthPhoneChallengeIdentityFields(identity, bridgeStatus),
        }
      : {
          ...record,
          ...mergeLegacyChallengeIdentityPayloads(record, identity, bridgeStatus),
        };

    record = includeClaimColumns
      ? {
          ...record,
          ...buildAuthPhoneChallengeClaimSnapshot(claimContext),
        }
      : {
          ...record,
          ...mergeLegacyChallengeClaimPayloads(record, claimContext),
        };

    return record;
  };

  let includeIdentityColumns = canUseAuthPhoneChallengeIdentitySchema();
  let includeClaimColumns = canUseAuthPhoneChallengeClaimSchema();

  while (true) {
    const insertRecord = buildInsertRecord(includeIdentityColumns, includeClaimColumns);
    const { error } = await admin.from("auth_phone_challenges").insert(insertRecord);
    if (!error) {
      if (includeIdentityColumns) markAuthPhoneChallengeIdentitySchemaAvailable(true);
      if (includeClaimColumns) markAuthPhoneChallengeClaimSchemaAvailable(true);
      return;
    }

    let downgraded = false;
    if (includeIdentityColumns && isAuthPhoneChallengeIdentitySchemaError(error)) {
      includeIdentityColumns = false;
      markAuthPhoneChallengeIdentitySchemaAvailable(false);
      downgraded = true;
    }
    if (includeClaimColumns && isAuthPhoneChallengeClaimSchemaError(error)) {
      includeClaimColumns = false;
      markAuthPhoneChallengeClaimSchemaAvailable(false);
      downgraded = true;
    }
    if (downgraded) continue;
    throw error;
  }
}

async function updateVerifiedAuthPhoneChallenges(
  admin: any,
  params: {
    authUserId: string;
    phoneE164: string;
    customerId: number;
    identity: PhoneChallengeIdentityContext;
  },
) {
  if (!canUseAuthPhoneChallengeIdentitySchema()) {
    const { data: rows, error: readError } = await admin
      .from("auth_phone_challenges")
      .select(AUTH_PHONE_CHALLENGE_BASE_SELECT)
      .eq("phone_e164", params.phoneE164)
      .eq("channel", "zalo_phone_template")
      .eq("status", "verified")
      .eq("auth_user_id", params.authUserId);
    if (readError) throw readError;
    for (const row of rows || []) {
      const { error: rowError } = await admin
        .from("auth_phone_challenges")
        .update({
          customer_id: params.customerId,
          auth_user_id: params.authUserId,
          ...mergeLegacyChallengeIdentityPayloads(row as AnyRecord, params.identity),
        })
        .eq("id", row.id);
      if (rowError) throw rowError;
    }
    return;
  }

  const { error } = await admin
    .from("auth_phone_challenges")
    .update({
      customer_id: params.customerId,
      auth_user_id: params.authUserId,
      ...buildAuthPhoneChallengeIdentityFields(params.identity),
    })
    .eq("phone_e164", params.phoneE164)
    .eq("channel", "zalo_phone_template")
    .eq("status", "verified")
    .eq("auth_user_id", params.authUserId);

  if (!error) {
    markAuthPhoneChallengeIdentitySchemaAvailable(true);
    return;
  }
  if (!isAuthPhoneChallengeIdentitySchemaError(error)) {
    throw error;
  }

  markAuthPhoneChallengeIdentitySchemaAvailable(false);
  const { data: fallbackRows, error: fallbackReadError } = await admin
    .from("auth_phone_challenges")
    .select(AUTH_PHONE_CHALLENGE_BASE_SELECT)
    .eq("phone_e164", params.phoneE164)
    .eq("channel", "zalo_phone_template")
    .eq("status", "verified")
    .eq("auth_user_id", params.authUserId);
  if (fallbackReadError) throw fallbackReadError;
  for (const row of fallbackRows || []) {
    const { error: fallbackError } = await admin
      .from("auth_phone_challenges")
      .update({
        customer_id: params.customerId,
        auth_user_id: params.authUserId,
        ...mergeLegacyChallengeIdentityPayloads(row as AnyRecord, params.identity),
      })
      .eq("id", row.id);
    if (fallbackError) throw fallbackError;
  }
}

async function buildPortalRepairUrl(admin: any, phoneE164: string) {
  let siteUrl = "https://calotrack.pro";
  try {
    const portalConfig = await readLatestPortalSiteSettings(admin);
    siteUrl = normalizePublicPortalSiteUrl(safeString(portalConfig.settings?.siteUrl) || siteUrl);
  } catch {
    siteUrl = "https://calotrack.pro";
  }

  const url = new URL(`${siteUrl}/dashboard`);
  url.searchParams.set("repair", "zalo-link");
  url.searchParams.set("channel", "zalo");
  url.searchParams.set("phone", phoneE164);
  return url.toString();
}

function readAutomationSecret() {
  return (
    cleanEnv(process.env.PORTAL_AUTOMATION_SECRET) ||
    cleanEnv(process.env.CRON_SECRET) ||
    cleanEnv(process.env.CHANNEL_CONTEXT_INTERNAL_KEY) ||
    cleanEnv(process.env.ZALO_OA_INTERNAL_KEY)
  );
}

function readAuthorizationBearer(req: any) {
  const header = safeString(req.headers?.authorization);
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return safeString(match?.[1]);
}

function readInternalPortalKey(req: any) {
  return (
    safeString(req.headers?.["x-calotrack-internal-key"]) ||
    readAuthorizationBearer(req) ||
    null
  );
}

function readChannelContextInternalKey() {
  return (
    cleanEnv(process.env.CHANNEL_CONTEXT_INTERNAL_KEY) ||
    cleanEnv(process.env.ZALO_OA_INTERNAL_KEY) ||
    null
  );
}

function buildClaimActivityLegendLines() {
  return [
    "Mức vận động:",
    "1 = ít vận động, hầu như ngồi nhiều",
    "2 = vận động nhẹ, đi lại hoặc tập 1-2 buổi/tuần",
    "3 = vận động vừa, tập 3-4 buổi/tuần",
    "4 = vận động nhiều, tập 5-6 buổi/tuần hoặc công việc tay chân",
    "5 = vận động rất cao, lao động nặng hoặc tập cường độ cao gần như mỗi ngày",
  ];
}

function formatClaimProfileGender(value: unknown) {
  const raw = safeString(value)?.toLowerCase();
  if (raw === "male") return "Nam";
  if (raw === "female") return "Nữ";
  return "chưa có";
}

function formatClaimProfileAge(value: unknown) {
  const raw = safeString(value);
  return raw ? `${raw} tuổi` : "chưa có";
}

function formatClaimProfileHeight(value: unknown) {
  const raw = safeString(value);
  return raw ? `${raw} cm` : "chưa có";
}

function formatClaimProfileWeight(value: unknown) {
  const raw = safeString(value);
  return raw ? `${raw} kg` : "chưa có";
}

function formatClaimProfileActivity(value: unknown) {
  const raw = safeString(value);
  return raw ? `mức ${raw}` : "chưa có";
}

function buildClaimProfileSnapshotLines(userRow: AnyRecord | null | undefined) {
  return [
    `Giới tính: ${formatClaimProfileGender(userRow?.gender)}`,
    `Tuổi: ${formatClaimProfileAge(userRow?.age)}`,
    `Chiều cao: ${formatClaimProfileHeight(userRow?.height_cm)}`,
    `Cân nặng: ${formatClaimProfileWeight(userRow?.weight_kg)}`,
    `Mức vận động: ${formatClaimProfileActivity(userRow?.activity_level)}`,
  ];
}

function buildClaimOnboardingReplyText(userRow: AnyRecord | null | undefined, phoneE164: string | null) {
  const missingFields = collectMissingCoreProfileFields(userRow);
  const lines = [
    `Đã nối Zalo thành công cho ${maskPhoneForDisplay(phoneE164)}.`,
    "Số điện thoại đã xác thực và Pro dùng thử 7 ngày đã được mở cho tài khoản này.",
    "Mình cần hoàn tất hồ sơ cốt lõi trước khi mở chat đầy đủ trên Zalo.",
    `Hiện còn thiếu: ${missingFields.join(", ")}.`,
    "",
    "Hồ sơ hiện tại:",
    ...buildClaimProfileSnapshotLines(userRow).map((line) => `- ${line}`),
    "",
    ...buildClaimActivityLegendLines(),
    "Bạn có thể nhắn một dòng như: Nam,30,1m70,68kg,mức 3",
  ];
  return lines.join("\n");
}

function buildClaimProfileCompletedReplyText(
  userRow: AnyRecord | null | undefined,
  phoneE164: string | null,
) {
  const lines = [
    `Đã nối Zalo thành công cho ${maskPhoneForDisplay(phoneE164)}.`,
    "Pro dùng thử 7 ngày đang hoạt động. Hồ sơ cốt lõi đã đủ và bạn có thể chat, log món, dùng coach ngay trong Zalo này.",
    "Gửi ảnh bữa ăn gần nhất hoặc nhắn món vừa ăn để mình log luôn.",
    "Tóm tắt nhanh:",
    ...buildClaimProfileSnapshotLines(userRow).map((line) => `- ${line}`),
  ];
  if (safeString(userRow?.daily_calorie_goal)) {
    lines.push(`- Mục tiêu calories mỗi ngày: ${safeString(userRow?.daily_calorie_goal)} kcal`);
  } else if (safeString(userRow?.tdee)) {
    lines.push(`- TDEE ước tính: ${safeString(userRow?.tdee)} kcal`);
  }
  lines.push("Bạn có thể bắt đầu với /daily hoặc nhắn món ăn / ảnh bữa ăn ngay.");
  return lines.join("\n");
}

function buildAlreadyLinkedReplyText(
  userRow: AnyRecord | null | undefined,
  phoneE164: string | null,
  profileReady: boolean,
) {
  if (!profileReady) {
    return buildClaimOnboardingReplyText(userRow, phoneE164);
  }
  return [
    `Zalo này đã được nối rồi cho ${maskPhoneForDisplay(phoneE164)}.`,
    "Bạn có thể dùng /daily để xem thống kê hôm nay hoặc chat ngay trong OA này.",
  ].join("\n");
}

function buildAmbiguousClaimReplyText() {
  return [
    "Mình đã mở đúng phiên xác thực cho tài khoản này rồi.",
    "Hãy confirm lại mã vừa được gửi ở ngay ở trên nhé để mình nối đúng account.",
  ].join("\n");
}

function readCheckoutHandoffMetadata(row: AnyRecord | null | undefined) {
  const metadata = row?.metadata && typeof row.metadata === "object"
    ? (row.metadata as AnyRecord)
    : {};
  return {
    kind: safeString(metadata.kind) || null,
    handoffCode: safeString(metadata.handoff_code) || null,
    handoffToken: safeString(metadata.handoff_token) || null,
    handoffStatus: safeString(metadata.handoff_status) || "pending",
    sku: safeString(metadata.sku) || null,
    nextPath: normalizePortalRelativePath(metadata.next_path, "/checkout"),
    source: safeString(metadata.source) || null,
  };
}

async function readLatestCheckoutHandoffRow(admin: any, handoffCode: string) {
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("channel_auth_bridges")
        .select("*")
        .eq("channel", "zalo")
        .contains("metadata", {
          kind: "checkout_handoff",
          handoff_code: handoffCode,
        })
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null
  );
}

export async function createZaloCheckoutHandoff(
  admin: any,
  params: {
    sku?: string | null;
    nextPath?: string | null;
    sourceOrigin?: string | null;
  },
) {
  const handoffCode = buildCheckoutHandoffCode();
  const handoffToken = buildCheckoutHandoffToken();
  const nextPath = normalizePortalRelativePath(params.nextPath, "/checkout");
  const bridgeTokenPlaceholder = `checkout_handoff_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + CHECKOUT_PENDING_TTL_MS).toISOString();
  const record = {
    bridge_token: bridgeTokenPlaceholder,
    channel: "zalo",
    platform_user_id: `checkout-handoff:${handoffCode}`,
    platform_chat_id: null,
    display_name: "checkout-handoff",
    status: "active",
    metadata: {
      kind: "checkout_handoff",
      handoff_code: handoffCode,
      handoff_token: handoffToken,
      handoff_status: "pending",
      sku: safeString(params.sku) || null,
      next_path: nextPath,
      source: "checkout",
      source_origin: safeString(params.sourceOrigin) || null,
    },
    expires_at: expiresAt,
  };

  const { error } = await admin.from("channel_auth_bridges").insert(record);
  if (error) throw error;

  return {
    handoffCode,
    handoffToken,
    expiresAt,
    nextPath,
    zaloOaUrl: DEFAULT_ZALO_OA_URL,
  };
}

export async function readZaloCheckoutHandoffStatus(
  admin: any,
  params: {
    handoffCode: string;
    handoffToken: string;
  },
) {
  const handoffCode = (safeString(params.handoffCode) || "").toUpperCase();
  const handoffToken = safeString(params.handoffToken);
  if (!handoffCode || !handoffToken) {
    return {
      status: "invalid",
      bridgeToken: null,
      expiresAt: null,
      nextPath: "/checkout",
      chatBound: false,
    };
  }

  const row = await readLatestCheckoutHandoffRow(admin, handoffCode);
  if (!row?.id) {
    return {
      status: "not_found",
      bridgeToken: null,
      expiresAt: null,
      nextPath: "/checkout",
      chatBound: false,
    };
  }

  const metadata = readCheckoutHandoffMetadata(row);
  if (metadata.handoffToken !== handoffToken) {
    return {
      status: "invalid",
      bridgeToken: null,
      expiresAt: safeString(row.expires_at) || null,
      nextPath: metadata.nextPath,
      chatBound: false,
    };
  }

  const expiresAt = safeString(row.expires_at) || null;
  const expired = expiresAt ? Date.parse(expiresAt) <= Date.now() : false;
  if (expired && safeString(row.status) === "active") {
    await admin
      .from("channel_auth_bridges")
      .update({
        status: "expired",
        failure_reason: "checkout_handoff_expired",
        metadata: {
          ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
          handoff_status: "expired",
        },
      })
      .eq("id", row.id);
  }

  if (expired) {
    return {
      status: "expired",
      bridgeToken: null,
      expiresAt,
      nextPath: metadata.nextPath,
      chatBound: false,
    };
  }

  if (metadata.handoffStatus === "consumed" && safeString(row.bridge_token)) {
    return {
      status: "consumed",
      bridgeToken: safeString(row.bridge_token),
      expiresAt,
      nextPath: metadata.nextPath,
      chatBound: true,
    };
  }

  return {
    status: "pending",
    bridgeToken: null,
    expiresAt,
    nextPath: metadata.nextPath,
    chatBound: false,
  };
}

export async function consumeZaloCheckoutHandoff(
  admin: any,
  params: {
    handoffCode: string;
    senderId: string;
    senderChatId?: string | null;
    displayName?: string | null;
  },
) {
  const handoffCode = (safeString(params.handoffCode) || "").toUpperCase();
  if (!handoffCode) {
    return {
      status: "invalid",
      bridgeToken: null,
      nextPath: "/checkout",
      expiresAt: null,
    };
  }

  const row = await readLatestCheckoutHandoffRow(admin, handoffCode);
  if (!row?.id) {
    return {
      status: "not_found",
      bridgeToken: null,
      nextPath: "/checkout",
      expiresAt: null,
    };
  }

  const metadata = readCheckoutHandoffMetadata(row);
  const expiresAt = safeString(row.expires_at) || null;
  const expired = expiresAt ? Date.parse(expiresAt) <= Date.now() : false;
  if (expired) {
    await admin
      .from("channel_auth_bridges")
      .update({
        status: "expired",
        failure_reason: "checkout_handoff_expired",
        metadata: {
          ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
          handoff_status: "expired",
        },
      })
      .eq("id", row.id);
    return {
      status: "expired",
      bridgeToken: null,
      nextPath: metadata.nextPath,
      expiresAt,
    };
  }

  if (metadata.handoffStatus === "consumed" && safeString(row.bridge_token)) {
    return {
      status: "consumed",
      bridgeToken: safeString(row.bridge_token),
      nextPath: metadata.nextPath,
      expiresAt,
    };
  }

  const bridge = await createOrReuseZaloAuthBridge(admin, {
    platformUserId: params.senderId,
    platformChatId: safeString(params.senderChatId) || safeString(params.senderId),
    displayName: safeString(params.displayName) || null,
    ttlMinutes: TOKEN_TTL_MINUTES,
  });

  const nextMetadata = {
    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
    handoff_status: "consumed",
    consumed_at: new Date().toISOString(),
    consumed_platform_user_id: safeString(params.senderId),
    consumed_platform_chat_id: safeString(params.senderChatId) || safeString(params.senderId),
  };

  const { data: claimedRow, error } = await admin
    .from("channel_auth_bridges")
    .update({
      bridge_token: bridge.bridgeToken,
      platform_user_id: safeString(params.senderId),
      platform_chat_id: safeString(params.senderChatId) || safeString(params.senderId),
      display_name: safeString(params.displayName) || row.display_name,
      status: "used",
      metadata: nextMetadata,
      consumed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "active")
    .is("consumed_at", null)
    .select("id, bridge_token, expires_at, metadata")
    .maybeSingle();
  if (error) throw error;

  if (!claimedRow?.id) {
    const latestRow = await readLatestCheckoutHandoffRow(admin, handoffCode);
    const latestMetadata = readCheckoutHandoffMetadata(latestRow);
    const latestConsumedBy = safeString(
      latestRow?.metadata &&
      typeof latestRow.metadata === "object" &&
      !Array.isArray(latestRow.metadata)
        ? (latestRow.metadata as AnyRecord).consumed_platform_user_id
        : null,
    );
    if (latestRow?.id && safeString(latestRow.bridge_token) && latestConsumedBy === safeString(params.senderId)) {
      return {
        status: "consumed",
        bridgeToken: safeString(latestRow.bridge_token),
        nextPath: latestMetadata.nextPath,
        expiresAt: safeString(latestRow.expires_at) || expiresAt,
      };
    }
    if (latestMetadata.handoffStatus === "consumed") {
      return {
        status: "already_consumed",
        bridgeToken: null,
        nextPath: latestMetadata.nextPath,
        expiresAt: safeString(latestRow?.expires_at) || expiresAt,
      };
    }
  }

  return {
    status: "consumed",
    bridgeToken: bridge.bridgeToken,
    nextPath: metadata.nextPath,
    expiresAt: bridge.expiresAt,
  };
}

async function resolveCoreProfileUsers(admin: any, context: AnyRecord) {
  const customerRow =
    context?.customerRow && typeof context.customerRow === "object"
      ? (context.customerRow as AnyRecord)
      : null;
  const userRow =
    context?.userRow && typeof context.userRow === "object" ? (context.userRow as AnyRecord) : null;
  const customerId =
    Number(context?.customerId ?? context?.customer_id ?? customerRow?.id ?? userRow?.customer_id ?? 0) ||
    null;
  const linkedUserId =
    Number(context?.linkedUserId ?? context?.linked_user_id ?? userRow?.id ?? 0) || null;

  let rows: AnyRecord[] = [];
  if (customerId) {
    const { data, error } = await admin
      .from("users")
      .select("*")
      .eq("customer_id", customerId)
      .in("platform", ["web", "zalo"])
      .order("updated_at", { ascending: false });
    if (error) throw error;
    rows = (data as AnyRecord[] | null) || [];
  } else if (linkedUserId) {
    const row =
      (await maybeSingle<AnyRecord>(
        admin
          .from("users")
          .select("*")
          .eq("id", linkedUserId)
          .limit(1),
      )) || null;
    rows = row ? [row] : [];
  }

  const profileCompletenessScore = (row: AnyRecord | null | undefined) => {
    if (!row) return -1;
    let score = 0;
    if (safeString(row.gender)) score += 1;
    if (toFinitePortalNumber(row.age) > 0) score += 1;
    if (toFinitePortalNumber(row?.height_cm) > 0) score += 1;
    if (toFinitePortalNumber(row?.weight_kg) > 0) score += 1;
    if (safeString(row?.activity_level) || row?.activity_level === 0) score += 1;
    if (safeString(row?.platform) === "web") score += 0.01;
    return score;
  };
  const preferredRow =
    linkedUserId != null
      ? rows.find((row) => Number(row?.id ?? 0) === Number(linkedUserId)) || null
      : null;
  const rankedRows = [...rows].sort((left, right) => {
    const scoreDiff = profileCompletenessScore(right) - profileCompletenessScore(left);
    if (scoreDiff !== 0) return scoreDiff;
    return Date.parse(safeString(right?.updated_at) || "") - Date.parse(safeString(left?.updated_at) || "");
  });
  const bestRow = rankedRows[0] || null;
  const primaryRow =
    preferredRow && bestRow && profileCompletenessScore(bestRow) <= profileCompletenessScore(preferredRow)
      ? preferredRow
      : bestRow || preferredRow || (context?.userRow as AnyRecord | null) || null;
  return {
    customerId,
    rows,
    primaryRow,
  };
}

export async function upsertCoreProfileForContext(params: {
  admin: any;
  context: AnyRecord;
  input: Record<string, unknown>;
  phoneE164?: string | null;
  resetOnly?: boolean;
}) {
  const { admin, context, input, resetOnly = false } = params;
  const resolved = await resolveCoreProfileUsers(admin, context);
  if (!resolved.primaryRow?.id && !resolved.customerId) {
    throw new Error("profile_subject_not_found");
  }

  const merged = resetOnly
    ? {
        gender: null,
        age: null,
        heightCm: null,
        weightKg: null,
        activityLevel: null,
      }
    : mergeCoreProfilePatch(resolved.primaryRow, input);
  const derived = resetOnly ? null : computeCoreProfileDerivedMetrics(merged, resolved.primaryRow);
  const missingFields = collectMissingCoreProfileFields({
    gender: merged.gender,
    age: merged.age,
    height_cm: merged.heightCm,
    weight_kg: merged.weightKg,
    activity_level: merged.activityLevel,
  });
  const profileReady = missingFields.length === 0;
  const onboardingComplete = !resetOnly && profileReady;
  const phoneE164 =
    safeString(params.phoneE164) ||
    safeString(resolved.primaryRow?.customer_phone_e164) ||
    safeString(
      context?.customerRow && typeof context.customerRow === "object"
        ? (context.customerRow as AnyRecord).phone_e164
        : null,
    ) ||
    null;

  const updatePayload: AnyRecord = {
    gender: merged.gender,
    age: merged.age,
    height_cm: merged.heightCm,
    weight_kg: merged.weightKg,
    activity_level: merged.activityLevel,
    onboarding_complete: onboardingComplete,
    onboarding_step: onboardingComplete ? 5 : countFilledCoreProfileFields(merged),
    bmr: derived?.bmr ?? null,
    tdee: derived?.tdee ?? null,
    daily_calorie_goal: derived?.dailyGoalKcal ?? null,
  };

  if (derived) {
    updatePayload.primary_goal = safeString(resolved.primaryRow?.primary_goal) || derived.primaryGoal;
    if (Object.prototype.hasOwnProperty.call(resolved.primaryRow || {}, "goal_mode_variant")) {
      updatePayload.goal_mode_variant = derived.goalModeVariant;
    }
    if (Object.prototype.hasOwnProperty.call(resolved.primaryRow || {}, "goal_mode")) {
      updatePayload.goal_mode =
        derived.goalModeVariant === "recomp_muscle_bias"
          ? "tangcogiammo"
          : derived.goalModeVariant === "recomp_fat_loss_bias"
            ? "giammotangco"
            : derived.primaryGoal;
    }
    if (derived.weeklyRateKg > 0) {
      updatePayload.goal_weekly_rate_kg = derived.weeklyRateKg;
    }
  }

  if (resolved.rows.length) {
    for (const row of resolved.rows) {
      const pendingIntent = onboardingComplete
        ? clearForcedOnboardingPendingIntent(row.pending_intent)
        : buildForcedOnboardingPendingIntent(row.pending_intent, phoneE164 || "", missingFields);
      const { error } = await admin
        .from("users")
        .update({
          ...updatePayload,
          pending_intent: JSON.stringify(pendingIntent),
        })
        .eq("id", Number(row.id));
      if (error) throw error;
    }
  }

  if (resolved.customerId) {
    const { error } = await admin
      .from("customers")
      .update({
        onboarding_status: onboardingComplete ? "completed" : "pending_profile",
        updated_at: new Date().toISOString(),
      })
      .eq("id", Number(resolved.customerId));
    if (error) throw error;

    try {
      await refreshCustomerTruthBestEffort(admin, Number(resolved.customerId));
    } catch {
      // Best-effort only. The direct user/customer writes above are canonical.
    }
  }

  const refreshedRows = await resolveCoreProfileUsers(admin, context);
  const refreshedPrimary = refreshedRows.primaryRow || resolved.primaryRow;
  return {
    profile_ready: onboardingComplete,
    onboarding_complete: onboardingComplete,
    profile_missing_fields: missingFields,
    next_action: onboardingComplete ? "chat_unlocked" : "complete_onboarding_profile",
    user_id: refreshedPrimary?.id ? Number(refreshedPrimary.id) : null,
    customer_id: refreshedRows.customerId,
    gender: merged.gender,
    age: merged.age,
    height_cm: merged.heightCm,
    weight_kg: merged.weightKg,
    activity_level: merged.activityLevel,
    bmr: derived?.bmr ?? toFinitePortalNumber(refreshedPrimary?.bmr),
    tdee: derived?.tdee ?? toFinitePortalNumber(refreshedPrimary?.tdee),
    daily_calorie_goal:
      derived?.dailyGoalKcal ??
      toFinitePortalNumber(refreshedPrimary?.daily_calorie_goal),
  };
}

function buildDisplayNameFromAnyAuthUser(authUser: AnyRecord | null | undefined) {
  const metadata =
    authUser?.user_metadata && typeof authUser.user_metadata === "object"
      ? (authUser.user_metadata as AnyRecord)
      : null;
  return (
    safeString(metadata?.full_name) ||
    safeString(metadata?.display_name) ||
    safeString(metadata?.name) ||
    safeString(authUser?.email)?.split("@")[0] ||
    null
  );
}

export async function readPhoneOnboardingTruth(
  admin: any,
  params: {
    authUserId: string;
    phoneE164: string;
  },
): Promise<PhoneOnboardingTruth> {
  const { authUserId, phoneE164 } = params;
  const customerByPhone =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("id, phone_verified_at")
        .eq("phone_e164", phoneE164)
        .limit(1),
    )) || null;

  const authLink =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_auth_links")
        .select("customer_id, link_status")
        .eq("auth_user_id", authUserId)
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  const compatUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("id, customer_id")
        .eq("platform", "web")
        .eq("auth_user_id", authUserId)
        .limit(1),
    )) || null;

  const webChannel =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_channel_accounts")
        .select("id, customer_id, link_status")
        .eq("channel", "web")
        .eq("platform_user_id", authUserId)
        .order("updated_at", { ascending: false })
        .limit(1),
    )) || null;

  const resolvedCustomerId =
    Number(authLink?.customer_id ?? 0) ||
    Number(webChannel?.customer_id ?? 0) ||
    Number(compatUser?.customer_id ?? 0) ||
    Number(customerByPhone?.id ?? 0) ||
    null;

  const phoneVerifiedAt = safeString(customerByPhone?.phone_verified_at) || null;
  const authLinked = Boolean(resolvedCustomerId && isLinkedRowStatus(authLink?.link_status) && Number(authLink?.customer_id ?? 0) === resolvedCustomerId);
  const compatLinked = Boolean(resolvedCustomerId && Number(compatUser?.customer_id ?? 0) === resolvedCustomerId);
  const webLinked = Boolean(resolvedCustomerId && isLinkedRowStatus(webChannel?.link_status) && Number(webChannel?.customer_id ?? 0) === resolvedCustomerId);

  let linkedChannelCount = 0;
  let zaloLinked = false;
  let zaloLinkStatus = "unlinked";

  if (resolvedCustomerId) {
    const channelRows =
      (
        await admin
          .from("customer_channel_accounts")
          .select("channel, link_status")
          .eq("customer_id", resolvedCustomerId)
          .in("link_status", ["linked", "active"])
      ).data ?? [];

    const linkedChannels = Array.from(
      new Set(
        (channelRows as AnyRecord[])
          .map((row) => safeString(row.channel))
          .filter(Boolean),
      ),
    );

    linkedChannelCount = linkedChannels.length;
    zaloLinked = linkedChannels.includes("zalo");
    zaloLinkStatus = zaloLinked ? "linked" : "unlinked";
  }

  const canonicalPortalLinked = Boolean(resolvedCustomerId && phoneVerifiedAt && authLinked && compatLinked && webLinked);
  const truthState: PhoneOnboardingTruthState = !resolvedCustomerId
    ? "auth_only"
    : canonicalPortalLinked
      ? (zaloLinked ? "zalo_linked" : "customer_linked")
      : "repair_required";

  return {
    truthState,
    repairRequired: !canonicalPortalLinked || !zaloLinked,
    customerId: resolvedCustomerId,
    phoneVerifiedAt,
    authLinked,
    compatLinked,
    webLinked,
    zaloLinked,
    linkedChannelCount,
    zaloLinkStatus,
  };
}

type PhoneOnboardingReconcileTarget = {
  authUserId: string;
  phoneE164: string;
  identity: PhoneChallengeIdentityContext;
  displayName: string | null;
  source: "verified_challenge" | "repair_required_customer" | "scoped";
  customerId: number | null;
};

const AUTOMATION_RECONCILE_PAGE_SIZE = 200;
const AUTOMATION_RECONCILE_PREVIEW_LIMIT = 25;

function buildPhoneOnboardingTargetKey(authUserId: string, phoneE164: string) {
  return `${authUserId}:${phoneE164}`;
}

async function readVerifiedChallengeRowsPage(
  admin: any,
  from: number,
  to: number,
): Promise<AnyRecord[]> {
  const selectClause = canUseAuthPhoneChallengeIdentitySchema()
    ? AUTH_PHONE_CHALLENGE_IDENTITY_SELECT
    : AUTH_PHONE_CHALLENGE_BASE_SELECT;

  try {
    const { data, error } = await admin
      .from("auth_phone_challenges")
      .select(selectClause)
      .eq("channel", "zalo_phone_template")
      .eq("status", "verified")
      .not("auth_user_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    markAuthPhoneChallengeIdentitySchemaAvailable(selectClause === AUTH_PHONE_CHALLENGE_IDENTITY_SELECT);
    return Array.isArray(data) ? (data as unknown as AnyRecord[]) : [];
  } catch (error) {
    if (!isAuthPhoneChallengeIdentitySchemaError(error)) throw error;
    markAuthPhoneChallengeIdentitySchemaAvailable(false);
    const { data, error: fallbackError } = await admin
      .from("auth_phone_challenges")
      .select(AUTH_PHONE_CHALLENGE_BASE_SELECT)
      .eq("channel", "zalo_phone_template")
      .eq("status", "verified")
      .not("auth_user_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (fallbackError) throw fallbackError;
    return Array.isArray(data) ? (data as unknown as AnyRecord[]) : [];
  }
}

async function collectVerifiedChallengeTargets(
  admin: any,
  seen: Set<string>,
  pageSize = AUTOMATION_RECONCILE_PAGE_SIZE,
): Promise<PhoneOnboardingReconcileTarget[]> {
  const targets: PhoneOnboardingReconcileTarget[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = await readVerifiedChallengeRowsPage(admin, from, from + pageSize - 1);
    if (!rows.length) break;
    for (const row of rows) {
      const authUserId = safeString(row.auth_user_id) || "";
      const phoneE164 = safeString(row.phone_e164) || "";
      if (!authUserId || !phoneE164) continue;
      const key = buildPhoneOnboardingTargetKey(authUserId, phoneE164);
      if (seen.has(key)) continue;
      seen.add(key);
      const identity = readPhoneChallengeIdentityContext(row);
      targets.push({
        authUserId,
        phoneE164,
        identity,
        displayName: identity.platformDisplayName,
        source: "verified_challenge",
        customerId: Number(row.customer_id ?? 0) || null,
      });
    }
    if (rows.length < pageSize) break;
  }
  return targets;
}

async function collectRepairRequiredTargets(
  admin: any,
  seen: Set<string>,
  pageSize = AUTOMATION_RECONCILE_PAGE_SIZE,
): Promise<PhoneOnboardingReconcileTarget[]> {
  const targets: PhoneOnboardingReconcileTarget[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("customers")
      .select("id, phone_e164, full_name, access_state, updated_at")
      .eq("access_state", "repair_required")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const customerRows = Array.isArray(data) ? (data as unknown as AnyRecord[]) : [];
    if (!customerRows.length) break;

    const customerIds = customerRows
      .map((row) => Number(row.id ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    const authUserIdByCustomer = new Map<number, string>();

    if (customerIds.length) {
      const [{ data: authLinks, error: authLinkError }, { data: compatUsers, error: compatUserError }] =
        await Promise.all([
          admin
            .from("customer_auth_links")
            .select("customer_id, auth_user_id, created_at")
            .in("customer_id", customerIds)
            .not("auth_user_id", "is", null)
            .order("created_at", { ascending: false }),
          admin
            .from("users")
            .select("customer_id, auth_user_id, updated_at")
            .eq("platform", "web")
            .in("customer_id", customerIds)
            .not("auth_user_id", "is", null)
            .order("updated_at", { ascending: false }),
        ]);

      if (authLinkError) throw authLinkError;
      if (compatUserError) throw compatUserError;

      for (const row of (authLinks as AnyRecord[] | null) || []) {
        const customerId = Number(row.customer_id ?? 0) || null;
        const authUserId = safeString(row.auth_user_id) || "";
        if (!customerId || !authUserId || authUserIdByCustomer.has(customerId)) continue;
        authUserIdByCustomer.set(customerId, authUserId);
      }

      for (const row of (compatUsers as AnyRecord[] | null) || []) {
        const customerId = Number(row.customer_id ?? 0) || null;
        const authUserId = safeString(row.auth_user_id) || "";
        if (!customerId || !authUserId || authUserIdByCustomer.has(customerId)) continue;
        authUserIdByCustomer.set(customerId, authUserId);
      }
    }

    for (const row of customerRows) {
      const customerId = Number(row.id ?? 0) || null;
      const authUserId = customerId ? authUserIdByCustomer.get(customerId) || "" : "";
      const phoneE164 = safeString(row.phone_e164) || "";
      if (!customerId || !authUserId || !phoneE164) continue;
      const key = buildPhoneOnboardingTargetKey(authUserId, phoneE164);
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        authUserId,
        phoneE164,
        identity: buildPhoneChallengeIdentityContext({}),
        displayName: safeString(row.full_name),
        source: "repair_required_customer",
        customerId,
      });
    }

    if (customerRows.length < pageSize) break;
  }

  return targets;
}

async function buildScopedReconcileTargets(
  admin: any,
  authUserId: string,
  phoneE164: string,
): Promise<PhoneOnboardingReconcileTarget[]> {
  if (!authUserId || !phoneE164) return [];
  const latestChallenge = await readLatestPhoneChallengeForAuth(admin, { authUserId, phoneE164 });
  const identity = readPhoneChallengeIdentityContext(latestChallenge);
  const customer =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("id, full_name")
        .eq("phone_e164", phoneE164)
        .limit(1),
    )) || null;

  return [
    {
      authUserId,
      phoneE164,
      identity,
      displayName: identity.platformDisplayName || safeString(customer?.full_name),
      source: "scoped",
      customerId: Number(customer?.id ?? latestChallenge?.customer_id ?? 0) || null,
    },
  ];
}

async function reconcilePhoneOnboardingTarget(
  admin: any,
  target: PhoneOnboardingReconcileTarget,
) {
  const truthBefore = await readPhoneOnboardingTruth(admin, {
    authUserId: target.authUserId,
    phoneE164: target.phoneE164,
  });

  if (truthBefore.truthState === "zalo_linked") {
    return {
      kind: "skipped" as const,
      record: {
        source: target.source,
        auth_user_id: target.authUserId,
        phone_e164: target.phoneE164,
        customer_id: truthBefore.customerId ?? target.customerId,
        truth_state: truthBefore.truthState,
        reason: "already_linked",
      },
    };
  }

  const { data: authLookup, error: authLookupError } = await admin.auth.admin.getUserById(target.authUserId);
  if (authLookupError || !authLookup?.user) {
    return {
      kind: "skipped" as const,
      record: {
        source: target.source,
        auth_user_id: target.authUserId,
        phone_e164: target.phoneE164,
        customer_id: truthBefore.customerId ?? target.customerId,
        truth_state: truthBefore.truthState,
        reason: "auth_user_missing",
      },
    };
  }

  const displayName =
    target.displayName ||
    target.identity.platformDisplayName ||
    buildDisplayNameFromAnyAuthUser(authLookup.user as unknown as AnyRecord);

  await completePhoneOnboardingFallback(admin, {
    authUser: authLookup.user as unknown as AnyRecord,
    phoneInput: target.phoneE164,
    phoneE164: target.phoneE164,
    bridgeToken: target.identity.bridgeToken,
    displayName,
  });

  const truthAfter = await readPhoneOnboardingTruth(admin, {
    authUserId: target.authUserId,
    phoneE164: target.phoneE164,
  });

  return {
    kind: "reconciled" as const,
    record: {
      source: target.source,
      auth_user_id: target.authUserId,
      phone_e164: target.phoneE164,
      customer_id: truthAfter.customerId ?? target.customerId,
      truth_state_before: truthBefore.truthState,
      truth_state_after: truthAfter.truthState,
      bridge_status: target.identity.bridgeToken ? "present" : "missing",
      zalo_linked: truthAfter.zaloLinked,
      linked_channel_count: truthAfter.linkedChannelCount,
    },
  };
}

export async function runPhoneOnboardingAutomationReconcile(
  admin: any,
  options?: {
    scopedAuthUserId?: string | null;
    scopedPhoneE164?: string | null;
    pageSize?: number;
    previewLimit?: number;
  },
) {
  const seen = new Set<string>();
  const pageSize = Number(options?.pageSize ?? AUTOMATION_RECONCILE_PAGE_SIZE) || AUTOMATION_RECONCILE_PAGE_SIZE;
  const previewLimit =
    Number(options?.previewLimit ?? AUTOMATION_RECONCILE_PREVIEW_LIMIT) || AUTOMATION_RECONCILE_PREVIEW_LIMIT;

  const targets =
    options?.scopedAuthUserId && options?.scopedPhoneE164
      ? await buildScopedReconcileTargets(admin, options.scopedAuthUserId, options.scopedPhoneE164)
      : [
          ...(await collectVerifiedChallengeTargets(admin, seen, pageSize)),
          ...(await collectRepairRequiredTargets(admin, seen, pageSize)),
        ];

  const reconciled: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const target of targets) {
    const outcome = await reconcilePhoneOnboardingTarget(admin, target);
    if (outcome.kind === "reconciled") {
      reconciled.push(outcome.record);
    } else {
      skipped.push(outcome.record);
    }
  }

  const [needsReviewOrders, pendingRepairCustomers] = await Promise.all([
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["needs_review"]),
    admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("access_state", "repair_required"),
  ]);

  return {
    processedAt: new Date().toISOString(),
    candidates: targets.length,
    reconciledCount: reconciled.length,
    skippedCount: skipped.length,
    needsReviewOrderCount: Number(needsReviewOrders.count ?? 0),
    repairRequiredCustomerCount: Number(pendingRepairCustomers.count ?? 0),
    reconciled: reconciled.slice(0, previewLimit),
    skipped: skipped.slice(0, previewLimit),
  };
}

async function completePhoneOnboardingFallback(
  admin: any,
  params: {
    authUser: AnyRecord;
    phoneInput: string;
    phoneE164: string;
    bridgeToken: string | null;
    displayName: string | null;
  },
) {
  const { authUser, phoneInput, phoneE164, bridgeToken, displayName } = params;
  const email = safeString(authUser?.email) || null;
  const authUserId = safeString(authUser?.id) || "";
  const nowIso = new Date().toISOString();

  let customer = await findCustomerByPhone(admin, phoneE164);

  if (!customer) {
    const trialEndsAt = addDays(7);
    const initialCustomerPayload: AnyRecord = {
      phone_e164: phoneE164,
      phone_display: phoneInput || phoneE164,
      full_name: displayName,
      plan: "free",
      premium_until: null,
      entitlement_source: "free",
      status: "active",
      access_state: "trialing",
      onboarding_status: "pending_profile",
      phone_verified_at: nowIso,
      trial_started_at: nowIso,
      trial_ends_at: trialEndsAt,
    };

    const { data, error } = await admin
      .from("customers")
      .insert(initialCustomerPayload)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    customer = data as AnyRecord;
  } else {
    const customerPatch: AnyRecord = {
      phone_display: phoneInput || safeString(customer.phone_display) || phoneE164,
      phone_verified_at: safeString(customer.phone_verified_at) || nowIso,
      status: "active",
      updated_at: nowIso,
    };

    if (!safeString(customer.full_name) && displayName) {
      customerPatch.full_name = displayName;
    }

    if (!safeString(customer.entitlement_source)) {
      customerPatch.entitlement_source = "free";
    }

    if (!hasPaidPlan(customer) && !safeString(customer.trial_started_at) && !safeString(customer.trial_ends_at)) {
      customerPatch.trial_started_at = nowIso;
      customerPatch.trial_ends_at = addDays(7);
    }

    const mergedCustomer = {
      ...customer,
      ...customerPatch,
    };
    customerPatch.access_state = deriveCustomerAccessState(mergedCustomer);

    const { data, error } = await admin
      .from("customers")
      .update(customerPatch)
      .eq("id", customer.id)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    customer = data as AnyRecord;
  }

  let authLink =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_auth_links")
        .select("*")
        .eq("auth_user_id", authUserId)
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  if (!authLink) {
    const { data, error } = await admin
      .from("customer_auth_links")
      .insert({
        customer_id: customer.id,
        auth_user_id: authUserId,
        email,
        link_status: "linked",
      })
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    authLink = data as AnyRecord;
  } else if (
    Number(authLink.customer_id ?? 0) !== Number(customer.id) ||
    safeString(authLink.link_status) !== "linked" ||
    safeString(authLink.email) !== email
  ) {
    const { data, error } = await admin
      .from("customer_auth_links")
      .update({
        customer_id: customer.id,
        email,
        link_status: "linked",
      })
      .eq("auth_user_id", authUserId)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    authLink = data as AnyRecord;
  }

  let compatUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("*")
        .eq("platform", "web")
        .eq("auth_user_id", authUserId)
        .limit(1),
    )) || null;

  if (!compatUser && email) {
    compatUser =
      (await maybeSingle<AnyRecord>(
        admin
          .from("users")
          .select("*")
          .eq("platform", "web")
          .eq("email", email)
          .limit(1),
      )) || null;
  }

  const compatDisplayName =
    safeString(compatUser?.first_name) ||
    displayName ||
    (email ? email.split("@")[0] : "") ||
    phoneE164;

  const nextCompatPayload: AnyRecord = {
    platform: "web",
    platform_id: buildCompatWebPlatformId(email, authUserId),
    email,
    auth_user_id: authUserId,
    username: safeString(compatUser?.username) || (email ? email.split("@")[0] : "") || phoneE164.replace(/\+/g, ""),
    first_name: compatDisplayName,
    is_active: compatUser?.is_active !== false,
    is_banned: false,
    customer_id: customer.id,
    customer_phone_e164: safeString(customer.phone_e164) || phoneE164,
    plan: safeString(customer.plan) || "free",
    premium_until: safeString(customer.premium_until),
    trial_ends_at: safeString(customer.trial_ends_at),
    access_state: deriveCustomerAccessState(customer),
  };

  if (!compatUser) {
    const { data, error } = await admin
      .from("users")
      .insert(nextCompatPayload)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    compatUser = data as AnyRecord;
  } else {
    const { data, error } = await admin
      .from("users")
      .update(nextCompatPayload)
      .eq("id", compatUser.id)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    compatUser = data as AnyRecord;
  }

  let webChannel =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_channel_accounts")
        .select("*")
        .eq("channel", "web")
        .eq("platform_user_id", authUserId)
        .limit(1),
    )) || null;

  if (!webChannel && compatUser?.id != null) {
    webChannel =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customer_channel_accounts")
          .select("*")
          .eq("channel", "web")
          .eq("linked_user_id", compatUser.id)
          .limit(1),
      )) || null;
  }

  const nextWebChannelPayload: AnyRecord = {
    customer_id: customer.id,
    channel: "web",
    platform_user_id: authUserId,
    platform_chat_id: null,
    linked_user_id: compatUser.id,
    display_name: displayName || compatDisplayName,
    phone_claimed: phoneInput || null,
    phone_claimed_e164: phoneE164,
    link_status: "linked",
  };

  if (!webChannel) {
    const { data, error } = await admin
      .from("customer_channel_accounts")
      .insert(nextWebChannelPayload)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    webChannel = data as AnyRecord;
  } else {
    const { data, error } = await admin
      .from("customer_channel_accounts")
      .update(nextWebChannelPayload)
      .eq("id", webChannel.id)
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    webChannel = data as AnyRecord;
  }

  let bridgeStatus = bridgeToken ? "not_found" : "not_requested";
  let zaloAutoLinked = false;
  let linkedChannelCount = 1;
  let zaloLinkStatus = "unlinked";

  if (bridgeToken) {
    const linkResult = await autoLinkZaloBridgeToCustomer(admin, bridgeToken, {
      customerId: Number(customer.id),
      phoneE164,
      phoneDisplay: phoneInput || phoneE164,
      plan: safeString(customer.plan) || "free",
      premiumUntil: safeString(customer.premium_until),
    });

    bridgeStatus = safeString(linkResult.status) || "not_found";
    zaloAutoLinked = bridgeStatus === "linked";
    linkedChannelCount = Number(linkResult.linkedChannelCount ?? 0) || linkedChannelCount;
    zaloLinkStatus = safeString(linkResult.zaloLinkStatus) || (zaloAutoLinked ? "linked" : "unlinked");
  }

  await refreshCustomerTruthBestEffort(admin, Number(customer.id));

  const refreshedCustomer =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("*")
        .eq("id", customer.id)
        .limit(1),
    )) || customer;

  const channels =
    (
      await admin
        .from("customer_channel_accounts")
        .select("channel, link_status")
        .eq("customer_id", customer.id)
        .in("link_status", ["linked", "active"])
    ).data ?? [];

  linkedChannelCount = new Set(
    (channels as AnyRecord[]).map((row) => safeString(row.channel)).filter(Boolean),
  ).size || linkedChannelCount;

  return {
    customer_id: Number(refreshedCustomer.id ?? customer.id) || null,
    phone_e164: safeString(refreshedCustomer.phone_e164) || phoneE164,
    access_state: deriveCustomerAccessState(refreshedCustomer),
    trial_ends_at: safeString(refreshedCustomer.trial_ends_at),
    premium_until: safeString(refreshedCustomer.premium_until),
    plan: safeString(refreshedCustomer.plan) || "free",
    zalo_auto_linked: zaloAutoLinked,
    bridge_status: bridgeStatus,
    linked_channel_count: linkedChannelCount,
    zalo_link_status: zaloLinkStatus,
  };
}

function sanitizePortalSiteSettings(raw: Record<string, unknown>) {
  const next: Record<string, string | null> = {};
  for (const key of PUBLIC_PORTAL_SITE_SETTING_KEYS) {
    const value = safeString(raw[key]);
    next[key] = key === "siteUrl" ? normalizePublicPortalSiteUrl(value) : value;
  }
  return next;
}

function getTelegramLinkHref(linkToken?: string | null): string {
  if (!linkToken) {
    return DEFAULT_TELEGRAM_BOT_URL;
  }

  return DEFAULT_TELEGRAM_BOT_URL.includes("?")
    ? `${DEFAULT_TELEGRAM_BOT_URL}&start=${encodeURIComponent(linkToken)}`
    : `${DEFAULT_TELEGRAM_BOT_URL}?start=${encodeURIComponent(linkToken)}`;
}

function buildChannelHelperText(channel: ChannelKey, status: "ready" | "already_linked", linkCode?: string | null) {
  if (channel === "telegram") {
    return status === "already_linked"
      ? "Telegram n\u00e0y \u0111\u00e3 li\u00ean k\u1ebft v\u00e0o account c\u1ee7a b\u1ea1n. B\u1ea1n c\u00f3 th\u1ec3 m\u1edf bot v\u00e0 chat ti\u1ebfp ngay."
      : "M\u1edf Telegram bot, bot s\u1ebd t\u1ef1 nh\u1eadn token v\u00e0 n\u1ed1i v\u00e0o account c\u1ee7a b\u1ea1n.";
  }

  return status === "already_linked"
    ? "Zalo n\u00e0y \u0111\u00e3 li\u00ean k\u1ebft v\u00e0o account c\u1ee7a b\u1ea1n. B\u1ea1n c\u00f3 th\u1ec3 m\u1edf OA v\u00e0 chat ti\u1ebfp ngay."
    : `M\u1edf OA Calo Track v\u00e0 g\u1eedi m\u00e3 ${linkCode || "li\u00ean k\u1ebft"} m\u1ed9t l\u1ea7n \u0111\u1ec3 n\u1ed1i Zalo v\u00e0o account c\u1ee7a b\u1ea1n.`;
}

async function resolvePortalCustomerForAuthUser(admin: any, authUserId: string) {
  const authLookup = await admin.auth.admin.getUserById(authUserId);
  const authUser = (authLookup.data?.user || null) as AnyRecord | null;
  const resolved = await resolveCanonicalPortalCustomerForAuthUser(admin, authUser);
  const customerId = resolved.customerId;
  if (!customerId) {
    throw new Error("phone_verification_required");
  }

  const customer = resolved.customerRow;

  if (!customer || safeString(customer.access_state) === "pending_verification" || !safeString(customer.phone_verified_at)) {
    throw new Error("phone_verification_required");
  }

  return customerId;
}

function isReclaimableLegacyCustomer(row: AnyRecord | null | undefined) {
  if (!row) return false;
  const status = safeString(row.status)?.toLowerCase();
  const accessState = safeString(row.access_state)?.toLowerCase();
  const entitlementSource = safeString(row.entitlement_source)?.toLowerCase();
  return (
    status === "blocked" ||
    accessState === "blocked" ||
    row.is_banned === true ||
    entitlementSource === "soft_deleted"
  );
}

function buildArchivedPhoneE164(phoneE164: string, customerId: number) {
  const normalized = (safeString(phoneE164) || "").replace(/\s+/g, "");
  return `archived:${customerId}:${normalized}:${Date.now()}`;
}

async function findCustomerByPhone(admin: any, phoneE164: string) {
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("id, status, access_state, is_banned, entitlement_source, phone_e164, phone_display")
        .eq("phone_e164", phoneE164)
        .limit(1),
    )) || null
  );
}

async function archiveBlockedPhoneCustomerIfNeeded(admin: any, phoneE164: string) {
  const customerRow = await findCustomerByPhone(admin, phoneE164);
  if (!isReclaimableLegacyCustomer(customerRow)) {
    return customerRow;
  }

  const customerId = Number(customerRow?.id ?? 0) || null;
  if (!customerId) {
    return customerRow;
  }

  const archivedPhone = buildArchivedPhoneE164(phoneE164, customerId);
  const phoneDisplay = safeString(customerRow?.phone_display) || phoneE164;
  const { error } = await admin
    .from("customers")
    .update({
      phone_e164: archivedPhone,
      phone_display: `[archived] ${phoneDisplay}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("phone_e164", phoneE164);

  if (error) {
    throw error;
  }

  return {
    ...customerRow,
    phone_e164: archivedPhone,
    phone_display: `[archived] ${phoneDisplay}`,
  };
}

async function releaseReclaimableZaloBridgeOwnership(
  admin: any,
  bridgeToken: string | null | undefined,
) {
  const payload = readZaloAuthBridgeToken(bridgeToken);
  if (!payload) {
    return;
  }

  const candidateIds = Array.from(
    new Set([safeString(payload.uid), safeString(payload.cid)].filter(Boolean)),
  );
  if (!candidateIds.length) {
    return;
  }

  const channelRows =
    (
      await admin
        .from("customer_channel_accounts")
        .select("id, customer_id, platform_user_id, platform_chat_id, link_status")
        .eq("channel", "zalo")
        .or(
          candidateIds
            .flatMap((value) => [`platform_user_id.eq.${value}`, `platform_chat_id.eq.${value}`])
            .join(","),
        )
    ).data ?? [];

  for (const row of channelRows as AnyRecord[]) {
    const customerId = Number(row.customer_id ?? 0) || null;
    if (!customerId) continue;
    const customer =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customers")
          .select("id, status, access_state, is_banned, entitlement_source")
          .eq("id", customerId)
          .limit(1),
      )) || null;

    if (!isReclaimableLegacyCustomer(customer)) {
      continue;
    }

    const { error } = await admin
      .from("customer_channel_accounts")
      .update({
        customer_id: null,
        linked_user_id: null,
        link_status: "unlinked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      throw error;
    }
  }
}

async function ensureOrderChannelLinkToken(admin: any, customerId: number, orderId: number) {
  const { data, error } = await admin.rpc("ensure_channel_link_token", {
    p_customer_id: customerId,
    p_channel: "telegram",
    p_order_id: orderId,
  });

  if (error) {
    throw error;
  }

  return safeString(data) || null;
}

function readOrderMetadata(row: AnyRecord | null | undefined) {
  const metadata = row?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

function isPendingCheckoutStatus(value: unknown) {
  const status = safeString(value)?.toLowerCase();
  return CHECKOUT_PENDING_STATUSES.includes(status as (typeof CHECKOUT_PENDING_STATUSES)[number]);
}

function isCheckoutOrderExpired(row: AnyRecord) {
  const createdAt = Date.parse(safeString(row.created_at) || "");
  if (!Number.isFinite(createdAt)) {
    return false;
  }
  return Date.now() - createdAt > CHECKOUT_PENDING_TTL_MS;
}

async function expireStalePendingOrdersForCustomer(admin: any, customerId: number) {
  const staleRows =
    (
      await admin
        .from("orders")
        .select("id, metadata, created_at, status")
        .eq("customer_id", customerId)
        .in("status", [...CHECKOUT_PENDING_STATUSES])
        .order("created_at", { ascending: false })
    ).data ?? [];

  for (const row of staleRows as AnyRecord[]) {
    if (!isPendingCheckoutStatus(row.status) || !isCheckoutOrderExpired(row)) {
      continue;
    }

    await admin
      .from("orders")
      .update({
        status: "cancelled",
        metadata: {
          ...readOrderMetadata(row),
          checkout_state: {
            status: "expired",
            reason: "checkout_ttl_expired",
            expired_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }
}

async function findReusablePendingOrder(
  admin: any,
  customerId: number,
  billingSku: CheckoutBillingSku,
  amount: number,
  provider: string,
) {
  const rows =
    (
      await admin
        .from("orders")
        .select("id, created_at, updated_at, status, order_code, phone_e164, amount, billing_sku, provider, metadata")
        .eq("customer_id", customerId)
        .eq("provider", provider)
        .eq("billing_sku", billingSku)
        .eq("amount", amount)
        .in("status", [...CHECKOUT_PENDING_STATUSES])
        .order("created_at", { ascending: false })
        .limit(10)
    ).data ?? [];

  return (
    (rows as AnyRecord[]).find(
      (row) => isPendingCheckoutStatus(row.status) && !isCheckoutOrderExpired(row),
    ) || null
  );
}

async function getActiveLinkToken(admin: any, customerId: number, channel: ChannelKey) {
  const rows =
    (
      await admin
        .from("channel_link_tokens")
        .select("id, customer_id, channel, link_token, status, expires_at, created_at")
        .eq("customer_id", customerId)
        .eq("channel", channel)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10)
    ).data ?? [];

  const now = Date.now();
  return (
    rows.find((row: AnyRecord) => {
      const expiresAt = safeString(row.expires_at);
      if (!expiresAt) return true;
      const timestamp = Date.parse(expiresAt);
      return Number.isFinite(timestamp) && timestamp > now;
    }) || null
  );
}

async function ensureLinkToken(admin: any, customerId: number, channel: ChannelKey) {
  const existing = await getActiveLinkToken(admin, customerId, channel);
  if (existing) {
    return {
      token: existing,
      reused: true,
    };
  }

  const linkToken = randomBytes(18).toString("hex");
  const expiresAt = addMinutes(TOKEN_TTL_MINUTES);
  const { data, error } = await admin
    .from("channel_link_tokens")
    .insert({
      customer_id: customerId,
      channel,
      link_token: linkToken,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id, customer_id, channel, link_token, status, expires_at, created_at")
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  return {
    token: data as AnyRecord,
    reused: false,
  };
}

function sanitizeRequestPayload(
  phoneE164: string,
  trackingId: string,
  templateId: string,
  templateData: Record<string, unknown>,
) {
  const maskedData = { ...templateData };
  for (const [key, value] of Object.entries(maskedData)) {
    if (/otp|code/i.test(key)) {
      maskedData[key] = "******";
    } else if (typeof value === "string" && /^\d{4,8}$/.test(value)) {
      maskedData[key] = "******";
    }
  }

  return {
    phone_e164: phoneE164,
    tracking_id: trackingId,
    template_id: templateId,
    template_data: maskedData,
  };
}

async function handleDashboardSummary(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const access = await resolveDashboardAccess(req, body);
    const authUserId = safeString(access.context?.userRow?.auth_user_id);
    const phoneE164 = safeString(access.context?.customerRow?.phone_e164);
    if (access.accessKind === "portal" && authUserId && phoneE164) {
      const truth = await readPhoneOnboardingTruth(access.admin, { authUserId, phoneE164 });
      if (truth.truthState === "repair_required") {
        await runPhoneOnboardingAutomationReconcile(access.admin, {
          scopedAuthUserId: authUserId,
          scopedPhoneE164: phoneE164,
          previewLimit: 1,
        });
      }
    }
    const summary = await getDashboardSummary(access.admin, access.context, getPeriod(req, body));

    sendJson(res, 200, {
      ok: true,
      data: {
        accessKind: access.accessKind,
        ...summary,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_dashboard_summary_failed");
    sendJson(
      res,
      message === "auth_required" || message === "customer_not_linked" ? 401 : 500,
      {
        ok: false,
        error: message,
        message,
      },
    );
  }
}

async function handleStartCheckout(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = (await readBody(req)) as {
      plan?: string;
      billing_sku?: string | null;
      provider?: string | null;
      phone_input?: string | null;
      phone?: string | null;
    };

    const plan = normalizeCheckoutPlan(body.plan);
    if (plan === "free") {
      sendJson(res, 400, { ok: false, error: "checkout_not_required_for_free" });
      return;
    }

    const billingSku = normalizeCheckoutBillingSku(plan, body.billing_sku);
    if (!billingSku) {
      sendJson(res, 400, { ok: false, error: "billing_sku_invalid" });
      return;
    }

    const provider = safeString(body.provider)?.toLowerCase() || "bank_transfer";
    if (provider !== "bank_transfer") {
      sendJson(res, 400, { ok: false, error: "provider_not_supported" });
      return;
    }

    const { admin, authUser } = await requireAuthenticatedUser(req);
    const customerId = await resolvePortalCustomerForAuthUser(admin, authUser.id);

    const customer =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customers")
          .select("id, phone_e164, phone_verified_at, access_state, status")
          .eq("id", customerId)
          .limit(1),
      )) || null;

    if (!customer) {
      sendJson(res, 404, { ok: false, error: "customer_not_found" });
      return;
    }

    if (safeString(customer.access_state) === "blocked" || safeString(customer.status) === "blocked") {
      sendJson(res, 423, { ok: false, error: "customer_blocked" });
      return;
    }

    const providedPhone = normalizeVietnamPhoneInput(
      safeString(body.phone_input) || safeString(body.phone) || "",
    );
    const customerPhone = normalizeVietnamPhoneInput(safeString(customer.phone_e164) || "");
    const phoneE164 = providedPhone || customerPhone;

    if (!phoneE164) {
      sendJson(res, 400, { ok: false, error: "phone_required" });
      return;
    }

    if (customerPhone && providedPhone && customerPhone !== providedPhone) {
      sendJson(res, 409, { ok: false, error: "verified_phone_mismatch" });
      return;
    }

    const amount = resolveCheckoutAmountVnd(plan, billingSku);
    if (!Number.isFinite(amount) || amount <= 0) {
      sendJson(res, 500, { ok: false, error: "checkout_amount_invalid" });
      return;
    }

    const planRow =
      (await maybeSingle<AnyRecord>(
        admin
          .from("plans")
          .select("id, code")
          .eq("code", plan)
          .limit(1),
      )) || null;

    if (!planRow?.id) {
      sendJson(res, 400, { ok: false, error: "plan_not_found" });
      return;
    }

    await expireStalePendingOrdersForCustomer(admin, customerId);

    const reusableOrder = await findReusablePendingOrder(
      admin,
      customerId,
      billingSku,
      amount,
      provider,
    );

    const reusableOrderCode = safeString(reusableOrder?.order_code);
    if (reusableOrder?.id && reusableOrderCode) {
      const reusableOrderId = String(reusableOrder.id);
      const telegramLinkToken = await ensureOrderChannelLinkToken(
        admin,
        customerId,
        Number(reusableOrderId),
      );

      sendJson(res, 200, {
        ok: true,
        data: {
          id: reusableOrderId,
          order_id: reusableOrderId,
          order_code: reusableOrderCode,
          provider,
          status: safeString(reusableOrder.status) || "pending_confirmation",
          plan,
          billing_sku: billingSku,
          amount,
          phone_e164: safeString(reusableOrder.phone_e164) || phoneE164,
          payment_url: null,
          qr_content: reusableOrderCode,
          bank_transfer_note: reusableOrderCode,
          helper_text: buildCheckoutHelperText(reusableOrderCode),
          telegram_link_token: telegramLinkToken,
          order_access_token: signOrderStatusToken(reusableOrderId, reusableOrderCode),
          created_at:
            safeString(reusableOrder.created_at) || new Date().toISOString(),
          reused: true,
        },
      });
      return;
    }

    const orderCode = createCheckoutOrderCode();
    let orderRow: AnyRecord | null = null;
    try {
      const { data, error: orderError } = await admin
        .from("orders")
        .insert({
          customer_id: customerId,
          plan_id: Number(planRow.id),
          billing_cycle: resolveCheckoutBillingCycle(billingSku),
          billing_sku: billingSku,
          amount,
          provider,
          status: "pending_confirmation",
          phone_e164: phoneE164,
          order_code: orderCode,
          metadata: {
            source: "portal_public_checkout_v2",
            auth_user_id: authUser.id,
            customer_id: customerId,
            phone_e164: phoneE164,
            checkout_origin: "website_api",
            checkout_ttl_minutes: Math.floor(CHECKOUT_PENDING_TTL_MS / 60000),
            checkout_request_key: `${customerId}:${provider}:${billingSku}`,
          },
        })
        .select("id, created_at")
        .single();

      if (orderError || !data) {
        throw orderError || new Error("order_create_failed");
      }
      orderRow = data;
    } catch (error) {
      if (!isPgUniqueViolation(error)) {
        throw error;
      }

      const concurrentReusableOrder = await findReusablePendingOrder(
        admin,
        customerId,
        billingSku,
        amount,
        provider,
      );
      const concurrentReusableOrderCode = safeString(concurrentReusableOrder?.order_code);
      if (!concurrentReusableOrder?.id || !concurrentReusableOrderCode) {
        throw error;
      }

      const concurrentOrderId = String(concurrentReusableOrder.id);
      const concurrentTelegramLinkToken = await ensureOrderChannelLinkToken(
        admin,
        customerId,
        Number(concurrentOrderId),
      );

      sendJson(res, 200, {
        ok: true,
        data: {
          id: concurrentOrderId,
          order_id: concurrentOrderId,
          order_code: concurrentReusableOrderCode,
          provider,
          status: safeString(concurrentReusableOrder.status) || "pending_confirmation",
          plan,
          billing_sku: billingSku,
          amount,
          phone_e164: safeString(concurrentReusableOrder.phone_e164) || phoneE164,
          payment_url: null,
          qr_content: concurrentReusableOrderCode,
          bank_transfer_note: concurrentReusableOrderCode,
          helper_text: buildCheckoutHelperText(concurrentReusableOrderCode),
          telegram_link_token: concurrentTelegramLinkToken,
          order_access_token: signOrderStatusToken(concurrentOrderId, concurrentReusableOrderCode),
          created_at:
            safeString(concurrentReusableOrder.created_at) || new Date().toISOString(),
          reused: true,
          race_recovered: true,
        },
      });
      return;
    }

    const telegramLinkToken = await ensureOrderChannelLinkToken(
      admin,
      customerId,
      Number(orderRow.id),
    );

    sendJson(res, 200, {
      ok: true,
      data: {
        id: String(orderRow.id),
        order_id: String(orderRow.id),
        order_code: orderCode,
        provider,
        status: "pending_confirmation",
        plan,
        billing_sku: billingSku,
        amount,
        phone_e164: phoneE164,
        payment_url: null,
        qr_content: orderCode,
        bank_transfer_note: orderCode,
        helper_text: buildCheckoutHelperText(orderCode),
        telegram_link_token: telegramLinkToken,
        order_access_token: signOrderStatusToken(Number(orderRow.id), orderCode),
        created_at: safeString(orderRow.created_at) || new Date().toISOString(),
        reused: false,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_start_checkout_failed");
    const status =
      message === "auth_required"
        ? 401
        : message === "phone_verification_required" || message === "verified_phone_mismatch"
          ? 409
          : message === "customer_blocked"
            ? 423
            : 500;

    sendJson(res, status, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleChannelLink(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    const channel = normalizeChannel(body.channel);
    if (!channel) {
      sendJson(res, 400, { ok: false, error: "invalid_channel" });
      return;
    }

    const { admin, authUser } = await requireAuthenticatedUser(req);
    const customerId = await resolvePortalCustomerForAuthUser(admin, authUser.id);
    const customer =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customers")
          .select("id, phone_e164")
          .eq("id", customerId)
          .limit(1),
      )) || null;

    const linkedChannel =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customer_channel_accounts")
          .select("id, channel, platform_user_id, platform_chat_id, display_name, link_status")
          .eq("customer_id", customerId)
          .eq("channel", channel)
          .eq("link_status", "linked")
          .order("updated_at", { ascending: false })
          .limit(1),
      )) || null;

    if (linkedChannel) {
      const helperText = buildChannelHelperText(channel, "already_linked");
      sendJson(res, 200, {
        ok: true,
        data: {
          channel,
          status: "already_linked",
          link_token: null,
          link_code: null,
          expires_at: null,
          helper_text: helperText,
          reused: true,
          url: channel === "telegram" ? getTelegramLinkHref(null) : DEFAULT_ZALO_OA_URL,
        },
      });
      return;
    }

    const { token, reused } = await ensureLinkToken(admin, customerId, channel);
    const linkToken = safeString(token.link_token);
    const linkCode = channel === "zalo" && linkToken ? linkToken.slice(0, 8).toUpperCase() : null;
    const helperText = buildChannelHelperText(channel, "ready", linkCode);

    if (channel === "zalo") {
      const phoneE164 = safeString(customer?.phone_e164);
      if (phoneE164) {
        await runPhoneOnboardingAutomationReconcile(admin, {
          scopedAuthUserId: authUser.id,
          scopedPhoneE164: phoneE164,
          previewLimit: 1,
        });
      }
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        channel,
        status: "ready",
        link_token: linkToken,
        link_code: linkCode,
        expires_at: safeString(token.expires_at),
        helper_text: helperText,
        reused,
        url: channel === "telegram" ? getTelegramLinkHref(linkToken) : DEFAULT_ZALO_OA_URL,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_channel_link_failed");
    sendJson(res, message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handlePublicSiteConfig(req: any, res: any) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const admin = createServiceRoleClient();
    const data = await readLatestPortalSiteSettings(admin);
    sendJson(res, 200, { ok: true, data });
  } catch {
    sendJson(res, 200, {
      ok: true,
      data: {
        settings: null,
        updatedAt: null,
      },
    });
  }
}

async function handleAdminPortalSiteConfig(req: any, res: any) {
  if (req.method === "GET") {
    try {
      const access = await requireAdminAccess(req);
      const data = await readLatestPortalSiteSettings(access.admin);
      sendJson(res, 200, { ok: true, data });
    } catch (error) {
      const message = String((error as Error)?.message || error || "admin_portal_settings_failed");
      sendJson(res, message === "auth_required" ? 401 : message === "admin_required" ? 403 : 500, {
        ok: false,
        error: message,
        message,
      });
    }
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const access = await requireAdminAccess(req);
    const body = await readBody(req);
    const action = safeString(body.action);
    if (action !== "save_public_portal_settings") {
      sendJson(res, 400, { ok: false, error: "invalid_action" });
      return;
    }

    const rawSettings =
      body.settings && typeof body.settings === "object"
        ? (body.settings as Record<string, unknown>)
        : {};
    const settings = sanitizePortalSiteSettings(rawSettings);
    const effective = normalizePortalSiteSettings(settings);

    await writeAdminAuditLog({
      admin: access.admin,
      actorMemberId: access.adminMember?.id ?? null,
      actorUserId: access.compatUser?.id ?? null,
      action: PORTAL_SITE_CONFIG_AUDIT_ACTION,
      targetType: PORTAL_SITE_CONFIG_TARGET_TYPE,
      targetId: PORTAL_SITE_CONFIG_TARGET_ID,
      roleSnapshot: access.roles,
      metadata: {
        scope: PORTAL_SITE_CONFIG_TARGET_ID,
        settings,
      },
    });

    sendJson(res, 200, {
      ok: true,
      data: {
        settings: effective,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "admin_portal_settings_failed");
    sendJson(res, message === "auth_required" ? 401 : message === "admin_required" ? 403 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleStartZaloPhoneOtp(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const payload = (await readBody(req)) as {
      phone?: string;
      bridge?: string | null;
      channel?: string | null;
      source_origin?: string | null;
      platform_user_id?: string | null;
      platform_chat_id?: string | null;
      platform_display_name?: string | null;
    };
    const phoneE164 = normalizeVietnamPhoneInput(payload.phone);
    if (!phoneE164 || !phoneE164.startsWith("+84")) {
      sendJson(res, 400, { ok: false, error: "phone_number_invalid" });
      return;
    }

    const bridgeToken = safeString(payload.bridge) || null;
    const bridgePayload = readZaloAuthBridgeToken(bridgeToken);
    const challengeIdentity = buildPhoneChallengeIdentityContext({
      sourceChannel:
        normalizeOnboardingSourceChannel(payload.channel) ||
        (bridgePayload ? "zalo" : "web"),
      platformUserId: safeString(payload.platform_user_id) || safeString(bridgePayload?.uid),
      platformChatId:
        safeString(payload.platform_chat_id) ||
        safeString(bridgePayload?.cid) ||
        safeString(bridgePayload?.uid),
      platformDisplayName:
        safeString(payload.platform_display_name) ||
        safeString(bridgePayload?.dn),
      bridgeToken,
      sourceOrigin:
        safeString(payload.source_origin) ||
        safeString(req.headers?.origin) ||
        safeString(req.headers?.referer),
    });
    const bridgeStatus = bridgeToken ? (bridgePayload ? "attached" : "invalid") : "missing";

    const admin = createServiceRoleClient();
    const cooldownSeconds = getOtpResendCooldownSeconds();
    const maxAttempts = getOtpMaxAttempts();
    const ttlSeconds = getOtpTtlSeconds();

    const { data: latestChallenge, error: latestError } = await admin
      .from("auth_phone_challenges")
      .select("id, status, created_at, expires_at")
      .eq("phone_e164", phoneE164)
      .eq("channel", "zalo_phone_template")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      throw new Error("challenge_lookup_failed");
    }

    if (latestChallenge) {
      const createdAt = new Date(String(latestChallenge.created_at)).getTime();
      const elapsed = Math.floor((Date.now() - createdAt) / 1000);
      if (["pending", "sent"].includes(String(latestChallenge.status)) && elapsed < cooldownSeconds) {
        sendJson(res, 429, {
          ok: false,
          error: "otp_cooldown_active",
          retry_after_seconds: Math.max(cooldownSeconds - elapsed, 1),
        });
        return;
      }
    }

    const customerRow = await findCustomerByPhone(admin, phoneE164);
    const challengeCustomerId = isReclaimableLegacyCustomer(customerRow)
      ? null
      : Number(customerRow?.id ?? 0) || null;

    const otp = randomOtp(6);
    const otpHash = await hashOtp(phoneE164, otp);
    const claimCode = buildClaimCode();
    const claimCodeHash = hashClaimCode(claimCode);
    const templateId = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_ID) || "560965";
    const otpKey = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_OTP_KEY) || "otp";
    const claimKey = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_CLAIM_KEY) || "claim_code";
    const expiresKey = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_EXPIRES_KEY);
    const productKey = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_PRODUCT_KEY);
    const productValue = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_PRODUCT_VALUE) || "CaloTrack";
    const staticDataRaw = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_STATIC_DATA_JSON);
    const trackingId = `otp_${randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const expiresMinutes = Math.ceil(ttlSeconds / 60);

    let staticData: Record<string, unknown> = {};
    if (staticDataRaw) {
      try {
        staticData = JSON.parse(staticDataRaw) as Record<string, unknown>;
      } catch {
        staticData = {};
      }
    }

    const templateData: Record<string, unknown> = {
      ...staticData,
      [otpKey]: otp,
      [claimKey]: claimCode,
    };
    if (expiresKey) templateData[expiresKey] = String(expiresMinutes);
    if (productKey && productValue) templateData[productKey] = productValue;

    const sendResult = await sendZaloTemplateMessage(admin, {
      phone: phoneE164.replace(/^\+/, ""),
      template_id: templateId,
      template_data: templateData,
      tracking_id: trackingId,
    });

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const claimWindowExpiresAt = addClaimWindowHours();
    const challengeInsertRecord = {
      phone_e164: phoneE164,
      customer_id: challengeCustomerId,
      channel: "zalo_phone_template",
      otp_hash: otpHash,
      status: sendResult.accepted ? "sent" : "provider_failed",
      provider_tracking_id: sendResult.trackingId,
      provider_msg_id: sendResult.providerMsgId,
      provider_status: sendResult.providerStatus,
      provider_error: sendResult.providerError,
      max_attempts: maxAttempts,
      expires_at: expiresAt,
      claim_code_hash: claimCodeHash,
      claim_code: claimCode,
      claim_window_expires_at: claimWindowExpiresAt,
      provider_request_payload: sanitizeRequestPayload(phoneE164, trackingId, templateId, templateData),
      provider_response_payload: sendResult.responsePayload as AnyRecord,
    };
    await insertAuthPhoneChallenge(admin, challengeInsertRecord, challengeIdentity, bridgeStatus);

    if (!sendResult.accepted) {
      sendJson(res, 200, {
        ok: true,
        status: "fallback_required",
        phone_e164: phoneE164,
        fallback: "support_retry",
        reason: sendResult.reason,
        provider_status: sendResult.providerStatus,
        provider_error: sendResult.providerError,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: "otp_sent",
      phone_e164: phoneE164,
      delivery_channel: "zalo",
      tracking_id: sendResult.trackingId,
      provider_msg_id: sendResult.providerMsgId,
      bridge_status: bridgeStatus,
      chat_identity_saved: Boolean(challengeIdentity.platformUserId || challengeIdentity.platformChatId),
      expires_in_seconds: ttlSeconds,
      cooldown_seconds: cooldownSeconds,
      message_preview: maskOtpMessage(buildAsciiOtpMessage(otp)),
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: String((error as Error)?.message || error || "portal_start_zalo_phone_otp_failed"),
    });
  }
}

async function handleVerifyZaloPhoneOtp(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const payload = (await readBody(req)) as {
      phone?: string;
      code?: string;
      issue_session?: boolean;
      bridge?: string | null;
    };

    const phoneE164 = normalizeVietnamPhoneInput(payload.phone);
    const code = String(payload.code ?? "").trim();
    const issueSession = payload.issue_session !== false;

    if (!phoneE164 || !phoneE164.startsWith("+84")) {
      sendJson(res, 400, { ok: false, error: "phone_number_invalid" });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      sendJson(res, 400, { ok: false, error: "otp_invalid_format" });
      return;
    }

    const admin = createServiceRoleClient();
    const { data: challenge, error: challengeError } = await admin
      .from("auth_phone_challenges")
      .select("*")
      .eq("phone_e164", phoneE164)
      .eq("channel", "zalo_phone_template")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError) {
      throw new Error("challenge_lookup_failed");
    }
    if (!challenge) {
      sendJson(res, 404, { ok: false, error: "otp_not_found" });
      return;
    }

    const challengeId = String(challenge.id);
    const status = String(challenge.status ?? "pending");
    const expiresAt = new Date(String(challenge.expires_at)).getTime();
    const maxAttempts = Number(challenge.max_attempts ?? getOtpMaxAttempts());
    const attemptCount = Number(challenge.attempt_count ?? 0);

    if (status === "locked") {
      sendJson(res, 423, { ok: false, error: "otp_locked" });
      return;
    }
    if (status === "provider_failed") {
      sendJson(res, 422, { ok: false, error: "otp_delivery_failed" });
      return;
    }
    if (status === "verified" && challenge.consumed_at) {
      sendJson(res, 409, { ok: false, error: "otp_already_used" });
      return;
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await admin.from("auth_phone_challenges").update({ status: "expired" }).eq("id", challengeId);
      sendJson(res, 422, { ok: false, error: "otp_expired" });
      return;
    }

    const otpHash = await hashOtp(phoneE164, code);
    if (otpHash !== String(challenge.otp_hash)) {
      const nextAttempts = attemptCount + 1;
      const nextStatus = nextAttempts >= maxAttempts ? "locked" : status;
      await admin
        .from("auth_phone_challenges")
        .update({
          attempt_count: nextAttempts,
          status: nextStatus,
        })
        .eq("id", challengeId);

      sendJson(res, nextStatus === "locked" ? 423 : 422, {
        ok: false,
        error: nextStatus === "locked" ? "otp_locked" : "otp_invalid",
        remaining_attempts: Math.max(maxAttempts - nextAttempts, 0),
      });
      return;
    }

    let sessionPayload: Record<string, unknown> | null = null;
    let authUserId = challenge.auth_user_id ? String(challenge.auth_user_id) : null;
    let authUser: AnyRecord | null = null;

    if (issueSession) {
      try {
        const session = await issueSessionForPhone(phoneE164);
        authUserId = session.authUserId;
        authUser = (session.user || null) as AnyRecord | null;
        sessionPayload = {
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
          expires_in: session.expiresIn,
          token_type: session.tokenType,
          user: session.user,
        };
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: "session_issue_failed",
          message: String((error as Error)?.message || error || "session_issue_failed"),
        });
        return;
      }
    } else {
      const auth = await requireAuthenticatedUser(req);
      authUserId = auth.authUser.id;
      authUser = auth.authUser as AnyRecord;
    }

    const { error: updateError } = await admin
      .from("auth_phone_challenges")
      .update({
        status: "verified",
        auth_user_id: authUserId,
        consumed_at: new Date().toISOString(),
      })
      .eq("id", challengeId);

    if (updateError) {
      throw new Error("challenge_verify_failed");
    }

    const challengeIdentity = readPhoneChallengeIdentityContext(challenge);
    const challengeClaim = readPhoneChallengeClaimContextFromChallenge(challenge as AnyRecord);
    const completionData =
      authUserId && authUser
        ? await completePhoneOnboardingForAuthContext({
            admin,
            authUser,
            phoneE164,
            bridgeToken:
              safeString(payload.bridge) ||
              challengeIdentity.bridgeToken ||
              null,
          })
        : null;
    const completionRecord =
      completionData && typeof completionData === "object"
        ? (completionData as Record<string, unknown>)
        : {};
    const completionChatLinkStatus = safeString(completionRecord.chat_link_status);
    const claimWindowExpiresAt =
      safeString(completionRecord.claim_window_expires_at) || challengeClaim.claimWindowExpiresAt;
    const claimWindowMs = claimWindowExpiresAt ? Date.parse(claimWindowExpiresAt) : NaN;
    const claimWindowActive = Number.isFinite(claimWindowMs) ? claimWindowMs > Date.now() : false;
    const hasChatIdentity = Boolean(
      challengeIdentity.platformUserId ||
      challengeIdentity.platformChatId ||
      safeString(completionRecord.bridge_status) === "linked" ||
      safeString(completionRecord.zalo_link_status) === "linked",
    );
    const zaloAutoLinked = completionRecord.zalo_auto_linked === true || completionChatLinkStatus === "linked";
    const claimStatus =
      safeString(completionRecord.claim_status) ||
      (zaloAutoLinked || hasChatIdentity
        ? "linked"
        : challengeClaim.claimCode && challengeClaim.claimCodeHash && claimWindowActive
          ? "pending_claim"
          : challengeClaim.claimCode && challengeClaim.claimCodeHash
            ? "claim_expired"
            : null);
    const zaloIdentityMode =
      safeString(completionRecord.zalo_identity_mode) ||
      (zaloAutoLinked || hasChatIdentity || challengeIdentity.bridgeToken ? "bridge" : claimStatus === "pending_claim" ? "pending_claim" : null);

    sendJson(res, 200, {
      ok: true,
      status: "verified",
      phone_e164: phoneE164,
      issued_session: issueSession,
      session: sessionPayload,
      completion: completionData,
      claim_code: safeString(completionRecord.claim_code) || challengeClaim.claimCode,
      claim_status: claimStatus,
      claim_window_expires_at: claimWindowExpiresAt,
      zalo_identity_mode: zaloIdentityMode,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: String((error as Error)?.message || error || "portal_verify_zalo_phone_otp_failed"),
    });
  }
}

async function completePhoneOnboardingForAuthContext(params: {
  admin: any;
  authUser: AnyRecord;
  phoneE164: string;
  bridgeToken?: string | null;
}) {
  const { admin, authUser, phoneE164 } = params;
  const authUserId = safeString(authUser.id) || "";
  const authUserMeta =
    authUser?.user_metadata && typeof authUser.user_metadata === "object"
      ? (authUser.user_metadata as AnyRecord)
      : {};
  const verifiedChallenge = await readLatestPhoneChallengeForAuth(admin, {
    authUserId,
    phoneE164,
  });
  const verifiedChallengeIdentity = readPhoneChallengeIdentityContext(verifiedChallenge);
  const verifiedChallengeClaim = await readPhoneChallengeClaimContext(
    admin,
    safeString(verifiedChallenge?.id),
  );
  const bridgeToken = safeString(params.bridgeToken) || verifiedChallengeIdentity.bridgeToken || null;
  const displayName =
    safeString(authUserMeta.full_name) ||
    safeString(authUserMeta.display_name) ||
    safeString(authUserMeta.name) ||
    null;
  const challengeHasChatIdentity = Boolean(
    verifiedChallengeIdentity.sourceChannel === "zalo" ||
      verifiedChallengeIdentity.platformUserId ||
      verifiedChallengeIdentity.platformChatId,
  );
  const preExistingCustomer = await findCustomerByPhone(admin, phoneE164);
  const hadPaidAccessBefore = hasPaidPlan(preExistingCustomer);
  const hadTrialBefore = Boolean(
    safeString(preExistingCustomer?.trial_started_at) || safeString(preExistingCustomer?.trial_ends_at),
  );

  await archiveBlockedPhoneCustomerIfNeeded(admin, phoneE164);
  await releaseReclaimableZaloBridgeOwnership(admin, bridgeToken);

  const { data, error } = await admin.rpc("complete_phone_onboarding_for_auth", {
    p_auth_user_id: authUser.id,
    p_phone_input: phoneE164,
    p_bridge_token: bridgeToken,
    p_email: safeString(authUser.email) || null,
    p_display_name: displayName,
  });

  let row = (data ?? {}) as AnyRecord;
  if (error) {
    if (!isMissingFunctionSchemaCacheError(error, "complete_phone_onboarding_for_auth")) {
      throw error;
    }

    row = await completePhoneOnboardingFallback(admin, {
      authUser,
      phoneInput: phoneE164,
      phoneE164,
      bridgeToken,
      displayName,
    });
  }

  let truth = await readPhoneOnboardingTruth(admin, {
    authUserId,
    phoneE164,
  });

  const shouldRetryTruthRepair =
    truth.truthState === "auth_only" ||
    truth.truthState === "repair_required" ||
    (bridgeToken && !truth.zaloLinked);

  if (shouldRetryTruthRepair) {
    row = await completePhoneOnboardingFallback(admin, {
      authUser,
      phoneInput: phoneE164,
      phoneE164,
      bridgeToken,
      displayName,
    });
    truth = await readPhoneOnboardingTruth(admin, {
      authUserId,
      phoneE164,
    });
  }

  if (truth.truthState !== "zalo_linked" || (bridgeToken && !truth.zaloLinked)) {
    await runPhoneOnboardingAutomationReconcile(admin, {
      scopedAuthUserId: authUserId,
      scopedPhoneE164: phoneE164,
      previewLimit: 1,
    });
    truth = await readPhoneOnboardingTruth(admin, {
      authUserId,
      phoneE164,
    });
  }

  const customerId = truth.customerId ?? (row.customer_id == null ? null : Number(row.customer_id));
  const bridgeStatusRaw = safeString(row.bridge_status) || (bridgeToken ? "bridge_not_found" : "not_requested");
  const bridgeStatus =
    bridgeStatusRaw === "bridge_expired"
      ? "expired"
      : bridgeStatusRaw === "bridge_not_found"
        ? "not_found"
        : bridgeStatusRaw === "bridge_missing"
          ? "not_requested"
          : bridgeStatusRaw;
  const zaloAutoLinked = truth.zaloLinked || row.zalo_auto_linked === true;
  const linkedChannelCount = truth.linkedChannelCount || Number(row.linked_channel_count ?? 0);
  const zaloLinkStatus = truth.zaloLinkStatus || safeString(row.zalo_link_status) || "unlinked";
  const truthState = truth.truthState;
  const claimWindowExpiresAt = verifiedChallengeClaim.claimWindowExpiresAt;
  const claimWindowMs = claimWindowExpiresAt ? Date.parse(claimWindowExpiresAt) : NaN;
  const claimWindowActive = Number.isFinite(claimWindowMs) ? claimWindowMs > Date.now() : false;
  const hasPendingClaimCode = Boolean(verifiedChallengeClaim.claimCode && verifiedChallengeClaim.claimCodeHash);
  const claimPending =
    !bridgeToken &&
    !zaloAutoLinked &&
    !challengeHasChatIdentity &&
    hasPendingClaimCode &&
    claimWindowActive;
  const bridgeContextMissingAfterZaloStart =
    Boolean(bridgeToken) && !zaloAutoLinked && !challengeHasChatIdentity;
  const effectiveBridgeStatus = bridgeContextMissingAfterZaloStart
    ? "bridge_context_missing_after_zalo_start"
    : bridgeStatus;
  const bridgeFailure = [
    "expired",
    "conflict",
    "not_found",
    "link_failed",
    "invalid",
    "bridge_context_missing_after_zalo_start",
  ].includes(effectiveBridgeStatus);
  const canonicalPortalIncomplete =
    !truth.customerId ||
    !truth.phoneVerifiedAt ||
    !truth.authLinked ||
    !truth.compatLinked ||
    !truth.webLinked;
  const chatLinkStatus: "linked" | "pending_claim" | "pending_repair" | "auto_link_failed" | "pending_auto_link" = zaloAutoLinked
    ? "linked"
    : claimPending
      ? "pending_claim"
    : !challengeHasChatIdentity
      ? "pending_repair"
      : bridgeFailure
        ? "auto_link_failed"
        : "pending_auto_link";
  const manualLinkRequired =
    !zaloAutoLinked &&
    !claimPending &&
    (!challengeHasChatIdentity || bridgeFailure);
  const repairRequired = canonicalPortalIncomplete || manualLinkRequired;
  const baseNextAction = zaloAutoLinked
    ? "open_zalo_chat"
    : claimPending
      ? "reply_claim_code_in_zalo"
    : manualLinkRequired
      ? "manual_link_recovery"
      : truthState === "customer_linked" || truthState === "repair_required"
        ? "refresh_dashboard"
        : "open_dashboard";
  const trialGranted =
    !hadPaidAccessBefore &&
    !hadTrialBefore &&
    !hasPaidPlan(row) &&
    safeString(row.access_state) === "trialing";
  const repairUrl = manualLinkRequired ? await buildPortalRepairUrl(admin, phoneE164) : null;
  const compatWebUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("*")
        .eq("platform", "web")
        .eq("auth_user_id", authUserId)
        .order("updated_at", { ascending: false })
        .limit(1),
    )) || null;
  let profileMissingFields = collectMissingCoreProfileFields(compatWebUser);
  let profileReady = profileMissingFields.length === 0;
  let syncedProfileResult: Record<string, unknown> | null = null;
  if (!manualLinkRequired && compatWebUser?.id) {
    syncedProfileResult = await upsertCoreProfileForContext({
      admin,
      context: {
        customerId,
        linkedUserId: Number(compatWebUser.id),
        userRow: compatWebUser,
      },
      input: {
        gender: compatWebUser.gender,
        age: compatWebUser.age,
        height_cm: compatWebUser.height_cm,
        weight_kg: compatWebUser.weight_kg,
        activity_level: compatWebUser.activity_level,
      },
      phoneE164,
    });
    if (Array.isArray(syncedProfileResult.profile_missing_fields)) {
      profileMissingFields = syncedProfileResult.profile_missing_fields as string[];
      profileReady = syncedProfileResult.profile_ready === true;
    }
  }
  const onboardingSurfaceForced = !manualLinkRequired && !profileReady;
  const nextAction = onboardingSurfaceForced ? "complete_onboarding_profile" : baseNextAction;
  const claimStatus = claimPending
    ? "pending_claim"
    : zaloAutoLinked || challengeHasChatIdentity
      ? "linked"
      : hasPendingClaimCode
        ? "claim_expired"
        : null;
  const zaloIdentityMode = claimPending ? "pending_claim" : bridgeToken || challengeHasChatIdentity ? "bridge" : null;

  if (compatWebUser?.id) {
    const nextPendingIntent = onboardingSurfaceForced
      ? buildForcedOnboardingPendingIntent(compatWebUser.pending_intent, phoneE164, profileMissingFields)
      : clearForcedOnboardingPendingIntent(compatWebUser.pending_intent);

    await admin
      .from("users")
      .update({ pending_intent: JSON.stringify(nextPendingIntent) })
      .eq("id", Number(compatWebUser.id));
  }

  if (customerId) {
    await updateVerifiedAuthPhoneChallenges(admin, {
      authUserId,
      phoneE164,
      customerId,
      identity: buildPhoneChallengeIdentityContext({
        sourceChannel:
          verifiedChallengeIdentity.sourceChannel || (bridgeToken ? "zalo" : null),
        platformUserId: verifiedChallengeIdentity.platformUserId,
        platformChatId: verifiedChallengeIdentity.platformChatId,
        platformDisplayName: verifiedChallengeIdentity.platformDisplayName,
        bridgeToken,
        sourceOrigin: verifiedChallengeIdentity.sourceOrigin,
      }),
    });
  }

  return {
    customer_id: customerId,
    phone_e164: safeString(row.phone_e164) || phoneE164,
    access_state: safeString(row.access_state) || "pending_verification",
    trial_ends_at: safeString(row.trial_ends_at),
    premium_until: safeString(row.premium_until),
    plan: safeString(row.plan) || "free",
    zalo_auto_linked: zaloAutoLinked,
    bridge_status: effectiveBridgeStatus,
    linked_channel_count: linkedChannelCount,
    zalo_link_status: zaloLinkStatus,
    truth_state: truthState,
    repair_required: repairRequired,
    trial_granted: trialGranted,
    chat_link_status: chatLinkStatus,
    manual_link_required: manualLinkRequired,
    repair_url: repairUrl,
    next_action: nextAction,
    profile_ready: profileReady,
    onboarding_surface_forced: onboardingSurfaceForced,
    onboarding_reason: onboardingSurfaceForced ? "onboarding_incomplete" : null,
    profile_missing_fields: profileMissingFields,
    claim_code: verifiedChallengeClaim.claimCode,
    claim_status: claimStatus,
    claim_window_expires_at: claimWindowExpiresAt,
    zalo_identity_mode: zaloIdentityMode,
  };
}

async function handleCompletePhoneOnboarding(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = (await readBody(req)) as {
      phone?: string;
      bridge?: string | null;
    };

    const phoneInput = safeString(body.phone) || "";
    const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
    if (!phoneE164 || !phoneE164.startsWith("+84")) {
      sendJson(res, 400, { ok: false, error: "phone_number_invalid" });
      return;
    }

    const { admin, authUser } = await requireAuthenticatedUser(req);
    const data = await completePhoneOnboardingForAuthContext({
      admin,
      authUser,
      phoneE164,
      bridgeToken: safeString(body.bridge) || null,
    });

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_complete_phone_onboarding_failed");
    sendJson(res, message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

function normalizeClaimRedeemMode(value: unknown) {
  const normalized = safeString(value)?.toLowerCase();
  return normalized === "fallback" ? "fallback" : "exact";
}

function isMissingClaimRedeemRpcError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return (
    message.includes("portal_redeem_zalo_claim_code") &&
    (message.includes("schema cache") || message.includes("could not find the function"))
  );
}

async function readClaimRedeemCandidateRows(
  admin: any,
  params: {
    createdAfterIso: string;
    limit?: number;
  },
) {
  const buildQuery = (selectClause: string) =>
    admin
      .from("auth_phone_challenges")
      .select(selectClause)
      .eq("channel", "zalo_phone_template")
      .eq("status", "verified")
      .gte("created_at", params.createdAfterIso)
      .order("created_at", { ascending: false })
      .limit(params.limit ?? 250);

  if (canUseAuthPhoneChallengeIdentitySchema()) {
    try {
      const { data, error } = await buildQuery(AUTH_PHONE_CHALLENGE_IDENTITY_SELECT);
      if (error) throw error;
      markAuthPhoneChallengeIdentitySchemaAvailable(true);
      return Array.isArray(data) ? (data as AnyRecord[]) : [];
    } catch (error) {
      if (!isAuthPhoneChallengeIdentitySchemaError(error)) throw error;
      markAuthPhoneChallengeIdentitySchemaAvailable(false);
    }
  }

  const { data, error } = await buildQuery(AUTH_PHONE_CHALLENGE_BASE_SELECT);
  if (error) throw error;
  return Array.isArray(data) ? (data as AnyRecord[]) : [];
}

async function resolveClaimCustomerContext(admin: any, challenge: AnyRecord | null | undefined) {
  const authUserId = safeString(challenge?.auth_user_id);
  const phoneE164 = safeString(challenge?.phone_e164);
  let customerId = Number(challenge?.customer_id ?? 0) || null;

  if (!customerId && authUserId) {
    const authLink =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customer_auth_links")
          .select("customer_id, link_status")
          .eq("auth_user_id", authUserId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1),
      )) || null;
    customerId = Number(authLink?.customer_id ?? 0) || null;
  }

  if (!customerId && authUserId) {
    const compatWebUser =
      (await maybeSingle<AnyRecord>(
        admin
          .from("users")
          .select("customer_id")
          .eq("platform", "web")
          .eq("auth_user_id", authUserId)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1),
      )) || null;
    customerId = Number(compatWebUser?.customer_id ?? 0) || null;
  }

  let customerRow: AnyRecord | null = null;
  if (customerId) {
    customerRow =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customers")
          .select("*")
          .eq("id", customerId)
          .limit(1),
      )) || null;
  }

  if (!customerRow && phoneE164) {
    customerRow =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customers")
          .select("*")
          .eq("phone_e164", phoneE164)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1),
      )) || null;
    customerId = Number(customerRow?.id ?? 0) || customerId;
  }

  return {
    authUserId,
    phoneE164,
    customerId,
    customerRow,
  };
}

async function updateClaimChallengeIdentity(
  admin: any,
  params: {
    challengeRow: AnyRecord;
    customerId: number;
    authUserId: string;
    identity: PhoneChallengeIdentityContext;
  },
) {
  const directPayload = {
    customer_id: params.customerId,
    auth_user_id: params.authUserId,
    ...buildAuthPhoneChallengeIdentityFields(params.identity),
  };

  if (canUseAuthPhoneChallengeIdentitySchema()) {
    const { error } = await admin
      .from("auth_phone_challenges")
      .update(directPayload)
      .eq("id", params.challengeRow.id);
    if (!error) {
      markAuthPhoneChallengeIdentitySchemaAvailable(true);
      return;
    }
    if (!isAuthPhoneChallengeIdentitySchemaError(error)) throw error;
    markAuthPhoneChallengeIdentitySchemaAvailable(false);
  }

  const { error } = await admin
    .from("auth_phone_challenges")
    .update({
      customer_id: params.customerId,
      auth_user_id: params.authUserId,
      ...mergeLegacyChallengeIdentityPayloads(params.challengeRow, params.identity),
    })
    .eq("id", params.challengeRow.id);
  if (error) throw error;
}

async function upsertCompatZaloUserForClaim(
  admin: any,
  params: {
    senderId: string;
    senderChatId: string;
    displayName: string | null;
    customerId: number;
    authUserId: string;
    phoneE164: string;
    customerRow: AnyRecord | null;
  },
) {
  let compatUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("*")
        .eq("platform", "zalo")
        .eq("platform_id", params.senderId)
        .limit(1),
    )) || null;

  const payload: AnyRecord = {
    username: safeString(compatUser?.username) || "",
    first_name:
      params.displayName || safeString(compatUser?.first_name) || safeString(params.customerRow?.full_name) || "Zalo user",
    last_name: safeString(compatUser?.last_name) || "",
    language: safeString(compatUser?.language) || "vi",
    platform: "zalo",
    platform_id: params.senderId,
    chat_id: params.senderChatId,
    onboarding_complete: compatUser?.onboarding_complete === true,
    onboarding_step: Number(compatUser?.onboarding_step ?? 0) || 0,
    pending_intent: compatUser?.pending_intent ?? null,
    daily_calorie_goal: compatUser?.daily_calorie_goal ?? null,
    bmr: compatUser?.bmr ?? null,
    tdee: compatUser?.tdee ?? null,
    is_active: compatUser?.is_active !== false,
    is_banned: compatUser?.is_banned === true,
    plan: safeString(params.customerRow?.plan) || safeString(compatUser?.plan) || "free",
    premium_until: safeString(params.customerRow?.premium_until) || safeString(compatUser?.premium_until),
    customer_id: params.customerId,
    auth_user_id: params.authUserId,
    customer_phone_e164: params.phoneE164,
    trial_ends_at: safeString(params.customerRow?.trial_ends_at) || safeString(compatUser?.trial_ends_at),
    access_state:
      safeString(params.customerRow?.access_state) ||
      safeString(compatUser?.access_state) ||
      deriveCustomerAccessState(params.customerRow),
  };

  if (!compatUser?.id) {
    const { data, error } = await admin.from("users").insert(payload).select("*").limit(1).single();
    if (error) throw error;
    compatUser = (data as AnyRecord) || null;
  } else {
    const { data, error } = await admin
      .from("users")
      .update(payload)
      .eq("id", Number(compatUser.id))
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    compatUser = (data as AnyRecord) || compatUser;
  }

  return compatUser;
}

async function upsertZaloChannelAccountForClaim(
  admin: any,
  params: {
    senderId: string;
    senderChatId: string;
    displayName: string | null;
    customerId: number;
    linkedUserId: number | null;
    phoneE164: string;
    customerRow: AnyRecord | null;
  },
) {
  const existingChannel =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_channel_accounts")
        .select("*")
        .eq("channel", "zalo")
        .eq("platform_user_id", params.senderId)
        .limit(1),
    )) || null;

  if (
    existingChannel?.id &&
    Number(existingChannel.customer_id ?? 0) > 0 &&
    Number(existingChannel.customer_id) !== params.customerId &&
    isLinkedRowStatus(existingChannel.link_status)
  ) {
    return {
      status: "invalid_claim" as const,
      row: existingChannel,
    };
  }

  const payload: AnyRecord = {
    customer_id: params.customerId,
    channel: "zalo",
    platform_user_id: params.senderId,
    platform_chat_id: params.senderChatId,
    linked_user_id: params.linkedUserId,
    display_name: params.displayName,
    phone_claimed: safeString(params.customerRow?.phone_display) || params.phoneE164,
    phone_claimed_e164: params.phoneE164,
    link_status: "linked",
  };

  if (!existingChannel?.id) {
    const { data, error } = await admin
      .from("customer_channel_accounts")
      .insert(payload)
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    return {
      status: "linked" as const,
      row: (data as AnyRecord) || null,
    };
  }

  const { data, error } = await admin
    .from("customer_channel_accounts")
    .update(payload)
    .eq("id", Number(existingChannel.id))
    .select("*")
    .limit(1)
    .single();
  if (error) throw error;
  return {
    status: "linked" as const,
    row: (data as AnyRecord) || existingChannel,
  };
}

async function redeemZaloClaimCodeFallback(
  admin: any,
  params: {
    code: string | null;
    senderId: string;
    senderChatId: string;
    displayName: string | null;
    mode: "exact" | "fallback";
  },
) {
  const nowMs = Date.now();
  const lookbackIso = new Date(nowMs - CLAIM_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const rows = await readClaimRedeemCandidateRows(admin, {
    createdAfterIso: lookbackIso,
    limit: 300,
  });

  let challengeRow: AnyRecord | null = null;
  if (params.mode === "exact") {
    const targetHash = hashClaimCode(params.code);
    if (!targetHash) {
      return { status: "invalid_claim" };
    }
    challengeRow =
      rows.find((row) => readPhoneChallengeClaimContextFromChallenge(row).claimCodeHash === targetHash) || null;
    if (!challengeRow) {
      return { status: "invalid_claim" };
    }
  } else {
    const fallbackCandidates = rows.filter((row) => {
      const claim = readPhoneChallengeClaimContextFromChallenge(row);
      const identity = readPhoneChallengeIdentityContext(row);
      const createdAtMs = Date.parse(safeString(row.created_at) || "");
      return Boolean(
        claim.claimCode &&
          claim.claimCodeHash &&
          claim.claimWindowExpiresAt &&
          Date.parse(claim.claimWindowExpiresAt) > nowMs &&
          Number.isFinite(createdAtMs) &&
          createdAtMs >= nowMs - CLAIM_FALLBACK_WINDOW_MINUTES * 60 * 1000 &&
          safeString(row.auth_user_id) &&
          !identity.platformUserId,
      );
    });

    if (fallbackCandidates.length === 0) {
      return { status: "no_pending_claim" };
    }
    if (fallbackCandidates.length > 1) {
      return { status: "ambiguous_claim" };
    }
    challengeRow = fallbackCandidates[0] || null;
  }

  if (!challengeRow) {
    return { status: "invalid_claim" };
  }

  const challengeClaim = readPhoneChallengeClaimContextFromChallenge(challengeRow);
  const challengeIdentity = readPhoneChallengeIdentityContext(challengeRow);
  const claimWindowMs = Date.parse(challengeClaim.claimWindowExpiresAt || "");
  if (!challengeClaim.claimWindowExpiresAt || !Number.isFinite(claimWindowMs) || claimWindowMs <= nowMs) {
    return {
      status: "claim_expired",
      claim_code: challengeClaim.claimCode,
      claim_window_expires_at: challengeClaim.claimWindowExpiresAt,
    };
  }

  const authUserId = safeString(challengeRow.auth_user_id);
  if (safeString(challengeRow.status) !== "verified" || !authUserId) {
    return { status: "invalid_claim" };
  }

  if (challengeIdentity.platformUserId) {
    const customerContext = await resolveClaimCustomerContext(admin, challengeRow);
    return {
      status: "already_linked",
      auth_user_id: authUserId,
      phone_e164: customerContext.phoneE164,
      customer_id: customerContext.customerId,
      claim_code: challengeClaim.claimCode,
      claim_window_expires_at: challengeClaim.claimWindowExpiresAt,
    };
  }

  const customerContext = await resolveClaimCustomerContext(admin, challengeRow);
  if (!customerContext.customerId || !customerContext.customerRow || !customerContext.phoneE164) {
    return {
      status: "invalid_claim",
      reason: "customer_not_found",
      auth_user_id: authUserId,
      phone_e164: customerContext.phoneE164,
      claim_code: challengeClaim.claimCode,
      claim_window_expires_at: challengeClaim.claimWindowExpiresAt,
    };
  }

  const compatUser = await upsertCompatZaloUserForClaim(admin, {
    senderId: params.senderId,
    senderChatId: params.senderChatId,
    displayName: params.displayName,
    customerId: customerContext.customerId,
    authUserId,
    phoneE164: customerContext.phoneE164,
    customerRow: customerContext.customerRow,
  });

  const channelUpsert = await upsertZaloChannelAccountForClaim(admin, {
    senderId: params.senderId,
    senderChatId: params.senderChatId,
    displayName: params.displayName,
    customerId: customerContext.customerId,
    linkedUserId: Number(compatUser?.id ?? 0) || null,
    phoneE164: customerContext.phoneE164,
    customerRow: customerContext.customerRow,
  });
  if (channelUpsert.status === "invalid_claim") {
    return {
      status: "invalid_claim",
      reason: "sender_already_linked",
      auth_user_id: authUserId,
      phone_e164: customerContext.phoneE164,
      customer_id: customerContext.customerId,
      claim_code: challengeClaim.claimCode,
      claim_window_expires_at: challengeClaim.claimWindowExpiresAt,
    };
  }

  await updateClaimChallengeIdentity(admin, {
    challengeRow,
    customerId: customerContext.customerId,
    authUserId,
    identity: buildPhoneChallengeIdentityContext({
      sourceChannel: "zalo",
      platformUserId: params.senderId,
      platformChatId: params.senderChatId,
      platformDisplayName: params.displayName,
      bridgeToken: challengeIdentity.bridgeToken,
      sourceOrigin: challengeIdentity.sourceOrigin,
    }),
  });

  try {
    await refreshCustomerTruthBestEffort(admin, customerContext.customerId);
  } catch {}

  return {
    status: "linked",
    auth_user_id: authUserId,
    phone_e164: customerContext.phoneE164,
    customer_id: customerContext.customerId,
    linked_user_id: Number(compatUser?.id ?? 0) || null,
    claim_code: challengeClaim.claimCode,
    claim_window_expires_at: challengeClaim.claimWindowExpiresAt,
  };
}

async function buildClaimRedeemReplyPayload(admin: any, result: AnyRecord) {
  const status = safeString(result.status) || "invalid_claim";
  const phoneE164 = safeString(result.phone_e164);
  const authUserId = safeString(result.auth_user_id);
  const customerId = Number(result.customer_id ?? 0) || null;
  const linkedUserId = Number(result.linked_user_id ?? 0) || null;

  if (status === "ambiguous_claim") {
    return {
      ...result,
      reply_text: buildAmbiguousClaimReplyText(),
    };
  }

  if (!["linked", "already_linked", "linked_repair_pending"].includes(status)) {
    return result;
  }

  let truth: PhoneOnboardingTruth | null = null;
  if (authUserId && phoneE164) {
    try {
      truth = await readPhoneOnboardingTruth(admin, {
        authUserId,
        phoneE164,
      });
    } catch {
      truth = null;
    }
  }

  const resolvedProfile = await resolveCoreProfileUsers(admin, {
    customerId: customerId ?? truth?.customerId ?? null,
    linkedUserId,
  });
  const primaryRow = resolvedProfile.primaryRow || null;
  const profileMissingFields = collectMissingCoreProfileFields(primaryRow);
  const profileReady = profileMissingFields.length === 0;
  const chatLinkStatus = truth?.zaloLinked ? "linked" : "linked";
  const truthState = truth?.truthState || "zalo_linked";
  const nextAction = profileReady ? "open_zalo_chat" : "complete_onboarding_profile";
  const replyText =
    status === "already_linked"
      ? buildAlreadyLinkedReplyText(primaryRow, phoneE164, profileReady)
      : profileReady
        ? buildClaimProfileCompletedReplyText(primaryRow, phoneE164)
        : buildClaimOnboardingReplyText(primaryRow, phoneE164);

  return {
    ...result,
    truth_state: truthState,
    chat_link_status: chatLinkStatus,
    profile_ready: profileReady,
    profile_missing_fields: profileMissingFields,
    next_action: nextAction,
    zalo_auto_linked: true,
    repair_required: status === "linked_repair_pending",
    reply_text: replyText,
  };
}

export async function redeemZaloClaimCode(params: {
  code?: string | null;
  senderId: string;
  senderChatId?: string | null;
  displayName?: string | null;
  mode?: string | null;
  traceId?: string | null;
  sourceMessageId?: string | null;
}) {
  const admin = createServiceRoleClient();
  const mode = normalizeClaimRedeemMode(params.mode);
  let rpcResult: AnyRecord = {};
  const normalizedCode = normalizeClaimCode(params.code);

  try {
    const { data: rpcRaw, error: rpcError } = await admin.rpc("portal_redeem_zalo_claim_code", {
      p_code: normalizedCode,
      p_sender_id: params.senderId,
      p_sender_chat_id: safeString(params.senderChatId) || params.senderId,
      p_display_name: safeString(params.displayName),
      p_mode: mode,
    });
    if (rpcError) throw rpcError;
    rpcResult =
      rpcRaw && typeof rpcRaw === "object"
        ? ({ ...(rpcRaw as AnyRecord) } satisfies AnyRecord)
        : {};
  } catch (error) {
    if (!isMissingClaimRedeemRpcError(error)) throw error;
    rpcResult = await redeemZaloClaimCodeFallback(admin, {
      code: normalizedCode,
      senderId: params.senderId,
      senderChatId: safeString(params.senderChatId) || params.senderId,
      displayName: safeString(params.displayName),
      mode,
    });
  }

  const redeemStatus = safeString(rpcResult.status) || "invalid_claim";
  let finalStatus = redeemStatus;

  if (["linked", "already_linked"].includes(redeemStatus)) {
    try {
      const reconcile = await runPhoneOnboardingAutomationReconcile(admin, {
        scopedAuthUserId: safeString(rpcResult.auth_user_id),
        scopedPhoneE164: safeString(rpcResult.phone_e164),
        previewLimit: 1,
      });
      rpcResult.reconcile = reconcile;
    } catch {
      if (redeemStatus === "linked") {
        finalStatus = "linked_repair_pending";
      }
    }
  }

  if (["linked", "already_linked", "linked_repair_pending"].includes(finalStatus)) {
    try {
      const coreProfileSync = await syncClaimLinkedUserCoreProfile(admin, rpcResult);
      if (coreProfileSync) {
        rpcResult.profile_ready = coreProfileSync.profile_ready;
        rpcResult.profile_missing_fields = coreProfileSync.profile_missing_fields;
      }
    } catch {
      // Reply still proceeds; buildClaimRedeemReplyPayload will report the current truth.
    }
  }

  return buildClaimRedeemReplyPayload(admin, {
    ...rpcResult,
    status: finalStatus,
    mode,
    trace_id: safeString(params.traceId),
    source_message_id: safeString(params.sourceMessageId),
  });
}

async function syncClaimLinkedUserCoreProfile(admin: any, result: AnyRecord) {
  const customerId = Number(result.customer_id ?? 0) || null;
  const linkedUserId = Number(result.linked_user_id ?? 0) || null;
  if (!customerId || !linkedUserId) {
    return null;
  }

  const resolved = await resolveCoreProfileUsers(admin, {
    customerId,
    linkedUserId,
  });
  const primaryRow = resolved.primaryRow || null;
  if (!primaryRow) {
    return null;
  }

  const hasCanonicalCoreProfile = Boolean(
    safeString(primaryRow.gender) &&
    toFinitePortalNumber(primaryRow.age) > 0 &&
    toFinitePortalNumber(primaryRow.height_cm) > 0 &&
    toFinitePortalNumber(primaryRow.weight_kg) > 0 &&
    (safeString(primaryRow.activity_level) || primaryRow.activity_level === 0),
  );

  if (!hasCanonicalCoreProfile) {
    return null;
  }

  return upsertCoreProfileForContext({
    admin,
    context: {
      customerId,
      linkedUserId,
      userRow: primaryRow,
    },
    input: {
      gender: primaryRow.gender,
      age: primaryRow.age,
      height_cm: primaryRow.height_cm,
      weight_kg: primaryRow.weight_kg,
      activity_level: primaryRow.activity_level,
    },
    phoneE164:
      safeString(result.phone_e164) ||
      safeString(primaryRow.customer_phone_e164) ||
      null,
  });
}

async function handleRedeemZaloClaimCode(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const expectedKey = readChannelContextInternalKey();
    const providedKey = readInternalPortalKey(req);
    if (!expectedKey || providedKey !== expectedKey) {
      sendJson(res, 401, { ok: false, error: "invalid_internal_key" });
      return;
    }

    const body = (await readBody(req)) as {
      code?: string | null;
      sender_id?: string | null;
      sender_chat_id?: string | null;
      display_name?: string | null;
      mode?: string | null;
      trace_id?: string | null;
      source_message_id?: string | null;
    };

    const senderId = safeString(body.sender_id);
    if (!senderId) {
      sendJson(res, 400, { ok: false, error: "sender_id_required" });
      return;
    }
    const payload = await redeemZaloClaimCode({
      code: body.code,
      senderId,
      senderChatId: body.sender_chat_id,
      displayName: body.display_name,
      mode: body.mode,
      traceId: body.trace_id,
      sourceMessageId: body.source_message_id,
    });

    sendJson(res, 200, {
      ok: true,
      data: payload,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_redeem_zalo_claim_code_failed");
    sendJson(res, 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleCreateZaloCheckoutHandoff(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = (await readBody(req)) as {
      sku?: string | null;
      next?: string | null;
      source_origin?: string | null;
    };
    const admin = createServiceRoleClient();
    const data = await createZaloCheckoutHandoff(admin, {
      sku: safeString(body.sku),
      nextPath: safeString(body.next) || "/checkout",
      sourceOrigin:
        safeString(body.source_origin) ||
        safeString(req.headers?.origin) ||
        safeString(req.headers?.referer),
    });

    sendJson(res, 200, {
      ok: true,
      data: {
        handoff_code: data.handoffCode,
        handoff_token: data.handoffToken,
        expires_at: data.expiresAt,
        zalo_oa_url: data.zaloOaUrl,
        next_path: data.nextPath,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "create_zalo_checkout_handoff_failed");
    sendJson(res, 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleCheckoutHandoffStatus(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = (await readBody(req)) as {
      handoff_code?: string | null;
      handoff_token?: string | null;
    };
    const admin = createServiceRoleClient();
    const data = await readZaloCheckoutHandoffStatus(admin, {
      handoffCode: safeString(body.handoff_code) || "",
      handoffToken: safeString(body.handoff_token) || "",
    });

    sendJson(res, 200, {
      ok: true,
      data: {
        status: data.status,
        bridge_token: data.bridgeToken,
        expires_at: data.expiresAt,
        next_path: data.nextPath,
        chat_bound: data.chatBound,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "checkout_handoff_status_failed");
    sendJson(res, 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleUpsertCoreProfile(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = (await readBody(req)) as AnyRecord;
    const access = await resolveDashboardAccess(req, body);
    const resetOnly = body.reset === true || (safeString(body.reset) || "").toLowerCase() === "true";
    const data = await upsertCoreProfileForContext({
      admin: access.admin,
      context: access.context,
      input: {
        gender: body.gender,
        age: body.age,
        height_cm: body.height_cm,
        weight_kg: body.weight_kg,
        activity_level: body.activity_level,
      },
      phoneE164:
        safeString(body.phone_e164) ||
        safeString(body.phoneE164) ||
        null,
      resetOnly,
    });

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "upsert_core_profile_failed");
    sendJson(res, ["auth_required", "customer_not_linked", "dashboard_subject_required"].includes(message) ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleAutomationReconcile(req: any, res: any) {
  if (!["GET", "POST"].includes(String(req.method || "").toUpperCase())) {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const expectedSecret = readAutomationSecret();
  const providedSecret = readAuthorizationBearer(req);
  if (expectedSecret && providedSecret !== expectedSecret) {
    sendJson(res, 401, { ok: false, error: "automation_auth_required" });
    return;
  }

  try {
    const body = req.method === "POST" ? ((await readBody(req)) as AnyRecord) : {};
    const scopedAuthUserId =
      safeString(body?.auth_user_id) ||
      safeString(body?.authUserId) ||
      safeString(req.query?.auth_user_id) ||
      safeString(req.query?.authUserId) ||
      null;
    const scopedPhoneE164 =
      safeString(body?.phone_e164) ||
      safeString(body?.phoneE164) ||
      safeString(req.query?.phone_e164) ||
      safeString(req.query?.phoneE164) ||
      null;
    const admin = createServiceRoleClient();
    const summary = await runPhoneOnboardingAutomationReconcile(admin, {
      scopedAuthUserId,
      scopedPhoneE164,
      previewLimit: scopedAuthUserId || scopedPhoneE164 ? 1 : undefined,
    });

    sendJson(res, 200, {
      ok: true,
      data: {
        processed_at: summary.processedAt,
        candidates: summary.candidates,
        reconciled_count: summary.reconciledCount,
        skipped_count: summary.skippedCount,
        needs_review_order_count: summary.needsReviewOrderCount,
        repair_required_customer_count: summary.repairRequiredCustomerCount,
        reconciled: summary.reconciled,
        skipped: summary.skipped,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "automation_reconcile_failed");
    sendJson(res, 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

export async function createZaloOnboardingGate(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = (await readBody(req)) as {
      platform_user_id?: string;
      platform_chat_id?: string | null;
      display_name?: string | null;
      next?: string | null;
    };

    const admin = createServiceRoleClient();
    const result = await buildZaloPhoneAuthGateText(admin, {
      platformUserId: safeString(body.platform_user_id) || "",
      platformChatId: safeString(body.platform_chat_id),
      displayName: safeString(body.display_name),
      nextPath: safeString(body.next),
    });
    const responseData = {
      ...result,
      replyText: [
        "Để bắt đầu dùng CaloTrack trên Zalo, bạn cần xác thực số điện thoại trước.",
        `Mở portal: ${result.portalUrl}`,
        "Xác thực OTP xong hệ thống sẽ mở Pro dùng thử 7 ngày và hướng dẫn bạn confirm lại mã vừa được gửi ở ngay ở trên trong chính chat này.",
      ].join("\n"),
    };

    sendJson(res, 200, {
      ok: true,
      data: responseData,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_auth_bridge_create_failed");
    sendJson(res, 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

async function handleNotificationSettings(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = req.method === "POST" ? ((await readBody(req)) as AnyRecord) : {};
    const access = await resolveDashboardAccess(req, body);
    const userId = Number(access.context?.userRow?.id ?? 0) || 0;
    if (!userId) {
      sendJson(res, 404, { ok: false, error: "linked_user_not_found" });
      return;
    }

    if (req.method === "GET") {
      const result = await readRetentionNotificationSettings(access.admin, userId);
      sendJson(res, 200, {
        ok: true,
        data: {
          linked_user_id: userId,
          settings: result.resolved,
          raw_settings: result.raw,
        },
      });
      return;
    }

    const kind = safeString(body.kind);
    const enabled = normalizeNotificationEnabled(body.enabled);
    if (!kind) {
      sendJson(res, 400, { ok: false, error: "kind_required" });
      return;
    }
    if (enabled == null) {
      sendJson(res, 400, { ok: false, error: "enabled_required" });
      return;
    }

    const result = await setRetentionNotificationSetting(access.admin, userId, kind as any, enabled);
    sendJson(res, 200, {
      ok: true,
      data: {
        linked_user_id: userId,
        settings: result.resolved,
        raw_settings: result.raw,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_notification_settings_failed");
    sendJson(res, ["auth_required", "customer_not_linked", "dashboard_subject_required"].includes(message) ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const action = getAction(req);

  if (action === "dashboard-summary") {
    await handleDashboardSummary(req, res);
    return;
  }

  if (action === "start-checkout") {
    await handleStartCheckout(req, res);
    return;
  }

  if (action === "create-zalo-checkout-handoff") {
    await handleCreateZaloCheckoutHandoff(req, res);
    return;
  }

  if (action === "checkout-handoff-status") {
    await handleCheckoutHandoffStatus(req, res);
    return;
  }

  if (action === "channel-link") {
    await handleChannelLink(req, res);
    return;
  }

  if (action === "automation-reconcile") {
    await handleAutomationReconcile(req, res);
    return;
  }

  if (action === "start-zalo-phone-otp") {
    await handleStartZaloPhoneOtp(req, res);
    return;
  }

  if (action === "verify-zalo-phone-otp") {
    await handleVerifyZaloPhoneOtp(req, res);
    return;
  }

  if (action === "redeem-zalo-claim-code") {
    await handleRedeemZaloClaimCode(req, res);
    return;
  }

  if (action === "complete-phone-onboarding") {
    await handleCompletePhoneOnboarding(req, res);
    return;
  }

  if (action === "upsert-core-profile") {
    await handleUpsertCoreProfile(req, res);
    return;
  }

  if (action === "zalo-auth-bridge") {
    await createZaloOnboardingGate(req, res);
    return;
  }

  if (action === "public-site-config") {
    await handlePublicSiteConfig(req, res);
    return;
  }

  if (action === "admin-portal-settings") {
    await handleAdminPortalSiteConfig(req, res);
    return;
  }

  if (action === "notification-settings") {
    await handleNotificationSettings(req, res);
    return;
  }

  if (action === "admin-members") {
    await handleAdminMembersRequest(req, res);
    return;
  }

  if (action === "admin-identities") {
    await handleAdminIdentitiesRequest(req, res);
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: "portal_action_not_found",
  });
}
