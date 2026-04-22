import {
  cleanEnv,
  createServiceRoleClient,
  readBody,
  safeString,
  sendJson,
} from "../adminServer.js";
import {
  backfillRetentionState,
  cleanupRetentionTestFixture,
  cleanupRetentionV2TestTarget,
  decorateRetentionReply,
  dispatchDueRetentionMessages,
  insertRetentionTestMealLog,
  insertRetentionTestMealLogBatch,
  insertRetentionTestWaterLog,
  insertRetentionTestWeightLog,
  prepareRetentionTestTarget,
  previewRetentionEventPush,
  previewRetentionBodyCheckIn,
  previewRetentionRenewalHook,
  previewRetentionUser,
  previewRetentionWaterMidday,
  previewRetentionWaterMorning,
  queueRetentionEvent,
  readRetentionTestPreflight,
  readRetentionTestSchemaStatus,
  readRetentionTestStateRow,
  readRetentionNotificationSettings,
  readRetentionDispatchHealth,
  refreshRetentionTestDates,
  restoreRetentionTestTarget,
  setRetentionNotificationSetting,
  seedRetentionTestFixture,
  snapshotRetentionTestTarget,
  updateRetentionTestCustomerRow,
  updateRetentionTestStateRow,
  updateRetentionTestUserRow,
} from "../zaloRetentionServer.js";

function getAction(req: any) {
  return String(req.query?.action || "").trim().toLowerCase();
}

function readAuthorizationBearer(req: any) {
  const header = safeString(req.headers?.authorization);
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return cleanEnv(safeString(match?.[1]) || undefined) || null;
}

function readInternalKey(req: any) {
  return cleanEnv(safeString(req.headers?.["x-calotrack-internal-key"]) || undefined) || readAuthorizationBearer(req) || null;
}

function readAllowedInternalKeys() {
  return [
    cleanEnv(process.env.ZALO_OA_INTERNAL_KEY),
    cleanEnv(process.env.CHANNEL_CONTEXT_INTERNAL_KEY),
    cleanEnv(process.env.CRON_SECRET),
    cleanEnv(process.env.PORTAL_AUTOMATION_SECRET),
  ].filter(Boolean);
}

function hasAllowedInternalKey(req: any) {
  const providedKey = readInternalKey(req);
  if (!providedKey) return false;
  return readAllowedInternalKeys().includes(providedKey);
}

