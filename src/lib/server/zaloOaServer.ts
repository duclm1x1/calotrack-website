import * as crypto from "node:crypto";

import {
  createServiceRoleClient,
  requireAdminAccess,
  safeString,
} from "./adminServer.js";

type AnyRecord = Record<string, any>;

type ZaloTokenState = {
  app_id: string;
  exists?: boolean;
  access_token?: string | null;
  refresh_token?: string | null;
  token_type?: string | null;
  expires_at?: string | null;
  last_refresh_at?: string | null;
  last_refresh_status?: string | null;
  last_error?: string | null;
  refresh_lock_until?: string | null;
  token_status?: string | null;
  browserbase_context_id?: string | null;
  last_browserbase_session_id?: string | null;
  last_reauth_at?: string | null;
  last_reauth_status?: string | null;
  last_reauth_error?: string | null;
};

type ZaloOAuthSession = {
  state: string;
  exists?: boolean;
  app_id?: string | null;
  code_verifier?: string | null;
  redirect_after?: string | null;
  expires_at?: string | null;
  consumed_at?: string | null;
  oa_id?: string | null;
  created_at?: string | null;
};

export type ZaloSendResult = {
  accepted: boolean;
  reason: string;
  providerStatus: string;
  providerError: string | null;
  providerMsgId: string | null;
  trackingId: string | null;
  requestPayload: AnyRecord;
  responsePayload: AnyRecord;
  httpStatus: number | null;
  providerErrorCode: number | null;
  refreshedDuringSend: boolean;
};

function cleanEnv(value: string | undefined) {
  return String(value || "").replace(/\r?\n/g, "").trim();
}

export function getZaloOaAppId() {
  return cleanEnv(process.env.ZALO_OA_APP_ID) ||
    cleanEnv(process.env.ZALO_APP_ID) ||
    "1450975846052622442";
}

