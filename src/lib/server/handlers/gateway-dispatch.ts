import { createServiceRoleClient, readBody, sendJson } from "../adminServer.js";
import { dispatchInboundEnvelope } from "../gateway/dispatch.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    const envelope = await dispatchInboundEnvelope(body, {
      admin: createServiceRoleClient(),
    });
    sendJson(res, 200, {
      ok: true,
      envelope,
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: "gateway_dispatch_failed",
      message: error instanceof Error ? error.message : String(error || "unknown_gateway_dispatch_error"),
    });
  }
}
