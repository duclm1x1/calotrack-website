import { randomUUID } from "node:crypto";

import { createServiceRoleClient, readBody, sendJson } from "../src/lib/server/adminServer.js";
import {
  buildAsciiOtpMessage,
  getOtpMaxAttempts,
  getOtpResendCooldownSeconds,
  getOtpTtlSeconds,
  hashOtp,
  maskOtpMessage,
  normalizeVietnamPhoneInput,
  randomOtp,
} from "../src/lib/server/portalPhoneAuthServer.js";
import { sendZaloTemplateMessage } from "../src/lib/server/zaloOaServer.js";

type AnyRecord = Record<string, unknown>;

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

function cleanEnv(value: string | undefined) {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

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
