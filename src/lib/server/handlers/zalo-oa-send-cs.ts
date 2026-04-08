import {
  readBody,
  sendJson,
  safeString,
} from "../src/lib/server/adminServer.js";
import { normalizePendingIntentState } from "../src/lib/server/zaloGatewayChatServer.js";
import {
  requireZaloBrokerAccess,
  sendZaloCsMessage,
} from "../src/lib/server/zaloOaServer.js";

type AnyRecord = Record<string, any>;

function toNullableInteger(value: unknown) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function mapReceiptStatus(rawValue: unknown, sendAccepted: boolean) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return sendAccepted ? "completed" : "failed_with_trace";
  if (["completed", "degraded", "blocked", "failed_with_trace"].includes(value)) {
    return value;
  }
  if (value.includes("blocked")) return "blocked";
  if (
    value.includes("busy") ||
    value.includes("missing") ||
    value.includes("invalid") ||
    value.includes("unavailable") ||
    value.includes("clarification") ||
    value.includes("skipped") ||
    value.includes("degraded")
  ) {
    return "degraded";
  }
  if (value.includes("error") || value.includes("failed")) {
    return "failed_with_trace";
  }
  return sendAccepted ? "completed" : "failed_with_trace";
}

function normalizeReceiptEnvelope(body: AnyRecord, payload: AnyRecord) {
  const source =
    body.receipt && typeof body.receipt === "object"
      ? body.receipt
      : payload.receipt && typeof payload.receipt === "object"
        ? payload.receipt
        : null;

  if (!source) return null;

  const sourceMessageId =
    safeString(source.source_message_id) ||
    safeString(source.message_id) ||
    safeString(source.client_message_id);
  const action = safeString(source.action) || "send_reply";

  if (!sourceMessageId || !action) return null;

  return {
    channel: "zalo",
    source_message_id: sourceMessageId,
    user_id: toNullableInteger(source.user_id),
    customer_id: toNullableInteger(source.customer_id),
    trace_id: safeString(source.trace_id) || `zalo-send:${sourceMessageId}:${action}`,
    route: safeString(source.route),
    action,
    action_status: safeString(source.action_status),
    error_code: safeString(source.error_code),
  };
}

function isTerminalActionStatus(value: unknown) {
  return ["completed", "degraded", "blocked"].includes(String(value || "").trim().toLowerCase());
}

async function readPendingIntentState(admin: any, userId: number | null) {
  if (!userId) return null;
  try {
    const { data, error } = await admin
      .from("users")
      .select("id,pending_intent")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: Number(data.id || 0) || null,
      pendingIntent: normalizePendingIntentState(data.pending_intent),
    };
  } catch {
    return null;
  }
}

function matchesPendingTerminalTrace(receipt: AnyRecord | null, pendingIntent: AnyRecord | null) {
  if (!receipt || !pendingIntent || typeof pendingIntent !== "object") return null;
  const trace = pendingIntent.last_terminal_trace;
  if (!trace || typeof trace !== "object") return null;

  const sameChannel = safeString(trace.channel || "zalo") === "zalo";
  const sameMessageId = safeString(trace.source_message_id) === safeString(receipt.source_message_id);
  const sameAction = safeString(trace.action) === safeString(receipt.action);
  const actionStatus = safeString(trace.action_status || trace.status);
  const completedAt = Date.parse(safeString(trace.completed_at || trace.updated_at || "") || "");
  const isRecentTerminal =
    Number.isFinite(completedAt) &&
    Math.abs(Date.now() - completedAt) <= 2 * 60 * 1000 &&
    isTerminalActionStatus(actionStatus);

  if (!sameChannel || !sameMessageId || !sameAction || !isTerminalActionStatus(actionStatus)) {
    if (!sameChannel || !sameMessageId || !isRecentTerminal) {
      return null;
    }
  }

  return {
    action_status: actionStatus,
    broker_message_id: safeString(trace.broker_message_id) || null,
    trace_id: safeString(trace.trace_id) || null,
    dedupe_scope: sameAction ? "same_action" : "same_message_recent_terminal",
  };
}

async function persistPendingTerminalTrace(admin: any, receipt: AnyRecord | null, params: {
  actionStatus: string;
  errorCode: string | null;
  brokerMessageId: string | null;
}) {
  const userId = toNullableInteger(receipt?.user_id);
  if (!userId || !receipt) return;

  const pendingState = await readPendingIntentState(admin, userId);
  const pendingIntent = normalizePendingIntentState(pendingState?.pendingIntent || {});
  pendingIntent.last_terminal_trace = {
    channel: "zalo",
    source_message_id: safeString(receipt.source_message_id) || null,
    trace_id: safeString(receipt.trace_id) || null,
    route: safeString(receipt.route) || null,
    action: safeString(receipt.action) || "send_reply",
    action_status: params.actionStatus,
    error_code: params.errorCode,
    broker_message_id: params.brokerMessageId,
    completed_at: new Date().toISOString(),
  };

  try {
    await admin.from("users").update({
      pending_intent: JSON.stringify(pendingIntent),
    }).eq("id", userId);
  } catch {
    // Keep broker send resilient even when pending-intent trace persistence fails.
  }
}

