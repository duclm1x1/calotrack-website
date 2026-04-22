import {
  computePremiumUntil,
  LIFETIME_SENTINEL_ISO,
  getBillingDurationDays,
  normalizePublicBillingSku,
} from "../../billing.js";
import {
  createServiceRoleClient,
  maybeSingle,
  readBody,
  safeString,
  sendJson,
} from "../adminServer.js";

type SepayWebhookPayload = {
  id?: number | string | null;
  gateway?: string | null;
  transactionDate?: string | null;
  accountNumber?: string | null;
  code?: string | null;
  content?: string | null;
  transferType?: string | null;
  transferAmount?: number | string | null;
  accumulated?: number | string | null;
  subAccount?: string | null;
  referenceCode?: string | null;
  description?: string | null;
};

type PaymentReviewState = {
  status: string;
  reason: string | null;
  updatedAt: string;
  expectedAmount?: number | null;
  receivedAmount?: number | null;
  providerEventId?: string | null;
  providerTxnId?: string | null;
  orderCode?: string | null;
};

function shouldRetryAuditInsert(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return (
    message.includes("billing_sku") ||
    message.includes("check constraint") ||
    message.includes("violates")
  );
}

function readWebhookApiKey() {
  return (
    safeString(process.env.SEPAY_WEBHOOK_API_KEY) ||
    safeString(process.env.SEPAY_WEBHOOK_SECRET) ||
    safeString(process.env.SEPAY_WEBHOOK_KEY)
  );
}

function extractApiKey(headerValue: unknown) {
  const header = safeString(headerValue);
  if (!header) return null;

  const apikeyMatch = header.match(/^Apikey\s+(.+)$/i);
  if (apikeyMatch?.[1]) return safeString(apikeyMatch[1]);

  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return safeString(bearerMatch[1]);

  return null;
}

function normalizeOrderCode(value: string | null) {
  return safeString(value)?.replace(/\s+/g, "").toUpperCase() || null;
}

function extractOrderCode(payload: SepayWebhookPayload) {
  const directCode = normalizeOrderCode(safeString(payload.code));
  if (directCode) return directCode;

  const candidates = [
    safeString(payload.content),
    safeString(payload.description),
    safeString(payload.referenceCode),
  ].filter(Boolean) as string[];

  const patterns = [
    /\bSEVQR\s+([A-Z0-9-]+)/i,
    /\b(CT[A-Z0-9-]{8,})\b/i,
    /\bCALO\s*([A-Z0-9-]+)/i,
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match?.[1]) {
        return normalizeOrderCode(match[1]);
      }
    }
  }

  return null;
}

function normalizeTransferAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount);
}

function computePremiumUntilIso(
  billingSku: string | null | undefined,
  currentPremiumUntil?: string | null,
) {
  const normalized = normalizePublicBillingSku(billingSku || "monthly", { plan: "pro" }) || "monthly";
  if (normalized === "lifetime") {
    return LIFETIME_SENTINEL_ISO;
  }
  return computePremiumUntil(normalized, currentPremiumUntil);
}

function isCustomerEntitlementActive(customer: Record<string, any> | null | undefined) {
  const accessState = safeString(customer?.access_state)?.toLowerCase() || "";
  const status = safeString(customer?.status)?.toLowerCase() || "";
  if (accessState === "active_paid" || accessState === "active_trial") return true;
  if (status === "active" && customer?.is_banned !== true) return true;
  return false;
}

