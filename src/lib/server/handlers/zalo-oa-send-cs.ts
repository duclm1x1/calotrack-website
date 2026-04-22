import {
  readBody,
  sendJson,
  safeString,
} from "../adminServer.js";
import { normalizePendingIntentState } from "../zaloGatewayChatServer.js";
import {
  requireZaloBrokerAccess,
  sendZaloCsMessage,
} from "../zaloOaServer.js";

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

function normalizeReceiptEnvelope(body: AnyRecord | null | undefined, payload: AnyRecord | null | undefined) {
  const safeBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? body
      : {};
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  const source =
    safeBody.receipt && typeof safeBody.receipt === "object"
      ? safeBody.receipt
      : safePayload.receipt && typeof safePayload.receipt === "object"
        ? safePayload.receipt
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

function isPreAckAction(action: unknown) {
  return /(?:^|_)pre_ack$/i.test(String(action ?? "").trim());
}

function isTerminalActionStatus(value: unknown) {
  return ["completed", "degraded", "blocked"].includes(String(value || "").trim().toLowerCase());
}

function normalizeBrokerPayload(body: AnyRecord | null | undefined) {
  const safeBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? body
      : {};
  return safeBody.payload && typeof safeBody.payload === "object"
    ? {
        ...safeBody.payload,
        gym_asset:
          safeBody.gym_asset && typeof safeBody.gym_asset === "object"
            ? safeBody.gym_asset
            : safeBody.payload.gym_asset && typeof safeBody.payload.gym_asset === "object"
              ? safeBody.payload.gym_asset
              : null,
        gym_assets:
          Array.isArray(safeBody.gym_assets)
            ? safeBody.gym_assets
            : Array.isArray(safeBody.payload.gym_assets)
              ? safeBody.payload.gym_assets
              : undefined,
      }
    : safeBody;
}

function emitBrokerDiagnostic(stage: string, data: AnyRecord) {
  try {
    console.log(
      "[zalo_broker_diag]",
      JSON.stringify({
        stage,
        at: new Date().toISOString(),
        ...data,
      }),
    );
  } catch {
    // Never let diagnostics affect broker send behavior.
  }
}

async function readPendingIntentState(admin: any, userId: number | null) {
  if (!userId) return null;
  try {
    const { data, error } = await admin
      .from("users")
      .select("id,pending_intent,updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: Number(data.id || 0) || null,
      updatedAt: safeString((data as AnyRecord).updated_at) || null,
      pendingIntent: normalizePendingIntentState(data.pending_intent),
    };
  } catch {
    return null;
  }
}

function buildPendingBrokerClaim(receipt: AnyRecord | null) {
  if (!receipt) return null;
  return {
    channel: "zalo",
    source_message_id: safeString(receipt.source_message_id) || null,
    trace_id: safeString(receipt.trace_id) || null,
    route: safeString(receipt.route) || null,
    action: safeString(receipt.action) || "send_reply",
    claimed_at: new Date().toISOString(),
  };
}

function matchesPendingBrokerClaim(receipt: AnyRecord | null, pendingIntent: AnyRecord | null) {
  if (!receipt || !pendingIntent || typeof pendingIntent !== "object") return null;
  const claim = pendingIntent.last_broker_claim;
  if (!claim || typeof claim !== "object") return null;

  const sameChannel = safeString(claim.channel || "zalo") === "zalo";
  const sameMessageId = safeString(claim.source_message_id) === safeString(receipt.source_message_id);
  const sameAction = safeString(claim.action) === safeString(receipt.action);
  const claimedAt = Date.parse(safeString(claim.claimed_at || "") || "");
  const isRecentClaim =
    Number.isFinite(claimedAt) &&
    Math.abs(Date.now() - claimedAt) <= 2 * 60 * 1000;

  if (!sameChannel || !sameMessageId || !isRecentClaim) {
    return null;
  }

  return {
    action_status: "in_progress",
    action: safeString(claim.action) || safeString(receipt.action) || null,
    broker_message_id: null,
    trace_id: safeString(claim.trace_id) || null,
    dedupe_scope: sameAction ? "same_action_inflight_claim" : "same_message_inflight_claim",
  };
}

function clearPendingBrokerClaimIfMatches(pendingIntent: AnyRecord, receipt: AnyRecord | null) {
  if (!pendingIntent || typeof pendingIntent !== "object") return;
  const claim = pendingIntent.last_broker_claim;
  if (!claim || typeof claim !== "object") return;
  if (safeString(claim.source_message_id) === safeString(receipt?.source_message_id)) {
    delete pendingIntent.last_broker_claim;
  }
}

async function persistPendingIntentState(
  admin: any,
  params: {
    userId: number | null;
    updatedAt?: string | null;
    pendingIntent: AnyRecord;
  },
) {
  const userId = toNullableInteger(params.userId);
  if (!userId) return null;

  try {
    const nextUpdatedAt = new Date().toISOString();
    let query = admin
      .from("users")
      .update({
        pending_intent: JSON.stringify(params.pendingIntent || {}),
        updated_at: nextUpdatedAt,
      })
      .eq("id", userId);

    if (safeString(params.updatedAt)) {
      query = query.eq("updated_at", safeString(params.updatedAt));
    }

    const { data, error } = await query
      .select("id,pending_intent,updated_at")
      .maybeSingle();

    if (error || !data) return null;

    return {
      userId: Number(data.id || 0) || null,
      updatedAt: safeString((data as AnyRecord).updated_at) || null,
      pendingIntent: normalizePendingIntentState((data as AnyRecord).pending_intent),
    };
  } catch {
    return null;
  }
}

async function acquirePendingBrokerClaim(admin: any, receipt: AnyRecord | null) {
  const userId = toNullableInteger(receipt?.user_id);
  if (!userId || !receipt || isPreAckAction(receipt.action)) {
    return {
      claimed: false,
      deduped: false,
      reason: "claim_not_applicable",
      state: await readPendingIntentState(admin, userId),
      dedupeMatch: null,
    };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pendingState = await readPendingIntentState(admin, userId);
    const pendingIntent = normalizePendingIntentState(pendingState?.pendingIntent || {});
    const terminalTraceMatch = matchesPendingTerminalTrace(receipt, pendingIntent);
    if (terminalTraceMatch) {
      return {
        claimed: false,
        deduped: true,
        reason: "duplicate_pending_terminal",
        state: pendingState,
        dedupeMatch: terminalTraceMatch,
      };
    }

    const inflightClaimMatch = matchesPendingBrokerClaim(receipt, pendingIntent);
    if (inflightClaimMatch) {
      return {
        claimed: false,
        deduped: true,
        reason: "duplicate_pending_claim",
        state: pendingState,
        dedupeMatch: inflightClaimMatch,
      };
    }

    pendingIntent.last_broker_claim = buildPendingBrokerClaim(receipt);
    const persisted = await persistPendingIntentState(admin, {
      userId,
      updatedAt: pendingState?.updatedAt || null,
      pendingIntent,
    });

    if (persisted) {
      return {
        claimed: true,
        deduped: false,
        reason: "claim_acquired",
        state: persisted,
        dedupeMatch: null,
      };
    }
  }

  const finalState = await readPendingIntentState(admin, userId);
  const finalPendingIntent = normalizePendingIntentState(finalState?.pendingIntent || {});
  return {
    claimed: false,
    deduped: true,
    reason: "duplicate_claim_conflict",
    state: finalState,
    dedupeMatch:
      matchesPendingTerminalTrace(receipt, finalPendingIntent) ||
      matchesPendingBrokerClaim(receipt, finalPendingIntent) || {
        action_status: "in_progress",
        action: safeString(receipt.action) || null,
        broker_message_id: null,
        trace_id: safeString(receipt.trace_id) || null,
        dedupe_scope: "claim_conflict",
      },
  };
}

function matchesPendingTerminalTrace(receipt: AnyRecord | null, pendingIntent: AnyRecord | null) {
  if (!receipt || !pendingIntent || typeof pendingIntent !== "object") return null;
  const trace = pendingIntent.last_terminal_trace;
  if (!trace || typeof trace !== "object") return null;

  const sameChannel = safeString(trace.channel || "zalo") === "zalo";
  const sameMessageId = safeString(trace.source_message_id) === safeString(receipt.source_message_id);
  const sameAction = safeString(trace.action) === safeString(receipt.action);
  const traceAction = safeString(trace.action);
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
    action: traceAction || null,
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
  if (isPreAckAction(receipt.action)) return;

  const pendingState = await readPendingIntentState(admin, userId);
  const pendingIntent = normalizePendingIntentState(pendingState?.pendingIntent || {});
  clearPendingBrokerClaimIfMatches(pendingIntent, receipt);
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
    await persistPendingIntentState(admin, {
      userId,
      updatedAt: pendingState?.updatedAt || null,
      pendingIntent,
    });
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

export async function sendZaloBrokerPayload(admin: any, body: AnyRecord) {
  let receiptState: AnyRecord | null = null;
  let receipt: AnyRecord | null = null;
  let fallbackClaimState: AnyRecord | null = null;

  try {
    const payload = normalizeBrokerPayload(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0) {
      throw new Error("missing_broker_payload");
    }
    receipt = normalizeReceiptEnvelope(body, payload);
    const stableTrackingId =
      safeString(payload?.tracking_id) ||
      safeString(payload?.client_msg_id) ||
      (() => {
        const token = safeString(receipt?.source_message_id) || safeString(receipt?.trace_id);
        if (!token) return "";
        return `zalo:${safeString(receipt?.action) || "send_reply"}:${token}`.slice(0, 120);
      })();
    if (payload && typeof payload === "object" && stableTrackingId) {
      if (!safeString(payload.tracking_id)) {
        payload.tracking_id = stableTrackingId;
      }
      if (!safeString(payload.client_msg_id)) {
        payload.client_msg_id = stableTrackingId;
      }
    }
    emitBrokerDiagnostic("normalized_receipt", {
      source_message_id: safeString(receipt?.source_message_id) || null,
      trace_id: safeString(receipt?.trace_id) || null,
      action: safeString(receipt?.action) || null,
      route: safeString(receipt?.route) || null,
      user_id: toNullableInteger(receipt?.user_id),
      customer_id: toNullableInteger(receipt?.customer_id),
      pre_ack: isPreAckAction(receipt?.action),
      tracking_id: safeString(payload?.tracking_id) || null,
      client_msg_id: safeString(payload?.client_msg_id) || null,
    });
    receiptState = await upsertReceipt(admin, receipt);
    const pendingTraceState = await readPendingIntentState(admin, toNullableInteger(receipt?.user_id));
    emitBrokerDiagnostic("post_upsert_receipt", {
      source_message_id: safeString(receipt?.source_message_id) || null,
      trace_id: safeString(receipt?.trace_id) || null,
      action: safeString(receipt?.action) || null,
      user_id: toNullableInteger(receipt?.user_id),
      receipt_state_present: Boolean(receiptState),
      receipt_id: toNullableInteger(receiptState?.receipt_id),
      receipt_duplicate: receiptState?.is_duplicate === true,
      receipt_action_status: safeString(receiptState?.action_status) || null,
      pending_terminal_trace_id:
        safeString(pendingTraceState?.pendingIntent?.last_terminal_trace?.trace_id) || null,
      pending_terminal_source_message_id:
        safeString(pendingTraceState?.pendingIntent?.last_terminal_trace?.source_message_id) || null,
    });

    if (
      receiptState?.is_duplicate === true &&
      ["completed", "degraded", "blocked"].includes(String(receiptState.action_status || ""))
    ) {
      emitBrokerDiagnostic("deduped_terminal_receipt", {
        source_message_id: safeString(receipt?.source_message_id) || null,
        trace_id: safeString(receipt?.trace_id) || null,
        action: safeString(receipt?.action) || null,
        user_id: toNullableInteger(receipt?.user_id),
        receipt_id: toNullableInteger(receiptState?.receipt_id),
        receipt_action_status: safeString(receiptState?.action_status) || null,
      });
      return {
        accepted: true,
        deduped: true,
        reason: "duplicate_receipt_terminal",
        receipt_id: receiptState.receipt_id ?? null,
        action_status: receiptState.action_status ?? null,
        provider_status: null,
        provider_error: null,
        provider_error_code: null,
        provider_msg_id: null,
        tracking_id: null,
        http_status: null,
        refreshed_during_send: false,
        gym_image_sent: false,
        gym_image_error: null,
        gym_asset_catalog_source: null,
        gym_images_total: 0,
        gym_images_sent: 0,
        pre_ack: isPreAckAction(receipt?.action),
      };
    }

    if (!receiptState) {
      fallbackClaimState = await acquirePendingBrokerClaim(admin, receipt);
      emitBrokerDiagnostic("fallback_claim_result", {
        source_message_id: safeString(receipt?.source_message_id) || null,
        trace_id: safeString(receipt?.trace_id) || null,
        action: safeString(receipt?.action) || null,
        user_id: toNullableInteger(receipt?.user_id),
        claimed: fallbackClaimState?.claimed === true,
        deduped: fallbackClaimState?.deduped === true,
        reason: safeString(fallbackClaimState?.reason) || null,
        dedupe_action_status: safeString(fallbackClaimState?.dedupeMatch?.action_status) || null,
        dedupe_trace_id: safeString(fallbackClaimState?.dedupeMatch?.trace_id) || null,
        dedupe_scope: safeString(fallbackClaimState?.dedupeMatch?.dedupe_scope) || null,
      });
      if (fallbackClaimState?.deduped) {
        emitBrokerDiagnostic("deduped_fallback_claim", {
          source_message_id: safeString(receipt?.source_message_id) || null,
          trace_id: safeString(receipt?.trace_id) || null,
          action: safeString(receipt?.action) || null,
          user_id: toNullableInteger(receipt?.user_id),
          reason: safeString(fallbackClaimState.reason) || null,
        });
        return {
          accepted: true,
          deduped: true,
          reason: safeString(fallbackClaimState.reason) || "duplicate_pending_claim",
          receipt_id: null,
          action_status: safeString(fallbackClaimState?.dedupeMatch?.action_status) || null,
          provider_status: null,
          provider_error: null,
          provider_error_code: null,
          provider_msg_id: safeString(fallbackClaimState?.dedupeMatch?.broker_message_id) || null,
          tracking_id: null,
          http_status: null,
          refreshed_during_send: false,
          gym_image_sent: false,
          gym_image_error: null,
          gym_asset_catalog_source: null,
          gym_images_total: 0,
          gym_images_sent: 0,
          pre_ack: isPreAckAction(receipt?.action),
        };
      }
    }

    const pendingTraceMatch = matchesPendingTerminalTrace(receipt, pendingTraceState?.pendingIntent || null);
    emitBrokerDiagnostic("pending_terminal_check", {
      source_message_id: safeString(receipt?.source_message_id) || null,
      trace_id: safeString(receipt?.trace_id) || null,
      action: safeString(receipt?.action) || null,
      user_id: toNullableInteger(receipt?.user_id),
      pending_terminal_match: Boolean(pendingTraceMatch),
      pending_terminal_scope: safeString(pendingTraceMatch?.dedupe_scope) || null,
      pending_terminal_action_status: safeString(pendingTraceMatch?.action_status) || null,
      pending_terminal_trace_id: safeString(pendingTraceMatch?.trace_id) || null,
    });
    if (!receiptState && pendingTraceMatch) {
      const pendingTraceIsPreAck = isPreAckAction(pendingTraceMatch.action);
      const incomingIsPreAck = isPreAckAction(receipt?.action);
      if (!(incomingIsPreAck && pendingTraceIsPreAck)) {
        emitBrokerDiagnostic("deduped_pending_terminal", {
          source_message_id: safeString(receipt?.source_message_id) || null,
          trace_id: safeString(receipt?.trace_id) || null,
          action: safeString(receipt?.action) || null,
          user_id: toNullableInteger(receipt?.user_id),
          dedupe_scope: safeString(pendingTraceMatch?.dedupe_scope) || null,
          action_status: safeString(pendingTraceMatch?.action_status) || null,
        });
        return {
          accepted: true,
          deduped: true,
          reason:
            pendingTraceMatch.dedupe_scope === "same_message_recent_terminal"
              ? "duplicate_pending_terminal_same_message"
              : "duplicate_pending_terminal",
          receipt_id: null,
          action_status: pendingTraceMatch.action_status,
          provider_status: null,
          provider_error: null,
          provider_error_code: null,
          provider_msg_id: pendingTraceMatch.broker_message_id,
          tracking_id: null,
          http_status: null,
          refreshed_during_send: false,
          gym_image_sent: false,
          gym_image_error: null,
          gym_asset_catalog_source: null,
          gym_images_total: 0,
          gym_images_sent: 0,
          pre_ack: isPreAckAction(receipt?.action),
        };
      }
    }

    emitBrokerDiagnostic("before_send", {
      source_message_id: safeString(receipt?.source_message_id) || null,
      trace_id: safeString(receipt?.trace_id) || null,
      action: safeString(receipt?.action) || null,
      user_id: toNullableInteger(receipt?.user_id),
      receipt_id: toNullableInteger(receiptState?.receipt_id),
      used_fallback_claim: fallbackClaimState?.claimed === true,
      payload_text_preview: safeString(payload?.text || payload?.message || "").slice(0, 120) || null,
    });
    const result = await sendZaloCsMessage(admin, payload);
    const finalActionStatus = mapReceiptStatus(receipt?.action_status, result.accepted);
    const finalErrorCode =
      receipt?.error_code ||
      safeString(result.providerError) ||
      safeString(result.reason);
    emitBrokerDiagnostic("after_send", {
      source_message_id: safeString(receipt?.source_message_id) || null,
      trace_id: safeString(receipt?.trace_id) || null,
      action: safeString(receipt?.action) || null,
      user_id: toNullableInteger(receipt?.user_id),
      accepted: result.accepted,
      provider_status: safeString(result.providerStatus) || null,
      provider_error: safeString(result.providerError) || null,
      provider_error_code: safeString(result.providerErrorCode) || null,
      provider_msg_id: safeString(result.providerMsgId) || null,
      final_action_status: finalActionStatus,
      reason: safeString(result.reason) || null,
    });
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

    return {
      accepted: result.accepted,
      deduped: false,
      reason: result.reason,
      receipt_id: receiptState?.receipt_id ?? null,
      action_status: finalActionStatus,
      provider_status: result.providerStatus,
      provider_error: result.providerError,
      provider_error_code: result.providerErrorCode,
      provider_msg_id: result.providerMsgId,
      tracking_id: result.trackingId,
      http_status: result.httpStatus,
      refreshed_during_send: result.refreshedDuringSend,
      gym_image_sent: result.gymImageSent === true,
      gym_image_error: result.gymImageError || null,
      gym_asset_catalog_source: result.gymAssetCatalogSource || null,
      gym_images_total: result.gymImagesTotal ?? 0,
      gym_images_sent: result.gymImagesSent ?? 0,
      pre_ack: isPreAckAction(receipt?.action),
    };
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_cs_broker_failed");
    emitBrokerDiagnostic("send_exception", {
      source_message_id: safeString(receipt?.source_message_id) || null,
      trace_id: safeString(receipt?.trace_id) || null,
      action: safeString(receipt?.action) || null,
      user_id: toNullableInteger(receipt?.user_id),
      receipt_id: toNullableInteger(receiptState?.receipt_id),
      error: message,
    });
    await completeReceipt(admin, receiptState?.receipt_id, {
      actionStatus: mapReceiptStatus("failed_with_trace", false),
      errorCode: receipt?.error_code || message,
      brokerMessageId: null,
      replyCount: 0,
    });
    await persistPendingTerminalTrace(admin, receipt, {
      actionStatus: mapReceiptStatus("failed_with_trace", false),
      errorCode: receipt?.error_code || message,
      brokerMessageId: null,
    });
    throw error;
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

  try {
    const { admin } = await requireZaloBrokerAccess(req);
    const body = await readBody(req);
    const data = await sendZaloBrokerPayload(admin, body);
    sendJson(res, 200, {
      ok: data.accepted,
      data,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_cs_broker_failed");
    sendJson(res, message === "admin_required" || message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
