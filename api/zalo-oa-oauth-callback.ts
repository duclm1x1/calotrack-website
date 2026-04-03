import { createServiceRoleClient } from "../src/lib/server/adminServer.js";
import {
  bootstrapZaloOaToken,
  consumeZaloOaOAuthSession,
  exchangeZaloOaAuthorizationCode,
  getSiteBaseUrl,
  getZaloOaOAuthSession,
  updateZaloOaBrowserbaseState,
} from "../src/lib/server/zaloOaServer.js";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRedirectAfter(candidate: string | null, req: any) {
  if (!candidate) return null;
  const siteBaseUrl = getSiteBaseUrl(req);
  const siteOrigin = new URL(siteBaseUrl).origin;

  try {
    if (candidate.startsWith("/")) {
      return new URL(candidate, `${siteBaseUrl}/`).toString();
    }

    const parsed = new URL(candidate);
    return parsed.origin === siteOrigin ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function appendStatus(target: string, status: "success" | "error", message?: string | null) {
  const url = new URL(target);
  url.searchParams.set("zalo_oauth", status);
  if (message) {
    url.searchParams.set("zalo_oauth_message", message);
  }
  return url.toString();
}

function sendRedirect(res: any, target: string) {
  res.statusCode = 302;
  res.setHeader("cache-control", "no-store");
  res.setHeader("location", target);
  res.end();
}

function sendStatusPage(
  res: any,
  payload: { ok: boolean; title: string; message: string; redirectAfter?: string | null },
) {
  const tone = payload.ok ? "#047857" : "#b91c1c";
  const badge = payload.ok ? "OAuth callback succeeded" : "OAuth callback failed";
  const action = payload.redirectAfter
    ? `<p style="margin-top:24px"><a href="${escapeHtml(payload.redirectAfter)}" style="color:${tone};font-weight:600">Continue</a></p>`
    : "";

  res.statusCode = payload.ok ? 200 : 400;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>${escapeHtml(payload.title)}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: Inter, Segoe UI, system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
      .wrap { max-width: 680px; margin: 64px auto; padding: 32px; background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08); }
      .badge { display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background: rgba(4,120,87,0.08); color: ${tone}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      h1 { margin: 0 0 12px; font-size: 32px; letter-spacing: -0.03em; }
      p { margin: 0; line-height: 1.7; color: #475569; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="badge">${badge}</div>
      <h1>${escapeHtml(payload.title)}</h1>
      <p>${escapeHtml(payload.message)}</p>
      ${action}
    </main>
  </body>
</html>`);
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    return;
  }

  const url = new URL(req.url || "/", "https://calotrack.local");
  const state = String(url.searchParams.get("state") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();
  const oaId = String(url.searchParams.get("oa_id") || "").trim();
  const oauthError = String(url.searchParams.get("error") || url.searchParams.get("error_code") || "").trim();
  const oauthErrorDescription = String(
    url.searchParams.get("error_description") || url.searchParams.get("error_reason") || "",
  ).trim();

  let redirectAfter = normalizeRedirectAfter(url.searchParams.get("redirect_after"), req);

  try {
    if (!state) {
      sendStatusPage(res, {
        ok: false,
        title: "Missing OAuth state",
        message: "The Zalo callback did not include a valid state value.",
      });
      return;
    }

    const admin = createServiceRoleClient();
    const session = await getZaloOaOAuthSession(admin, state);
    redirectAfter = redirectAfter || normalizeRedirectAfter(session.redirect_after || null, req);

    if (!session.exists) {
      const target = redirectAfter ? appendStatus(redirectAfter, "error", "session_missing") : null;
      if (target) {
        sendRedirect(res, target);
        return;
      }
      sendStatusPage(res, {
        ok: false,
        title: "OAuth session not found",
        message: "The authorization request no longer exists or has already been cleared.",
      });
      return;
    }

    if (session.consumed_at) {
      const target = redirectAfter ? appendStatus(redirectAfter, "error", "session_already_consumed") : null;
      if (target) {
        sendRedirect(res, target);
        return;
      }
      sendStatusPage(res, {
        ok: false,
        title: "OAuth session already used",
        message: "This authorization code has already been consumed.",
      });
      return;
    }

    if (!session.expires_at || Date.parse(session.expires_at) <= Date.now()) {
      const target = redirectAfter ? appendStatus(redirectAfter, "error", "session_expired") : null;
      if (target) {
        sendRedirect(res, target);
        return;
      }
      sendStatusPage(res, {
        ok: false,
        title: "OAuth session expired",
        message: "The authorization window expired before the callback was completed.",
      });
      return;
    }

    if (oauthError) {
      await updateZaloOaBrowserbaseState(admin, {
        appId: session.app_id || null,
        lastReauthStatus: "oauth_callback_error",
        lastReauthError: oauthErrorDescription || oauthError,
      });
      const target = redirectAfter ? appendStatus(redirectAfter, "error", oauthErrorDescription || oauthError) : null;
      if (target) {
        sendRedirect(res, target);
        return;
      }
      sendStatusPage(res, {
        ok: false,
        title: "Zalo authorization denied",
        message: oauthErrorDescription || oauthError,
      });
      return;
    }

    if (!code || !session.code_verifier) {
      const target = redirectAfter ? appendStatus(redirectAfter, "error", "missing_authorization_code") : null;
      if (target) {
        sendRedirect(res, target);
        return;
      }
      sendStatusPage(res, {
        ok: false,
        title: "Missing authorization code",
        message: "The callback did not include a valid authorization code.",
      });
      return;
    }

    const exchanged = await exchangeZaloOaAuthorizationCode({
      appId: session.app_id || null,
      code,
      codeVerifier: session.code_verifier,
    });

    await bootstrapZaloOaToken(admin, {
      appId: exchanged.appId,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresIn: exchanged.expiresIn,
      tokenType: exchanged.tokenType,
    });

    await updateZaloOaBrowserbaseState(admin, {
      appId: exchanged.appId,
      lastReauthStatus: "oauth_callback_ok",
      lastReauthError: "",
    });

    await consumeZaloOaOAuthSession(admin, {
      state,
      oaId: oaId || null,
    });

    const target = redirectAfter ? appendStatus(redirectAfter, "success", "oauth_callback_ok") : null;
    if (target) {
      sendRedirect(res, target);
      return;
    }

    sendStatusPage(res, {
      ok: true,
      title: "Zalo OA reauthorized",
      message: "The broker received a fresh token bundle and is ready to resume automatic rotation.",
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_oa_oauth_callback_failed");
    const target = redirectAfter ? appendStatus(redirectAfter, "error", message) : null;
    if (target) {
      sendRedirect(res, target);
      return;
    }
    sendStatusPage(res, {
      ok: false,
      title: "Zalo OA reauthorization failed",
      message,
    });
  }
}
