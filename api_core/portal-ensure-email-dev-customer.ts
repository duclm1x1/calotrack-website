import {
  ensureEmailDevCustomerForAuthUser,
  requireAuthenticatedUser,
  sendJson,
  safeString,
} from "../src/lib/server/adminServer.js";

function hasActiveTrialWindow(value: string | null): boolean {
  const iso = safeString(value);
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp > Date.now() : false;
}

function deriveEffectiveAccessState(customer: Record<string, unknown>): string {
  const raw = safeString(customer.access_state) || "pending_verification";
  const entitlementSource = safeString(customer.entitlement_source);
  if (raw === "blocked" || raw === "active_paid") {
    return raw;
  }
  if (entitlementSource === "email_dev_trial") {
    return hasActiveTrialWindow(safeString(customer.trial_ends_at)) ? "trialing" : "free_limited";
  }
  return raw;
}

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
    const { admin, authUser } = await requireAuthenticatedUser(req);
    const ensured = await ensureEmailDevCustomerForAuthUser(admin, authUser);

    sendJson(res, 200, {
      ok: true,
      data: {
        customer_id: ensured.customer.id,
        access_state: deriveEffectiveAccessState(ensured.customer),
        trial_started_at: safeString(ensured.customer.trial_started_at),
        trial_ends_at: safeString(ensured.customer.trial_ends_at),
        web_channel_id: ensured.webChannel.id,
        compat_user_id: ensured.compatUser.id,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_email_dev_customer_failed");
    sendJson(res, message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