function parseOptionalDate(value: unknown) {
  const text = safeString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeNotificationEnabled(value: unknown) {
  if (value === true || value === false) return value;
  const text = safeString(value)?.toLowerCase();
  if (["true", "1", "yes", "on"].includes(text || "")) return true;
  if (["false", "0", "no", "off"].includes(text || "")) return false;
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const action = getAction(req);
  if (!action) {
    sendJson(res, 400, { ok: false, error: "action_required" });
    return;
  }

  if (!hasAllowedInternalKey(req)) {
    sendJson(res, 401, { ok: false, error: "internal_access_denied" });
    return;
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const admin = createServiceRoleClient();

    if (action === "dispatch-due") {
      const result = await dispatchDueRetentionMessages(admin, {
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
        userId: Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || null,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "health") {
      const result = await readRetentionDispatchHealth(admin);
      const payload = {
        storage_mode: result.storageMode,
        schema_health: result.schemaHealth,
        dispatch_allowed: result.dispatchAllowed,
        blocker_reason: result.blockerReason,
        claim_backend: result.claimBackend,
        probe_errors: result.probeErrors,
        checked_tables: result.checkedTables,
        checked_at: result.checkedAt,
      };
      const isAliasRoute = String(req.url || "").split("?")[0] === "/api/zalo-retention-health";
      sendJson(res, isAliasRoute ? (result.dispatchAllowed ? 200 : 503) : 200, {
        ok: true,
        data: payload,
      });
      return;
    }

    if (action === "decorate-reply") {
      const payload = body?.payload && typeof body.payload === "object" ? body.payload : body;
      let result;
      try {
        result = await decorateRetentionReply(admin, {
          kind: safeString(body.kind) || safeString(payload?.kind) || safeString(payload?.retention_kind),
          user_id: Number(body.user_id ?? body.userId ?? payload?.user_id ?? payload?.linked_user_id ?? 0) || null,
          linked_user_id: Number(body.linked_user_id ?? body.linkedUserId ?? payload?.linked_user_id ?? 0) || null,
          customer_id: Number(body.customer_id ?? body.customerId ?? payload?.customer_id ?? 0) || null,
          base_reply_text: safeString(body.base_reply_text) || safeString(payload?.reply_text) || safeString(payload?.final_response?.text),
          payload,
          date_local: safeString(body.date_local) || safeString(payload?.date_local),
          meal_log_id: Number(body.meal_log_id ?? body.mealLogId ?? payload?.meal_log_id ?? 0) || null,
          daily_stats_snapshot: body.daily_stats_snapshot || null,
          dry_run: body.dry_run === true || body.dryRun === true || payload?.dry_run === true,
        });
      } catch (error) {
        const baseReplyText =
          safeString(body.base_reply_text) ||
          safeString(payload?.reply_text) ||
          safeString(payload?.final_response?.text) ||
          safeString(payload?.text);
        sendJson(res, 200, {
          ok: false,
          error: String((error as Error)?.message || error || "decorate_reply_failed"),
          data: {
            payload: {
              ...(payload && typeof payload === "object" ? payload : {}),
              reply_text: baseReplyText || safeString(payload?.reply_text),
            },
            decorated_reply_text: baseReplyText || "",
            insight_meta: {},
            streak_meta: {},
          },
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        data: result,
      });
      return;
    }

    if (action === "preview-user") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await previewRetentionUser(admin, {
        userId,
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "body-checkin-preview") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await previewRetentionBodyCheckIn(admin, {
        userId,
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "preview-water-morning") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await previewRetentionWaterMorning(admin, {
        userId,
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "preview-water-midday") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await previewRetentionWaterMidday(admin, {
        userId,
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "preview-renewal-hook") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await previewRetentionRenewalHook(admin, {
        userId,
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "preview-event-push") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      const kind = safeString(body.event_kind ?? body.kind ?? req.query?.event_kind ?? req.query?.kind) as
        | "streak_milestone"
        | "quick_log_suggestion"
        | "goal_reached"
        | "weight_drop";
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      if (!kind) {
        sendJson(res, 400, { ok: false, error: "event_kind_required" });
        return;
      }
      const rawPayload =
        body.payload && typeof body.payload === "object"
          ? body.payload
          : safeString(req.query?.payload)
            ? JSON.parse(String(req.query.payload))
            : {};
      const result = await previewRetentionEventPush(admin, {
        userId,
        kind,
        payload: rawPayload,
        now: parseOptionalDate(body.now || req.query?.now) || undefined,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "queue-event") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      const kind = safeString(body.kind ?? req.query?.kind) as
        | "streak_milestone"
        | "quick_log_suggestion"
        | "goal_reached"
        | "weight_drop";
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      if (!kind) {
        sendJson(res, 400, { ok: false, error: "kind_required" });
        return;
      }
      const result = await queueRetentionEvent(admin, {
        userId,
        kind,
        payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "settings-get") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await readRetentionNotificationSettings(admin, userId);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "settings-set") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      const kind = safeString(body.kind ?? req.query?.kind);
      const enabled = normalizeNotificationEnabled(body.enabled ?? req.query?.enabled);
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      if (!kind) {
        sendJson(res, 400, { ok: false, error: "kind_required" });
        return;
      }
      if (enabled == null) {
        sendJson(res, 400, { ok: false, error: "enabled_required" });
        return;
      }
      const result = await setRetentionNotificationSetting(admin, userId, kind as any, enabled);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-schema") {
      const result = await readRetentionTestSchemaStatus(admin);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-preflight") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await readRetentionTestPreflight(admin, {
        userId,
        expectedPhone: safeString(body.expected_phone ?? body.expectedPhone ?? req.query?.expected_phone ?? req.query?.expectedPhone),
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-read-state") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await readRetentionTestStateRow(admin, { userId });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-update-user") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await updateRetentionTestUserRow(admin, {
        userId,
        patch: body.patch && typeof body.patch === "object" ? body.patch : body,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-update-customer") {
      const customerId = Number(body.customer_id ?? body.customerId ?? req.query?.customer_id ?? req.query?.customerId ?? 0) || 0;
      if (!customerId) {
        sendJson(res, 400, { ok: false, error: "customer_id_required" });
        return;
      }
      const result = await updateRetentionTestCustomerRow(admin, {
        customerId,
        patch: body.patch && typeof body.patch === "object" ? body.patch : body,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-update-state") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await updateRetentionTestStateRow(admin, {
        userId,
        patch: body.patch && typeof body.patch === "object" ? body.patch : body,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-refresh") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      const dateKeys = Array.isArray(body.date_keys ?? body.dateKeys) ? (body.date_keys ?? body.dateKeys) : [];
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await refreshRetentionTestDates(admin, {
        userId,
        dateKeys,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-insert-water") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await insertRetentionTestWaterLog(admin, {
        userId,
        dateLocal: safeString(body.date_local ?? body.dateLocal ?? req.query?.date_local ?? req.query?.dateLocal),
        amountMl: Number(body.amount_ml ?? body.amountMl ?? req.query?.amount_ml ?? req.query?.amountMl ?? 0) || 0,
        label: safeString(body.label ?? req.query?.label),
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-insert-weight") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await insertRetentionTestWeightLog(admin, {
        userId,
        dateLocal: safeString(body.date_local ?? body.dateLocal ?? req.query?.date_local ?? req.query?.dateLocal),
        weight: Number(body.weight ?? req.query?.weight ?? 0) || 0,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-insert-meal") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await insertRetentionTestMealLog(admin, {
        userId,
        dateLocal: safeString(body.date_local ?? body.dateLocal ?? req.query?.date_local ?? req.query?.dateLocal),
        hour: Number(body.hour ?? req.query?.hour ?? 0) || 0,
        minute: Number(body.minute ?? req.query?.minute ?? 0) || 0,
        label: safeString(body.label ?? req.query?.label),
        traceId: safeString(body.trace_id ?? body.traceId ?? req.query?.trace_id ?? req.query?.traceId),
        foods: Array.isArray(body.foods) ? body.foods : [],
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-insert-meals-batch") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const items = Array.isArray(body.items) ? body.items : [];
      const result = await insertRetentionTestMealLogBatch(admin, {
        userId,
        items: items.map((item) => ({
          dateLocal: safeString(item?.date_local ?? item?.dateLocal),
          hour: Number(item?.hour ?? 0) || 0,
          minute: Number(item?.minute ?? 0) || 0,
          label: safeString(item?.label),
          traceId: safeString(item?.trace_id ?? item?.traceId) || null,
          foods: Array.isArray(item?.foods) ? item.foods : [],
        })),
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-prepare") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await prepareRetentionTestTarget(admin, {
        userId,
        baseDate: safeString(body.base_date ?? body.baseDate ?? req.query?.base_date ?? req.query?.baseDate),
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-cleanup") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await cleanupRetentionV2TestTarget(admin, {
        userId,
        baseDate: safeString(body.base_date ?? body.baseDate ?? req.query?.base_date ?? req.query?.baseDate),
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-snapshot") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await snapshotRetentionTestTarget(admin, {
        userId,
        baseDate: safeString(body.base_date ?? body.baseDate ?? req.query?.base_date ?? req.query?.baseDate),
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "test-restore") {
      const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;
      if (!snapshot) {
        sendJson(res, 400, { ok: false, error: "snapshot_required" });
        return;
      }
      const result = await restoreRetentionTestTarget(admin, { snapshot });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "backfill-state") {
      const result = await backfillRetentionState(admin, {
        userId: Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || null,
        limit: Number(body.limit ?? req.query?.limit ?? 0) || null,
      });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "seed-test-fixture") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await seedRetentionTestFixture(admin, { userId });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (action === "cleanup-test-fixture") {
      const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "user_id_required" });
        return;
      }
      const result = await cleanupRetentionTestFixture(admin, { userId });
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    sendJson(res, 404, { ok: false, error: "retention_action_not_found" });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_retention_failed");
    sendJson(
      res,
      message === "internal_access_denied"
        ? 401
        : message === "retention_schema_not_ready" || message === "feature_not_ready"
          ? 503
          : 500,
      {
        ok: false,
        error: message,
        message,
      },
    );
  }
}
