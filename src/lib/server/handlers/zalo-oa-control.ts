import {
  readBody,
  sendJson,
} from "../src/lib/server/adminServer.js";
import {
  bootstrapZaloOaToken,
  getZaloOaHealth,
  refreshZaloOaToken,
  requireZaloBrokerAccess,
  updateZaloOaBrowserbaseState,
} from "../src/lib/server/zaloOaServer.js";

function getMode(req: any) {
  const url = new URL(req.url || "/", "https://calotrack.local");
  return String(url.searchParams.get("mode") || "").trim().toLowerCase();
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const mode = getMode(req);
  if (!mode) {
    sendJson(res, 400, { ok: false, error: "invalid_zalo_oa_control_mode" });
    return;
  }

  try {
    const { admin, accessKind } = await requireZaloBrokerAccess(req);

    if (mode === "health") {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      const health = await getZaloOaHealth(admin);
      sendJson(res, 200, {
        ok: true,
        data: {
          ...health,
          accessKind,
        },
      });
      return;
    }

    if (mode === "browserbase-state") {
      if (req.method === "GET") {
        const health = await getZaloOaHealth(admin);
        sendJson(res, 200, {
          ok: true,
          data: {
            ...health,
            accessKind,
          },
        });
        return;
      }

      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      const body = await readBody(req);
      const state = await updateZaloOaBrowserbaseState(admin, {
        appId: String(body.app_id || body.appId || "").trim() || null,
        browserbaseContextId: body.browserbase_context_id ?? body.browserbaseContextId,
        lastBrowserbaseSessionId: body.last_browserbase_session_id ?? body.lastBrowserbaseSessionId,
        lastReauthAt: body.last_reauth_at ?? body.lastReauthAt,
        lastReauthStatus: body.last_reauth_status ?? body.lastReauthStatus,
        lastReauthError: body.last_reauth_error ?? body.lastReauthError,
      });
      const health = await getZaloOaHealth(admin, state.app_id);

      sendJson(res, 200, {
        ok: true,
        data: {
          ...health,
          accessKind,
        },
      });
      return;
    }

    if (mode === "bootstrap") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      const body = await readBody(req);
      const accessToken = String(body.access_token || body.accessToken || "").trim();
      const refreshToken = String(body.refresh_token || body.refreshToken || "").trim();
      const expiresAt = String(body.expires_at || body.expiresAt || "").trim();
      const expiresIn = Number(body.expires_in ?? body.expiresIn ?? 0) || 0;
      const tokenType = String(body.token_type || body.tokenType || "bearer").trim();
      const appId = String(body.app_id || body.appId || "").trim();
      const browserbaseContextId = body.browserbase_context_id ?? body.browserbaseContextId;
      const lastBrowserbaseSessionId = body.last_browserbase_session_id ?? body.lastBrowserbaseSessionId;
      const lastReauthStatus = body.last_reauth_status ?? body.lastReauthStatus;
      const lastReauthError = body.last_reauth_error ?? body.lastReauthError;
      const lastReauthAt = body.last_reauth_at ?? body.lastReauthAt;

      if (!accessToken || !refreshToken) {
        sendJson(res, 400, {
          ok: false,
          error: "invalid_bootstrap_payload",
          message: "access_token and refresh_token are required",
        });
        return;
      }

      let state = await bootstrapZaloOaToken(admin, {
        appId: appId || null,
        accessToken,
        refreshToken,
        expiresAt: expiresAt || null,
        expiresIn,
        tokenType,
      });

      const shouldUpdateBrowserbaseState =
        browserbaseContextId !== undefined ||
        lastBrowserbaseSessionId !== undefined ||
        lastReauthStatus !== undefined ||
        lastReauthError !== undefined ||
        lastReauthAt !== undefined;

      if (shouldUpdateBrowserbaseState) {
        state = await updateZaloOaBrowserbaseState(admin, {
          appId: state.app_id,
          browserbaseContextId,
          lastBrowserbaseSessionId,
          lastReauthAt,
          lastReauthStatus: lastReauthStatus ?? "bootstrap_completed",
          lastReauthError,
        });
      }

      sendJson(res, 200, {
        ok: true,
        data: {
          accessKind,
          app_id: state.app_id,
          token_status: state.token_status,
          expires_at: state.expires_at,
          last_refresh_status: state.last_refresh_status,
          browserbase_context_id: state.browserbase_context_id || null,
          last_browserbase_session_id: state.last_browserbase_session_id || null,
          last_reauth_at: state.last_reauth_at || null,
          last_reauth_status: state.last_reauth_status || null,
          last_reauth_error: state.last_reauth_error || null,
        },
      });
      return;
    }

    if (mode === "force-refresh") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      const state = await refreshZaloOaToken(admin, { forceRefresh: true });
      const health = await getZaloOaHealth(admin, state.app_id);

      sendJson(res, 200, {
        ok: true,
        data: {
          accessKind,
          app_id: state.app_id,
          token_status: health.tokenStatus,
          expires_at: health.expiresAt,
          last_refresh_at: health.lastRefreshAt,
          last_refresh_status: health.lastRefreshStatus,
          last_error: health.lastError,
        },
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "unknown_zalo_oa_control_mode" });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_oa_control_failed");
    sendJson(res, message === "admin_required" || message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
