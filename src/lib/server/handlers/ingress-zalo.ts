import { createServiceRoleClient, readBody, sendJson } from "../adminServer.js";
import { dispatchInboundEnvelope } from "../gateway/dispatch.js";
import { buildZaloInboundEnvelope } from "../ingress/zalo.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    const envelope = buildZaloInboundEnvelope(body, {
      requestId: String(req.headers?.["x-request-id"] || req.headers?.["x-calotrack-trace-id"] || ""),
    });
    const shouldDispatch = String(req.query?.dispatch || body.dispatch || "").toLowerCase() === "1" || body.dispatch === true;
    if (!shouldDispatch) {
      sendJson(res, 200, { ok: true, envelope });
      return;
    }

    const outbound = await dispatchInboundEnvelope(envelope, {
      admin: createServiceRoleClient(),
    });
    sendJson(res, 200, { ok: true, envelope, outbound });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: "ingress_zalo_failed",
      message: error instanceof Error ? error.message : String(error || "unknown_ingress_zalo_error"),
    });
  }
}
