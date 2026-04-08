import { createServiceRoleClient, readBody, sendJson } from "../src/lib/server/adminServer.js";
import {
  getOtpMaxAttempts,
  hashOtp,
  issueSessionForPhone,
  normalizeVietnamPhoneInput,
} from "../src/lib/server/portalPhoneAuthServer.js";

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
