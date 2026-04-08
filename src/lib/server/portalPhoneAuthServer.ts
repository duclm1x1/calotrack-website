import { createHash, randomInt, randomUUID } from "node:crypto";

import { createServiceRoleClient, maybeSingle, safeString } from "./adminServer.js";

type AnyRecord = Record<string, any>;

function cleanEnv(value: string | undefined) {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

export function normalizeVietnamPhoneInput(input: string | null | undefined): string | null {
  const digits = String(input || "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+84")) return `+84${digits.slice(3).replace(/\D/g, "")}`;
  if (digits.startsWith("84")) return `+84${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length >= 9) return `+84${digits.slice(1)}`;
  if (digits.startsWith("+")) return digits;
  if (/^[1-9]\d{8,12}$/.test(digits)) return `+${digits}`;
  return null;
}

export function buildAsciiOtpMessage(otp: string) {
  return `Ma xac thuc CaloTrack cua ban la ${otp}. Ma co hieu luc trong 3 phut.`;
}

export function maskOtpMessage(message: string) {
  return message.replace(/\d{4,8}/g, "******");
}

export function randomOtp(length = 6): string {
  return Array.from({ length }, () => String(randomInt(0, 10))).join("");
}

export function getOtpTtlSeconds() {
  const value = Number(cleanEnv(process.env.PORTAL_PHONE_OTP_TTL_SECONDS) || "180");
  return Number.isFinite(value) && value > 0 ? value : 180;
}

export function getOtpMaxAttempts() {
  const value = Number(cleanEnv(process.env.PORTAL_PHONE_OTP_MAX_ATTEMPTS) || "5");
  return Number.isFinite(value) && value > 0 ? value : 5;
}

export function getOtpResendCooldownSeconds() {
  const value = Number(cleanEnv(process.env.PORTAL_PHONE_OTP_RESEND_COOLDOWN_SECONDS) || "30");
  return Number.isFinite(value) && value >= 0 ? value : 30;
}

function getSyntheticEmailDomain() {
  return cleanEnv(process.env.PORTAL_SYNTHETIC_EMAIL_DOMAIN) || "auth.calotrack.local";
}

function getSupabaseUrl() {
  return cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
}

function getSupabaseAnonKey() {
  return (
    cleanEnv(process.env.SUPABASE_ANON_KEY) ||
    cleanEnv(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_ANON_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  );
}

export async function hashOtp(phoneE164: string, otp: string) {
  const pepper = cleanEnv(process.env.PORTAL_PHONE_OTP_PEPPER) || cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createHash("sha256")
    .update(`${pepper}:${phoneE164}:${otp}`, "utf8")
    .digest("hex");
}

function syntheticEmailForPhone(phoneE164: string) {
  const digits = phoneE164.replace(/[^\d]/g, "");
  return `phone.${digits}@${getSyntheticEmailDomain()}`;
}

function randomPassword() {
  return `${randomUUID()}${randomUUID().replace(/-/g, "")}`;
}

export async function issueSessionForPhone(phoneE164: string) {
  const admin = createServiceRoleClient();
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !anonKey) {
    throw new Error("supabase_runtime_config_missing");
  }

  const syntheticEmail = syntheticEmailForPhone(phoneE164);
  const password = randomPassword();

  const identity =
    (await maybeSingle<AnyRecord>(
      admin
        .from("auth_phone_identities")
        .select("phone_e164, auth_user_id, synthetic_email")
        .eq("phone_e164", phoneE164)
        .limit(1),
    )) || null;

  let authUserId = safeString(identity?.auth_user_id) || null;

  if (authUserId) {
    const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: {
        auth_method: "zalo_phone_otp",
        phone_e164: phoneE164,
      },
    });
    if (updateError) {
      authUserId = null;
    }
  }

  if (!authUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: {
        auth_method: "zalo_phone_otp",
        phone_e164: phoneE164,
      },
    });

    if (createError || !created.user) {
      throw createError ?? new Error("auth_user_create_failed");
    }

    authUserId = created.user.id;

    const { error: upsertError } = await admin.from("auth_phone_identities").upsert({
      phone_e164: phoneE164,
      auth_user_id: authUserId,
      synthetic_email: syntheticEmail,
    });
    if (upsertError) throw upsertError;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: syntheticEmail,
      password,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as AnyRecord;
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(
      safeString(payload.error_description) ||
        safeString(payload.msg) ||
        safeString(payload.error) ||
        "session_issue_failed",
    );
  }

  return {
    authUserId,
    syntheticEmail,
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token),
    expiresIn: Number(payload.expires_in ?? 0),
    tokenType: String(payload.token_type ?? "bearer"),
    user: (payload.user as AnyRecord | undefined) ?? null,
  };
}
