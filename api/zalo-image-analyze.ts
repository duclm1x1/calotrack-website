import { sendJson } from "../src/lib/server/adminServer.js";
import {
  analyzeZaloImage,
  requireInternalZaloRequest,
} from "../src/lib/server/zaloRecoveryServer.js";

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
    const body = await requireInternalZaloRequest(req);
    const result = await analyzeZaloImage(req, body);
    sendJson(res, 200, result);
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_image_analyze_failed");
    sendJson(res, message === "internal_access_denied" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
