import * as crypto from "node:crypto";

import {
  createServiceRoleClient,
} from "../src/lib/server/adminServer.js";
import {
  getZaloOaInternalKey,
  sendZaloCsMessage,
} from "../src/lib/server/zaloOaServer.js";

const DEFAULT_UPSTREAM = "https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2-internal";
const DEFAULT_APP_ID = "1450975846052622442";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeSignature(value: unknown) {
  const rawValue = safeString(value).trim();
  if (!rawValue) {
    return "";
  }
  const macMatch = rawValue.match(/(?:^|,|\s)mac=([a-fA-F0-9]{64})$/i);
  if (macMatch) {
    return macMatch[1].toLowerCase();
  }
  return rawValue.toLowerCase();
}

function buildTraceId(rawBody: string, body: any) {
  const senderId = safeString(body?.sender?.id || body?.user_id_by_app || "unknown");
  const messageId = safeString(body?.message?.msg_id || body?.msg_id || Date.now());
  const digest = crypto.createHash("sha1").update(rawBody).digest("hex").slice(0, 8);
  return `ct-zalo-adapter-${senderId}-${messageId}-${digest}`;
}

async function readRawBody(req: any) {
  if (typeof req.body === "string") {
    return req.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function buildTextPayload(userId: string, text: string) {
  return {
    recipient: {
      user_id: userId,
    },
    message: {
      text: String(text || "").trim().slice(0, 1900),
    },
  };
}

function getIncomingText(body: any) {
  return safeString(body?.message?.text) || "";
}

function getSenderId(body: any) {
  return safeString(body?.sender?.id) ||
    safeString(body?.user_id_by_app) ||
    safeString(body?.message?.from?.id) ||
    "";
}

function normalizeCommandText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (char) => (char === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9/%\.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGreetingTextClean() {
  return [
    "Hey. Mình đang online đây.",
    "Bạn có thể gửi món vừa ăn, gửi ảnh bữa ăn hoặc hỏi thẳng về calories, protein, tập luyện và recovery.",
    "",
    "1. Ghi món ăn mới",
    "2. Xem chi tiết thống kê",
    "3. Cập nhật cân nặng",
    "4. Xem tiến độ tuần",
    "5. Nhận lời khuyên",
    "",
    "Mẹo nhanh: dùng /daily, /weekly hoặc /help.",
  ].join("\n");
}

function buildHelpTextClean(isLinked: boolean) {
  return [
    "[Help] Lệnh nhanh CaloTrack trên Zalo",
    "",
    "Theo dõi nhanh",
    "- /stats - dashboard hôm nay",
    "- /daily - dashboard ngày hợp nhất",
    "- /homnay - xem riêng ngày hiện tại",
    "- /tuannay - xem 7 ngày gần nhất",
    "- /thangnay - xem từ đầu tháng",
    "- /history - menu điều hướng lịch sử",
    "",
    "Ghi món / xóa món",
    "- /log <nội dung> - ép ghi món, ví dụ: /log bữa sáng: 2 trứng luộc",
    "- /ghi <nội dung> - alias của /log",
    "- /clear - liệt kê món hôm nay để xóa",
    "- /xoa 2 | /xoa 1,3 | /xoa het",
    "- Gửi ảnh món ăn rồi trả lời có để lưu review",
    "",
    "Hồ sơ",
    "- /onboarding - xem hồ sơ hiện tại",
    "- /onboarding reset - mở lại flow hồ sơ",
    "- /mode giammo | /mode giucan | /mode tangco",
    "- /can 72.4 - cập nhật cân nặng",
    "",
    "Gym mode",
    "- /gym - xem trạng thái gym mode",
    "- /gym on - bật specialist mode 3 giờ",
    "- /gym status - xem thời gian còn lại",
    "- /gym plan 45 - nhận buổi tập gợi ý",
    "- /gym finish | /gym off - tắt mode ngay",
    ...(isLinked
      ? []
      : [
          "",
          "Nếu chưa liên kết portal, mở: https://calotrack-website.vercel.app/login",
          "Xác thực xong rồi quay lại chat là dùng tiếp được.",
        ]),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    "1️⃣ Ghi món ăn mới",
    "2️⃣ Xem chi tiết thống kê",
    "3️⃣ Cập nhật cân nặng",
    "4️⃣ Xem tiến độ tuần",
    "5️⃣ Nhận lời khuyên",
    "━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

function buildQuickActionTextClean() {
  return [
    "[QuickAction]",
    "- /stats hoặc /daily",
    "- /tuannay hoặc /thangnay",
    "- /ghi bữa tối: cá hồi 200g",
    "- /xoa 2 hoặc /xoa het",
    "- /can 72.4",
    "- /gym on → /gym plan",
    "- Gửi ảnh rồi trả lời có để lưu",
    "- /help để xem toàn bộ command",
  ].join("\n");
}

function buildUnavailableTextClean() {
  return "Mình đang gặp lỗi tạm thời ở luồng chat. Bạn thử lại sau ít phút hoặc dùng /daily và /weekly giúp mình nhé.";
}

async function sendGatewayReply(admin: ReturnType<typeof createServiceRoleClient>, userId: string, text: string) {
  if (!userId || !text.trim()) return null;
  return sendZaloCsMessage(admin, buildTextPayload(userId, text));
}

async function tryHandleGatewayHotfix(parsedBody: any) {
  const admin = createServiceRoleClient();
  const senderId = getSenderId(parsedBody);
  if (!senderId) return { handled: false };

  const messageText = getIncomingText(parsedBody).trim();
  const normalized = normalizeCommandText(messageText);
  const isText = Boolean(messageText);

  if (isText && /^(hi|hello|hey|xin chao|chao)$/.test(normalized)) {
    await sendGatewayReply(admin, senderId, buildGreetingTextClean());
    return { handled: true, mode: "greeting" };
  }

  if (isText && /^(\/)?(help|menu)$/.test(normalized)) {
    await sendGatewayReply(admin, senderId, buildHelpTextClean(true));
    return { handled: true, mode: "help" };
  }

  if (isText && /^(\/)?quickaction$/.test(normalized)) {
    await sendGatewayReply(admin, senderId, buildQuickActionTextClean());
    return { handled: true, mode: "quickaction" };
  }

  return {
    handled: false,
    senderId,
  };
}

export default async function handler(req: any, res: any) {
  const upstream = process.env.ZALO_OA_N8N_INTERNAL_WEBHOOK_URL || DEFAULT_UPSTREAM;
  const appId = process.env.ZALO_APP_ID || DEFAULT_APP_ID;
  const secretKey = process.env.ZALO_OA_SECRET_KEY || "";
  const internalSecret = getZaloOaInternalKey() || "";

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "calotrack-zalo-oa-webhook-proxy",
      upstream,
      internalReady: Boolean(internalSecret),
      signatureReady: Boolean(appId && secretKey),
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsedBody = {};
    }

    const timestamp = safeString((parsedBody as any)?.timestamp || (parsedBody as any)?.ts || "");
    const providedSignature = normalizeSignature(req.headers["x-zevent-signature"]);
    const expectedSignature = appId && secretKey && rawBody && timestamp
      ? crypto.createHash("sha256").update(`${appId}${rawBody}${timestamp}${secretKey}`).digest("hex").toLowerCase()
      : "";
    const signatureValid = Boolean(providedSignature && expectedSignature && providedSignature === expectedSignature);

    if (!secretKey || !internalSecret) {
      sendJson(res, 500, {
        ok: false,
        error: "missing_adapter_config",
        signatureReady: Boolean(secretKey),
        internalSecretReady: Boolean(internalSecret),
      });
      return;
    }

    if (!signatureValid) {
      sendJson(res, 401, {
        ok: false,
        error: "invalid_signature",
      });
      return;
    }

    const traceId = buildTraceId(rawBody, parsedBody);
    const forwardHeaders: Record<string, string> = {};

    const gatewayHandled = await tryHandleGatewayHotfix(parsedBody).catch(async (error) => {
      const senderId = getSenderId(parsedBody);
      if (senderId) {
        try {
          await sendGatewayReply(createServiceRoleClient(), senderId, buildUnavailableTextClean());
        } catch {
          // Ignore fallback send failures here and continue to upstream.
        }
      }
      return {
        handled: false,
        gatewayError: error instanceof Error ? error.message : String(error || "gateway_hotfix_failed"),
      };
    });

    if (gatewayHandled?.handled) {
      sendJson(res, 200, {
        ok: true,
        handledBy: "gateway",
        mode: (gatewayHandled as any).mode || "unknown",
        traceId,
      });
      return;
    }

    if (req.headers["content-type"]) {
      forwardHeaders["content-type"] = String(req.headers["content-type"]);
    }
    if (req.headers["x-zevent-signature"]) {
      forwardHeaders["x-zevent-signature"] = String(req.headers["x-zevent-signature"]);
    }
    if (req.headers["user-agent"]) {
      forwardHeaders["user-agent"] = String(req.headers["user-agent"]);
    }
    if (req.headers["x-request-id"]) {
      forwardHeaders["x-request-id"] = String(req.headers["x-request-id"]);
    }
    forwardHeaders["x-calotrack-internal-secret"] = internalSecret;
    forwardHeaders["x-calotrack-verified"] = "true";
    forwardHeaders["x-calotrack-trace-id"] = traceId;

    const upstreamResponse = await fetch(upstream, {
      method: "POST",
      headers: forwardHeaders,
      body: rawBody,
    });

    const upstreamText = await upstreamResponse.text();
    if (upstreamResponse.ok) {
      res.statusCode = upstreamResponse.status;
      res.setHeader(
        "content-type",
        upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      );
      res.setHeader("cache-control", "no-store");
      res.end(upstreamText);
      return;
    }

    const senderId = getSenderId(parsedBody);
    if (senderId) {
      try {
        await sendGatewayReply(createServiceRoleClient(), senderId, buildUnavailableTextClean());
      } catch {
        // Ignore direct-send fallback failures; still acknowledge the webhook below.
      }
    }

    sendJson(res, 200, {
      ok: true,
      handledBy: "gateway_fallback",
      traceId,
      upstreamStatus: upstreamResponse.status,
    });
  } catch (error) {
    const senderId = getSenderId((req as any)?.body);
    if (senderId) {
      try {
        await sendGatewayReply(createServiceRoleClient(), senderId, buildUnavailableTextClean());
      } catch {
        // Best effort only.
      }
    }
    sendJson(res, 502, {
      ok: false,
      error: "upstream_unreachable",
      message: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
}

