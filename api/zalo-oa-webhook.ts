const DEFAULT_UPSTREAM = "https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2";

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
  const upstream = process.env.ZALO_OA_N8N_WEBHOOK_URL || DEFAULT_UPSTREAM;

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "calotrack-zalo-oa-webhook-proxy",
      upstream,
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
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