function getZaloOaSecretKey() {
  return cleanEnv(process.env.ZALO_OA_SECRET_KEY) || cleanEnv(process.env.ZALO_APP_SECRET);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function encodeBase64Url(buffer: Buffer) {
  return buffer.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function getSiteBaseUrl(req?: any) {
  const configured = cleanEnv(process.env.ZALO_OA_SITE_URL) ||
    cleanEnv(process.env.VITE_SITE_URL) ||
    cleanEnv(process.env.SITE_URL);
  if (configured) return trimTrailingSlash(configured);

  const host = safeString(req?.headers?.["x-forwarded-host"]) ||
    safeString(req?.headers?.host);
  const proto = safeString(req?.headers?.["x-forwarded-proto"]) || "https";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return "https://calotrack-website.vercel.app";
}

export function getZaloOaOauthCallbackUrl(req?: any) {
  return cleanEnv(process.env.ZALO_OA_OAUTH_CALLBACK_URL) ||
    `${getSiteBaseUrl(req)}/api/zalo-oa-oauth/callback`;
}

function getZaloOaOauthPermissionUrl() {
  return cleanEnv(process.env.ZALO_OA_PERMISSION_URL) ||
    "https://oauth.zaloapp.com/v4/oa/permission";
}

function getZaloOaOauthSessionTtlSeconds() {
  const value = Number(process.env.ZALO_OA_OAUTH_SESSION_TTL_SECONDS || "600");
  return Number.isFinite(value) && value >= 60 ? value : 600;
}

export function getZaloOaInternalKey() {
  return cleanEnv(process.env.ZALO_OA_INTERNAL_KEY) ||
    cleanEnv(process.env.CHANNEL_CONTEXT_INTERNAL_KEY) ||
    cleanEnv(process.env.CALOTRACK_ZALO_INTERNAL_SECRET);
}

function getRefreshLeadSeconds() {
  const value = Number(process.env.ZALO_OA_REFRESH_LEAD_SECONDS || "7200");
  return Number.isFinite(value) && value > 0 ? value : 7200;
}

function getRefreshLockSeconds() {
  const value = Number(process.env.ZALO_OA_REFRESH_LOCK_SECONDS || "30");
  return Number.isFinite(value) && value > 0 ? value : 30;
}

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getInternalKeyCandidate(req: any) {
  return safeString(req.headers?.["x-calotrack-internal-key"]) ||
    safeString(req.headers?.["x-calotrack-internal-secret"]) ||
    (() => {
      const authHeader = safeString(req.headers?.authorization);
      const match = authHeader?.match(/^Bearer\s+(.+)$/i);
      return safeString(match?.[1]);
    })();
}

function normalizeTokenState(value: unknown, appId: string): ZaloTokenState {
  const row = value && typeof value === "object" ? value as AnyRecord : {};
  return {
    app_id: safeString(row.app_id) || appId,
    exists: row.exists === true,
    access_token: safeString(row.access_token),
    refresh_token: safeString(row.refresh_token),
    token_type: safeString(row.token_type) || "bearer",
    expires_at: safeString(row.expires_at),
    last_refresh_at: safeString(row.last_refresh_at),
    last_refresh_status: safeString(row.last_refresh_status),
    last_error: safeString(row.last_error),
    refresh_lock_until: safeString(row.refresh_lock_until),
    token_status: safeString(row.token_status),
    browserbase_context_id: safeString(row.browserbase_context_id),
    last_browserbase_session_id: safeString(row.last_browserbase_session_id),
    last_reauth_at: safeString(row.last_reauth_at),
    last_reauth_status: safeString(row.last_reauth_status),
    last_reauth_error: safeString(row.last_reauth_error),
  };
}

function normalizeOauthSession(value: unknown, state?: string | null): ZaloOAuthSession {
  const row = value && typeof value === "object" ? value as AnyRecord : {};
  return {
    state: safeString(row.state) || safeString(state) || "",
    exists: row.exists === true,
    app_id: safeString(row.app_id),
    code_verifier: safeString(row.code_verifier),
    redirect_after: safeString(row.redirect_after),
    expires_at: safeString(row.expires_at),
    consumed_at: safeString(row.consumed_at),
    oa_id: safeString(row.oa_id),
    created_at: safeString(row.created_at),
  };
}

function parseJsonRecord(value: unknown): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as AnyRecord;
}

function shouldRefresh(state: ZaloTokenState, leadSeconds: number, forceRefresh = false) {
  if (forceRefresh) return true;
  if (!state.access_token) return true;
  const expiresAt = safeString(state.expires_at);
  if (!expiresAt) return true;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= Date.now() + (leadSeconds * 1000);
}

async function rpc<T>(admin: ReturnType<typeof createServiceRoleClient>, fn: string, params: Record<string, unknown>) {
  const { data, error } = await admin.rpc(fn, params);
  if (error) throw error;
  return data as T;
}

export async function requireZaloBrokerAccess(req: any) {
  const internalKey = getZaloOaInternalKey();
  const candidate = getInternalKeyCandidate(req);
  if (internalKey && candidate && timingSafeEquals(candidate, internalKey)) {
    return {
      admin: createServiceRoleClient(),
      accessKind: "internal" as const,
    };
  }

  const access = await requireAdminAccess(req);
  return {
    admin: access.admin,
    accessKind: "admin" as const,
    adminAccess: access,
  };
}

export async function getZaloOaTokenState(admin: ReturnType<typeof createServiceRoleClient>, appId?: string) {
  const payload = await rpc<AnyRecord>(admin, "zalo_oa_get_token_state", {
    p_app_id: appId || getZaloOaAppId(),
  });
  return normalizeTokenState(payload, appId || getZaloOaAppId());
}

export async function bootstrapZaloOaToken(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: {
    appId?: string | null;
    accessToken: string;
    refreshToken: string;
    expiresAt?: string | null;
    expiresIn?: number | null;
    tokenType?: string | null;
  },
) {
  const targetAppId = safeString(payload.appId) || getZaloOaAppId();
  const expiresAt = safeString(payload.expiresAt) ||
    (Number(payload.expiresIn ?? 0) > 0
      ? new Date(Date.now() + Number(payload.expiresIn) * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

  const row = await rpc<AnyRecord>(admin, "zalo_oa_bootstrap_token", {
    p_app_id: targetAppId,
    p_access_token: payload.accessToken,
    p_refresh_token: payload.refreshToken,
    p_expires_at: expiresAt,
    p_token_type: safeString(payload.tokenType) || "bearer",
  });
  return normalizeTokenState(row, targetAppId);
}

export function createZaloOaPkcePair() {
  const codeVerifier = encodeBase64Url(crypto.randomBytes(48));
  const codeChallenge = encodeBase64Url(
    crypto.createHash("sha256").update(codeVerifier, "ascii").digest(),
  );
  const state = encodeBase64Url(crypto.randomBytes(24));
  return {
    state,
    codeVerifier,
    codeChallenge,
  };
}

function normalizeRedirectAfter(candidate: unknown, req?: any) {
  const value = safeString(candidate);
  if (!value) return null;

  const siteBaseUrl = getSiteBaseUrl(req);
  const siteUrl = new URL(siteBaseUrl);
  try {
    if (value.startsWith("/")) {
      return new URL(value, `${siteBaseUrl}/`).toString();
    }

    const parsed = new URL(value);
    return parsed.origin === siteUrl.origin ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function createZaloOaOAuthSession(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: {
    appId?: string | null;
    state: string;
    codeVerifier: string;
    redirectAfter?: string | null;
    expiresAt?: string | null;
  },
) {
  const targetAppId = safeString(payload.appId) || getZaloOaAppId();
  const row = await rpc<AnyRecord>(admin, "zalo_oa_create_oauth_session", {
    p_state: payload.state,
    p_app_id: targetAppId,
    p_code_verifier: payload.codeVerifier,
    p_redirect_after: payload.redirectAfter ?? null,
    p_expires_at: payload.expiresAt || new Date(Date.now() + getZaloOaOauthSessionTtlSeconds() * 1000).toISOString(),
  });
  return normalizeOauthSession(row, payload.state);
}

export async function getZaloOaOAuthSession(
  admin: ReturnType<typeof createServiceRoleClient>,
  state: string,
) {
  const row = await rpc<AnyRecord>(admin, "zalo_oa_get_oauth_session", {
    p_state: state,
  });
  return normalizeOauthSession(row, state);
}

export async function consumeZaloOaOAuthSession(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: {
    state: string;
    oaId?: string | null;
  },
) {
  const row = await rpc<AnyRecord>(admin, "zalo_oa_consume_oauth_session", {
    p_state: payload.state,
    p_oa_id: payload.oaId ?? null,
  });
  return normalizeOauthSession(row, payload.state);
}

export function createZaloOaOauthStartPayload(
  req?: any,
  options?: {
    appId?: string | null;
    redirectAfter?: string | null;
  },
) {
  const appId = safeString(options?.appId) || getZaloOaAppId();
  const redirectAfter = normalizeRedirectAfter(options?.redirectAfter, req);
  const { state, codeVerifier, codeChallenge } = createZaloOaPkcePair();
  const callbackUrl = new URL(getZaloOaOauthCallbackUrl(req));
  callbackUrl.searchParams.set("state", state);
  if (redirectAfter) {
    callbackUrl.searchParams.set("redirect_after", redirectAfter);
  }

  const authorizationUrl = new URL(getZaloOaOauthPermissionUrl());
  authorizationUrl.searchParams.set("app_id", appId);
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return {
    appId,
    state,
    codeVerifier,
    codeChallenge,
    redirectAfter,
    callbackUrl: callbackUrl.toString(),
    authorizationUrl: authorizationUrl.toString(),
    expiresAt: new Date(Date.now() + getZaloOaOauthSessionTtlSeconds() * 1000).toISOString(),
  };
}

export async function exchangeZaloOaAuthorizationCode(payload: {
  appId?: string | null;
  code: string;
  codeVerifier: string;
}) {
  const targetAppId = safeString(payload.appId) || getZaloOaAppId();
  const secretKey = getZaloOaSecretKey();
  if (!secretKey) {
    throw new Error("zalo_oa_secret_key_missing");
  }

  const response = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: secretKey,
    },
    body: new URLSearchParams({
      code: payload.code,
      app_id: targetAppId,
      grant_type: "authorization_code",
      code_verifier: payload.codeVerifier,
    }),
  });
  const rawText = await response.text();
  let parsed: AnyRecord = {};
  try {
    parsed = JSON.parse(rawText) as AnyRecord;
  } catch {
    parsed = { raw: rawText };
  }

  const accessToken = safeString(parsed.access_token);
  const refreshToken = safeString(parsed.refresh_token);
  if (!response.ok || !accessToken || !refreshToken) {
    const message = safeString(parsed.error_description) ||
      safeString(parsed.message) ||
      safeString(parsed.error_name) ||
      safeString(parsed.raw) ||
      "zalo_oauth_exchange_failed";
    throw new Error(message || "zalo_oauth_exchange_failed");
  }

  const expiresIn = Number(parsed.expires_in ?? parsed.expires ?? 0) || 0;
  return {
    appId: targetAppId,
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: safeString(parsed.token_type) || "bearer",
    raw: parsed,
  };
}

function resolveOptionalString(next: unknown, fallback?: string | null) {
  if (next === undefined) return fallback ?? null;
  return safeString(next) || null;
}

function resolveOptionalTimestamp(next: unknown, fallback?: string | null) {
  if (next === undefined) return fallback ?? null;
  const value = safeString(next);
  return value || null;
}

export async function updateZaloOaBrowserbaseState(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: {
    appId?: string | null;
    browserbaseContextId?: string | null;
    lastBrowserbaseSessionId?: string | null;
    lastReauthAt?: string | null;
    lastReauthStatus?: string | null;
    lastReauthError?: string | null;
  },
) {
  const targetAppId = safeString(payload.appId) || getZaloOaAppId();
  const current = await getZaloOaTokenState(admin, targetAppId);
  const nextLastReauthStatus = resolveOptionalString(payload.lastReauthStatus, current.last_reauth_status);
  const nextLastReauthAt = payload.lastReauthAt === undefined
    ? (
        payload.lastReauthStatus !== undefined || payload.lastReauthError !== undefined
          ? new Date().toISOString()
          : current.last_reauth_at || null
      )
    : resolveOptionalTimestamp(payload.lastReauthAt, current.last_reauth_at);
  const nextLastReauthError = payload.lastReauthError === undefined
    ? (
        nextLastReauthStatus === "ok" || nextLastReauthStatus === "bootstrap_completed"
          ? null
          : current.last_reauth_error || null
      )
    : resolveOptionalString(payload.lastReauthError, current.last_reauth_error);

  const row = await rpc<AnyRecord>(admin, "zalo_oa_update_browserbase_state", {
    p_app_id: targetAppId,
    p_browserbase_context_id: resolveOptionalString(payload.browserbaseContextId, current.browserbase_context_id),
    p_last_browserbase_session_id: resolveOptionalString(
      payload.lastBrowserbaseSessionId,
      current.last_browserbase_session_id,
    ),
    p_last_reauth_at: nextLastReauthAt,
    p_last_reauth_status: nextLastReauthStatus,
    p_last_reauth_error: nextLastReauthError,
  });

  return normalizeTokenState(row, targetAppId);
}

function classifyRefreshFailure(payload: AnyRecord, fallbackMessage?: string | null) {
  const message =
    safeString(payload.error_description) ||
    safeString(payload.message) ||
    safeString(payload.error_name) ||
    safeString(fallbackMessage) ||
    "refresh_failed";
  const lowered = message.toLowerCase();
  const status = lowered.includes("refresh token") ||
      lowered.includes("authorization") ||
      lowered.includes("invalid_grant") ||
      lowered.includes("expired")
    ? "reauthorization_required"
    : "refresh_failed";
  return { status, message };
}

async function waitForHealthyToken(admin: ReturnType<typeof createServiceRoleClient>, appId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const state = await getZaloOaTokenState(admin, appId);
    if (!state.refresh_lock_until || !shouldRefresh(state, getRefreshLeadSeconds(), false)) {
      return state;
    }
  }
  return getZaloOaTokenState(admin, appId);
}

export async function refreshZaloOaToken(
  admin: ReturnType<typeof createServiceRoleClient>,
  options?: { appId?: string; forceRefresh?: boolean },
) {
  const targetAppId = options?.appId || getZaloOaAppId();
  let state = await getZaloOaTokenState(admin, targetAppId);
  if (!shouldRefresh(state, getRefreshLeadSeconds(), options?.forceRefresh === true)) {
    return state;
  }

  const acquired = await rpc<boolean>(admin, "zalo_oa_acquire_refresh_lock", {
    p_app_id: targetAppId,
    p_lock_seconds: getRefreshLockSeconds(),
  });

  if (!acquired) {
    return waitForHealthyToken(admin, targetAppId);
  }

  state = await getZaloOaTokenState(admin, targetAppId);
  if (!shouldRefresh(state, getRefreshLeadSeconds(), options?.forceRefresh === true)) {
    return state;
  }

  if (!state.refresh_token) {
    const marked = await rpc<AnyRecord>(admin, "zalo_oa_mark_refresh_failure", {
      p_app_id: targetAppId,
      p_refresh_status: "bootstrap_required",
      p_error: "Missing refresh token for Zalo OA rotation.",
    });
    return normalizeTokenState(marked, targetAppId);
  }

  const secretKey = getZaloOaSecretKey();
  if (!secretKey) {
    const marked = await rpc<AnyRecord>(admin, "zalo_oa_mark_refresh_failure", {
      p_app_id: targetAppId,
      p_refresh_status: "bootstrap_required",
      p_error: "Missing ZALO_OA_SECRET_KEY for refresh.",
    });
    return normalizeTokenState(marked, targetAppId);
  }

  try {
    const response = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: secretKey,
      },
      body: new URLSearchParams({
        app_id: targetAppId,
        refresh_token: state.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const rawText = await response.text();
    let payload: AnyRecord = {};
    try {
      payload = JSON.parse(rawText) as AnyRecord;
    } catch {
      payload = { raw: rawText };
    }

    const accessToken = safeString(payload.access_token);
    if (!response.ok || !accessToken) {
      const failure = classifyRefreshFailure(payload, rawText);
      const marked = await rpc<AnyRecord>(admin, "zalo_oa_mark_refresh_failure", {
        p_app_id: targetAppId,
        p_refresh_status: failure.status,
        p_error: failure.message,
      });
      return normalizeTokenState(marked, targetAppId);
    }

    const refreshToken = safeString(payload.refresh_token) || state.refresh_token;
    const expiresIn = Number(payload.expires_in ?? payload.expires ?? 0) || 0;
    const expiresAt = expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const updated = await rpc<AnyRecord>(admin, "zalo_oa_apply_refreshed_token", {
      p_app_id: targetAppId,
      p_access_token: accessToken,
      p_refresh_token: refreshToken,
      p_expires_at: expiresAt,
      p_token_type: safeString(payload.token_type) || "bearer",
      p_refresh_status: "ok",
    });
    return normalizeTokenState(updated, targetAppId);
  } catch (error) {
    const marked = await rpc<AnyRecord>(admin, "zalo_oa_mark_refresh_failure", {
      p_app_id: targetAppId,
      p_refresh_status: "refresh_failed",
      p_error: safeString((error as Error)?.message) || "refresh_failed",
    });
    return normalizeTokenState(marked, targetAppId);
  }
}

export async function getZaloOaHealth(admin: ReturnType<typeof createServiceRoleClient>, appId?: string) {
  const state = await getZaloOaTokenState(admin, appId);
  return {
    appId: state.app_id,
    tokenStatus: state.token_status || (shouldRefresh(state, getRefreshLeadSeconds(), false) ? "expiring_soon" : "healthy"),
    expiresAt: state.expires_at || null,
    lastRefreshAt: state.last_refresh_at || null,
    lastRefreshStatus: state.last_refresh_status || null,
    lastError: state.last_error || null,
    refreshLockUntil: state.refresh_lock_until || null,
    hasAccessToken: Boolean(state.access_token),
    hasRefreshToken: Boolean(state.refresh_token),
    browserbaseContextId: state.browserbase_context_id || null,
    lastBrowserbaseSessionId: state.last_browserbase_session_id || null,
    lastReauthAt: state.last_reauth_at || null,
    lastReauthStatus: state.last_reauth_status || null,
    lastReauthError: state.last_reauth_error || null,
    browserbaseReady: Boolean(state.browserbase_context_id),
    needsQrBootstrap: !state.browserbase_context_id,
    needsBrowserbaseReauth: (state.token_status || "") === "reauthorization_required",
  };
}

function sanitizePayload(value: unknown): AnyRecord {
  const payload = parseJsonRecord(value);
  const json = JSON.stringify(payload, (_key, rawValue) => {
    if (typeof rawValue === "string") {
      if (/^\d{4,8}$/.test(rawValue)) {
        return "******";
      }
      return rawValue;
    }
    return rawValue;
  });
  return parseJsonRecord(JSON.parse(json));
}

function deriveSendFailureReason(responsePayload: AnyRecord, httpStatus: number | null) {
  const errorCode = Number(responsePayload.error ?? -1);
  const message = safeString(responsePayload.message) || "";
  const lowered = message.toLowerCase();

  if (errorCode === -155 || lowered.includes("token")) return "zalo_token_invalid";
  if (lowered.includes("phone")) return "zalo_phone_not_linked";
  if (lowered.includes("template")) return "zalo_template_invalid";
  if (lowered.includes("quota")) return "zalo_quota_exceeded";
  if (httpStatus === 401 || httpStatus === 403) return "zalo_token_invalid";
  return "zalo_send_failed";
}

function extractProviderMessageId(payload: AnyRecord): string | null {
  const data = parseJsonRecord(payload.data);
  return safeString(data.msg_id) || safeString(data.message_id);
}

function needsTokenRetry(httpStatus: number | null, payload: AnyRecord) {
  const errorCode = Number(payload.error ?? 0);
  const message = safeString(payload.message)?.toLowerCase() || "";
  return errorCode === -155 || httpStatus === 401 || httpStatus === 403 || message.includes("token");
}

async function logDelivery(admin: ReturnType<typeof createServiceRoleClient>, params: {
  appId: string;
  channel: "oa_cs" | "template";
  endpoint: string;
  target: string;
  templateId?: string | null;
  trackingId?: string | null;
  status: string;
  httpStatus: number | null;
  providerErrorCode: number | null;
  providerMessage: string | null;
  retryCount: number;
  refreshedDuringSend: boolean;
  requestPayload: AnyRecord;
  responsePayload: AnyRecord;
}) {
  await rpc<number>(admin, "zalo_oa_log_delivery", {
    p_app_id: params.appId,
    p_channel: params.channel,
    p_endpoint: params.endpoint,
    p_target: params.target,
    p_template_id: params.templateId ?? null,
    p_tracking_id: params.trackingId ?? null,
    p_status: params.status,
    p_http_status: params.httpStatus,
    p_provider_error_code: params.providerErrorCode,
    p_provider_message: params.providerMessage,
    p_retry_count: params.retryCount,
    p_refreshed_during_send: params.refreshedDuringSend,
    p_request_payload: params.requestPayload,
    p_response_payload: params.responsePayload,
  }).catch(() => 0);
}

async function sendWithToken(accessToken: string, endpoint: string, payload: AnyRecord) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: accessToken,
    },
    body: JSON.stringify(payload),
  });
  const rawText = await response.text();
  let responsePayload: AnyRecord = {};
  try {
    responsePayload = JSON.parse(rawText) as AnyRecord;
  } catch {
    responsePayload = { raw: rawText };
  }
  return {
    httpStatus: response.status,
    responsePayload,
  };
}