async function upsertReceipt(admin: any, receipt: AnyRecord | null) {
  if (!receipt) return null;
  try {
    const { data, error } = await admin.rpc("upsert_message_receipt", {
      p_channel: receipt.channel,
      p_source_message_id: receipt.source_message_id,
      p_user_id: receipt.user_id,
      p_trace_id: receipt.trace_id,
      p_route: receipt.route,
      p_action: receipt.action,
    });
    if (error) return null;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function completeReceipt(admin: any, receiptId: unknown, params: {
  actionStatus: string;
  errorCode: string | null;
  brokerMessageId: string | null;
  replyCount: number;
}) {
  const normalizedId = toNullableInteger(receiptId);
  if (!normalizedId) return;
  try {
    await admin.rpc("complete_message_receipt", {
      p_receipt_id: normalizedId,
      p_action_status: params.actionStatus,
      p_error_code: params.errorCode,
      p_broker_message_id: params.brokerMessageId,
      p_reply_count: params.replyCount,
    });
  } catch {
    // Keep broker send resilient even when receipt RPCs are unavailable.
  }
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

  let brokerAdmin: any = null;
  let receiptState: AnyRecord | null = null;
  let receipt: AnyRecord | null = null;
  let pendingTraceState: AnyRecord | null = null;

  try {
    const { admin } = await requireZaloBrokerAccess(req);
    brokerAdmin = admin;
    const body = await readBody(req);
    const payload = body.payload && typeof body.payload === "object" ? body.payload : body;
    receipt = normalizeReceiptEnvelope(body, payload);
    receiptState = await upsertReceipt(admin, receipt);
    pendingTraceState = await readPendingIntentState(admin, toNullableInteger(receipt?.user_id));

    if (
      receiptState?.is_duplicate === true &&
      ["completed", "degraded", "blocked"].includes(String(receiptState.action_status || ""))
    ) {
      sendJson(res, 200, {
        ok: true,
        data: {
          accepted: true,
          deduped: true,
          reason: "duplicate_receipt_terminal",
          receipt_id: receiptState.receipt_id ?? null,
          action_status: receiptState.action_status ?? null,
        },
      });
      return;
    }

    const pendingTraceMatch = matchesPendingTerminalTrace(receipt, pendingTraceState?.pendingIntent || null);
    if (!receiptState && pendingTraceMatch) {
      sendJson(res, 200, {
        ok: true,
        data: {
          accepted: true,
          deduped: true,
          reason:
            pendingTraceMatch.dedupe_scope === "same_message_recent_terminal"
              ? "duplicate_pending_terminal_same_message"
              : "duplicate_pending_terminal",
          receipt_id: null,
          action_status: pendingTraceMatch.action_status,
          broker_message_id: pendingTraceMatch.broker_message_id,
        },
      });
      return;
    }

    const result = await sendZaloCsMessage(admin, payload);
    const finalActionStatus = mapReceiptStatus(receipt?.action_status, result.accepted);
    const finalErrorCode =
      receipt?.error_code ||
      safeString(result.providerError) ||
      safeString(result.reason);
    await completeReceipt(admin, receiptState?.receipt_id, {
      actionStatus: finalActionStatus,
      errorCode: finalErrorCode,
      brokerMessageId: safeString(result.providerMsgId),
      replyCount: result.accepted ? 1 : 0,
    });
    await persistPendingTerminalTrace(admin, receipt, {
      actionStatus: finalActionStatus,
      errorCode: finalErrorCode || null,
      brokerMessageId: safeString(result.providerMsgId) || null,
    });

    sendJson(res, 200, {
      ok: result.accepted,
      data: {
        accepted: result.accepted,
        deduped: false,
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
    if (brokerAdmin && receiptState?.receipt_id) {
      await completeReceipt(brokerAdmin, receiptState.receipt_id, {
        actionStatus: mapReceiptStatus("failed_with_trace", false),
        errorCode: receipt?.error_code || message,
        brokerMessageId: null,
        replyCount: 0,
      });
    }
    if (brokerAdmin && receipt) {
      await persistPendingTerminalTrace(brokerAdmin, receipt, {
        actionStatus: mapReceiptStatus("failed_with_trace", false),
        errorCode: receipt?.error_code || message,
        brokerMessageId: null,
      });
    }
    sendJson(res, message === "admin_required" || message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