async function upsertWebhookLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  providerEventId: string | null,
  payload: SepayWebhookPayload,
  status: string,
  eventType: string,
  audit?: Record<string, unknown>,
) {
  const existingAudit =
    payload &&
    typeof payload === "object" &&
    "_audit" in payload &&
    payload._audit &&
    typeof payload._audit === "object"
      ? (payload._audit as Record<string, unknown>)
      : {};
  const nextPayload =
    audit && Object.keys(audit).length
      ? {
          ...payload,
          _audit: {
            ...existingAudit,
            ...audit,
          },
        }
      : payload;
  const record = {
    provider: "sepay",
    event_type: eventType,
    provider_event_id: providerEventId,
    payload: nextPayload,
    status,
    processed_at: new Date().toISOString(),
  };

  if (providerEventId) {
    const { error } = await admin
      .from("payment_webhooks")
      .upsert(record, { onConflict: "provider,provider_event_id" });
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("payment_webhooks").insert(record);
  if (error) throw error;
}

async function syncCustomerAccess(
  admin: ReturnType<typeof createServiceRoleClient>,
  customerId: number,
) {
  try {
    await admin.rpc("sync_customer_to_compat_users", { p_customer_id: customerId });
  } catch {
    // Best effort only. Manual updates below will still keep portal/chat state usable.
  }
}

function readOrderMetadata(order: Record<string, any> | null | undefined) {
  const raw = order?.metadata;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

function buildOrderReviewState(review: PaymentReviewState) {
  return {
    payment_review: {
      ...review,
    },
  };
}

function mergeOrderMetadata(
  order: Record<string, any> | null | undefined,
  nextValues: Record<string, unknown>,
) {
  return {
    ...readOrderMetadata(order),
    ...nextValues,
  };
}

async function confirmOrderFromSepay(
  admin: ReturnType<typeof createServiceRoleClient>,
  orderCode: string,
  payload: SepayWebhookPayload,
) {
  const providerEventId =
    safeString(payload.id)?.toString() || safeString(payload.referenceCode) || null;
  const providerTxnId =
    safeString(payload.referenceCode) || safeString(payload.id)?.toString() || null;
  const receivedAmount = normalizeTransferAmount(payload.transferAmount);

  const order =
    (await maybeSingle<Record<string, any>>(
      admin
        .from("orders")
        .select("id, customer_id, plan_id, billing_sku, amount, provider, status, order_code, phone_e164, metadata")
        .eq("order_code", orderCode)
        .limit(1),
    )) || null;

  if (!order) {
    await upsertWebhookLog(admin, providerEventId, payload, "order_not_found", "payment_unmatched", {
      normalized_order_code: orderCode,
      review_reason: "order_not_found",
      received_amount: receivedAmount,
      provider_txn_id: providerTxnId,
    });
    return { status: "order_not_found", orderCode };
  }

  const reviewStateBase = {
    updatedAt: new Date().toISOString(),
    providerEventId,
    providerTxnId,
    orderCode,
  };

  if (receivedAmount == null) {
    await upsertWebhookLog(admin, providerEventId, payload, "malformed_amount", "payment_invalid_amount", {
      normalized_order_code: orderCode,
      review_reason: "malformed_amount",
      provider_txn_id: providerTxnId,
    });
    await admin
      .from("orders")
      .update({
        status: order.status === "paid" ? order.status : "needs_review",
        metadata: mergeOrderMetadata(
          order,
          buildOrderReviewState({
            ...reviewStateBase,
            status: "needs_review",
            reason: "malformed_amount",
            expectedAmount: Number(order.amount ?? 0),
            receivedAmount: null,
          }),
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return {
      status: "malformed_amount",
      reason: "malformed_amount",
      orderCode,
      expectedAmount: Number(order.amount ?? 0),
      receivedAmount: null,
    };
  }

  if (receivedAmount < Number(order.amount ?? 0)) {
    await upsertWebhookLog(admin, providerEventId, payload, "needs_review", "payment_mismatch", {
      normalized_order_code: orderCode,
      review_reason: "amount_underpaid",
      expected_amount: Number(order.amount ?? 0),
      received_amount: receivedAmount,
      provider_txn_id: providerTxnId,
    });
    await admin
      .from("orders")
      .update({
        status: order.status === "paid" ? order.status : "needs_review",
        metadata: mergeOrderMetadata(
          order,
          buildOrderReviewState({
            ...reviewStateBase,
            status: "needs_review",
            reason: "amount_underpaid",
            expectedAmount: Number(order.amount ?? 0),
            receivedAmount,
          }),
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return {
      status: "needs_review",
      reason: "amount_underpaid",
      orderCode,
      expectedAmount: Number(order.amount ?? 0),
      receivedAmount,
    };
  }

  const customer =
    (await maybeSingle<Record<string, any>>(
      admin
        .from("customers")
        .select("id, premium_until, plan, entitlement_source, status, access_state, is_banned")
        .eq("id", order.customer_id)
        .limit(1),
    )) || null;

  const compatUser =
    (await maybeSingle<Record<string, any>>(
      admin
        .from("users")
        .select("id")
        .eq("customer_id", order.customer_id)
        .order("updated_at", { ascending: false })
        .limit(1),
    )) || null;
  const compatUserId = Number(compatUser?.id ?? 0) || null;

  const auditWarnings: string[] = [];
  const orderAlreadyMarkedPaid = ["paid", "active", "completed"].includes(
    safeString(order.status)?.toLowerCase() || "",
  );
  if (orderAlreadyMarkedPaid && isCustomerEntitlementActive(customer)) {
    await upsertWebhookLog(admin, providerEventId, payload, "duplicate_paid_order", "payment_duplicate", {
      normalized_order_code: orderCode,
      review_reason: "duplicate_paid_order",
      received_amount: receivedAmount,
      provider_txn_id: providerTxnId,
    });
    return {
      status: "duplicate_paid_order",
      orderId: Number(order.id),
      orderCode,
      customerId: Number(order.customer_id),
      premiumUntil: null,
    };
  }
  if (orderAlreadyMarkedPaid) {
    auditWarnings.push("repairing_preexisting_paid_order_without_customer_access");
  }

  if (providerTxnId) {
    const { error: paymentAttemptError } = await admin.from("payment_attempts").upsert(
      {
        order_id: order.id,
        provider: "sepay",
        provider_txn_id: providerTxnId,
        status: "paid",
        amount: receivedAmount,
        paid_at: safeString(payload.transactionDate) || new Date().toISOString(),
        raw_payload: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_txn_id" },
    );
    if (paymentAttemptError) throw paymentAttemptError;
  } else {
    const { error: paymentAttemptError } = await admin.from("payment_attempts").insert({
      order_id: order.id,
      provider: "sepay",
      status: "paid",
      amount: receivedAmount,
      paid_at: safeString(payload.transactionDate) || new Date().toISOString(),
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    });
    if (paymentAttemptError) throw paymentAttemptError;
  }

  const premiumUntil = computePremiumUntilIso(safeString(order.billing_sku), safeString(customer?.premium_until));
  const plan =
    safeString(order.billing_sku)?.toLowerCase() === "lifetime" ? "lifetime" : "pro";

  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("id")
    .eq("customer_id", order.customer_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSubscription?.id) {
    const { error: subscriptionError } = await admin
      .from("subscriptions")
      .update({
        plan_id: order.plan_id,
        status: "active",
        billing_cycle:
          safeString(order.billing_sku)?.toLowerCase() === "yearly" ? "yearly" : "monthly",
        current_period_start: new Date().toISOString(),
        current_period_end: premiumUntil,
        provider: "sepay",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingSubscription.id);
    if (subscriptionError) throw subscriptionError;
  } else {
    const { error: subscriptionError } = await admin.from("subscriptions").insert({
      customer_id: order.customer_id,
      plan_id: order.plan_id,
      status: "active",
      billing_cycle:
        safeString(order.billing_sku)?.toLowerCase() === "yearly" ? "yearly" : "monthly",
      current_period_start: new Date().toISOString(),
      current_period_end: premiumUntil,
      provider: "sepay",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (subscriptionError) throw subscriptionError;
  }

  const { error: orderError } = await admin
    .from("orders")
    .update({
      status: "paid",
      provider: "sepay",
      metadata: mergeOrderMetadata(order, {
        ...buildOrderReviewState({
          ...reviewStateBase,
          status: "processed",
          reason: null,
          expectedAmount: Number(order.amount ?? 0),
          receivedAmount,
        }),
        last_payment: {
          provider: "sepay",
          providerEventId,
          providerTxnId,
          receivedAmount,
          paidAt: safeString(payload.transactionDate) || new Date().toISOString(),
          orderCode,
        },
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (orderError) throw orderError;

  const { error: customerError } = await admin
    .from("customers")
    .update({
      plan,
      premium_until: premiumUntil,
      entitlement_source: "payment:sepay",
      status: "active",
      access_state: "active_paid",
      is_banned: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.customer_id);
  if (customerError) throw customerError;

  try {
    if (compatUserId) {
      const baseTransactionHistoryRecord = {
        user_id: compatUserId,
        customer_id: order.customer_id,
        amount: receivedAmount,
        payment_method: "sepay",
        status: "completed",
        transaction_code: providerTxnId || order.order_code,
        description: `Order ${order.order_code} auto-confirmed by SePay`,
        days_added:
          safeString(order.billing_sku)?.toLowerCase() === "lifetime"
            ? 36500
            : getBillingDurationDays(
                normalizePublicBillingSku(order.billing_sku, { plan: "pro" }) || "monthly",
              ),
        plan_granted: plan,
        billing_sku: order.billing_sku,
        metadata: {
          order_id: order.id,
          order_code: order.order_code,
          provider_event_id: providerEventId,
          original_billing_sku: order.billing_sku,
        },
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      try {
        await admin.from("transaction_history").insert(baseTransactionHistoryRecord);
      } catch (error) {
        if (!shouldRetryAuditInsert(error)) {
          throw error;
        }

        await admin.from("transaction_history").insert({
          ...baseTransactionHistoryRecord,
          billing_sku: null,
          metadata: {
            ...(baseTransactionHistoryRecord.metadata as Record<string, unknown>),
            schema_fallback: "billing_sku_null_compat",
          },
        });
      }
    }
  } catch (error) {
    auditWarnings.push(String((error as Error)?.message || error || "transaction_history_insert_failed"));
  }

  try {
    if (compatUserId) {
      const baseSubscriptionEventRecord = {
        user_id: compatUserId,
        customer_id: order.customer_id,
        event_type: "payment_confirmed",
        plan_from: null,
        plan_to: plan,
        amount: receivedAmount,
        source: "sepay",
        notes: `Order ${order.order_code}`,
        billing_sku: order.billing_sku,
        metadata: {
          order_id: order.id,
          order_code: order.order_code,
          provider_event_id: providerEventId,
          original_billing_sku: order.billing_sku,
        },
        created_at: new Date().toISOString(),
      };

      try {
        await admin.from("subscription_events").insert(baseSubscriptionEventRecord);
      } catch (error) {
        if (!shouldRetryAuditInsert(error)) {
          throw error;
        }

        await admin.from("subscription_events").insert({
          ...baseSubscriptionEventRecord,
          billing_sku: null,
          metadata: {
            ...(baseSubscriptionEventRecord.metadata as Record<string, unknown>),
            schema_fallback: "billing_sku_null_compat",
          },
        });
      }
    }
  } catch (error) {
    auditWarnings.push(String((error as Error)?.message || error || "subscription_events_insert_failed"));
  }

  await syncCustomerAccess(admin, Number(order.customer_id));

  await upsertWebhookLog(admin, providerEventId, payload, "processed", "payment_confirmed", {
    normalized_order_code: orderCode,
    received_amount: receivedAmount,
    provider_txn_id: providerTxnId,
    audit_warnings: auditWarnings,
  });

  return {
    status: "processed",
    orderId: Number(order.id),
    orderCode,
    customerId: Number(order.customer_id),
    premiumUntil,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "method_not_allowed" });
    return;
  }

  const expectedApiKey = readWebhookApiKey();
  const providedApiKey = extractApiKey(req.headers?.authorization);

  if (!expectedApiKey) {
    sendJson(res, 500, { success: false, error: "sepay_webhook_secret_missing" });
    return;
  }

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    sendJson(res, 401, { success: false, error: "sepay_webhook_unauthorized" });
    return;
  }

  try {
    const payload = (await readBody(req)) as SepayWebhookPayload;
    const transferType = safeString(payload.transferType)?.toLowerCase();
    const providerEventId =
      safeString(payload.id)?.toString() || safeString(payload.referenceCode) || null;

    if (transferType && transferType !== "in") {
      const admin = createServiceRoleClient();
      await upsertWebhookLog(admin, providerEventId, payload, "ignored_transfer_type", "payment_ignored", {
        review_reason: "ignored_transfer_type",
      });
      sendJson(res, 200, { success: true, status: "ignored_transfer_type" });
      return;
    }

    const orderCode = extractOrderCode(payload);
    if (!orderCode) {
      const admin = createServiceRoleClient();
      await upsertWebhookLog(admin, providerEventId, payload, "ignored_no_order_code", "payment_unmatched", {
        review_reason: "missing_order_code",
        received_amount: normalizeTransferAmount(payload.transferAmount),
      });
      sendJson(res, 200, { success: true, status: "ignored_no_order_code" });
      return;
    }

    const admin = createServiceRoleClient();
    const result = await confirmOrderFromSepay(admin, orderCode, payload);

    sendJson(res, 200, {
      success: true,
      status: result.status,
      order_code: orderCode,
      data: result,
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: String((error as Error)?.message || error || "sepay_webhook_failed"),
    });
  }
}