export async function sendZaloTemplateMessage(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: {
    phone: string;
    template_id: string;
    template_data: AnyRecord;
    tracking_id?: string | null;
  },
): Promise<ZaloSendResult> {
  const appId = getZaloOaAppId();
  const endpoint = "https://business.openapi.zalo.me/message/template";
  let tokenState = await refreshZaloOaToken(admin, { appId });
  let refreshedDuringSend = false;
  let retryCount = 0;

  if (!safeString(tokenState.access_token)) {
    const failure: ZaloSendResult = {
      accepted: false,
      reason: tokenState.last_refresh_status === "bootstrap_required"
        ? "zalo_otp_not_configured"
        : "zalo_token_invalid",
      providerStatus: "failed",
      providerError: safeString(tokenState.last_error) || "Missing usable Zalo access token",
      providerMsgId: null,
      trackingId: safeString(payload.tracking_id),
      requestPayload: sanitizePayload(payload),
      responsePayload: {},
      httpStatus: null,
      providerErrorCode: null,
      refreshedDuringSend,
    };
    await logDelivery(admin, {
      appId,
      channel: "template",
      endpoint,
      target: safeString(payload.phone) || "",
      templateId: safeString(payload.template_id),
      trackingId: safeString(payload.tracking_id),
      status: failure.reason,
      httpStatus: null,
      providerErrorCode: null,
      providerMessage: failure.providerError,
      retryCount,
      refreshedDuringSend,
      requestPayload: failure.requestPayload,
      responsePayload: {},
    });
    return failure;
  }

  let transport = await sendWithToken(safeString(tokenState.access_token) || "", endpoint, payload);
  if (needsTokenRetry(transport.httpStatus, transport.responsePayload)) {
    tokenState = await refreshZaloOaToken(admin, { appId, forceRefresh: true });
    refreshedDuringSend = true;
    retryCount = 1;
    if (safeString(tokenState.access_token)) {
      transport = await sendWithToken(safeString(tokenState.access_token) || "", endpoint, payload);
    }
  }

  const providerErrorCode = Number(transport.responsePayload.error ?? -1);
  const accepted = transport.httpStatus !== null && transport.httpStatus >= 200 && transport.httpStatus < 300 &&
    providerErrorCode === 0;
  const providerError = accepted
    ? null
    : safeString(transport.responsePayload.message) || "Zalo template send failed";
  const result: ZaloSendResult = {
    accepted,
    reason: accepted ? "sent" : deriveSendFailureReason(transport.responsePayload, transport.httpStatus),
    providerStatus: accepted ? "accepted" : "failed",
    providerError,
    providerMsgId: extractProviderMessageId(transport.responsePayload),
    trackingId: safeString(payload.tracking_id),
    requestPayload: sanitizePayload(payload),
    responsePayload: transport.responsePayload,
    httpStatus: transport.httpStatus,
    providerErrorCode,
    refreshedDuringSend,
  };

  await logDelivery(admin, {
    appId,
    channel: "template",
    endpoint,
    target: safeString(payload.phone) || "",
    templateId: safeString(payload.template_id),
    trackingId: safeString(payload.tracking_id),
    status: result.reason,
    httpStatus: result.httpStatus,
    providerErrorCode: result.providerErrorCode,
    providerMessage: result.providerError,
    retryCount,
    refreshedDuringSend,
    requestPayload: result.requestPayload,
    responsePayload: result.responsePayload,
  });

  return result;
}

