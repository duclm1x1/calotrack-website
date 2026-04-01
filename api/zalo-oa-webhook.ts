import crypto from "node:crypto";

const DEFAULT_UPSTREAM = "https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2-internal";
const DEFAULT_APP_ID = "1450975846052622442";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeSignature(value: unknown) {
  const rawValue = safeString(value).trim();
  if (!rawValue) {
    return "";
  }
  const macMatch = rawValue.match(/(?:^|,|\s)mac=([a-fA-F0-9]{64})$/i);
  if (macMatch) {
    return macMatch[1].toLowerCase();
  }
  return rawValue.toLowerCase();
}

function buildTraceId(rawBody: string, body: any) {
  const senderId = safeString(body?.sender?.id || body?.user_id_by_app || "unknown");
  const messageId = safeString(body?.message?.msg_id || body?.msg_id || Date.now());
  const digest = crypto.createHash("sha1").update(rawBody).digest("hex").slice(0, 8);
  return `ct-zalo-adapter-${senderId}-${messageId}-${digest}`;
}

async function readRawBody(req: any) {
  if (typeof req.body === "string") {
    return req.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  const upstream = process.env.ZALO_OA_N8N_INTERNAL_WEBHOOK_URL || DEFAULT_UPSTREAM;
  const appId = process.env.ZALO_APP_ID || DEFAULT_APP_ID;
  const secretKey = process.env.ZALO_OA_SECRET_KEY || "";
  const internalSecret = process.env.CALOTRACK_ZALO_INTERNAL_SECRET || "";

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "calotrack-zalo-oa-webhook-proxy",
      upstream,
      internalReady: Boolean(internalSecret),
      signatureReady: Boolean(appId && secretKey),
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsedBody = {};
    }

    const timestamp = safeString((parsedBody as any)?.timestamp || (parsedBody as any)?.ts || "");
    const providedSignature = normalizeSignature(req.headers["x-zevent-signature"]);
    const expectedSignature = appId && secretKey && rawBody && timestamp
      ? crypto.createHash("sha256").update(`${appId}${rawBody}${timestamp}${secretKey}`).digest("hex").toLowerCase()
      : "";
    const signatureValid = Boolean(providedSignature && expectedSignature && providedSignature === expectedSignature);

    if (!secretKey || !internalSecret) {
      sendJson(res, 500, {
        ok: false,
        error: "missing_adapter_config",
        signatureReady: Boolean(secretKey),
        internalSecretReady: Boolean(internalSecret),
      });
      return;
    }

    if (!signatureValid) {
      sendJson(res, 401, {
        ok: false,
        error: "invalid_signature",
      });
      return;
    }

    const traceId = buildTraceId(rawBody, parsedBody);
    const forwardHeaders: Record<string, string> = {};

    if (req.headers["content-type"]) {
      forwardHeaders["content-type"] = String(req.headers["content-type"]);
    }
    if (req.headers["x-zevent-signature"]) {
      forwardHeaders["x-zevent-signature"] = String(req.headers["x-zevent-signature"]);
    }
    if (req.headers["user-agent"]) {
      forwardHeaders["user-agent"] = String(req.headers["user-agent"]);
    }
    if (req.headers["x-request-id"]) {
      forwardHeaders["x-request-id"] = String(req.headers["x-request-id"]);
    }
    forwardHeaders["x-calotrack-internal-secret"] = internalSecret;
    forwardHeaders["x-calotrack-verified"] = "true";
    forwardHeaders["x-calotrack-trace-id"] = traceId;

    const upstreamResponse = await fetch(upstream, {
      method: "POST",
      headers: forwardHeaders,
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
}
