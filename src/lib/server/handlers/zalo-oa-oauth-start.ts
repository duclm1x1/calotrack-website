import { createServiceRoleClient } from "../src/lib/server/adminServer.js";
import {
  createZaloOaOAuthSession,
  createZaloOaOauthStartPayload,
} from "../src/lib/server/zaloOaServer.js";

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

  try {
    const url = new URL(req.url || "/", "https://calotrack.local");
    const payload = createZaloOaOauthStartPayload(req, {
      appId: url.searchParams.get("app_id"),
      redirectAfter: url.searchParams.get("redirect_after"),
    });
    const admin = createServiceRoleClient();

    await createZaloOaOAuthSession(admin, {
      appId: payload.appId,
      state: payload.state,
      codeVerifier: payload.codeVerifier,
      redirectAfter: payload.redirectAfter,
      expiresAt: payload.expiresAt,
    });

    res.statusCode = 302;
    res.setHeader("cache-control", "no-store");
    res.setHeader("location", payload.authorizationUrl);
    res.end();
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_oa_oauth_start_failed");
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: message,
      message,
    }));
  }
}