export async function sendZaloCsMessage(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: AnyRecord,
): Promise<ZaloSendResult> {
  const appId = getZaloOaAppId();
  const endpoint = "https://openapi.zalo.me/v3.0/oa/message/cs";
  let tokenState = await refreshZaloOaToken(admin, { appId });
  let refreshedDuringSend = false;
  let retryCount = 0;

  if (!safeString(tokenState.access_token)) {
    const failure: ZaloSendResult = {
      accepted: false,
      reason: tokenState.last_refresh_status === "bootstrap_required"
        ? "bootstrap_required"
        : "zalo_token_invalid",
      providerStatus: "failed",
      providerError: safeString(tokenState.last_error) || "Missing usable Zalo access token",
      providerMsgId: null,
      trackingId: safeString(payload.tracking_id || payload.client_msg_id),
      requestPayload: sanitizePayload(payload),
      responsePayload: {},
      httpStatus: null,
      providerErrorCode: null,
      refreshedDuringSend,
    };
    await logDelivery(admin, {
      appId,
      channel: "oa_cs",
      endpoint,
      target: safeString(payload.recipient?.user_id || payload.user_id || payload.target) || "",
      trackingId: failure.trackingId,
      status: failure.reason,
      httpStatus: null,
      providerErrorCode: null,
      providerMessage: failure.providerError,
      retryCount,
      refreshedDuringSend,
      requestPayload: failure.requestPayload,
      responsePayload: {},
    });
    return failure;
  }

  let transport = await sendWithToken(safeString(tokenState.access_token) || "", endpoint, payload);
  if (needsTokenRetry(transport.httpStatus, transport.responsePayload)) {
    tokenState = await refreshZaloOaToken(admin, { appId, forceRefresh: true });
    refreshedDuringSend = true;
    retryCount = 1;
    if (safeString(tokenState.access_token)) {
      transport = await sendWithToken(safeString(tokenState.access_token) || "", endpoint, payload);
    }
  }

  const providerErrorCode = Number(transport.responsePayload.error ?? -1);
  const accepted = transport.httpStatus !== null && transport.httpStatus >= 200 && transport.httpStatus < 300 &&
    providerErrorCode === 0;
  const providerError = accepted
    ? null
    : safeString(transport.responsePayload.message) || "Zalo cs send failed";
  const result: ZaloSendResult = {
    accepted,
    reason: accepted ? "sent" : deriveSendFailureReason(transport.responsePayload, transport.httpStatus),
    providerStatus: accepted ? "accepted" : "failed",
    providerError,
    providerMsgId: extractProviderMessageId(transport.responsePayload),
    trackingId: safeString(payload.tracking_id || payload.client_msg_id),
    requestPayload: sanitizePayload(payload),
    responsePayload: transport.responsePayload,
    httpStatus: transport.httpStatus,
    providerErrorCode,
    refreshedDuringSend,
  };

  await logDelivery(admin, {
    appId,
    channel: "oa_cs",
    endpoint,
    target: safeString(payload.recipient?.user_id || payload.user_id || payload.target) || "",
    trackingId: result.trackingId,
    status: result.reason,
    httpStatus: result.httpStatus,
    providerErrorCode: result.providerErrorCode,
    providerMessage: result.providerError,
    retryCount,
    refreshedDuringSend,
    requestPayload: result.requestPayload,
    responsePayload: result.responsePayload,
  });

  return result;
}
