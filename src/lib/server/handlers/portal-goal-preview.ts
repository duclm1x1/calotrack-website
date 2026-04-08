import { sendJson } from "../src/lib/server/adminServer.js";
import {
  getGoalPreview,
  readJsonBody,
  resolveDashboardAccess,
} from "../src/lib/server/dashboardSummaryServer.js";

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
    const preview = await getGoalPreview(access.admin, access.context, body);

    sendJson(res, 200, {
      ok: true,
      data: {
        accessKind: access.accessKind,
        ...preview,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_goal_preview_failed");
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
