import {
  readBody,
  sendJson,
} from "../src/lib/server/adminServer.js";
import {
  requireZaloBrokerAccess,
  sendZaloTemplateMessage,
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
    const phone = String(body.phone || "").trim();
    const templateId = String(body.template_id || body.templateId || "").trim();
    const templateData = body.template_data && typeof body.template_data === "object"
      ? body.template_data
      : body.templateData && typeof body.templateData === "object"
        ? body.templateData
        : null;

    if (!phone || !templateId || !templateData) {
      sendJson(res, 400, {
        ok: false,
        error: "invalid_template_payload",
        message: "phone, template_id and template_data are required",
      });
      return;
    }

    const result = await sendZaloTemplateMessage(admin, {
      phone,
      template_id: templateId,
      template_data: templateData,
      tracking_id: String(body.tracking_id || body.trackingId || "").trim() || null,
    });

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
    const message = String((error as Error)?.message || error || "zalo_template_broker_failed");
    sendJson(res, message === "admin_required" || message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
