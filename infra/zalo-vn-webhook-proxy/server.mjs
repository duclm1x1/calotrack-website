import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT || 3000);
const APP_ID = String(process.env.ZALO_APP_ID || "1450975846052622442");
const SECRET_KEY = String(process.env.ZALO_OA_SECRET_KEY || "");
const INTERNAL_SECRET = String(process.env.CALOTRACK_ZALO_INTERNAL_SECRET || "");
const UPSTREAM = String(
  process.env.ZALO_OA_N8N_INTERNAL_WEBHOOK_URL ||
  "https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2-internal",
);

function safeString(value) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeSignature(value) {
  const rawValue = safeString(value).trim();
  if (!rawValue) return "";
  const macMatch = rawValue.match(/(?:^|,|\s)mac=([a-fA-F0-9]{64})$/i);
  if (macMatch) return macMatch[1].toLowerCase();
  return rawValue.toLowerCase();
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function buildTraceId(rawBody, body) {
  const senderId = safeString(body?.sender?.id || body?.user_id_by_app || "unknown");
  const messageId = safeString(body?.message?.msg_id || body?.msg_id || Date.now());
  const digest = crypto.createHash("sha1").update(rawBody).digest("hex").slice(0, 8);
  return `ct-zalo-adapter-${senderId}-${messageId}-${digest}`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      service: "calotrack-zalo-vn-adapter",
      upstream: UPSTREAM,
      signatureReady: Boolean(APP_ID && SECRET_KEY),
      internalSecretReady: Boolean(INTERNAL_SECRET),
    });
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/zalo/oa/webhook")) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsedBody = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsedBody = {};
    }

    if (!SECRET_KEY || !INTERNAL_SECRET) {
      sendJson(res, 500, {
        ok: false,
        error: "missing_adapter_config",
      });
      return;
    }

    const timestamp = safeString(parsedBody?.timestamp || parsedBody?.ts || "");
    const providedSignature = normalizeSignature(req.headers["x-zevent-signature"]);
    const expectedSignature = APP_ID && SECRET_KEY && rawBody && timestamp
      ? crypto.createHash("sha256").update(`${APP_ID}${rawBody}${timestamp}${SECRET_KEY}`).digest("hex").toLowerCase()
      : "";

    if (!providedSignature || !expectedSignature || providedSignature !== expectedSignature) {
      sendJson(res, 401, { ok: false, error: "invalid_signature" });
      return;
    }

    const traceId = buildTraceId(rawBody, parsedBody);
    const upstreamResponse = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": String(req.headers["content-type"] || "application/json"),
        "x-zevent-signature": String(req.headers["x-zevent-signature"] || ""),
        "x-calotrack-internal-secret": INTERNAL_SECRET,
        "x-calotrack-verified": "true",
        "x-calotrack-trace-id": traceId,
      },
      body: rawBody,
    });

    const upstreamText = await upstreamResponse.text();
    res.statusCode = upstreamResponse.status;
    res.setHeader(
      "content-type",
      upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    );
    res.setHeader("cache-control", "no-store");
    res.end(upstreamText);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: "upstream_unreachable",
      message: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`CaloTrack Zalo adapter listening on :${PORT}`);
});
