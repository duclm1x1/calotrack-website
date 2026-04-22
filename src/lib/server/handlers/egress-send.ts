import { createServiceRoleClient, readBody, sendJson } from "../adminServer.js";
import { validateOutboundEnvelope } from "../egress/common.js";
import { sendTelegramOutboundEnvelope } from "../egress/telegram.js";
import { sendZaloOutboundEnvelope } from "../egress/zalo.js";
import { getZaloOaInternalKey } from "../zaloOaServer.js";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readInternalKey(req: any) {
  return (
    safeString(req.headers?.["x-calotrack-internal-key"]) ||
    safeString(req.headers?.["x-calotrack-internal-secret"]) ||
    (() => {
      const authHeader = safeString(req.headers?.authorization);
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      return safeString(match?.[1]);
    })()
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const internalKey = getZaloOaInternalKey();
  if (!internalKey || readInternalKey(req) !== internalKey) {
    sendJson(res, 401, { ok: false, error: "internal_access_denied" });
    return;
  }

  try {
    const body = await readBody(req);
    const envelope = validateOutboundEnvelope(body);
    if (envelope.channel === "zalo") {
      const result = await sendZaloOutboundEnvelope(createServiceRoleClient(), envelope);
      sendJson(res, 200, { ok: true, channel: "zalo", result });
      return;
    }
    if (envelope.channel === "telegram") {
      const result = await sendTelegramOutboundEnvelope(envelope);
      sendJson(res, 200, { ok: true, channel: "telegram", result });
      return;
    }

    sendJson(res, 501, {
      ok: false,
      error: "egress_channel_not_supported",
      channel: envelope.channel,
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: "egress_send_failed",
      message: error instanceof Error ? error.message : String(error || "unknown_egress_send_error"),
    });
  }
}
