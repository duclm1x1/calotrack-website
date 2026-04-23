import * as crypto from "node:crypto";

import {
  createServiceRoleClient,
} from "../adminServer.js";
import {
  getZaloOaInternalKey,
  sendZaloCsMessage,
} from "../zaloOaServer.js";
import {
  rewriteZaloBodyMediaUrls,
} from "../zaloMediaProxy.js";
import {
  buildLinkRequiredTextClean,
  handleDirectExerciseLog,
  handleDirectGoalMode,
  persistPendingIntent,
  resolveZaloGatewayAccess,
} from "../zaloGatewayChatServer.js";
import {
  getDashboardSummary,
} from "../dashboardSummaryServer.js";
import {
  consumeZaloCheckoutHandoff,
  parseCoreProfileInputText,
  redeemZaloClaimCode,
  upsertCoreProfileForContext,
} from "./portal.js";
import resolveChannelContextHandler from "./resolve-channel-context.js";
import { sendZaloBrokerPayload } from "./zalo-oa-send-cs.js";
import { logWaterForUser } from "./zalo-water.js";

const DEFAULT_UPSTREAM = "https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2-internal";
const DEFAULT_APP_ID = "1450975846052622442";
const CHANNEL_CONTEXT_INTERNAL_KEY_FALLBACK = "ctctx_b5d53fa9965845bc9f279d405715b454";
const INGRESS_FALLBACK_TTL_MS = 2 * 60 * 1000;
const LOOKUP_CONFIRM_TTL_MS = 10 * 60 * 1000;

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function cleanEnvString(value: unknown) {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

function toNullableInteger(value: unknown) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
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
  const senderId = safeString(body?.user_id_by_app || body?.sender?.id || "unknown");
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

function buildFastPreAckTrackingId(sourceMessageId: string, action = "workflow_pre_ack") {
  const token = safeString(sourceMessageId) || `${Date.now()}`;
  return `zalo:${action}:${token}`.slice(0, 120);
}

async function sendFastPreAckReply(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  text: string,
  params: {
    sourceMessageId: string;
    action?: string | null;
  },
) {
  if (!userId || !text.trim()) return null;
  const trackingId = buildFastPreAckTrackingId(
    params.sourceMessageId,
    safeString(params.action) || "workflow_pre_ack",
  );
  return sendZaloCsMessage(admin, {
    ...buildTextPayload(userId, text),
    tracking_id: trackingId,
    client_msg_id: trackingId,
  }, {
    skipDeliveryLog: true,
  });
}

function getInternalKeyCandidate(req: any) {
  return safeString(req.headers?.["x-calotrack-internal-key"]) ||
    safeString(req.headers?.["x-calotrack-internal-secret"]) ||
    (() => {
      const authHeader = safeString(req.headers?.authorization);
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      return safeString(match?.[1]);
    })();
}

function getIncomingText(body: any) {
  const directText = safeString(body?.message?.text) || safeString(body?.text);
  if (directText) return directText;

  const base64Candidates = [
    body?.message?.text_b64,
    body?.message_text_b64,
    body?.raw_text_b64,
  ];
  for (const candidate of base64Candidates) {
    const encoded = safeString(candidate).trim();
    if (!encoded) continue;
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf8").trim();
      if (decoded) return decoded;
    } catch {
      // Ignore malformed base64 text candidates.
    }
  }
  return "";
}

function getSenderId(body: any) {
  return safeString(body?.user_id_by_app) ||
    safeString(body?.sender?.id) ||
    safeString(body?.message?.from?.id) ||
    "";
}

function getSourceMessageId(body: any, traceId?: string) {
  return (
    safeString(body?.message?.msg_id) ||
    safeString(body?.msg_id) ||
    safeString(body?.message_id) ||
    safeString(traceId) ||
    `${Date.now()}`
  );
}

function isTerminalReceiptState(value: unknown) {
  return ["completed", "degraded", "blocked", "failed_with_trace"].includes(
    safeString(value).trim().toLowerCase(),
  );
}

async function upsertWebhookIngressReceipt(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    sourceMessageId: string;
    traceId: string;
    route?: string | null;
  },
) {
  if (!params.sourceMessageId) return null;
  try {
    const { data, error } = await admin.rpc("upsert_message_receipt", {
      p_channel: "zalo",
      p_source_message_id: params.sourceMessageId,
      p_user_id: null,
      p_trace_id: params.traceId,
      p_route: safeString(params.route) || "CHAT",
      p_action: "inbound_event",
    });
    if (error) return null;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function completeWebhookIngressReceipt(
  admin: ReturnType<typeof createServiceRoleClient>,
  receiptId: unknown,
  params: {
    actionStatus: string;
    errorCode?: string | null;
  },
) {
  const normalizedId = toNullableInteger(receiptId);
  if (!normalizedId) return;
  try {
    await admin.rpc("complete_message_receipt", {
      p_receipt_id: normalizedId,
      p_action_status: safeString(params.actionStatus) || "completed",
      p_error_code: safeString(params.errorCode) || null,
      p_broker_message_id: null,
      p_reply_count: 0,
    });
  } catch {
    // Keep ingress resilient even when receipt completion is unavailable.
  }
}

async function readPendingIntentConcurrencyState(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: unknown,
) {
  const normalizedUserId = toNullableInteger(userId);
  if (!normalizedUserId) return null;
  try {
    const { data, error } = await admin
      .from("users")
      .select("id,pending_intent,updated_at")
      .eq("id", normalizedUserId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: normalizedUserId,
      updatedAt: safeString((data as any)?.updated_at) || null,
      pendingIntent: parsePendingIntentStateLite((data as any)?.pending_intent),
    };
  } catch {
    return null;
  }
}

async function persistPendingIntentConcurrencyState(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: unknown;
    updatedAt?: string | null;
    pendingIntent: Record<string, unknown>;
  },
) {
  const normalizedUserId = toNullableInteger(params.userId);
  if (!normalizedUserId) return null;
  try {
    const nextUpdatedAt = new Date().toISOString();
    let query = admin
      .from("users")
      .update({
        pending_intent: JSON.stringify(params.pendingIntent || {}),
        updated_at: nextUpdatedAt,
      })
      .eq("id", normalizedUserId);

    if (safeString(params.updatedAt)) {
      query = query.eq("updated_at", safeString(params.updatedAt));
    }

    const { data, error } = await query
      .select("id,pending_intent,updated_at")
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: normalizedUserId,
      updatedAt: safeString((data as any)?.updated_at) || null,
      pendingIntent: parsePendingIntentStateLite((data as any)?.pending_intent),
    };
  } catch {
    return null;
  }
}

function buildPendingIngressClaim(sourceMessageId: string, traceId: string) {
  return {
    channel: "zalo",
    source_message_id: safeString(sourceMessageId) || null,
    trace_id: safeString(traceId) || null,
    claimed_at: new Date().toISOString(),
    action_status: "in_progress",
  };
}

function matchesPendingIngressClaim(pendingIntent: Record<string, unknown>, sourceMessageId: string) {
  const claim =
    pendingIntent?.last_ingress_claim && typeof pendingIntent.last_ingress_claim === "object"
      ? (pendingIntent.last_ingress_claim as Record<string, unknown>)
      : null;
  if (!claim) return null;
  const claimedAtMs = toTimestampMs(claim.claimed_at);
  if (!Number.isFinite(claimedAtMs) || Math.abs(Date.now() - Number(claimedAtMs)) > INGRESS_FALLBACK_TTL_MS) {
    return null;
  }
  if (safeString(claim.channel || "zalo") !== "zalo") return null;
  if (safeString(claim.source_message_id) !== safeString(sourceMessageId)) return null;
  return {
    trace_id: safeString(claim.trace_id) || null,
    action_status: "in_progress",
    dedupe_scope: "same_message_inflight_claim",
  };
}

function matchesPendingIngressTerminal(pendingIntent: Record<string, unknown>, sourceMessageId: string) {
  const terminal =
    pendingIntent?.last_ingress_terminal && typeof pendingIntent.last_ingress_terminal === "object"
      ? (pendingIntent.last_ingress_terminal as Record<string, unknown>)
      : null;
  if (!terminal) return null;
  const completedAtMs = toTimestampMs(terminal.completed_at ?? terminal.updated_at);
  const actionStatus = safeString(terminal.action_status || terminal.status);
  if (!Number.isFinite(completedAtMs) || Math.abs(Date.now() - Number(completedAtMs)) > INGRESS_FALLBACK_TTL_MS) {
    return null;
  }
  if (safeString(terminal.channel || "zalo") !== "zalo") return null;
  if (safeString(terminal.source_message_id) !== safeString(sourceMessageId)) return null;
  if (!isTerminalReceiptState(actionStatus)) return null;
  return {
    trace_id: safeString(terminal.trace_id) || null,
    action_status: actionStatus,
    dedupe_scope: "same_message_recent_terminal",
  };
}

async function acquirePendingIngressFallbackClaim(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: unknown,
  params: {
    sourceMessageId: string;
    traceId: string;
  },
) {
  const normalizedUserId = toNullableInteger(userId);
  if (!normalizedUserId || !safeString(params.sourceMessageId)) {
    return {
      claimed: false,
      deduped: false,
      reason: "claim_not_applicable",
      claim: null,
    };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readPendingIntentConcurrencyState(admin, normalizedUserId);
    const pendingIntent = clonePlainObject(current?.pendingIntent || {});
    const terminalMatch = matchesPendingIngressTerminal(pendingIntent, params.sourceMessageId);
    if (terminalMatch) {
      return {
        claimed: false,
        deduped: true,
        reason: "duplicate_ingress_terminal",
        claim: terminalMatch,
      };
    }
    const claimMatch = matchesPendingIngressClaim(pendingIntent, params.sourceMessageId);
    if (claimMatch) {
      return {
        claimed: false,
        deduped: true,
        reason: "duplicate_ingress_claim",
        claim: claimMatch,
      };
    }

    pendingIntent.last_ingress_claim = buildPendingIngressClaim(params.sourceMessageId, params.traceId);
    const persisted = await persistPendingIntentConcurrencyState(admin, {
      userId: normalizedUserId,
      updatedAt: current?.updatedAt || null,
      pendingIntent,
    });
    if (persisted) {
      return {
        claimed: true,
        deduped: false,
        reason: "claim_acquired",
        claim: persisted.pendingIntent?.last_ingress_claim || null,
      };
    }
  }

  const finalState = await readPendingIntentConcurrencyState(admin, normalizedUserId);
  const finalPendingIntent = clonePlainObject(finalState?.pendingIntent || {});
  return {
    claimed: false,
    deduped: true,
    reason: "duplicate_ingress_conflict",
    claim:
      matchesPendingIngressTerminal(finalPendingIntent, params.sourceMessageId) ||
      matchesPendingIngressClaim(finalPendingIntent, params.sourceMessageId) || null,
  };
}

async function completePendingIngressFallbackClaim(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: unknown,
  params: {
    sourceMessageId: string;
    traceId: string;
    actionStatus: string;
    errorCode?: string | null;
  },
) {
  const normalizedUserId = toNullableInteger(userId);
  if (!normalizedUserId || !safeString(params.sourceMessageId)) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readPendingIntentConcurrencyState(admin, normalizedUserId);
    if (!current) return;
    const pendingIntent = clonePlainObject(current.pendingIntent || {});
    const claim =
      pendingIntent?.last_ingress_claim && typeof pendingIntent.last_ingress_claim === "object"
        ? (pendingIntent.last_ingress_claim as Record<string, unknown>)
        : null;
    if (claim && safeString(claim.source_message_id) === safeString(params.sourceMessageId)) {
      delete pendingIntent.last_ingress_claim;
    }
    pendingIntent.last_ingress_terminal = {
      channel: "zalo",
      source_message_id: safeString(params.sourceMessageId) || null,
      trace_id: safeString(params.traceId) || null,
      action_status: safeString(params.actionStatus) || "completed",
      error_code: safeString(params.errorCode) || null,
      completed_at: new Date().toISOString(),
    };
    const persisted = await persistPendingIntentConcurrencyState(admin, {
      userId: normalizedUserId,
      updatedAt: current.updatedAt,
      pendingIntent,
    });
    if (persisted) return;
  }
}

