import {
  readBody,
  requireAdminAccess,
  safeString,
  sendJson,
} from "../adminServer.js";

function toPaymentRow(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    user_id: Number(row.user_id ?? 0),
    user_name: safeString(row.user_name),
    channel: safeString(row.channel),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    customer_phone: safeString(row.customer_phone),
    amount: Number(row.amount ?? 0),
    payment_method: String(row.payment_method ?? "admin"),
    status: String(row.status ?? "pending"),
    transaction_code: safeString(row.transaction_code),
    description: safeString(row.description),
    days_added: Number(row.days_added ?? 0),
    plan_granted: safeString(row.plan_granted),
    billing_sku: safeString(row.billing_sku),
    provider_event_id: safeString(row.provider_event_id),
    entitlement_result: safeString(row.entitlement_result),
    created_at: String(row.created_at ?? new Date().toISOString()),
    completed_at: safeString(row.completed_at),
  };
}

async function listPayments(admin: any) {
  const { data, error } = await admin.rpc("admin_list_payments");
  if (error) throw error;
  return Array.isArray(data) ? data.map((row) => toPaymentRow(row as Record<string, any>)) : [];
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const access = await requireAdminAccess(req);
    const { admin } = access;

    if (req.method === "GET") {
      const payments = await listPayments(admin);
      sendJson(res, 200, { ok: true, data: payments });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const action = safeString(body.action);

      if (action === "list") {
        const payments = await listPayments(admin);
        sendJson(res, 200, { ok: true, data: payments });
        return;
      }

      sendJson(res, 400, { ok: false, error: "unsupported_action" });
      return;
    }

    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (error: any) {
    const code = safeString(error?.message) || "admin_payments_failed";
    const status = code === "auth_required" ? 401 : code === "admin_required" ? 403 : 500;
    sendJson(res, status, { ok: false, error: code });
  }
}
