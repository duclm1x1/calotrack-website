import {
  readBody,
  sendJson,
} from "../src/lib/server/adminServer.js";
import {
  requireZaloBrokerAccess,
  sendZaloCsMessage,
} from "../src/lib/server/zaloOaServer.js";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const { admin } = await requireZaloBrokerAccess(req);
    const body = await readBody(req);
    const payload = body.payload && typeof body.payload === "object" ? body.payload : body;
    const result = await sendZaloCsMessage(admin, payload);

    sendJson(res, 200, {
      ok: result.accepted,
      data: {
        accepted: result.accepted,
        reason: result.reason,
        provider_status: result.providerStatus,
        provider_error: result.providerError,
        provider_error_code: result.providerErrorCode,
        provider_msg_id: result.providerMsgId,
        tracking_id: result.trackingId,
        http_status: result.httpStatus,
        refreshed_during_send: result.refreshedDuringSend,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_cs_broker_failed");
    sendJson(res, message === "admin_required" || message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