function normalizeSenderEnvelope(body: any) {
  const canonicalUserId =
    safeString(body?.user_id_by_app) ||
    safeString(body?.sender?.id) ||
    safeString(body?.message?.from?.id) ||
    null;
  const rawSenderId = safeString(body?.sender?.id) || null;
  const rawMessageFromId = safeString(body?.message?.from?.id) || null;

  if (!canonicalUserId) return body;

  const normalized = JSON.parse(JSON.stringify(body || {}));
  normalized.user_id_by_app = canonicalUserId;
  normalized.platform_user_id = canonicalUserId;

  const chatLikeId =
    (rawSenderId && rawSenderId !== canonicalUserId ? rawSenderId : null) ||
    (rawMessageFromId && rawMessageFromId !== canonicalUserId ? rawMessageFromId : null) ||
    safeString(normalized.platform_chat_id) ||
    null;

  if (chatLikeId) {
    normalized.platform_chat_id = chatLikeId;
  }

  if (normalized.sender && typeof normalized.sender === "object") {
    normalized.sender = {
      ...normalized.sender,
      id: canonicalUserId,
      original_id:
        rawSenderId && rawSenderId !== canonicalUserId
          ? rawSenderId
          : normalized.sender.original_id || null,
    };
  } else {
    normalized.sender = { id: canonicalUserId };
  }

  if (normalized.message?.from && typeof normalized.message.from === "object") {
    normalized.message = {
      ...normalized.message,
      from: {
        ...normalized.message.from,
        id: canonicalUserId,
        original_id:
          rawMessageFromId && rawMessageFromId !== canonicalUserId
            ? rawMessageFromId
            : normalized.message.from.original_id || null,
      },
    };
  }

  return normalized;
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

function buildBmrExplainText() {
  return [
    "BMR là lượng calories cơ thể bạn cần nếu chỉ nằm nghỉ và không vận động thêm.",
    "Hiểu đơn giản: đó là mức nền để tim, não, hô hấp và các cơ quan vẫn hoạt động bình thường.",
    "CaloTrack dùng BMR làm nền để tính tiếp TDEE và mục tiêu calories mỗi ngày cho bạn.",
  ].join("\n");
}

function buildTdeeExplainText() {
  return [
    "TDEE là tổng calories bạn tiêu hao trong một ngày đã tính cả vận động và sinh hoạt.",
    "Hiểu đơn giản: đây là mốc tham chiếu để biết nên ăn bao nhiêu nếu muốn giữ cân, giảm mỡ hoặc tăng cơ.",
    "CaloTrack dùng TDEE để tính mục tiêu ngày và theo dõi chênh lệch nạp vào so với nhu cầu thực tế.",
  ].join("\n");
}

function getTrialRenewalReminderText(access: any) {
  const trialEndsAt = safeString(access?.context?.customerRow?.trial_ends_at);
  if (!trialEndsAt) return null;
  const trialEndsMs = Date.parse(trialEndsAt);
  if (!Number.isFinite(trialEndsMs)) return null;
  const remainingMs = trialEndsMs - Date.now();
  if (remainingMs <= 0) return null;
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (remainingDays > 2) return null;
  return [
    "",
    `Nhắc nhẹ: Pro dùng thử 7 ngày của bạn còn ${remainingDays} ngày.`,
    "Nếu muốn giữ nguyên coach, ảnh AI và quota cao hơn, bạn có thể gia hạn ngay trên dashboard.",
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
    "- /workout 600 | /vandong 600 | /tapluyen 600 - ghi nhanh calories vận động",
    "",
    "Gym mode",
    "- /gym - xem trạng thái gym mode",
    "- /gym on - bật Gym Coach 3 giờ",
    "- /gym status - xem thời gian còn lại",
    "- /gym chest | /gym ngực - guide ngực",
    "- /gym upper chest | /gym ngực trên - guide ngực trên",
    "- /gym lower chest | /gym ngực dưới - guide ngực dưới",
    "- /gym vai xô | /gym chest legs - guide nhiều nhóm cơ",
    "- /gym <nhóm cơ> 45 | /gym plan 45 - nhận plan theo thời lượng",
    "- /gym finish | /gym off - tắt mode ngay",
    "",
    "Nước",
    "- /nuoc 500 - ghi nhanh nước uống",
    ...(isLinked
      ? []
      : [
          "",
          "Nếu chưa liên kết portal, hãy nhắn lại 'hi' trong chính chat Zalo này để hệ thống gửi link xác thực chuẩn.",
          "Nếu bạn đã xác thực trên web trước đó, dashboard sẽ hiện bước khắc phục kết nối.",
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
    "- /nuoc 500",
    "- /workout 600",
    "- /xoa 2 hoặc /xoa het",
    "- /can 72.4",
    "- /gym on → /gym chest 45",
    "- Gửi ảnh rồi trả lời có để lưu",
    "- /help để xem toàn bộ command",
  ].join("\n");
}

function formatIntVi(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Math.round(numeric).toLocaleString("vi-VN");
}

function formatFloatVi(value: unknown, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toTimeZoneDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeString(timeZone) || "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseBasicWaterAmountMl(normalized: string) {
  const direct = normalized.match(/^(?:\/)?(?:nuoc|uong|water)\s+(\d{2,4})(?:\s*(?:ml|cc|m))?$/);
  if (direct) {
    const amount = Number.parseInt(direct[1], 10);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }
  const reversed = normalized.match(/^(\d{2,4})(?:\s*(?:ml|cc|m))?\s*(?:nuoc|uong|water)$/);
  if (reversed) {
    const amount = Number.parseInt(reversed[1], 10);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }
  return null;
}

function clonePlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function parsePendingIntentStateLite(candidate: unknown) {
  if (!candidate) return {};
  if (typeof candidate === "object" && !Array.isArray(candidate)) {
    return clonePlainObject(candidate);
  }
  try {
    const parsed = JSON.parse(String(candidate));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toTimestampMs(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1e9) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFreshStructuredConfirmCandidate(pendingIntent: Record<string, unknown>) {
  const candidate =
    pendingIntent?.confirm_candidate && typeof pendingIntent.confirm_candidate === "object"
      ? (pendingIntent.confirm_candidate as Record<string, unknown>)
      : pendingIntent?.image_analysis && typeof pendingIntent.image_analysis === "object"
        ? (pendingIntent.image_analysis as Record<string, unknown>)
        : null;
  if (!candidate) return false;
  const createdAtMs = toTimestampMs(candidate.created_at ?? candidate.updated_at ?? candidate.logged_at);
  if (Number.isFinite(createdAtMs) && Math.abs(Date.now() - Number(createdAtMs)) > 10 * 60 * 1000) {
    return false;
  }
  const foodName = safeString(candidate.food_name || candidate.title).trim();
  const calories = Number(candidate.total_calories ?? candidate.calories ?? 0);
  return Boolean(foodName || Number.isFinite(calories) && calories > 0);
}

function readFreshTextLookupConfirmCandidate(pendingIntent: Record<string, unknown>) {
  const candidate =
    pendingIntent?.confirm_candidate && typeof pendingIntent.confirm_candidate === "object"
      ? (pendingIntent.confirm_candidate as Record<string, unknown>)
      : null;
  const candidateCreatedAtMs = toTimestampMs(candidate?.created_at ?? candidate?.updated_at ?? candidate?.logged_at);
  if (
    candidate &&
    safeString(candidate.source).toLowerCase().includes("text_lookup") &&
    (!Number.isFinite(candidateCreatedAtMs) || Math.abs(Date.now() - Number(candidateCreatedAtMs)) <= LOOKUP_CONFIRM_TTL_MS)
  ) {
    const foodName = safeString(candidate.food_name || candidate.title).trim();
    const calories = Number(candidate.total_calories ?? candidate.calories ?? 0);
    if (foodName || (Number.isFinite(calories) && calories > 0)) {
      return {
        food_name: foodName || "Món vừa tra cứu",
        total_calories: Number.isFinite(calories) ? calories : 0,
        total_protein: Number(candidate.total_protein ?? candidate.protein ?? 0) || 0,
        total_carbs: Number(candidate.total_carbs ?? candidate.carbs ?? 0) || 0,
        total_fat: Number(candidate.total_fat ?? candidate.fat ?? 0) || 0,
        quantity_numeric: Number(candidate.quantity_numeric ?? 1) || 1,
        created_at: candidate.created_at || new Date().toISOString(),
        source: safeString(candidate.source) || "text_lookup",
      };
    }
  }

  const searchState =
    pendingIntent?.pending_search_result && typeof pendingIntent.pending_search_result === "object"
      ? (pendingIntent.pending_search_result as Record<string, unknown>)
      : null;
  const searchCreatedAtMs = toTimestampMs(searchState?.created_at);
  const topResult = Array.isArray(searchState?.results) && searchState.results.length > 0 && typeof searchState.results[0] === "object"
    ? (searchState.results[0] as Record<string, unknown>)
    : null;
  if (
    searchState &&
    topResult &&
    (!Number.isFinite(searchCreatedAtMs) || Math.abs(Date.now() - Number(searchCreatedAtMs)) <= LOOKUP_CONFIRM_TTL_MS)
  ) {
    const foodName = safeString(topResult.name).trim();
    const calories = Number(topResult.calories ?? 0);
    if (foodName || (Number.isFinite(calories) && calories > 0)) {
      return {
        food_name: foodName || "Món vừa tra cứu",
        total_calories: Number.isFinite(calories) ? calories : 0,
        total_protein: Number(topResult.protein ?? 0) || 0,
        total_carbs: Number(topResult.carbs ?? 0) || 0,
        total_fat: Number(topResult.fat ?? 0) || 0,
        quantity_numeric: 1,
        created_at: searchState.created_at || new Date().toISOString(),
        source: "text_lookup_pending_search",
      };
    }
  }

  return null;
}

function parseLookupReplyConfirmCandidate(messageText: unknown) {
  const text = String(messageText || "").trim();
  if (!text) return null;
  const normalized = normalizeCommandText(text);
  if (!normalized.includes("luu mon nay")) return null;
  if (!normalized.includes("estimate tra cuu")) return null;
  const titleMatch = text.match(/\*\*([^*\n]+)\*\*/);
  const caloriesMatch = text.match(/-\s*Calories:\s*([\d.,]+)\s*kcal/i);
  const macrosMatch = text.match(/-\s*Macros:\s*P\s*([\d.,]+)g\s*\|\s*C\s*([\d.,]+)g\s*\|\s*F\s*([\d.,]+)g/i);
  const foodName = safeString(titleMatch?.[1]).trim();
  const totalCalories = Number(String(caloriesMatch?.[1] || "").replace(",", ".")) || 0;
  const totalProtein = Number(String(macrosMatch?.[1] || "").replace(",", ".")) || 0;
  const totalCarbs = Number(String(macrosMatch?.[2] || "").replace(",", ".")) || 0;
  const totalFat = Number(String(macrosMatch?.[3] || "").replace(",", ".")) || 0;
  if (!foodName && totalCalories <= 0 && totalProtein <= 0 && totalCarbs <= 0 && totalFat <= 0) {
    return null;
  }
  return {
    food_name: foodName || "Món vừa tra cứu",
    total_calories: totalCalories,
    total_protein: totalProtein,
    total_carbs: totalCarbs,
    total_fat: totalFat,
    quantity_numeric: 1,
    created_at: new Date().toISOString(),
    source: "text_lookup_recovered",
  };
}

async function findRecentLookupReplyConfirmCandidate(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: unknown,
) {
  const normalizedUserId = toNullableInteger(userId);
  if (!normalizedUserId) return null;
  try {
    const { data, error } = await admin
      .from("messages")
      .select("id,message_text,message_type,source,created_at")
      .eq("user_id", normalizedUserId)
      .eq("message_type", "bot")
      .order("id", { ascending: false })
      .limit(8);
    if (error || !Array.isArray(data)) return null;
    for (const row of data) {
      const createdAtMs = toTimestampMs((row as any)?.created_at);
      if (Number.isFinite(createdAtMs) && Math.abs(Date.now() - Number(createdAtMs)) > LOOKUP_CONFIRM_TTL_MS) {
        continue;
      }
      const candidate = parseLookupReplyConfirmCandidate((row as any)?.message_text);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function refreshGatewayStats(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: unknown,
  dateLocal: string,
) {
  const normalizedUserId = toNullableInteger(userId);
  if (!normalizedUserId || !safeString(dateLocal)) return;
  await admin.rpc("refresh_daily_user_stats", {
    p_user_id: normalizedUserId,
    p_date: dateLocal,
  });
  await admin.rpc("refresh_weekly_user_stats", {
    p_user_id: normalizedUserId,
    p_anchor_date: dateLocal,
  });
}

async function saveTextLookupConfirmCandidate(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: unknown;
    customerId: unknown;
    sourceMessageId: string;
    traceId?: string | null;
    timeZone?: string | null;
    pendingIntent?: Record<string, unknown> | null;
  },
  candidate: Record<string, unknown>,
) {
  const normalizedUserId = toNullableInteger(params.userId);
  if (!normalizedUserId) {
    throw new Error("save_text_lookup_candidate_missing_user");
  }

  const dateLocal = toTimeZoneDateKey(new Date(), safeString(params.timeZone) || "Asia/Ho_Chi_Minh");
  const loggedAt = new Date().toISOString();
  const existingMealLog = await admin
    .from("meal_logs")
    .select("id")
    .eq("user_id", normalizedUserId)
    .eq("source_channel", "zalo")
    .eq("source_message_id", safeString(params.sourceMessageId))
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((existingMealLog as any)?.data?.id) {
    return {
      deduped: true,
      mealLogId: Number((existingMealLog as any).data.id) || null,
    };
  }

  const mealLogInsert = await admin
    .from("meal_logs")
    .insert({
      user_id: normalizedUserId,
      customer_id: toNullableInteger(params.customerId),
      source_channel: "zalo",
      source_message_id: safeString(params.sourceMessageId) || null,
      log_mode: "gateway_text_lookup_confirm",
      logged_at: loggedAt,
      date_local: dateLocal,
      trace_id: safeString(params.traceId) || `gateway_text_lookup_confirm:${normalizedUserId}:${Date.now()}`,
      compat_food_log_id: null,
    })
    .select("id")
    .limit(1)
    .single();

  if (mealLogInsert.error) throw mealLogInsert.error;

  const itemInsert = await admin.from("meal_log_items").insert({
    meal_log_id: Number((mealLogInsert.data as any)?.id),
    food_id: null,
    food_name_snapshot: safeString(candidate.food_name || candidate.title) || "Món vừa tra cứu",
    quantity_value: Number(candidate.quantity_numeric ?? 1) || 1,
    quantity_unit: null,
    portion_label: "1 phần",
    grams: null,
    calories: Number(candidate.total_calories ?? candidate.calories ?? 0) || 0,
    protein: Number(candidate.total_protein ?? candidate.protein ?? 0) || 0,
    carbs: Number(candidate.total_carbs ?? candidate.carbs ?? 0) || 0,
    fat: Number(candidate.total_fat ?? candidate.fat ?? 0) || 0,
    source_type: "gateway_text_lookup_confirm",
    source_confidence: 0.85,
    compat_food_log_id: null,
  });
  if (itemInsert.error) throw itemInsert.error;

  await refreshGatewayStats(admin, normalizedUserId, dateLocal);

  const nextPendingIntent = clonePlainObject(params.pendingIntent || {});
  delete nextPendingIntent.confirm_candidate;
  delete nextPendingIntent.pending_search_result;
  delete nextPendingIntent.last_saved_food_bundle;
  return {
    deduped: false,
    mealLogId: Number((mealLogInsert.data as any)?.id) || null,
    dateLocal,
    nextPendingIntent,
  };
}

function hasImageReviewPendingState(pendingIntent: Record<string, unknown>) {
  if (safeString(pendingIntent.active_image_review_id)) return true;
  if (Array.isArray(pendingIntent.image_review_queue) && pendingIntent.image_review_queue.length > 0) return true;
  const imageAnalysis =
    pendingIntent?.image_analysis && typeof pendingIntent.image_analysis === "object"
      ? (pendingIntent.image_analysis as Record<string, unknown>)
      : null;
  if (imageAnalysis && Array.isArray(imageAnalysis.foods) && imageAnalysis.foods.length > 0) return true;
  const confirmCandidate =
    pendingIntent?.confirm_candidate && typeof pendingIntent.confirm_candidate === "object"
      ? (pendingIntent.confirm_candidate as Record<string, unknown>)
      : null;
  if (confirmCandidate && Array.isArray(confirmCandidate.foods) && confirmCandidate.foods.length > 0) return true;
  return false;
}

function normalizeImageReviewFoodCandidate(food: Record<string, unknown>) {
  const quantityValue = Number(food.quantity ?? 1);
  const gramsValue = Number(food.estimated_weight_g ?? food.grams ?? 0);
  const caloriesValue = Number(food.calories ?? 0);
  const proteinValue = Number(food.protein ?? 0);
  const carbsValue = Number(food.carbs ?? 0);
  const fatValue = Number(food.fat ?? 0);
  const foodName = safeString(food.name || food.food_name || food.title).trim();
  const quantityUnit = safeString(food.unit || food.quantity_unit || "").trim();
  const notes = safeString(food.notes || food.note || "").trim();
  return {
    food_name: foodName || "Món từ ảnh",
    quantity_value: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1,
    quantity_unit: quantityUnit || null,
    grams: Number.isFinite(gramsValue) && gramsValue > 0 ? Math.round(gramsValue) : null,
    calories: Number.isFinite(caloriesValue) ? caloriesValue : 0,
    protein: Number.isFinite(proteinValue) ? proteinValue : 0,
    carbs: Number.isFinite(carbsValue) ? carbsValue : 0,
    fat: Number.isFinite(fatValue) ? fatValue : 0,
    notes,
  };
}

function buildImageReviewPortionLabel(food: ReturnType<typeof normalizeImageReviewFoodCandidate>) {
  const quantityText = formatFloatVi(food.quantity_value, 1);
  const unitText = safeString(food.quantity_unit) || "phần";
  const weightText = food.grams ? ` (~${formatIntVi(food.grams)}g)` : "";
  return `${quantityText} ${unitText}${weightText}`.trim();
}

function normalizeStructuredImageReviewCandidate(
  structured: Record<string, unknown> | null,
  meta: Record<string, unknown> = {},
) {
  if (!structured || typeof structured !== "object") return null;
  const foods = Array.isArray(structured.foods)
    ? structured.foods
        .filter((food) => food && typeof food === "object")
        .map((food) => normalizeImageReviewFoodCandidate(food as Record<string, unknown>))
        .filter((food) =>
          Boolean(food.food_name) ||
          food.calories > 0 ||
          food.protein > 0 ||
          food.carbs > 0 ||
          food.fat > 0,
        )
    : [];
  if (!foods.length) return null;
  const createdAt = safeString(
    structured.created_at ||
      structured.updated_at ||
      meta.created_at ||
      structured.logged_at,
  );
  const createdAtMs = toTimestampMs(createdAt);
  if (Number.isFinite(createdAtMs) && Math.abs(Date.now() - Number(createdAtMs)) > LOOKUP_CONFIRM_TTL_MS) {
    return null;
  }
  const totals = foods.reduce(
    (acc, food) => ({
      total_calories: acc.total_calories + Number(food.calories || 0),
      total_protein: acc.total_protein + Number(food.protein || 0),
      total_carbs: acc.total_carbs + Number(food.carbs || 0),
      total_fat: acc.total_fat + Number(food.fat || 0),
    }),
    { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 },
  );
  const title =
    safeString(structured.title || structured.food_name || meta.title).trim() ||
    foods.map((food) => safeString(food.food_name).trim()).filter(Boolean).slice(0, 2).join(" + ") ||
    "Bữa ăn từ ảnh";
  const followupKind = safeString(structured.followup_kind || structured.kind || meta.followup_kind).trim();
  return {
    review_id: safeString(structured.review_id || meta.review_id).trim() || null,
    title,
    foods,
    total_calories:
      Number(structured.total_calories ?? structured.calories ?? totals.total_calories) || totals.total_calories,
    total_protein:
      Number(structured.total_protein ?? structured.protein ?? totals.total_protein) || totals.total_protein,
    total_carbs:
      Number(structured.total_carbs ?? structured.carbs ?? totals.total_carbs) || totals.total_carbs,
    total_fat:
      Number(structured.total_fat ?? structured.fat ?? totals.total_fat) || totals.total_fat,
    source_message_id: safeString(structured.source_message_id || meta.source_message_id).trim() || null,
    trace_id: safeString(structured.trace_id || meta.trace_id).trim() || null,
    created_at: createdAt || new Date().toISOString(),
    confirm_scope:
      structured.derived_from_followup === true ||
      Boolean(followupKind)
        ? "subset"
        : "full",
  };
}

function readFreshImageReviewConfirmCandidate(pendingIntent: Record<string, unknown>) {
  const activeReviewId = safeString(pendingIntent.active_image_review_id || pendingIntent.last_image_review_id).trim();
  const queue = Array.isArray(pendingIntent.image_review_queue) ? pendingIntent.image_review_queue : [];
  const orderedEntries = [
    ...(activeReviewId
      ? queue.filter((entry) =>
          safeString((entry as Record<string, unknown>)?.review_id || (entry as Record<string, unknown>)?.image_analysis?.review_id).trim() === activeReviewId)
      : []),
    ...queue,
  ];
  for (const entry of orderedEntries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const structured =
      record.image_analysis && typeof record.image_analysis === "object"
        ? (record.image_analysis as Record<string, unknown>)
        : record;
    const candidate = normalizeStructuredImageReviewCandidate(structured, {
      review_id: record.review_id,
      source_message_id: record.source_message_id,
      trace_id: record.trace_id,
      created_at: record.created_at,
    });
    if (candidate) return candidate;
  }

  const activeStructured =
    pendingIntent?.image_analysis && typeof pendingIntent.image_analysis === "object"
      ? (pendingIntent.image_analysis as Record<string, unknown>)
      : pendingIntent?.confirm_candidate && typeof pendingIntent.confirm_candidate === "object"
        ? (pendingIntent.confirm_candidate as Record<string, unknown>)
        : null;
  if (!activeStructured) return null;
  return normalizeStructuredImageReviewCandidate(activeStructured, {
    review_id: activeReviewId || safeString(activeStructured.review_id).trim() || null,
    source_message_id: activeStructured.source_message_id,
    trace_id: activeStructured.trace_id,
    created_at: activeStructured.created_at,
  });
}

function clearImageReviewPendingState(
  pendingIntent: Record<string, unknown>,
  savedCandidate: ReturnType<typeof readFreshImageReviewConfirmCandidate>,
  params: {
    sourceMessageId: string;
    traceId?: string | null;
  },
) {
  const nextPendingIntent = clonePlainObject(pendingIntent || {});
  delete nextPendingIntent.confirm_candidate;
  delete nextPendingIntent.image_analysis;
  delete nextPendingIntent.image_review_queue;
  delete nextPendingIntent.active_image_review_id;
  delete nextPendingIntent.last_image_review_id;
  delete nextPendingIntent.image_followup;
  nextPendingIntent.last_saved_food_bundle = {
    source: "gateway_image_review_confirm",
    review_id: safeString(savedCandidate?.review_id) || null,
    food_name: safeString(savedCandidate?.title) || "Bữa ăn từ ảnh",
    total_calories: Number(savedCandidate?.total_calories ?? 0) || 0,
    total_protein: Number(savedCandidate?.total_protein ?? 0) || 0,
    total_carbs: Number(savedCandidate?.total_carbs ?? 0) || 0,
    total_fat: Number(savedCandidate?.total_fat ?? 0) || 0,
    source_message_id: safeString(params.sourceMessageId) || null,
    trace_id: safeString(params.traceId) || null,
    saved_at: new Date().toISOString(),
  };
  nextPendingIntent.last_terminal_trace = {
    channel: "zalo",
    source_message_id: safeString(params.sourceMessageId) || null,
    trace_id: safeString(params.traceId) || null,
    route: "CHAT",
    action: "log_confirm",
    action_status: "saved",
    completed_at: new Date().toISOString(),
  };
  const interactionContext =
    nextPendingIntent.interaction_context && typeof nextPendingIntent.interaction_context === "object"
      ? clonePlainObject(nextPendingIntent.interaction_context)
      : {};
  interactionContext.last_surface = "image_review";
  interactionContext.last_action = "log_confirm";
  interactionContext.last_non_error_reply_at = new Date().toISOString();
  nextPendingIntent.interaction_context = interactionContext;
  return nextPendingIntent;
}

async function saveImageReviewConfirmCandidate(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: unknown;
    customerId: unknown;
    sourceMessageId: string;
    traceId?: string | null;
    timeZone?: string | null;
    pendingIntent?: Record<string, unknown> | null;
  },
  candidate: NonNullable<ReturnType<typeof readFreshImageReviewConfirmCandidate>>,
) {
  const normalizedUserId = toNullableInteger(params.userId);
  if (!normalizedUserId) {
    throw new Error("save_image_review_candidate_missing_user");
  }
  if (!Array.isArray(candidate.foods) || !candidate.foods.length) {
    throw new Error("save_image_review_candidate_missing_foods");
  }

  const dateLocal = toTimeZoneDateKey(new Date(), safeString(params.timeZone) || "Asia/Ho_Chi_Minh");
  const loggedAt = new Date().toISOString();
  const existingMealLog = await admin
    .from("meal_logs")
    .select("id")
    .eq("user_id", normalizedUserId)
    .eq("source_channel", "zalo")
    .eq("source_message_id", safeString(params.sourceMessageId))
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((existingMealLog as any)?.data?.id) {
    return {
      deduped: true,
      mealLogId: Number((existingMealLog as any).data.id) || null,
      nextPendingIntent: clearImageReviewPendingState(params.pendingIntent || {}, candidate, params),
    };
  }

  const mealLogInsert = await admin
    .from("meal_logs")
    .insert({
      user_id: normalizedUserId,
      customer_id: toNullableInteger(params.customerId),
      source_channel: "zalo",
      source_message_id: safeString(params.sourceMessageId) || null,
      log_mode: "gateway_image_review_confirm",
      logged_at: loggedAt,
      date_local: dateLocal,
      trace_id: safeString(params.traceId) || `gateway_image_review_confirm:${normalizedUserId}:${Date.now()}`,
      compat_food_log_id: null,
    })
    .select("id")
    .limit(1)
    .single();

  if (mealLogInsert.error) throw mealLogInsert.error;

  const itemRows = candidate.foods.map((food) => ({
    meal_log_id: Number((mealLogInsert.data as any)?.id),
    food_id: null,
    food_name_snapshot: safeString(food.food_name || "Món từ ảnh"),
    quantity_value: Number(food.quantity_value ?? 1) || 1,
    quantity_unit: safeString(food.quantity_unit) || null,
    portion_label: buildImageReviewPortionLabel(food),
    grams: Number(food.grams ?? 0) > 0 ? Number(food.grams) : null,
    calories: Number(food.calories ?? 0) || 0,
    protein: Number(food.protein ?? 0) || 0,
    carbs: Number(food.carbs ?? 0) || 0,
    fat: Number(food.fat ?? 0) || 0,
    source_type: "gateway_image_review_confirm",
    source_confidence: 0.9,
    compat_food_log_id: null,
  }));
  const itemInsert = await admin.from("meal_log_items").insert(itemRows);
  if (itemInsert.error) throw itemInsert.error;

  await refreshGatewayStats(admin, normalizedUserId, dateLocal);

  return {
    deduped: false,
    mealLogId: Number((mealLogInsert.data as any)?.id) || null,
    dateLocal,
    nextPendingIntent: clearImageReviewPendingState(params.pendingIntent || {}, candidate, params),
  };
}

function looksLikeImageReviewSubsetFollowup(normalized: string) {
  if (!normalized) return false;
  if (/^(khong|khong luu|bo qua)$/.test(normalized)) return false;
  return (
    /\b(chi|rieng|mieng giua|mieng nay|phan giua|phan nay|mon nay|tach rieng|boc rieng)\b/.test(normalized) ||
    /\b(bo|nam|ga|trung|com|bun|pho|ca|tom|rau|salad|nuoc|cola|coca|beef|chicken|mushroom|egg|rice)\b/.test(normalized)
  );
}

function pickImageReviewFollowupFoods(
  normalized: string,
  candidate: NonNullable<ReturnType<typeof readFreshImageReviewConfirmCandidate>>,
) {
  const foods = Array.isArray(candidate.foods) ? candidate.foods : [];
  if (!foods.length) return [];
  const matchedFoods = foods.filter((food) => {
    const haystack = normalizeCommandText([food.food_name, food.notes].filter(Boolean).join(" "));
    if (!haystack) return false;
    return normalized
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !["chi", "rieng", "phan", "mieng", "nay", "giua", "mon"].includes(token))
      .some((token) => haystack.includes(token));
  });
  if (matchedFoods.length > 0) return matchedFoods;
  if (/\b(chi|rieng|mieng giua|mieng nay|phan giua|phan nay|mon nay|tach rieng|boc rieng)\b/.test(normalized)) {
    return foods.slice(0, 1);
  }
  return [];
}

function buildImageReviewSubsetTitle(foods: Array<ReturnType<typeof normalizeImageReviewFoodCandidate>>) {
  const names = foods.map((food) => safeString(food.food_name).trim()).filter(Boolean);
  if (!names.length) return "Bữa ăn từ ảnh";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} và ${names[1]}`;
  return `${names[0]} và món kèm`;
}

function buildImageReviewSubsetCandidate(
  messageText: string,
  baseCandidate: NonNullable<ReturnType<typeof readFreshImageReviewConfirmCandidate>>,
  params: {
    sourceMessageId: string;
    traceId?: string | null;
  },
) {
  const normalized = normalizeCommandText(messageText);
  if (!looksLikeImageReviewSubsetFollowup(normalized)) return null;
  const matchedFoods = pickImageReviewFollowupFoods(normalized, baseCandidate);
  if (!matchedFoods.length) return null;
  const totals = matchedFoods.reduce(
    (acc, food) => ({
      total_calories: acc.total_calories + Number(food.calories || 0),
      total_protein: acc.total_protein + Number(food.protein || 0),
      total_carbs: acc.total_carbs + Number(food.carbs || 0),
      total_fat: acc.total_fat + Number(food.fat || 0),
    }),
    { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 },
  );
  const createdAt = new Date().toISOString();
  const title = buildImageReviewSubsetTitle(matchedFoods);
  return {
    review_id: `${safeString(baseCandidate.review_id) || "image-review"}:subset:${safeString(params.sourceMessageId) || Date.now()}`,
    title,
    foods: matchedFoods.map((food) => ({ ...food })),
    total_calories: Math.round(totals.total_calories),
    total_protein: Number(totals.total_protein) || 0,
    total_carbs: Number(totals.total_carbs) || 0,
    total_fat: Number(totals.total_fat) || 0,
    source_message_id: safeString(params.sourceMessageId) || null,
    trace_id: safeString(params.traceId) || null,
    created_at: createdAt,
    confirm_scope: "subset",
    observation: `Follow-up ảnh đã bóc riêng theo câu hỏi: ${safeString(messageText).trim()}`,
  };
}

function persistImageReviewSubsetState(
  pendingIntent: Record<string, unknown>,
  subsetCandidate: NonNullable<ReturnType<typeof buildImageReviewSubsetCandidate>>,
) {
  const nextPendingIntent = clonePlainObject(pendingIntent || {});
  const subsetImageAnalysis = {
    review_id: subsetCandidate.review_id,
    kind: "analysis",
    title: subsetCandidate.title,
    observation: subsetCandidate.observation,
    source_message_id: subsetCandidate.source_message_id,
    trace_id: subsetCandidate.trace_id,
    created_at: subsetCandidate.created_at,
    foods: subsetCandidate.foods.map((food) => ({ ...food })),
    total_calories: subsetCandidate.total_calories,
    total_protein: subsetCandidate.total_protein,
    total_carbs: subsetCandidate.total_carbs,
    total_fat: subsetCandidate.total_fat,
    derived_from_followup: true,
    followup_kind: "subset_review",
  };
  const existingQueue = Array.isArray(nextPendingIntent.image_review_queue)
    ? clonePlainObject(nextPendingIntent.image_review_queue)
    : [];
  const nextQueue = [
    {
      review_id: subsetCandidate.review_id,
      source_message_id: subsetCandidate.source_message_id,
      trace_id: subsetCandidate.trace_id,
      created_at: subsetCandidate.created_at,
      image_analysis: subsetImageAnalysis,
    },
    ...existingQueue.filter((entry: any) => safeString(entry?.review_id).trim() !== safeString(subsetCandidate.review_id).trim()),
  ].slice(0, 8);
  nextPendingIntent.confirm_candidate = {
    review_id: subsetCandidate.review_id,
    title: subsetCandidate.title,
    foods: subsetCandidate.foods.map((food) => ({ ...food })),
    total_calories: subsetCandidate.total_calories,
    total_protein: subsetCandidate.total_protein,
    total_carbs: subsetCandidate.total_carbs,
    total_fat: subsetCandidate.total_fat,
    source_message_id: subsetCandidate.source_message_id,
    trace_id: subsetCandidate.trace_id,
    created_at: subsetCandidate.created_at,
    derived_from_followup: true,
    followup_kind: "subset_review",
  };
  nextPendingIntent.image_analysis = subsetImageAnalysis;
  nextPendingIntent.image_review_queue = nextQueue;
  nextPendingIntent.active_image_review_id = subsetCandidate.review_id;
  nextPendingIntent.last_image_review_id = subsetCandidate.review_id;
  const interactionContext =
    nextPendingIntent.interaction_context && typeof nextPendingIntent.interaction_context === "object"
      ? clonePlainObject(nextPendingIntent.interaction_context)
      : {};
  interactionContext.last_surface = "image_review";
  interactionContext.last_action = "image_followup_review";
  interactionContext.last_non_error_reply_at = subsetCandidate.created_at;
  nextPendingIntent.interaction_context = interactionContext;
  return nextPendingIntent;
}

function buildImageReviewSubsetReply(
  subsetCandidate: NonNullable<ReturnType<typeof buildImageReviewSubsetCandidate>>,
) {
  const foods = Array.isArray(subsetCandidate.foods) ? subsetCandidate.foods : [];
  const blocks = foods.map((food) => {
    const alias = null;
    const lines = [alias ? `[Food] ${food.food_name} (${alias})` : `[Food] ${food.food_name}`];
    const weightText = food.grams ? ` (~${formatIntVi(food.grams)}g)` : "";
    lines.push(`- Số lượng: ${formatFloatVi(food.quantity_value, 1)} ${safeString(food.quantity_unit) || "phần"}${weightText}`);
    lines.push(`- Calories: ${formatIntVi(food.calories)} kcal`);
    lines.push(`- Macros: P ${formatFloatVi(food.protein)}g | C ${formatFloatVi(food.carbs)}g | F ${formatFloatVi(food.fat)}g`);
    if (safeString(food.notes)) lines.push(`- Ghi chú: ${safeString(food.notes)}`);
    return lines.join("\n");
  });
  return [
    "[Image] Mình bóc riêng phần bạn vừa hỏi ra rồi nè. Chỗ này vẫn đang ở trạng thái xem thử thôi, chưa lưu nhé.",
    ...blocks,
    `Tổng: ${formatIntVi(subsetCandidate.total_calories)} kcal`,
    `Macros: P ${formatFloatVi(subsetCandidate.total_protein)}g | C ${formatFloatVi(subsetCandidate.total_carbs)}g | F ${formatFloatVi(subsetCandidate.total_fat)}g`,
    "Ghi lại? \"có\" / \"không\"",
    "Thấy ổn thì nhắn \"có\" để mình lưu đúng phần này. Nếu còn muốn chỉnh estimate thì cứ nói tiếp, mình vẫn đang ở mode phân tích thôi.",
  ].join("\n");
}

function hasPendingInteractiveState(pendingIntent: Record<string, unknown>) {
  if (hasFreshStructuredConfirmCandidate(pendingIntent)) return true;
  if (safeString(pendingIntent.active_image_review_id)) return true;
  if (Array.isArray(pendingIntent.image_review_queue) && pendingIntent.image_review_queue.length > 0) return true;
  if (pendingIntent.batch_food_review && typeof pendingIntent.batch_food_review === "object") return true;
  if (pendingIntent.pending_search_result && typeof pendingIntent.pending_search_result === "object") return true;
  return false;
}

function hasSaveablePendingState(pendingIntent: Record<string, unknown>) {
  if (hasFreshStructuredConfirmCandidate(pendingIntent)) return true;
  if (safeString(pendingIntent.active_image_review_id)) return true;
  if (Array.isArray(pendingIntent.image_review_queue) && pendingIntent.image_review_queue.length > 0) return true;
  if (pendingIntent.batch_food_review && typeof pendingIntent.batch_food_review === "object") return true;
  return false;
}

function isSaveConfirmPhrase(normalized: string) {
  return Boolean(
    /^(co|ok|oke|okay|yes|y|uh|um|duoc|dc|dong y|xac nhan)$/.test(normalized) ||
      /^(them vao nhat ky|ghi vao nhat ky|luu vao nhat ky|luu lai|ghi lai|log mon nay|them mon nay|luu mon nay|xac nhan ghi|xac nhan luu)$/.test(normalized) ||
      /^(toi )?(muon)\s+(ghi|luu|them).*(nhat ky|mon nay)$/.test(normalized)
  );
}

function readGymModeState(pendingIntent: Record<string, unknown>) {
  const gymMode =
    pendingIntent?.gym_mode && typeof pendingIntent.gym_mode === "object"
      ? clonePlainObject(pendingIntent.gym_mode)
      : {};
  const expiresAt = safeString(gymMode.expires_at).trim();
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const enabled = Boolean(gymMode.enabled === true && Number.isFinite(expiresMs) && expiresMs > Date.now());
  return {
    enabled,
    expiresAt: expiresAt || null,
    expiresMs: Number.isFinite(expiresMs) ? expiresMs : null,
    focus: safeString(gymMode.focus).trim() || "",
    sessionStatus: safeString(gymMode.session_status).trim() || "",
  };
}

function buildGymStatusReplyText(gymState: ReturnType<typeof readGymModeState>) {
  if (!gymState.enabled) {
    return "🏋️ Gym mode hiện đang tắt. Nhắn /gym on nếu bạn muốn bật Gym Coach 3 giờ.";
  }
  const remainingMinutes = gymState.expiresMs
    ? Math.max(0, Math.ceil((gymState.expiresMs - Date.now()) / 60000))
    : 0;
  const focus = safeString(gymState.focus).trim() || "tong quat";
  return [
    "🏋️ Gym mode đang bật.",
    `- Focus: ${focus}`,
    `- Còn lại: ${remainingMinutes} phút`,
    "Dùng nhanh: /gym chest, /gym upper chest, /gym lower chest, /gym vai xô, /gym chest 45",
    "Nhắn /gym off để tắt ngay.",
  ].join("\n");
}

function buildGymTipsReplyText() {
  return [
    "🏋️ Tips gym nhanh",
    "- Khởi động 5-8 phút và làm 1-2 set ramp-up trước bài chính.",
    "- Giữ form ổn định, chừa 1-2 reps trước fail ở set đầu thay vì cố quá sớm.",
    "- Nếu rep cuối bắt đầu vỡ form, giảm tạ trước khi cố thêm volume.",
    "- Ưu tiên ROM đều và kiểm soát nhịp xuống hơn là chỉ đẩy tạ nặng.",
    "- Muốn guide theo nhóm cơ, nhắn /gym chest, /gym upper chest, /gym lower chest, /gym vai xô hoặc /gym chest legs.",
  ].join("\n");
}

function isLikelyShortFillerMessage(messageText: string, normalized: string) {
  const raw = safeString(messageText).trim().toLowerCase();
  if (!raw && !normalized) return false;
  if (/^[\u{1f44d}\u{1f44c}\u{2764}\u{1f64f}]+$/u.test(raw)) return true;
  if (normalized.length > 16) return false;
  return [
    "ok",
    "oke",
    "okay",
    "dc",
    "duoc",
    "cam on",
    "cam on nha",
    "cam on nhe",
    "thanks",
    "thank you",
    "nha",
    "oke nha",
    "ok nha",
  ].includes(normalized);
}

function buildDailySummaryText(summary: Record<string, any>) {
  const daily = (summary?.daily || {}) as Record<string, any>;
  const profile = (summary?.profile || {}) as Record<string, any>;
  return [
    "📊 Dashboard hôm nay",
    `- Nạp vào: ${formatIntVi(daily.intakeKcal)} kcal`,
    `- Vận động: ${formatIntVi(daily.exerciseKcal)} kcal`,
    `- Net: ${formatIntVi(daily.netKcal)} / Goal ${formatIntVi(daily.goalKcal)} kcal`,
    `- Macro: P ${formatFloatVi(daily.consumedProteinG)}g | C ${formatFloatVi(daily.consumedCarbsG)}g | F ${formatFloatVi(daily.consumedFatG)}g`,
    `- Chế độ mục tiêu: ${safeString(profile.goalModeDisplayLabel) || "chưa có"}`,
    "",
    "Mở /tuannay để xem tiến độ 7 ngày.",
  ].join("\n");
}

function buildWeeklySummaryText(summary: Record<string, any>) {
  const weekly = (summary?.weekly || {}) as Record<string, any>;
  const requested = (summary?.requestedPeriod || {}) as Record<string, any>;
  const profile = (summary?.profile || {}) as Record<string, any>;
  const daysLogged = Math.max(0, Number(weekly.daysLogged || 0) || 0);
  const avgCalories = daysLogged > 0 ? Number(weekly.consumedKcal || 0) / daysLogged : 0;
  const avgProtein = daysLogged > 0 ? Number(weekly.consumedProteinG || 0) / daysLogged : 0;
  return [
    "📈 Tổng kết 7 ngày gần nhất",
    `- Tổng calo đã nạp: ${formatIntVi(weekly.consumedKcal)} / ${formatIntVi(weekly.targetKcal)} kcal`,
    `- Vận động: ${formatIntVi(requested.exerciseKcal)} kcal`,
    `- Net: ${formatIntVi(requested.netKcal)} kcal`,
    `- Còn lại: ${formatIntVi(weekly.remainingKcal)} kcal`,
    `- Macro: P ${formatFloatVi(weekly.consumedProteinG)}g | C ${formatFloatVi(weekly.consumedCarbsG)}g | F ${formatFloatVi(weekly.consumedFatG)}g`,
    `- Protein trung bình/ngày: ${formatFloatVi(avgProtein)}g`,
    `- Trung bình mỗi ngày: ${formatFloatVi(avgCalories)} kcal`,
    `- Số ngày đã log: ${formatIntVi(daysLogged)}`,
    `- Chế độ mục tiêu: ${safeString(profile.goalModeDisplayLabel) || "chưa có"}`,
    "",
    "Mở /daily để xem chi tiết hôm nay.",
  ].join("\n");
}

function buildMonthlySummaryText(summary: Record<string, any>) {
  const requested = (summary?.requestedPeriod || {}) as Record<string, any>;
  const profile = (summary?.profile || {}) as Record<string, any>;
  const daysLogged = Math.max(0, Number(requested.daysLogged || 0) || 0);
  const consumedKcal = Number(requested.consumedKcal || 0) || 0;
  const targetKcal = Number(requested.targetKcal || 0) || 0;
  const remainingKcal = targetKcal - consumedKcal;
  const avgCalories = daysLogged > 0 ? consumedKcal / daysLogged : 0;
  return [
    `📆 Tháng này của bạn (${safeString(requested.startDate) || "?"} - ${safeString(requested.endDate) || "?"})`,
    `- Tổng calo đã nạp: ${formatIntVi(consumedKcal)} / ${formatIntVi(targetKcal)} kcal`,
    `- Vận động: ${formatIntVi(requested.exerciseKcal)} kcal`,
    `- Net: ${formatIntVi(requested.netKcal)} kcal`,
    `- Còn lại: ${formatIntVi(remainingKcal)} kcal`,
    `- Macro: P ${formatFloatVi(requested.consumedProteinG)}g | C ${formatFloatVi(requested.consumedCarbsG)}g | F ${formatFloatVi(requested.consumedFatG)}g`,
    `- Trung bình mỗi ngày đã log: ${formatFloatVi(avgCalories)} kcal`,
    `- Số ngày đã log: ${formatIntVi(daysLogged)}`,
    `- Chế độ mục tiêu: ${safeString(profile.goalModeDisplayLabel) || "chưa có"}`,
    "",
    "Mở /daily hoặc /tuannay để xem chi tiết hơn.",
  ].join("\n");
}

function resolveWorkflowPreAckKind(normalized: string, hasAttachment: boolean) {
  if (hasAttachment) return "image";
  if (!normalized) return null;
  if (/^(?:\/)?(?:help|menu|stats|daily|homnay|tuannay|thangnay|quickaction|can|mode|nuoc|water|workout|vandong|tapluyen)\b/.test(normalized)) {
    return null;
  }
  if (/\b(bao nhieu|calo|kcal|protein|carb|fat|macro|tra cuu|tim mon)\b/.test(normalized)) {
    return "lookup";
  }
  if (/\b(tu van|giai thich|co on khong|nen an|nen tap|co tot khong|lich tap|recovery)\b/.test(normalized)) {
    return "coaching";
  }
  if (/^(?:\/)?gym\s+(?:on|off|status|finish)\b/.test(normalized)) {
    return null;
  }
  if (/^(?:\/)?gym\s+\S+/.test(normalized) || /^(?:\/)?tips\s+gym$/.test(normalized)) {
    return "gym";
  }
  return null;
}

function buildWorkflowPreAckText(preAckKind: string | null) {
  if (preAckKind === "image") {
    return "Bạn chờ tí, mình đang phân tích ảnh đây.";
  }
  if (preAckKind === "lookup" || preAckKind === "coaching" || preAckKind === "gym") {
    return "Bạn chờ tí, mình đang xử lý cho bạn đây.";
  }
  return "";
}

function shouldSendWorkflowPreAck(parsedBody: any) {
  const normalized = normalizeCommandText(getIncomingText(parsedBody));
  const hasAttachment = Array.isArray(parsedBody?.message?.attachments) && parsedBody.message.attachments.length > 0;
  return Boolean(resolveWorkflowPreAckKind(normalized, hasAttachment));
}

function setLatencyHeaders(
  res: any,
  payload: {
    routeClass: "direct" | "workflow";
    preAckSent: boolean;
    preAckLatencyMs: number | null;
    computeLatencyMs: number | null;
    finalResponseLatencyMs: number;
    brokerSendLatencyMs: number | null;
  },
) {
  res.setHeader("x-calotrack-route-class", payload.routeClass);
  res.setHeader("x-calotrack-pre-ack-sent", payload.preAckSent ? "1" : "0");
  res.setHeader("x-calotrack-pre-ack-latency-ms", payload.preAckLatencyMs == null ? "" : String(payload.preAckLatencyMs));
  res.setHeader("x-calotrack-compute-latency-ms", payload.computeLatencyMs == null ? "" : String(payload.computeLatencyMs));
  res.setHeader("x-calotrack-final-latency-ms", String(payload.finalResponseLatencyMs));
  res.setHeader("x-calotrack-broker-send-latency-ms", payload.brokerSendLatencyMs == null ? "" : String(payload.brokerSendLatencyMs));
}

function hasCoreProfile(userRow: Record<string, unknown> | null | undefined) {
  if (!userRow || typeof userRow !== "object") return false;
  const hasNumberLikeValue = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";
  return Boolean(
    safeString(userRow.gender) &&
    hasNumberLikeValue(userRow.age) &&
    hasNumberLikeValue(userRow.height_cm) &&
    hasNumberLikeValue(userRow.weight_kg) &&
    hasNumberLikeValue(userRow.activity_level)
  );
}

function collectMissingCoreProfileFields(userRow: Record<string, unknown> | null | undefined) {
  const missing: string[] = [];
  if (!safeString(userRow?.gender)) missing.push("giới tính");
  if (userRow?.age === null || userRow?.age === undefined || !safeString(userRow?.age)) missing.push("tuổi");
  if (userRow?.height_cm === null || userRow?.height_cm === undefined || !safeString(userRow?.height_cm)) missing.push("chiều cao");
  if (userRow?.weight_kg === null || userRow?.weight_kg === undefined || !safeString(userRow?.weight_kg)) missing.push("cân nặng");
  if (userRow?.activity_level === null || userRow?.activity_level === undefined || !safeString(userRow?.activity_level)) {
    missing.push("mức vận động");
  }
  return missing;
}

function formatProfileGender(value: unknown) {
  const raw = safeString(value).toLowerCase().trim();
  if (raw === "male") return "Nam";
  if (raw === "female") return "Nữ";
  return "chưa có";
}

function formatProfileAge(value: unknown) {
  const raw = safeString(value).trim();
  return raw ? `${raw} tuổi` : "chưa có";
}

function formatProfileHeight(value: unknown) {
  const raw = safeString(value).trim();
  return raw ? `${raw} cm` : "chưa có";
}

function formatProfileWeight(value: unknown) {
  const raw = safeString(value).trim();
  return raw ? `${raw} kg` : "chưa có";
}

function formatProfileActivity(value: unknown) {
  const raw = safeString(value).trim();
  return raw ? `mức ${raw}` : "chưa có";
}

function buildActivityLegendLines() {
  return [
    "Mức vận động:",
    "1 = ít vận động, hầu như ngồi nhiều",
    "2 = vận động nhẹ, đi lại hoặc tập 1-2 buổi/tuần",
    "3 = vận động vừa, tập 3-4 buổi/tuần",
    "4 = vận động nhiều, tập 5-6 buổi/tuần hoặc công việc tay chân",
    "5 = vận động rất cao, lao động nặng hoặc tập cường độ cao gần như mỗi ngày",
  ];
}

function buildProfileSnapshotLines(userRow: Record<string, unknown> | null | undefined) {
  return [
    `Giới tính: ${formatProfileGender(userRow?.gender)}`,
    `Tuổi: ${formatProfileAge(userRow?.age)}`,
    `Chiều cao: ${formatProfileHeight(userRow?.height_cm)}`,
    `Cân nặng: ${formatProfileWeight(userRow?.weight_kg)}`,
    `Mức vận động: ${formatProfileActivity(userRow?.activity_level)}`,
  ];
}

function buildOnboardingProfileTextClean(
  userRow: Record<string, unknown> | null | undefined,
  options?: {
    includeSnapshot?: boolean;
    leadingLine?: string | null;
  },
) {
  const missingFields = collectMissingCoreProfileFields(userRow);
  const lines = [
    "Số điện thoại đã xác thực và Pro dùng thử 7 ngày đã được mở cho tài khoản này rồi.",
    "Mình cần hoàn tất hồ sơ cốt lõi trước khi mở chat đầy đủ trên Zalo.",
  ];
  if (options?.leadingLine) {
    lines.push(options.leadingLine);
  }
  if (missingFields.length) {
    lines.push(`Hiện còn thiếu: ${missingFields.join(", ")}.`);
  } else {
    lines.push("Hồ sơ cốt lõi đã đủ. Bạn có thể chat và log món ngay trong Zalo này.");
  }
  if (options?.includeSnapshot) {
    lines.push("");
    lines.push("Hồ sơ hiện tại:");
    lines.push(...buildProfileSnapshotLines(userRow).map((line) => `- ${line}`));
  }
  lines.push("");
  lines.push(...buildActivityLegendLines());
  lines.push("Bạn có thể nhắn một dòng như: Nam,30,1m70,68kg,mức 3");
  return lines.join("\n");
}

function buildOnboardingCompletedTextClean(result: Record<string, unknown>) {
  const lines = [
    "🎉 Hoàn tất onboarding rồi nha!",
    "",
    `- Giới tính: ${formatProfileGender(result.gender)}`,
    `- Tuổi: ${formatProfileAge(result.age)}`,
    `- Chiều cao: ${formatProfileHeight(result.height_cm)}`,
    `- Cân nặng: ${formatProfileWeight(result.weight_kg)}`,
    `- Mức vận động: ${formatProfileActivity(result.activity_level)}`,
  ];
  if (safeString(result.bmr)) {
    lines.push(`- BMR của bạn: ${safeString(result.bmr)} kcal/ngày`);
  }
  if (safeString(result.tdee)) {
    lines.push(`- TDEE duy trì: ${safeString(result.tdee)} kcal/ngày`);
  }
  if (safeString(result.daily_calorie_goal)) {
    lines.push(`- Baseline hiện tại: ${safeString(result.daily_calorie_goal)} kcal/ngày để theo dõi`);
  }
  lines.push("");
  lines.push("Nếu muốn mình chốt luôn mục tiêu cụ thể thì nhắn /mode giammo, /mode giucan hoặc /mode tangco.");
  lines.push("Giờ bạn có thể gửi món ăn, ảnh món ăn hoặc /stats luôn nhé.");
  return lines.join("\n");
}

function extractCheckoutHandoffCode(text: string) {
  const match = normalizeCommandText(text).match(/^\/?checkout\s+([a-z0-9]{6,16})$/i);
  return match ? match[1].toUpperCase() : null;
}

function extractClaimRedeemCode(text: string) {
  const raw = safeString(text).trim();
  if (!raw) return null;
  const directMatch = raw.match(/^([A-Za-z0-9]{8}|[A-Za-z0-9]{24,64})$/);
  if (directMatch?.[1]) return directMatch[1];
  const linkMatch = raw.match(/^\/?link\s+([A-Za-z0-9]{8}|[A-Za-z0-9]{24,64})$/i);
  return linkMatch?.[1] || null;
}

async function resolveLinkContextFromWebhook(params: {
  senderId: string;
  senderChatId: string | null;
  displayName: string | null;
  messageText: string;
}) {
  let responseBody = "";
  const requestBody: Record<string, string> = {
    channel: "zalo",
    platform_user_id: params.senderId,
    first_name: params.displayName || "",
    message_text: params.messageText,
  };
  if (params.senderChatId) {
    requestBody.platform_chat_id = params.senderChatId;
  }
  const req = {
    method: "POST",
    headers: {
      "x-calotrack-internal-key":
        cleanEnvString(process.env.CHANNEL_CONTEXT_INTERNAL_KEY) || CHANNEL_CONTEXT_INTERNAL_KEY_FALLBACK,
    },
    body: requestBody,
  };
  const res = {
    statusCode: 200,
    setHeader: (_name: string, _value: string) => {},
    end: (value?: string | Buffer) => {
      responseBody = Buffer.isBuffer(value) ? value.toString("utf8") : safeString(value);
    },
  };
  await resolveChannelContextHandler(req, res);
  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody);
    if (res.statusCode >= 400 || parsed?.ok === false) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseProfileGender(text: string) {
  const normalized = normalizeCommandText(text);
  if (/\b(nam|male)\b/.test(normalized)) return "male";
  if (/\b(nu|female)\b/.test(normalized)) return "female";
  return null;
}

function parseProfileActivity(text: string) {
  const normalized = normalizeCommandText(text);
  const explicit = normalized.match(/(?:^|\s)(?:muc|level)?\s*([1-5])(?:\s|$)/);
  if (explicit) return Number(explicit[1]);
  if (/^[1-5]$/.test(normalized)) return Number(normalized);
  return null;
}

function parseProfileHeight(text: string) {
  const compact = safeString(text).toLowerCase().replace(/\s+/g, "");
  const metersWithCm = compact.match(/^([1-2])m(\d{1,2})$/);
  if (metersWithCm) {
    return Number(metersWithCm[1]) * 100 + Number(metersWithCm[2]);
  }
  const decimalMeters = compact.match(/^([1-2][\.,]\d{1,2})m?$/);
  if (decimalMeters) {
    const numeric = Number(decimalMeters[1].replace(",", "."));
    if (Number.isFinite(numeric) && numeric >= 1.2 && numeric <= 2.5) {
      return Math.round(numeric * 100);
    }
  }
  const cmMatch = compact.match(/^(\d{3})cm?$/);
  if (cmMatch) {
    const numeric = Number(cmMatch[1]);
    return numeric >= 120 && numeric <= 250 ? numeric : null;
  }
  return null;
}

function parseProfileWeight(text: string) {
  const compact = safeString(text).toLowerCase().replace(/\s+/g, "");
  const kgMatch = compact.match(/^(\d{2,3}(?:[\.,]\d)?)kg$/);
  if (!kgMatch) return null;
  const numeric = Number(kgMatch[1].replace(",", "."));
  return Number.isFinite(numeric) && numeric >= 20 && numeric <= 400 ? numeric : null;
}

function parseProfileAge(text: string) {
  const normalized = normalizeCommandText(text);
  const match = normalized.match(/^(\d{2})$/);
  if (!match) return null;
  const numeric = Number(match[1]);
  return numeric >= 13 && numeric <= 100 ? numeric : null;
}

function parseOnboardingProfileInput(messageText: string, currentUserRow: Record<string, unknown> | null | undefined) {
  return parseCoreProfileInputText(messageText, currentUserRow);
}

function buildCheckoutHandoffReplyText(status: string) {
  switch (status) {
    case "consumed":
      return "Mình đã nhận mã nối checkout rồi. Quay lại trang checkout, OTP sẽ mở ngay trong vài giây.";
    case "expired":
      return "Mã nối checkout này đã hết hạn. Quay lại trang checkout để tạo mã mới rồi gửi lại /checkout CODE.";
    case "not_found":
    case "invalid":
      return "Mã nối checkout không hợp lệ. Quay lại trang checkout để lấy mã mới rồi gửi đúng cú pháp /checkout CODE.";
    default:
      return "Mình chưa nối được checkout cho chat này. Quay lại trang checkout để tạo mã mới rồi thử lại /checkout CODE.";
  }
}

function getSenderChatId(body: any) {
  return safeString(body?.platform_chat_id) ||
    safeString(body?.sender?.original_id) ||
    safeString(body?.sender?.id) ||
    safeString(body?.message?.from?.original_id) ||
    safeString(body?.message?.from?.id) ||
    null;
}

function getSenderDisplayName(body: any) {
  const normalizeNameCandidate = (value: unknown) =>
    safeString(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u0111\u0110]/g, (char) => (char === "\u0111" ? "d" : "D"))
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isPlaceholder = (value: unknown) => {
    const raw = safeString(value).trim();
    if (!raw || /^\d+$/.test(raw)) return true;
    if (/^phone\.\d+@/i.test(raw)) return true;
    if (/^phone[._\s-]*\d+/i.test(raw)) return true;
    const normalized = normalizeNameCandidate(raw);
    if (!normalized) return true;
    return (
      normalized === "fixture zalo" ||
      normalized === "zalo fixture" ||
      normalized === "test zalo" ||
      normalized === "test user" ||
      normalized === "demo user" ||
      normalized.includes("canary") ||
      normalized.includes("fixture") ||
      normalized.includes("sandbox") ||
      normalized.startsWith("phone 84") ||
      normalized.startsWith("phone 0") ||
      normalized.startsWith("phone 9") ||
      normalized === "guest" ||
      normalized === "unknown" ||
      normalized === "user"
    );
  };
  const candidates = [
    safeString(body?.sender?.display_name),
    safeString(body?.sender?.name),
    safeString(body?.message?.from?.display_name),
    safeString(body?.message?.from?.name),
  ];
  for (const candidate of candidates) {
    if (!isPlaceholder(candidate)) return candidate.trim();
  }
  return null;
}

function buildUnavailableTextClean() {
  return "Mình đang gặp lỗi tạm thời ở luồng chat. Bạn thử lại sau ít phút hoặc dùng /daily và /weekly giúp mình nhé.";
}

async function sendGatewayReply(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  text: string,
  meta: Record<string, unknown> = {},
) {
  if (!userId || !text.trim()) return null;
  return sendZaloBrokerPayload(admin, {
    payload: buildTextPayload(userId, text),
    receipt: {
      source_message_id: safeString(meta.sourceMessageId) || safeString(meta.traceId) || `${Date.now()}`,
      trace_id: safeString(meta.traceId) || null,
      route: safeString(meta.route) || "CHAT",
      action: safeString(meta.action) || "send_reply",
      user_id: toNullableInteger(meta.userId),
      customer_id: toNullableInteger(meta.customerId),
    },
  });
}

async function sendBestEffortFallbackReply(
  admin: ReturnType<typeof createServiceRoleClient>,
  senderId: string,
  meta: Record<string, unknown> = {},
) {
  if (!senderId) return "missing_sender";
  try {
    const access = await resolveZaloGatewayAccess(admin, senderId);
    const replyMeta = {
      sourceMessageId: safeString(meta.sourceMessageId) || safeString(meta.traceId) || null,
      traceId: safeString(meta.traceId) || null,
      route: safeString(meta.route) || "CHAT",
      userId: toNullableInteger(access.linkedUserId || access.context?.linkedUserId || null),
      customerId: toNullableInteger(access.customerId || access.context?.customerId || null),
    };
    if (!access.linked) {
      await sendGatewayReply(admin, senderId, await buildLinkRequiredTextClean(admin, access), {
        ...replyMeta,
        action: "auth_gate_fallback",
      });
      return "auth_gate";
    }
  } catch {
    // Fall through to generic unavailable text below.
  }

  await sendGatewayReply(admin, senderId, buildUnavailableTextClean(), {
    sourceMessageId: safeString(meta.sourceMessageId) || safeString(meta.traceId) || null,
    traceId: safeString(meta.traceId) || null,
    route: safeString(meta.route) || "CHAT",
    action: "unavailable_fallback",
  });
  return "unavailable";
}

async function tryHandleDirectSummaryReply(
  admin: ReturnType<typeof createServiceRoleClient>,
  access: Awaited<ReturnType<typeof resolveZaloGatewayAccess>>,
  normalized: string,
) {
  if (!access.linked || !access.context) return null;
  const isDaily = /^(?:\/)?(daily|homnay|stats)$/.test(normalized);
  const isWeekly = /^(?:\/)?(tuannay|weekly)$/.test(normalized);
  const isMonthly = /^(?:\/)?(?:thangnay|thang nay|monthly)$/.test(normalized);
  if (!isDaily && !isWeekly && !isMonthly) return null;

  const period = isDaily ? "day" : isMonthly ? "month" : "week";
  let summary: Record<string, any> | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      summary = await getDashboardSummary(admin, access.context, period) as Record<string, any>;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  }
  if (!summary) {
    throw lastError instanceof Error ? lastError : new Error("dashboard_summary_failed");
  }
  const text = isDaily
    ? buildDailySummaryText(summary as Record<string, any>)
    : isMonthly
      ? buildMonthlySummaryText(summary as Record<string, any>)
      : buildWeeklySummaryText(summary as Record<string, any>);
  return {
    mode: isDaily ? "daily" : isMonthly ? "thangnay" : "tuannay",
    text,
  };
}

async function tryHandleDirectWaterLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  access: Awaited<ReturnType<typeof resolveZaloGatewayAccess>>,
  normalized: string,
  sourceMessageId: string,
  traceId: string | null,
) {
  if (!access.linked || !access.context?.userRow) return null;
  const amountMl = parseBasicWaterAmountMl(normalized);
  if (!amountMl) return null;

  const currentUserRow = access.context.userRow as Record<string, unknown>;
  const userId = Number(currentUserRow.id || 0);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  const summary = await logWaterForUser(admin, {
    userId,
    amountMl,
    sourceMessageId: sourceMessageId || null,
    traceId: traceId || null,
    sourceChannel: "zalo",
  });
  const nextPendingIntent = clonePlainObject(
    parsePendingIntentStateLite(currentUserRow.pending_intent ?? {}),
  );
  nextPendingIntent.last_water_log = {
    date_local: safeString(summary.date_local) || getSaigonDateKey(),
    amount_ml: Number(amountMl) || 0,
    total_ml: Number(summary.total_ml) || 0,
    goal_ml: Number(summary.goal_ml) || 0,
    remaining_ml: Number(summary.remaining_ml) || 0,
    pct: Number(summary.pct) || 0,
    storage_mode: safeString(summary.storage_mode) || "compat",
    source_channel: "zalo",
    source_message_id: sourceMessageId || null,
    trace_id: traceId || null,
    logged_at: new Date().toISOString(),
  };
  nextPendingIntent.last_terminal_trace = {
    channel: "zalo",
    source_message_id: sourceMessageId || null,
    trace_id: traceId || null,
    route: "CHAT",
    action: "water_log",
    action_status: "water_logged",
    completed_at: new Date().toISOString(),
  };
  await persistPendingIntent(admin, currentUserRow, nextPendingIntent);

  return {
    mode: "water_log",
    text: [
      `Đã ghi ${formatIntVi(amountMl)} ml nước cho bạn.`,
      `- Hôm nay: ${formatIntVi(summary.total_ml)} / ${formatIntVi(summary.goal_ml)} ml (${formatIntVi(summary.pct)}%)`,
      `- Còn lại: ${formatIntVi(summary.remaining_ml)} ml`,
    ].join("\n"),
  };
}

async function tryHandleGatewayHotfix(parsedBody: any, traceId?: string) {
  const admin = createServiceRoleClient();
  const senderId = getSenderId(parsedBody);
  if (!senderId) return { handled: false };
  const accessSenderId =
    safeString(parsedBody?.platform_chat_id) ||
    safeString(parsedBody?.sender?.original_id) ||
    safeString(parsedBody?.message?.from?.original_id) ||
    senderId;
  const replyRecipientId =
    safeString(parsedBody?.platform_chat_id) ||
    safeString(parsedBody?.sender?.original_id) ||
    safeString(parsedBody?.message?.from?.original_id) ||
    safeString(parsedBody?.message?.from?.id) ||
    safeString(parsedBody?.sender?.id) ||
    senderId;

  const messageText = getIncomingText(parsedBody).trim();
  const normalized = normalizeCommandText(messageText);
  const isText = Boolean(messageText);
  const sourceMessageId = getSourceMessageId(parsedBody, traceId);
  const sendAccesslessDirectReply = async (text: string, action: string, mode: string) => {
    const startedAt = Date.now();
    let resolvedAccessMeta: Record<string, unknown> | null = null;
    try {
      const access = await resolveZaloGatewayAccess(admin, accessSenderId);
      resolvedAccessMeta = {
        userId: toNullableInteger(access.linkedUserId || access.context?.linkedUserId || access.context?.userRow?.id || access.senderUserRow?.id || null),
        customerId: toNullableInteger(access.customerId || access.context?.customerId || access.context?.userRow?.customer_id || access.senderUserRow?.customer_id || null),
      };
    } catch {
      resolvedAccessMeta = null;
    }
    const brokerStartedAt = Date.now();
    const brokerResult = await sendGatewayReply(admin, replyRecipientId, text, {
      sourceMessageId,
      traceId: safeString(traceId) || null,
      route: "CHAT",
      action,
      userId: resolvedAccessMeta?.userId ?? null,
      customerId: resolvedAccessMeta?.customerId ?? null,
    });
    return {
      handled: true,
      mode,
      route_class: "direct" as const,
      reply_text: text,
      user_id: resolvedAccessMeta?.userId ?? null,
      customer_id: resolvedAccessMeta?.customerId ?? null,
      compute_latency_ms: Math.max(0, brokerStartedAt - startedAt),
      pre_ack_sent: false,
      pre_ack_latency_ms: null,
      broker_send_latency_ms: Date.now() - brokerStartedAt,
      send_accepted: Boolean(brokerResult && (brokerResult.accepted === true || brokerResult.deduped === true)),
      send_reason: safeString(brokerResult?.reason) || null,
      send_http_status: Number.isFinite(Number(brokerResult?.http_status)) ? Number(brokerResult?.http_status) : null,
      send_error_message: safeString(brokerResult?.provider_error || brokerResult?.reason) || null,
    };
  };

  if (isText && /^(hi|hello|hey|xin chao|chao)$/.test(normalized)) {
    return sendAccesslessDirectReply(buildGreetingTextClean(), "greeting", "greeting");
  }

  if (isText && /^(\/)?(help|menu)$/.test(normalized)) {
    return sendAccesslessDirectReply(buildHelpTextClean(false), "help", "help");
  }

  if (isText && /^(\/)?quickaction$/.test(normalized)) {
    return sendAccesslessDirectReply(buildQuickActionTextClean(), "quickaction", "quickaction");
  }

  const access = await resolveZaloGatewayAccess(admin, accessSenderId);
  const currentUserRow = (
    access.context?.userRow ||
    (!access.linked ? access.senderUserRow : null) ||
    null
  ) as Record<string, unknown> | null;
  const currentPendingIntent = parsePendingIntentStateLite(
    currentUserRow?.pending_intent ?? access.context?.userRow?.pending_intent ?? {},
  );
  const directTextLookupCandidate = readFreshTextLookupConfirmCandidate(currentPendingIntent);
  const directImageReviewCandidate = readFreshImageReviewConfirmCandidate(currentPendingIntent);
  const replyMetaBase = {
    sourceMessageId,
    traceId: safeString(traceId) || null,
    route: "CHAT",
    userId: toNullableInteger(access.linkedUserId || access.context?.linkedUserId || currentUserRow?.id || access.senderUserRow?.id || null),
    customerId: toNullableInteger(access.customerId || access.context?.customerId || currentUserRow?.customer_id || access.senderUserRow?.customer_id || null),
  };
  const sendDirectReply = async (text: string, action: string, mode: string) => {
    const finalText = ["greeting", "help", "onboarding_completed"].includes(action)
      ? `${text}${getTrialRenewalReminderText(access) || ""}`
      : text;
    const startedAt = Date.now();
    const brokerStartedAt = Date.now();
    const brokerResult = await sendGatewayReply(admin, replyRecipientId, finalText, {
      ...replyMetaBase,
      action,
    });
    return {
      handled: true,
      mode,
      route_class: "direct" as const,
      reply_text: finalText,
      user_id: replyMetaBase.userId ?? null,
      customer_id: replyMetaBase.customerId ?? null,
      compute_latency_ms: Math.max(0, brokerStartedAt - startedAt),
      pre_ack_sent: false,
      pre_ack_latency_ms: null,
      broker_send_latency_ms: Date.now() - brokerStartedAt,
      send_accepted: Boolean(brokerResult && (brokerResult.accepted === true || brokerResult.deduped === true)),
      send_reason: safeString(brokerResult?.reason) || null,
      send_http_status: Number.isFinite(Number(brokerResult?.http_status)) ? Number(brokerResult?.http_status) : null,
      send_error_message: safeString(brokerResult?.provider_error || brokerResult?.reason) || null,
    };
  };
  const onboardingContext =
    access.context && typeof access.context === "object"
      ? (access.context as Record<string, unknown>)
      : {
          customerId: access.customerId,
          linkedUserId: access.linkedUserId,
          userRow: currentUserRow,
          customerRow: null,
        };
  const profileReady = hasCoreProfile(currentUserRow);
  const needsOnboarding = Boolean(access.linked && !profileReady);
  const isOnboardingCommand = /^(\/)?onboarding(?:\s+reset)?$/.test(normalized);
  const isOnboardingReset = /^(\/)?onboarding\s+reset$/.test(normalized);
  const checkoutHandoffCode = extractCheckoutHandoffCode(messageText);
  const claimRedeemCode = extractClaimRedeemCode(messageText);

  if (isText && checkoutHandoffCode) {
    const checkoutResult = await consumeZaloCheckoutHandoff(admin, {
      handoffCode: checkoutHandoffCode,
      senderId,
      senderChatId: getSenderChatId(parsedBody),
      displayName: getSenderDisplayName(parsedBody),
    });
    return sendDirectReply(buildCheckoutHandoffReplyText(checkoutResult.status), "checkout_handoff", "checkout_handoff");
  }

  if (isText && claimRedeemCode && !access.linked) {
    const senderChatId = getSenderChatId(parsedBody);
    const displayName = getSenderDisplayName(parsedBody);
    try {
      const linkedContext = await resolveLinkContextFromWebhook({
        senderId,
        senderChatId,
        displayName,
        messageText,
      });
      const linkedContextStatus =
        safeString(linkedContext?.link_status) || safeString((linkedContext?.link_result as Record<string, unknown> | undefined)?.status);
      const linkedNow =
        linkedContextStatus === "linked" &&
        (Number.parseInt(String(linkedContext?.customer_id ?? ""), 10) > 0 ||
          Number.parseInt(String((linkedContext?.link_result as Record<string, unknown> | undefined)?.customer_id ?? ""), 10) > 0);
      if (linkedNow) {
        const linkReply =
          safeString((linkedContext?.link_result as Record<string, unknown> | undefined)?.helper_text) ||
          "Da noi Zalo vao tai khoan CaloTrack thanh cong. Bay gio ban co the chat va log ngay trong Zalo nay.";
        return sendAccesslessDirectReply(linkReply, "channel_link_redeem", "channel_link_redeem");
      }
    } catch (error) {
      console.warn("[zalo-oa-webhook] channel_link_redeem_failed", {
        traceId: traceId || null,
        senderId,
        claimRedeemCode,
        message: String((error as Error)?.message || error || "channel_link_redeem_failed"),
      });
    }
    try {
      if (/^[A-F0-9]{8}$/i.test(claimRedeemCode)) {
        const redeemPayload = await redeemZaloClaimCode({
          code: claimRedeemCode,
          senderId,
          senderChatId,
          displayName,
          mode: "exact",
          traceId,
          sourceMessageId,
        });
        const redeemStatus = safeString((redeemPayload as Record<string, unknown>)?.status) || "invalid_claim";
        const redeemReply =
          safeString((redeemPayload as Record<string, unknown>)?.reply_text) ||
          await buildLinkRequiredTextClean(admin, access);
        return sendAccesslessDirectReply(redeemReply, `claim_redeem_${redeemStatus}`, "claim_redeem");
      }
    } catch (error) {
      console.warn("[zalo-oa-webhook] phone_claim_redeem_failed", {
        traceId: traceId || null,
        senderId,
        claimRedeemCode,
        message: String((error as Error)?.message || error || "phone_claim_redeem_failed"),
      });
    }
  }

  if (isText && !access.linked) {
    console.warn("[zalo-oa-webhook] auth_gate_blocked", {
      traceId: traceId || null,
      senderId,
      authUserId: access.authUserId,
      customerId: access.customerId,
      truthState: access.truthState,
      actionStatus: "phone_gate_blocked",
      bridgeStatus: access.bridgeStatus,
      chatLinkStatus: access.chatLinkStatus,
      blockedReason: access.blockedReason,
      errorCode: access.blockedReason || (access.repairRequired ? "repair_required" : "phone_gate_blocked"),
      phoneE164: access.phoneE164,
      challengeIdentityKnown: access.challengeIdentityKnown,
      repairAttempted: access.repairAttempted,
    });
    return sendDirectReply(await buildLinkRequiredTextClean(admin, access), "auth_gate", "auth_gate");
  }

  if (isText) {
    const directGoalMode = await handleDirectGoalMode(admin, access, messageText);
    if (directGoalMode?.handled) {
      return sendDirectReply(
        safeString(directGoalMode.replyText || directGoalMode.legacyReplyText),
        "goal_mode_direct",
        "goal_mode_direct",
      );
    }

    const directExercise = await handleDirectExerciseLog(admin, access, messageText);
    if (directExercise?.handled) {
      return sendDirectReply(
        safeString(directExercise.replyText || directExercise.legacyReplyText),
        "exercise_log_direct",
        "exercise_log_direct",
      );
    }
  }

  if (isText && !isSaveConfirmPhrase(normalized) && hasImageReviewPendingState(currentPendingIntent)) {
    const subsetCandidate = directImageReviewCandidate
      ? buildImageReviewSubsetCandidate(messageText, directImageReviewCandidate, {
          sourceMessageId,
          traceId: replyMetaBase.traceId,
        })
      : null;
    if (subsetCandidate && currentUserRow) {
      const nextPendingIntent = persistImageReviewSubsetState(currentPendingIntent, subsetCandidate);
      await persistPendingIntent(admin, currentUserRow, nextPendingIntent);
      return sendDirectReply(
        buildImageReviewSubsetReply(subsetCandidate),
        "image_followup_review",
        "image_followup_review",
      );
    }
  }

  if (isText && isSaveConfirmPhrase(normalized) && directTextLookupCandidate && access.linked && currentUserRow?.id) {
    const saveResult = await saveTextLookupConfirmCandidate(
      admin,
      {
        userId: replyMetaBase.userId,
        customerId: replyMetaBase.customerId,
        sourceMessageId,
        traceId: replyMetaBase.traceId,
        timeZone: safeString(currentUserRow?.timezone) || safeString(access.context?.timeZone) || "Asia/Ho_Chi_Minh",
        pendingIntent: currentPendingIntent,
      },
      directTextLookupCandidate,
    );
    if (!saveResult.deduped && saveResult.nextPendingIntent && currentUserRow) {
      await persistPendingIntent(admin, currentUserRow, saveResult.nextPendingIntent);
    }
    return sendDirectReply(
      [
        `✅ Mình đã lưu ${safeString(directTextLookupCandidate.food_name || "món vừa tra cứu")} vào nhật ký cho bạn rồi.`,
        `- Calories: ${formatIntVi(directTextLookupCandidate.total_calories)} kcal`,
        `- Protein: ${formatFloatVi(directTextLookupCandidate.total_protein)}g | Carbs: ${formatFloatVi(directTextLookupCandidate.total_carbs)}g | Fat: ${formatFloatVi(directTextLookupCandidate.total_fat)}g`,
      ].join("\n"),
      "save_confirm_text_lookup",
      "save_confirm_text_lookup",
    );
  }

  if (isText && isSaveConfirmPhrase(normalized) && hasImageReviewPendingState(currentPendingIntent)) {
    if (access.linked && currentUserRow?.id && directImageReviewCandidate) {
      const saveResult = await saveImageReviewConfirmCandidate(
        admin,
        {
          userId: replyMetaBase.userId,
          customerId: replyMetaBase.customerId,
          sourceMessageId,
          traceId: replyMetaBase.traceId,
          timeZone: safeString(currentUserRow?.timezone) || safeString(access.context?.timeZone) || "Asia/Ho_Chi_Minh",
          pendingIntent: currentPendingIntent,
        },
        directImageReviewCandidate,
      );
      if (saveResult.nextPendingIntent && currentUserRow) {
        await persistPendingIntent(admin, currentUserRow, saveResult.nextPendingIntent);
      }
      return sendDirectReply(
        [
          `✅ Món ${safeString(directImageReviewCandidate.title || "bữa ăn từ ảnh")} đã được ghi lại rồi nha bạn!`,
          `- Calories: ${formatIntVi(directImageReviewCandidate.total_calories)} kcal`,
          `- Protein: ${formatFloatVi(directImageReviewCandidate.total_protein)}g | Carbs: ${formatFloatVi(directImageReviewCandidate.total_carbs)}g | Fat: ${formatFloatVi(directImageReviewCandidate.total_fat)}g`,
        ].join("\n"),
        "log_confirm",
        "save_confirm_image_review",
      );
    }

    if (currentUserRow) {
      const clearedPendingIntent = clearImageReviewPendingState(currentPendingIntent, directImageReviewCandidate, {
        sourceMessageId,
        traceId: replyMetaBase.traceId,
      });
      await persistPendingIntent(admin, currentUserRow, clearedPendingIntent);
    }
    return sendDirectReply(
      "Mình không còn review ảnh đang chờ lưu. Bạn gửi lại ảnh hoặc dùng /log để ghi thủ công nhé.",
      "save_confirm_missing_image_review",
      "save_confirm_missing_image_review",
    );
  }

  if (isText && isSaveConfirmPhrase(normalized) && !hasSaveablePendingState(currentPendingIntent)) {
    const recoveredLookupCandidate =
      access.linked && currentUserRow?.id
        ? await findRecentLookupReplyConfirmCandidate(admin, currentUserRow.id)
        : null;
    if (recoveredLookupCandidate) {
      const saveResult = await saveTextLookupConfirmCandidate(
        admin,
        {
          userId: replyMetaBase.userId,
          customerId: replyMetaBase.customerId,
          sourceMessageId,
          traceId: replyMetaBase.traceId,
          timeZone: safeString(currentUserRow?.timezone) || safeString(access.context?.timeZone) || "Asia/Ho_Chi_Minh",
          pendingIntent: currentPendingIntent,
        },
        recoveredLookupCandidate,
      );
      if (!saveResult.deduped && saveResult.nextPendingIntent && currentUserRow) {
        await persistPendingIntent(admin, currentUserRow, saveResult.nextPendingIntent);
      }
      return sendDirectReply(
        [
          `✅ Mình đã lưu ${safeString(recoveredLookupCandidate.food_name || "món vừa tra cứu")} vào nhật ký cho bạn rồi.`,
          `- Calories: ${formatIntVi(recoveredLookupCandidate.total_calories)} kcal`,
          `- Protein: ${formatFloatVi(recoveredLookupCandidate.total_protein)}g | Carbs: ${formatFloatVi(recoveredLookupCandidate.total_carbs)}g | Fat: ${formatFloatVi(recoveredLookupCandidate.total_fat)}g`,
        ].join("\n"),
        "save_confirm_text_lookup_recovered",
        "save_confirm_text_lookup_recovered",
      );
    }
    const nextPendingIntent = clonePlainObject(currentPendingIntent);
    if (nextPendingIntent.confirm_candidate) {
      delete nextPendingIntent.confirm_candidate;
      await persistPendingIntent(admin, currentUserRow, nextPendingIntent);
    }
    return sendDirectReply(
      "Mình chưa có món nào để lưu. Bạn vui lòng nhắn /log <tên món> để ghi thủ công nhé.",
      "save_confirm_missing",
      "save_confirm_missing",
    );
  }

  if (isText && isOnboardingCommand) {
    if (!isOnboardingReset) {
      return sendDirectReply(
        profileReady
          ? buildOnboardingCompletedTextClean(currentUserRow || {})
          : buildOnboardingProfileTextClean(currentUserRow, {
              includeSnapshot: true,
            }),
        "onboarding_view",
        "onboarding_view",
      );
    }

    const result = await upsertCoreProfileForContext({
      admin,
      context: onboardingContext,
      input: {},
      phoneE164: access.phoneE164,
      resetOnly: isOnboardingReset,
    });
    const snapshotRow = {
      ...(currentUserRow || {}),
      gender: result.gender,
      age: result.age,
      height_cm: result.height_cm,
      weight_kg: result.weight_kg,
      activity_level: result.activity_level,
    };
    return sendDirectReply(
      result.onboarding_complete
        ? buildOnboardingCompletedTextClean(result as Record<string, unknown>)
        : buildOnboardingProfileTextClean(snapshotRow, {
            includeSnapshot: true,
            leadingLine: isOnboardingReset ? "Mình đã mở lại flow hồ sơ cốt lõi cho bạn." : null,
          }),
      "onboarding_reset",
      "onboarding_reset",
    );
  }

  if (isText && needsOnboarding) {
    const parsedProfileInput = parseOnboardingProfileInput(messageText, currentUserRow);
    if (parsedProfileInput.matchedFields.length) {
      const result = await upsertCoreProfileForContext({
        admin,
        context: onboardingContext,
        input: parsedProfileInput.patch,
        phoneE164: access.phoneE164,
      });
      if (result.onboarding_complete) {
        return sendDirectReply(
          buildOnboardingCompletedTextClean(result as Record<string, unknown>),
          "onboarding_completed",
          "onboarding_completed",
        );
      }

      const snapshotRow = {
        ...(currentUserRow || {}),
        gender: result.gender,
        age: result.age,
        height_cm: result.height_cm,
        weight_kg: result.weight_kg,
        activity_level: result.activity_level,
      };
      return sendDirectReply(
        buildOnboardingProfileTextClean(snapshotRow, {
          includeSnapshot: true,
          leadingLine: "Mình đã lưu phần hồ sơ đọc được từ tin nhắn của bạn.",
        }),
        "onboarding_profile_intake",
        "onboarding_profile_intake",
      );
    }

    console.warn("[zalo-oa-webhook] profile_gate_blocked", {
      traceId: traceId || null,
      senderId,
      authUserId: access.authUserId,
      customerId: access.customerId,
      truthState: access.truthState,
      actionStatus: "profile_gate_blocked",
      bridgeStatus: access.bridgeStatus,
      chatLinkStatus: access.chatLinkStatus,
      blockedReason: access.blockedReason,
      errorCode: "onboarding_incomplete",
      needsOnboarding: true,
      onboardingReason: "onboarding_incomplete",
      profileReady,
      onboardingSurfaceForced: true,
    });
    return sendDirectReply(
      buildOnboardingProfileTextClean(currentUserRow, {
        includeSnapshot: false,
      }),
      "profile_gate",
      "profile_gate",
    );
  }

  if (isText && /\bbmr\b/.test(normalized) && /\b(la gi|la sao|nghia la gi)\b/.test(normalized)) {
    return sendDirectReply(buildBmrExplainText(), "bmr_explain", "bmr_explain");
  }

  if (isText && /\btdee\b/.test(normalized) && /\b(la gi|la sao|nghia la gi)\b/.test(normalized)) {
    return sendDirectReply(buildTdeeExplainText(), "tdee_explain", "tdee_explain");
  }

  const directWeightMatch = safeString(messageText).trim().match(/^\/?can\s+(\d{2,3}(?:[.,]\d)?)(?:\s*kg)?$/i);
  if (isText && directWeightMatch) {
    const weightKg = Number.parseFloat(String(directWeightMatch[1] || "").replace(",", "."));
    if (Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 400) {
      const result = await upsertCoreProfileForContext({
        admin,
        context: onboardingContext,
        input: {
          weight_kg: weightKg,
        },
        phoneE164: access.phoneE164,
      });
      const lines = [`✅ Đã cập nhật cân nặng: ${weightKg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg.`];
      if (Number.isFinite(Number(result.tdee))) {
        lines.push(`- TDEE: ${Math.round(Number(result.tdee)).toLocaleString("vi-VN")} kcal`);
      }
      if (Number.isFinite(Number(result.daily_calorie_goal))) {
        lines.push(`- Mục tiêu ngày: ${Math.round(Number(result.daily_calorie_goal)).toLocaleString("vi-VN")} kcal`);
      }
      return sendDirectReply(lines.join("\n"), "weight_update_direct", "weight_update_direct");
    }
  }

  if (isText && /^(?:\/)?gym(?:\s+status)?$/.test(normalized)) {
    const gymState = readGymModeState(currentPendingIntent);
    if (!gymState.enabled && currentPendingIntent.gym_mode) {
      const nextPendingIntent = clonePlainObject(currentPendingIntent);
      delete nextPendingIntent.gym_mode;
      await persistPendingIntent(admin, currentUserRow, nextPendingIntent);
    }
    return sendDirectReply(buildGymStatusReplyText(gymState), "gym_status_direct", "gym_status_direct");
  }

  if (isText && /^(?:\/)?tips\s+gym$/.test(normalized)) {
    return sendDirectReply(buildGymTipsReplyText(), "tips_gym_direct", "tips_gym_direct");
  }

  if (isText && /^(?:\/)?gym(?:\s+(?:off|finish|done|xong|tat|dung|ket thuc))$/.test(normalized)) {
    const nextPendingIntent = clonePlainObject(currentPendingIntent);
    delete nextPendingIntent.gym_mode;
    await persistPendingIntent(admin, currentUserRow, nextPendingIntent);
    return sendDirectReply("🏋️ Đã tắt gym mode. Khi cần bật lại, nhắn /gym on.", "gym_off_direct", "gym_off_direct");
  }

  if (
    isText &&
    isLikelyShortFillerMessage(messageText, normalized) &&
    !hasPendingInteractiveState(currentPendingIntent) &&
    !readGymModeState(currentPendingIntent).enabled
  ) {
    return sendDirectReply("CaloTrack ghi nhận rồi. Khi cần gì cứ nhắn tiếp nhé.", "short_ack_direct", "short_ack_direct");
  }

  if (isText) {
    const directSummary = await tryHandleDirectSummaryReply(admin, access, normalized);
    if (directSummary) {
      return sendDirectReply(directSummary.text, directSummary.mode, directSummary.mode);
    }

    const directWater = await tryHandleDirectWaterLog(
      admin,
      access,
      normalized,
      sourceMessageId,
      safeString(traceId) || null,
    );
    if (directWater) {
      return sendDirectReply(directWater.text, directWater.mode, directWater.mode);
    }
  }

  return {
    handled: false,
    senderId,
    debug: {
      is_text: isText,
      normalized,
      save_confirm_phrase: isSaveConfirmPhrase(normalized),
      linked: access.linked,
      user_id: replyMetaBase.userId ?? null,
      has_image_review_pending: hasImageReviewPendingState(currentPendingIntent),
      has_saveable_pending: hasSaveablePendingState(currentPendingIntent),
      has_text_lookup_candidate: Boolean(directTextLookupCandidate),
      has_image_review_candidate: Boolean(directImageReviewCandidate),
    },
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
    const providedInternalSecret = getInternalKeyCandidate(req);
    const internalVerifiedHeader = safeString(req.headers["x-calotrack-verified"]).trim().toLowerCase();
    const internalTrusted = Boolean(
      internalSecret &&
      providedInternalSecret &&
      providedInternalSecret === internalSecret &&
      (!internalVerifiedHeader || ["true", "1", "yes"].includes(internalVerifiedHeader)),
    );

    if (!secretKey || !internalSecret) {
      sendJson(res, 500, {
        ok: false,
        error: "missing_adapter_config",
        signatureReady: Boolean(secretKey),
        internalSecretReady: Boolean(internalSecret),
      });
      return;
    }

    if (!signatureValid && !internalTrusted) {
      sendJson(res, 401, {
        ok: false,
        error: "invalid_signature",
      });
      return;
    }

    parsedBody = normalizeSenderEnvelope(parsedBody);
    parsedBody = rewriteZaloBodyMediaUrls(parsedBody, {
      siteUrl: safeString(process.env.CANARY_SITE_URL || process.env.SITE_URL || "https://calotrack.pro"),
    });
    const normalizedRawBody = JSON.stringify(parsedBody);
    const traceId = buildTraceId(normalizedRawBody, parsedBody);
    const requestStartedAtMs = Date.now();
    const requestAdmin = createServiceRoleClient();
    const sourceMessageId = getSourceMessageId(parsedBody, traceId);
    const senderId = getSenderId(parsedBody);
    const accessSenderId =
      safeString((parsedBody as any)?.platform_chat_id) ||
      safeString((parsedBody as any)?.sender?.original_id) ||
      safeString((parsedBody as any)?.message?.from?.original_id) ||
      senderId;
    const ingressReceipt = await upsertWebhookIngressReceipt(requestAdmin, {
      sourceMessageId,
      traceId,
      route: "CHAT",
    });
    let ingressFallbackUserId: number | null = null;
    let ingressFallbackClaim: {
      claimed: boolean;
      deduped: boolean;
      reason: string;
      claim: Record<string, unknown> | null;
    } | null = null;
    if (!ingressReceipt && senderId) {
      try {
        const ingressAccess = await resolveZaloGatewayAccess(requestAdmin, accessSenderId);
        ingressFallbackUserId = toNullableInteger(
          ingressAccess.linkedUserId ||
            ingressAccess.context?.linkedUserId ||
            ingressAccess.context?.userRow?.id ||
            ingressAccess.senderUserRow?.id ||
            null,
        );
        ingressFallbackClaim = await acquirePendingIngressFallbackClaim(requestAdmin, ingressFallbackUserId, {
          sourceMessageId,
          traceId,
        });
      } catch {
        ingressFallbackClaim = null;
      }
    }
    const forwardHeaders: Record<string, string> = {};

    if (ingressReceipt?.is_duplicate === true && isTerminalReceiptState(ingressReceipt?.action_status)) {
      const finalResponseLatencyMs = Date.now() - requestStartedAtMs;
      setLatencyHeaders(res, {
        routeClass: "workflow",
        preAckSent: false,
        preAckLatencyMs: null,
        computeLatencyMs: finalResponseLatencyMs,
        finalResponseLatencyMs,
        brokerSendLatencyMs: null,
      });
      sendJson(res, 200, {
        ok: true,
        handledBy: "ingress_dedupe",
        traceId,
        route_class: "workflow",
        deduped: true,
        source_message_id: sourceMessageId,
        ingress_receipt_id: ingressReceipt?.receipt_id ?? null,
        ingress_action_status: ingressReceipt?.action_status ?? null,
        final_response_latency_ms: finalResponseLatencyMs,
        compute_latency_ms: finalResponseLatencyMs,
        broker_send_latency_ms: null,
      });
      return;
    }

    if (ingressFallbackClaim?.deduped) {
      const finalResponseLatencyMs = Date.now() - requestStartedAtMs;
      setLatencyHeaders(res, {
        routeClass: "workflow",
        preAckSent: false,
        preAckLatencyMs: null,
        computeLatencyMs: finalResponseLatencyMs,
        finalResponseLatencyMs,
        brokerSendLatencyMs: null,
      });
      sendJson(res, 200, {
        ok: true,
        handledBy: "ingress_dedupe_fallback",
        traceId,
        route_class: "workflow",
        deduped: true,
        source_message_id: sourceMessageId,
        ingress_receipt_id: null,
        ingress_action_status: safeString(ingressFallbackClaim?.claim?.action_status) || null,
        ingress_user_id: ingressFallbackUserId,
        dedupe_reason: ingressFallbackClaim.reason,
        final_response_latency_ms: finalResponseLatencyMs,
        compute_latency_ms: finalResponseLatencyMs,
        broker_send_latency_ms: null,
      });
      return;
    }

    const gatewayHandled = await tryHandleGatewayHotfix(parsedBody, traceId).catch((error) => ({
      handled: false,
      gatewayError: error instanceof Error ? error.message : String(error || "gateway_hotfix_failed"),
    }));

    if (gatewayHandled?.handled) {
      const finalResponseLatencyMs = Date.now() - requestStartedAtMs;
      const brokerSendLatencyMs =
        Number.isFinite(Number((gatewayHandled as any)?.broker_send_latency_ms))
          ? Number((gatewayHandled as any).broker_send_latency_ms)
          : null;
      const computeLatencyMs =
        Number.isFinite(Number((gatewayHandled as any)?.compute_latency_ms))
          ? Number((gatewayHandled as any).compute_latency_ms)
          : brokerSendLatencyMs == null
            ? finalResponseLatencyMs
            : Math.max(0, finalResponseLatencyMs - brokerSendLatencyMs);
      await completeWebhookIngressReceipt(requestAdmin, ingressReceipt?.receipt_id, {
        actionStatus: (gatewayHandled as any)?.send_accepted === false ? "failed_with_trace" : "completed",
        errorCode: safeString((gatewayHandled as any)?.send_error_message) || null,
      });
      await completePendingIngressFallbackClaim(requestAdmin, ingressFallbackUserId, {
        sourceMessageId,
        traceId,
        actionStatus: (gatewayHandled as any)?.send_accepted === false ? "failed_with_trace" : "completed",
        errorCode: safeString((gatewayHandled as any)?.send_error_message) || null,
      });
      setLatencyHeaders(res, {
        routeClass: "direct",
        preAckSent: false,
        preAckLatencyMs: null,
        computeLatencyMs,
        finalResponseLatencyMs,
        brokerSendLatencyMs,
      });
      sendJson(res, 200, {
        ok: true,
        handledBy: "gateway",
        mode: (gatewayHandled as any).mode || "unknown",
        traceId,
        route_class: "direct",
        reply_text: (gatewayHandled as any).reply_text || null,
        user_id: (gatewayHandled as any).user_id ?? null,
        customer_id: (gatewayHandled as any).customer_id ?? null,
        send_accepted: (gatewayHandled as any).send_accepted ?? null,
        send_reason: (gatewayHandled as any).send_reason || null,
        send_http_status: (gatewayHandled as any).send_http_status ?? null,
        send_error_message: (gatewayHandled as any).send_error_message || null,
        pre_ack_sent: false,
        pre_ack_latency_ms: null,
        compute_latency_ms: computeLatencyMs,
        final_response_latency_ms: finalResponseLatencyMs,
        broker_send_latency_ms: brokerSendLatencyMs,
      });
      return;
    }

    const preAckRecipientId =
      safeString((parsedBody as any)?.platform_chat_id) ||
      safeString((parsedBody as any)?.sender?.original_id) ||
      safeString((parsedBody as any)?.message?.from?.original_id) ||
      safeString((parsedBody as any)?.message?.from?.id) ||
      safeString((parsedBody as any)?.sender?.id) ||
      senderId;
    const normalizedIncoming = normalizeCommandText(getIncomingText(parsedBody));
    const hasAttachment = Array.isArray((parsedBody as any)?.message?.attachments) &&
      (parsedBody as any).message.attachments.length > 0;
    const preAckKind = resolveWorkflowPreAckKind(normalizedIncoming, hasAttachment);
    let preAckSent = false;
    let preAckAttempted = false;
    let preAckAccepted: boolean | null = null;
    let preAckLatencyMs: number | null = null;
    let brokerSendLatencyMs: number | null = null;
    let preAckSendReason: string | null = null;
    let preAckSendError: string | null = null;
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

    const upstreamResponsePromise = fetch(upstream, {
      method: "POST",
      headers: forwardHeaders,
      body: normalizedRawBody,
    });
    let upstreamResponse: Response | null = null;
    let shouldSendPreAck = false;
    if (senderId && preAckKind) {
      if (preAckKind === "image") {
        shouldSendPreAck = true;
      } else {
        const upstreamSettledWithinDelay = await Promise.race([
          upstreamResponsePromise.then((response) => {
            upstreamResponse = response;
            return true;
          }),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
        ]);
        shouldSendPreAck = !upstreamSettledWithinDelay;
      }
    }

    if (shouldSendPreAck && senderId && preAckKind) {
      const preAckStartedAtMs = Date.now();
      preAckAttempted = true;
      try {
        const preAckResult = await sendFastPreAckReply(requestAdmin, preAckRecipientId, buildWorkflowPreAckText(preAckKind), {
          sourceMessageId,
          action: "workflow_pre_ack",
        });
        preAckAccepted = Boolean(preAckResult?.accepted === true);
        preAckSent = preAckAccepted;
        preAckSendReason = safeString(preAckResult?.reason) || null;
        preAckSendError = safeString(preAckResult?.provider_error) || null;
      } catch {
        preAckSent = false;
        preAckAccepted = false;
        preAckSendReason = "send_failed";
        preAckSendError = "send_failed";
      }
      preAckLatencyMs = Date.now() - preAckStartedAtMs;
      brokerSendLatencyMs = preAckLatencyMs;
    }

    if (!upstreamResponse) {
      upstreamResponse = await upstreamResponsePromise;
    }

    const upstreamText = await upstreamResponse.text();
    const finalResponseLatencyMs = Date.now() - requestStartedAtMs;
    const computeLatencyMs =
      brokerSendLatencyMs == null
        ? finalResponseLatencyMs
        : Math.max(0, finalResponseLatencyMs - brokerSendLatencyMs);
    setLatencyHeaders(res, {
      routeClass: "workflow",
      preAckSent,
      preAckLatencyMs,
      computeLatencyMs,
      finalResponseLatencyMs,
      brokerSendLatencyMs,
    });
    if ((gatewayHandled as any)?.gatewayError) {
      console.warn("[zalo-oa-webhook] gateway_hotfix_degraded", {
        traceId,
        senderId: getSenderId(parsedBody),
        gatewayError: (gatewayHandled as any).gatewayError,
        errorCode: "gateway_hotfix_degraded",
      });
    }
    if (upstreamResponse.ok) {
      await completeWebhookIngressReceipt(requestAdmin, ingressReceipt?.receipt_id, {
        actionStatus: "completed",
      });
      await completePendingIngressFallbackClaim(requestAdmin, ingressFallbackUserId, {
        sourceMessageId,
        traceId,
        actionStatus: "completed",
      });
      let responseText = upstreamText;
      try {
        const parsed = JSON.parse(upstreamText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const includeInternalDebug =
            safeString(req.headers?.["x-calotrack-verified"]).toLowerCase() === "true" ||
            Boolean(getInternalKeyCandidate(req));
          responseText = JSON.stringify({
            ...(parsed as Record<string, unknown>),
              route_class: "workflow",
              pre_ack_sent: preAckSent,
              pre_ack_attempted: preAckAttempted,
              pre_ack_accepted: preAckAccepted,
              pre_ack_latency_ms: preAckLatencyMs,
              pre_ack_send_reason: preAckSendReason,
              pre_ack_send_error: preAckSendError,
            compute_latency_ms: computeLatencyMs,
            final_response_latency_ms: finalResponseLatencyMs,
            broker_send_latency_ms: brokerSendLatencyMs,
            direct_reply_sla_ms: 1500,
            pre_ack_sla_ms: 800,
            pre_ack_sla_met: preAckSent && (preAckLatencyMs ?? Number.POSITIVE_INFINITY) <= 800,
            ...(includeInternalDebug
              ? {
                  gateway_error: safeString((gatewayHandled as any)?.gatewayError) || null,
                  gateway_debug_mode: (gatewayHandled as any)?.mode || null,
                  gateway_debug: (gatewayHandled as any)?.debug || null,
                }
              : {}),
          });
        }
      } catch {
        // Keep upstream body as-is when response is not JSON.
      }
      res.statusCode = upstreamResponse.status;
      res.setHeader(
        "content-type",
        upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      );
      res.setHeader("cache-control", "no-store");
      res.end(responseText);
      return;
    }

    console.error("[zalo-oa-webhook] upstream_non_ok", {
      traceId,
      senderId: getSenderId(parsedBody),
      upstreamStatus: upstreamResponse.status,
      upstreamBodyPreview: upstreamText.slice(0, 500),
      gatewayError: (gatewayHandled as any)?.gatewayError || null,
      errorCode: "upstream_non_ok",
    });
    await completeWebhookIngressReceipt(requestAdmin, ingressReceipt?.receipt_id, {
      actionStatus: "failed_with_trace",
      errorCode: `upstream_non_ok:${upstreamResponse.status}`,
    });
    await completePendingIngressFallbackClaim(requestAdmin, ingressFallbackUserId, {
      sourceMessageId,
      traceId,
      actionStatus: "failed_with_trace",
      errorCode: `upstream_non_ok:${upstreamResponse.status}`,
    });

    if (senderId) {
      try {
        await sendBestEffortFallbackReply(createServiceRoleClient(), senderId, {
          sourceMessageId,
          traceId,
          route: "CHAT",
        });
      } catch {
        // Ignore direct-send fallback failures; still acknowledge the webhook below.
      }
    }

    sendJson(res, 200, {
      ok: true,
      handledBy: "gateway_fallback",
      traceId,
      upstreamStatus: upstreamResponse.status,
        route_class: "workflow",
        pre_ack_sent: preAckSent,
        pre_ack_attempted: preAckAttempted,
        pre_ack_accepted: preAckAccepted,
        pre_ack_latency_ms: preAckLatencyMs,
        pre_ack_send_reason: preAckSendReason,
        pre_ack_send_error: preAckSendError,
      compute_latency_ms: computeLatencyMs,
      final_response_latency_ms: finalResponseLatencyMs,
      broker_send_latency_ms: brokerSendLatencyMs,
    });
  } catch (error) {
    const senderId = getSenderId((req as any)?.body);
    if (senderId) {
      try {
        await sendBestEffortFallbackReply(createServiceRoleClient(), senderId, {
          sourceMessageId: getSourceMessageId((req as any)?.body),
          route: "CHAT",
        });
      } catch {
        // Best effort only.
      }
    }

    console.error("[zalo-oa-webhook] upstream_unreachable", {
      senderId,
      message: error instanceof Error ? error.message : String(error || "Unknown upstream error"),
    });
    sendJson(res, 502, {
      ok: false,
      error: "upstream_unreachable",
      message: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
}

