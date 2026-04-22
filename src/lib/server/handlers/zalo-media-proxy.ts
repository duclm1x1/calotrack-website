import { sendJson } from "../adminServer.js";
import { verifySignedZaloMediaProxyParams } from "../zaloMediaProxy.js";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function getQueryValue(req: any, key: string) {
  const direct = req?.query?.[key];
  if (direct !== undefined) return safeString(direct);
  try {
    const parsed = new URL(req?.url || "", "https://calotrack.pro");
    return safeString(parsed.searchParams.get(key));
  } catch {
    return "";
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const sourceUrl = getQueryValue(req, "src");
  const expiresAt = getQueryValue(req, "exp");
  const signature = getQueryValue(req, "sig");
  if (!verifySignedZaloMediaProxyParams(sourceUrl, expiresAt, signature)) {
    sendJson(res, 403, { ok: false, error: "invalid_media_proxy_signature" });
    return;
  }

  try {
    const upstream = await fetch(sourceUrl, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: {
        "User-Agent": "CaloTrackMediaProxy/1.0 (+https://calotrack.pro)",
        Accept: "image/*,application/pdf;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      sendJson(res, 502, {
        ok: false,
        error: "media_proxy_upstream_failed",
        upstream_status: upstream.status,
      });
      return;
    }

    res.statusCode = 200;
    res.setHeader("cache-control", "private, max-age=300");
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/octet-stream");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      res.setHeader("content-length", contentLength);
    }
    const contentDisposition = upstream.headers.get("content-disposition");
    if (contentDisposition) {
      res.setHeader("content-disposition", contentDisposition);
    }

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: "media_proxy_fetch_failed",
      message: error instanceof Error ? error.message : String(error || "unknown_media_proxy_error"),
    });
  }
}
