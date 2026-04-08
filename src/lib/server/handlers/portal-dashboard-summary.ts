import { sendJson } from "../src/lib/server/adminServer.js";
import {
  getDashboardSummary,
  readJsonBody,
  resolveDashboardAccess,
  type DashboardPeriod,
} from "../src/lib/server/dashboardSummaryServer.js";

function getPeriod(req: any, body: Record<string, unknown>): DashboardPeriod {
  const fromQuery = String(req.query?.period || "").trim().toLowerCase();
  const fromBody = String(body.period || "").trim().toLowerCase();
  const value = fromQuery || fromBody;
  return value === "day" || value === "month" ? (value as DashboardPeriod) : "week";
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const access = await resolveDashboardAccess(req, body);
    const summary = await getDashboardSummary(access.admin, access.context, getPeriod(req, body));

    sendJson(res, 200, {
      ok: true,
      data: {
        accessKind: access.accessKind,
        ...summary,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_dashboard_summary_failed");
    sendJson(
      res,
      message === "auth_required" || message === "customer_not_linked" ? 401 : 500,
      {
        ok: false,
        error: message,
        message,
      },
    );
  }
}
