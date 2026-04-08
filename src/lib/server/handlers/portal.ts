import { randomBytes, randomUUID } from "node:crypto";

import {
  createServiceRoleClient,
  maybeSingle,
  readBody,
  requireAdminAccess,
  requireAuthenticatedUser,
  safeString,
  sendJson,
  writeAdminAuditLog,
} from "../src/lib/server/adminServer.js";
import {
  getDashboardSummary,
  resolveDashboardAccess,
  type DashboardPeriod,
} from "../src/lib/server/dashboardSummaryServer.js";
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
} from "../src/lib/server/portalPhoneAuthServer.js";
import {
  PORTAL_SITE_CONFIG_AUDIT_ACTION,
  PORTAL_SITE_CONFIG_TARGET_ID,
  PORTAL_SITE_CONFIG_TARGET_TYPE,
  PUBLIC_PORTAL_SITE_SETTING_KEYS,
  normalizePortalSiteSettings,
  readLatestPortalSiteSettings,
} from "../src/lib/server/portalSiteConfigServer.js";
import { handleAdminIdentitiesRequest } from "../src/lib/server/adminIdentitiesApiServer.js";
import { handleAdminMembersRequest } from "../src/lib/server/adminMembersApiServer.js";
import { sendZaloTemplateMessage } from "../src/lib/server/zaloOaServer.js";

type AnyRecord = Record<string, unknown>;
type ChannelKey = "telegram" | "zalo";

const DEFAULT_TELEGRAM_BOT_URL = safeString(process.env.VITE_TELEGRAM_BOT_URL) || "https://t.me/CaloTrack_bot";
const DEFAULT_ZALO_OA_URL = safeString(process.env.VITE_ZALO_OA_URL) || "https://zalo.me/4423588403113387176";
const TOKEN_TTL_MINUTES = 30;

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

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sanitizePortalSiteSettings(raw: Record<string, unknown>) {
  const next: Record<string, string | null> = {};
  for (const key of PUBLIC_PORTAL_SITE_SETTING_KEYS) {
    next[key] = safeString(raw[key]);
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
      ? "Telegram này đã liên kết vào account của bạn. Bạn có thể mở bot và chat tiếp ngay."
      : "Mở Telegram bot, bot sẽ tự nhận token và nối vào account của bạn.";
  }

  return status === "already_linked"
    ? "Zalo này đã liên kết vào account của bạn. Bạn có thể mở OA và chat tiếp ngay."
    : `Mở OA Calo Track và gửi mã ${linkCode || "liên kết"} một lần để nối Zalo vào account của bạn.`;
}

async function resolvePortalCustomerForAuthUser(admin: any, authUserId: string) {
  const authLink =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_auth_links")
        .select("customer_id, link_status")
        .eq("auth_user_id", authUserId)
        .in("link_status", ["linked", "active"])
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  const customerId = Number(authLink?.customer_id ?? 0) || null;
  if (!customerId) {
    throw new Error("phone_verification_required");
  }

  const customer =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("id, access_state, phone_verified_at")
        .eq("id", customerId)
        .limit(1),
    )) || null;

  if (!customer || safeString(customer.access_state) === "pending_verification" || !safeString(customer.phone_verified_at)) {
    throw new Error("phone_verification_required");
  }

  return customerId;
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
    const payload = (await readBody(req)) as { phone?: string };
    const phoneE164 = normalizeVietnamPhoneInput(payload.phone);
    if (!phoneE164 || !phoneE164.startsWith("+84")) {
      sendJson(res, 400, { ok: false, error: "phone_number_invalid" });
      return;
    }

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

    const { data: customerRow } = await admin
      .from("customers")
      .select("id")
      .eq("phone_e164", phoneE164)
      .limit(1)
      .maybeSingle();

    const otp = randomOtp(6);
    const otpHash = await hashOtp(phoneE164, otp);
    const templateId = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_ID) || "560965";
    const otpKey = cleanEnv(process.env.ZALO_PHONE_TEMPLATE_OTP_KEY) || "otp";
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
    const { error: insertError } = await admin.from("auth_phone_challenges").insert({
      phone_e164: phoneE164,
      customer_id: customerRow?.id ?? null,
      channel: "zalo_phone_template",
      otp_hash: otpHash,
      status: sendResult.accepted ? "sent" : "provider_failed",
      provider_tracking_id: sendResult.trackingId,
      provider_msg_id: sendResult.providerMsgId,
      provider_status: sendResult.providerStatus,
      provider_error: sendResult.providerError,
      max_attempts: maxAttempts,
      expires_at: expiresAt,
      provider_request_payload: sanitizeRequestPayload(phoneE164, trackingId, templateId, templateData),
      provider_response_payload: sendResult.responsePayload as AnyRecord,
    });

    if (insertError) {
      throw insertError;
    }

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

    if (issueSession) {
      try {
        const session = await issueSessionForPhone(phoneE164);
        authUserId = session.authUserId;
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

    sendJson(res, 200, {
      ok: true,
      status: "verified",
      phone_e164: phoneE164,
      issued_session: issueSession,
      session: sessionPayload,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: String((error as Error)?.message || error || "portal_verify_zalo_phone_otp_failed"),
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

  if (action === "channel-link") {
    await handleChannelLink(req, res);
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

  if (action === "public-site-config") {
    await handlePublicSiteConfig(req, res);
    return;
  }

  if (action === "admin-portal-settings") {
    await handleAdminPortalSiteConfig(req, res);
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
