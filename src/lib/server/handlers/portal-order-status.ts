import {
  createServiceRoleClient,
  readBody,
  safeString,
  sendJson,
} from "../adminServer.js";

function resolveOrderId(req: any, body: Record<string, unknown>) {
  return (
    safeString(req.query?.order_id) ||
    safeString(req.query?.orderId) ||
    safeString(body.order_id) ||
    safeString(body.orderId) ||
    safeString(body.id)
  );
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const orderId = resolveOrderId(req, body);
    if (!orderId) {
      sendJson(res, 400, { ok: false, error: "order_id_required" });
      return;
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("portal_get_order_status", {
      p_order_id: orderId,
    });

    if (error) {
      throw error;
    }

    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    sendJson(res, 200, {
      ok: true,
      data: {
        orderId: String(row.order_id ?? orderId),
        orderCode: safeString(row.order_code),
        status: String(row.status ?? "pending_confirmation"),
        entitlementActive: row.entitlement_active === true,
        premiumUntil: safeString(row.premium_until),
        provider: safeString(row.provider),
        amount: row.amount == null ? null : Number(row.amount),
        phoneE164: safeString(row.phone_e164),
        telegramLinkToken: safeString(row.telegram_link_token),
        telegramLinkUrl: safeString(row.telegram_link_url),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      },
    });
  } catch (error: any) {
    sendJson(res, 500, {
      ok: false,
      error: safeString(error?.message) || "portal_order_status_failed",
    });
  }
}
