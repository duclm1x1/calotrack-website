import {
  cleanEnv,
  createServiceRoleClient,
  maybeSingle,
  readBody,
  safeString,
  sendJson,
} from "../adminServer.js";

type AnyRecord = Record<string, any>;

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_WATER_GOAL_ML = 2000;
const RETENTION_COMPAT_KEY = "retention_v1";
const MAX_COMPAT_WATER_ENTRIES = 80;

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

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/[^\d,.-]/g, "");
  if (!normalized) return fallback;
  const candidate = normalized.includes(",") && !normalized.includes(".")
    ? normalized.replace(",", ".")
    : normalized;
  const numeric = Number(candidate);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeInteger(value: unknown, fallback = 0) {
  const numeric = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function formatMlVi(value: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.max(0, safeInteger(value, 0)));
}

function normalizeTimezone(value: unknown) {
  const timeZone = safeString(value) || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function buildLocalParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
  };
}

function toLocalDateKey(date: Date, timeZone: string) {
  const parts = buildLocalParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isWaterFeatureNotReadyError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return (
    message.includes("water_logs") ||
    message.includes("water_daily_goal_ml") ||
    message.includes("user_retention_state") ||
    message.includes("refresh_user_retention_state") ||
    message.includes("schema cache")
  );
}

function isPgUniqueViolation(error: unknown) {
  const code = String((error as { code?: string })?.code || "").trim();
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique constraint");
}

async function readExistingWaterLogBySourceMessageId(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  sourceChannel: string,
  sourceMessageId: string,
) {
  if (!sourceMessageId) return null;
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("water_logs")
        .select("id, user_id, date_local, amount_ml, created_at")
        .eq("user_id", userId)
        .eq("source_channel", sourceChannel)
        .eq("source_message_id", sourceMessageId)
        .order("id", { ascending: false })
        .limit(1),
    )) || null
  );
}

function normalizeCompatPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as AnyRecord;
  return JSON.parse(JSON.stringify(value)) as AnyRecord;
}

async function readConversationStateRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("conversation_state")
        .select("user_id, customer_id, state_payload, updated_at")
        .eq("user_id", userId)
        .limit(1),
    )) || null
  );
}

function readRetentionCompatState(row: AnyRecord | null) {
  const statePayload =
    row?.state_payload && typeof row.state_payload === "object" && !Array.isArray(row.state_payload)
      ? (row.state_payload as AnyRecord)
      : {};
  return normalizeCompatPayload(statePayload[RETENTION_COMPAT_KEY]);
}

async function writeRetentionCompatState(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  customerId: number | null,
  patch: AnyRecord,
) {
  const current = await readConversationStateRow(admin, userId);
  const baseStatePayload =
    current?.state_payload && typeof current.state_payload === "object" && !Array.isArray(current.state_payload)
      ? normalizeCompatPayload(current.state_payload)
      : {};
  const nextRetention = {
    ...readRetentionCompatState(current),
    ...normalizeCompatPayload(patch),
    updated_at: new Date().toISOString(),
  };
  const nextStatePayload = {
    ...baseStatePayload,
    [RETENTION_COMPAT_KEY]: nextRetention,
  };

  if (current?.user_id) {
    const { error } = await admin
      .from("conversation_state")
      .update({
        customer_id: customerId ?? current.customer_id ?? null,
        state_payload: nextStatePayload,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from("conversation_state")
    .insert({
      user_id: userId,
      customer_id: customerId,
      state_payload: nextStatePayload,
    });
  if (error) throw error;
}

function pruneCompatWaterEntries(entries: AnyRecord[]) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object")
    .slice(-MAX_COMPAT_WATER_ENTRIES);
}

function readCompatDailyTotals(payload: AnyRecord) {
  const raw = payload.water_daily_totals;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {} as Record<string, number>;
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    next[String(key)] = Math.max(0, safeInteger(value, 0));
  }
  return next;
}

async function readUserRow(admin: ReturnType<typeof createServiceRoleClient>, userId: number) {
  const { data, error } = await admin
    .from("users")
    .select("id, customer_id, timezone")
    .eq("id", userId)
    .limit(1)
    .single();
  if (error) throw error;
  return (data || {}) as AnyRecord;
}

async function readWaterContext(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate: string,
) {
  const userRow = await readUserRow(admin, userId);
  try {
    await admin.rpc("refresh_user_retention_state", {
      p_user_id: userId,
      p_anchor_date: anchorDate,
    });
  } catch (error) {
    if (isWaterFeatureNotReadyError(error)) {
      throw new Error("feature_not_ready");
    }
    throw error;
  }

  try {
    const { data, error } = await admin
      .from("user_retention_state")
      .select("timezone, water_daily_goal_ml")
      .eq("user_id", userId)
      .limit(1)
      .single();
    if (error) throw error;
    return {
      userRow,
      timezone: normalizeTimezone(data?.timezone || userRow.timezone),
      waterGoalMl: Math.max(250, safeInteger(data?.water_daily_goal_ml, DEFAULT_WATER_GOAL_ML)),
      storage_mode: "schema",
      compatPayload: null,
    };
  } catch (error) {
    if (isWaterFeatureNotReadyError(error)) {
      const conversationState = await readConversationStateRow(admin, userId);
      const compatPayload = readRetentionCompatState(conversationState);
      return {
        userRow,
        timezone: normalizeTimezone(compatPayload.timezone || userRow.timezone),
        waterGoalMl: Math.max(250, safeInteger(compatPayload.water_daily_goal_ml, DEFAULT_WATER_GOAL_ML)),
        storage_mode: "compat",
        compatPayload,
      };
    }
    throw error;
  }
}

async function touchLastUserInteraction(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  try {
    const { error } = await admin
      .from("user_retention_state")
      .update({
        last_user_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    if (!isWaterFeatureNotReadyError(error)) {
      throw error;
    }
  }
}

async function readWaterSummary(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  dateKey: string,
  goalMl: number,
) {
  try {
    const { data, error } = await admin
      .from("water_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .eq("date_local", dateKey);
    if (error) throw error;
    const totalMl = (Array.isArray(data) ? data : []).reduce(
      (sum, row) => sum + safeInteger((row as AnyRecord).amount_ml, 0),
      0,
    );
    return buildWaterSummaryPayload(userId, dateKey, goalMl, totalMl);
  } catch (error) {
    if (isWaterFeatureNotReadyError(error)) {
      throw new Error("feature_not_ready");
    }
    throw error;
  }
}

function buildWaterSummaryPayload(userId: number, dateKey: string, goalMl: number, totalMl: number) {
  const pct = Math.max(0, Math.min(999, Math.round((totalMl / Math.max(goalMl, 1)) * 100)));
  const remainingMl = Math.max(0, goalMl - totalMl);
  return {
    ok: true,
    user_id: userId,
    date_local: dateKey,
    total_ml: totalMl,
    goal_ml: goalMl,
    remaining_ml: remainingMl,
    pct,
    reply_text:
      remainingMl > 0
        ? `💧 Hôm nay: ${formatMlVi(totalMl)} / ${formatMlVi(goalMl)}ml (${pct}%) — còn ~${formatMlVi(remainingMl)}ml nữa thôi 🎯`
        : `🎉 ${formatMlVi(totalMl)} / ${formatMlVi(goalMl)}ml — đã đủ nước hôm nay! Chuẩn luôn!`,
  };
}

function readCompatWaterSummary(userId: number, dateKey: string, goalMl: number, compatPayload: AnyRecord) {
  const totals = readCompatDailyTotals(compatPayload);
  return buildWaterSummaryPayload(userId, dateKey, goalMl, Math.max(0, safeInteger(totals[dateKey], 0)));
}

async function appendCompatWaterLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  options: {
    userId: number;
    customerId: number | null;
    dateKey: string;
    amountMl: number;
    goalMl: number;
    sourceMessageId: string;
    traceId: string;
    sourceChannel: string;
  },
) {
  const conversationState = await readConversationStateRow(admin, options.userId);
  const compatPayload = readRetentionCompatState(conversationState);
  const totals = readCompatDailyTotals(compatPayload);
  const entries = pruneCompatWaterEntries(Array.isArray(compatPayload.water_recent_entries) ? compatPayload.water_recent_entries : []);
  const sourceMessageId = safeString(options.sourceMessageId);
  const duplicate = sourceMessageId
    ? entries.some(
        (entry) =>
          safeString(entry?.date_local) === options.dateKey &&
          safeString(entry?.source_message_id) === sourceMessageId,
      )
    : false;

  if (!duplicate) {
    totals[options.dateKey] = Math.max(0, safeInteger(totals[options.dateKey], 0)) + options.amountMl;
    entries.push({
      date_local: options.dateKey,
      amount_ml: options.amountMl,
      source_message_id: sourceMessageId || null,
      trace_id: safeString(options.traceId) || null,
      source_channel: safeString(options.sourceChannel) || "zalo",
      logged_at: new Date().toISOString(),
    });
  }

  const retainedDates = new Set([
    options.dateKey,
    ...entries.map((entry) => safeString(entry?.date_local)).filter(Boolean),
  ]);
  const nextTotals: Record<string, number> = {};
  for (const dateKey of Array.from(retainedDates).filter((value): value is string => Boolean(value))) {
    nextTotals[dateKey] = Math.max(0, safeInteger(totals[dateKey], 0));
  }

  await writeRetentionCompatState(admin, options.userId, options.customerId, {
    water_daily_goal_ml: options.goalMl,
    water_daily_totals: nextTotals,
    water_recent_entries: pruneCompatWaterEntries(entries),
  });

  return buildWaterSummaryPayload(
    options.userId,
    options.dateKey,
    options.goalMl,
    Math.max(0, safeInteger(nextTotals[options.dateKey], 0)),
  );
}

export async function logWaterForUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  options: {
    userId: number;
    requestedDateKey?: string | null;
    amountMl: number;
    sourceMessageId?: string | null;
    traceId?: string | null;
    sourceChannel?: string | null;
  },
) {
  const userId = safeInteger(options.userId, 0);
  if (!userId) throw new Error("user_id_required");

  const amountMl = Math.max(1, Math.min(10000, safeInteger(options.amountMl, 0)));
  if (!amountMl) throw new Error("amount_ml_required");

  const userRow = await readUserRow(admin, userId);
  const timezone = normalizeTimezone(userRow.timezone);
  const anchorDate = safeString(options.requestedDateKey) || toLocalDateKey(new Date(), timezone);
  const context = await readWaterContext(admin, userId, anchorDate);

  await touchLastUserInteraction(admin, userId);

  const sourceMessageId = safeString(options.sourceMessageId);
  const traceId = safeString(options.traceId);
  const sourceChannel = safeString(options.sourceChannel) || "zalo";
  let summary;

  if (context.storage_mode === "compat") {
    summary = await appendCompatWaterLog(admin, {
      userId,
      customerId: userRow.customer_id ?? null,
      dateKey: anchorDate,
      amountMl,
      goalMl: context.waterGoalMl,
      sourceMessageId,
      traceId,
      sourceChannel,
    });
  } else {
    const existingLog = await readExistingWaterLogBySourceMessageId(
      admin,
      userId,
      sourceChannel,
      sourceMessageId,
    );
    if (existingLog?.id) {
      summary = await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
      summary = {
        ...(summary && typeof summary === "object" ? summary : {}),
        deduped: true,
        source_message_id: sourceMessageId,
      };
    } else {
      try {
        const { error } = await admin
          .from("water_logs")
          .insert({
            user_id: userId,
            customer_id: userRow.customer_id ?? null,
            date_local: anchorDate,
            amount_ml: amountMl,
            source_channel: sourceChannel,
            source_message_id: sourceMessageId,
            trace_id: traceId,
          });
        if (error) throw error;
      } catch (error) {
        if (isPgUniqueViolation(error) && sourceMessageId) {
          summary = await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
          summary = {
            ...(summary && typeof summary === "object" ? summary : {}),
            deduped: true,
            source_message_id: sourceMessageId,
          };
        } else if (isWaterFeatureNotReadyError(error)) {
          summary = await appendCompatWaterLog(admin, {
            userId,
            customerId: userRow.customer_id ?? null,
            dateKey: anchorDate,
            amountMl,
            goalMl: context.waterGoalMl,
            sourceMessageId,
            traceId,
            sourceChannel,
          });
          context.storage_mode = "compat";
        } else {
          throw error;
        }
      }
    }
    if (!summary) {
      summary = await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
    }
  }

  return {
    ...summary,
    logged_amount_ml: amountMl,
    storage_mode: context.storage_mode,
    reply_text: [
      `💧 +${formatMlVi(amountMl)}ml — ghi xong!`,
      summary.remaining_ml > 0
        ? `Hôm nay: ${formatMlVi(summary.total_ml)} / ${formatMlVi(summary.goal_ml)}ml (${summary.pct}%) — còn ~${formatMlVi(summary.remaining_ml)}ml nữa thôi 🎯`
        : `🎉 ${formatMlVi(summary.total_ml)} / ${formatMlVi(summary.goal_ml)}ml — đã đủ nước hôm nay! Chuẩn luôn!`,
    ].join("\n"),
  };
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
    const admin = createServiceRoleClient();
    const body = req.method === "POST" ? await readBody(req) : {};
    const userId = Number(body.user_id ?? body.userId ?? req.query?.user_id ?? req.query?.userId ?? 0) || 0;
    if (!userId) {
      sendJson(res, 400, { ok: false, error: "user_id_required" });
      return;
    }

    const requestedDateKey =
      safeString(body.date_local || body.dateLocal || req.query?.date_local || req.query?.dateLocal) || "";
    const userRow = await readUserRow(admin, userId);
    const timezone = normalizeTimezone(userRow.timezone);
    const anchorDate = requestedDateKey || toLocalDateKey(new Date(), timezone);
    const context = await readWaterContext(admin, userId, anchorDate);

    if (action === "summary") {
      const summary =
        context.storage_mode === "compat"
          ? readCompatWaterSummary(userId, anchorDate, context.waterGoalMl, context.compatPayload || {})
          : await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
      sendJson(res, 200, summary);
      return;
    }

    if (action === "log") {
      const amountMl = Math.max(1, Math.min(10000, safeInteger(body.amount_ml ?? body.amountMl, 0)));
      if (!amountMl) {
        sendJson(res, 400, { ok: false, error: "amount_ml_required" });
        return;
      }

      await touchLastUserInteraction(admin, userId);

      const sourceMessageId = safeString(body.source_message_id || body.sourceMessageId) || "";
      const traceId = safeString(body.trace_id || body.traceId) || "";
      const sourceChannel = safeString(body.source_channel || body.sourceChannel) || "zalo";
      let summary;
      if (context.storage_mode === "compat") {
        summary = await appendCompatWaterLog(admin, {
          userId,
          customerId: userRow.customer_id ?? null,
          dateKey: anchorDate,
          amountMl,
          goalMl: context.waterGoalMl,
          sourceMessageId,
          traceId,
          sourceChannel,
        });
      } else {
        const existingLog = await readExistingWaterLogBySourceMessageId(
          admin,
          userId,
          sourceChannel,
          sourceMessageId,
        );
        if (existingLog?.id) {
          summary = await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
          summary = {
            ...(summary && typeof summary === "object" ? summary : {}),
            deduped: true,
            source_message_id: sourceMessageId,
          };
        } else {
          try {
            const { error } = await admin
              .from("water_logs")
              .insert({
                user_id: userId,
                customer_id: userRow.customer_id ?? null,
                date_local: anchorDate,
                amount_ml: amountMl,
                source_channel: sourceChannel,
                source_message_id: sourceMessageId,
                trace_id: traceId,
              });
            if (error) throw error;
          } catch (error) {
            if (isPgUniqueViolation(error) && sourceMessageId) {
              summary = await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
              summary = {
                ...(summary && typeof summary === "object" ? summary : {}),
                deduped: true,
                source_message_id: sourceMessageId,
              };
            } else if (isWaterFeatureNotReadyError(error)) {
              summary = await appendCompatWaterLog(admin, {
                userId,
                customerId: userRow.customer_id ?? null,
                dateKey: anchorDate,
                amountMl,
                goalMl: context.waterGoalMl,
                sourceMessageId,
                traceId,
                sourceChannel,
              });
              context.storage_mode = "compat";
            } else {
              throw error;
            }
          }
        }
        if (!summary) {
          summary = await readWaterSummary(admin, userId, anchorDate, context.waterGoalMl);
        }
      }
      sendJson(res, 200, {
        ...summary,
        logged_amount_ml: amountMl,
        reply_text: [
          `💧 +${formatMlVi(amountMl)}ml — ghi xong!`,
          summary.remaining_ml > 0
            ? `Hôm nay: ${formatMlVi(summary.total_ml)} / ${formatMlVi(summary.goal_ml)}ml (${summary.pct}%) — còn ~${formatMlVi(summary.remaining_ml)}ml nữa thôi 🎯`
            : `🎉 ${formatMlVi(summary.total_ml)} / ${formatMlVi(summary.goal_ml)}ml — đã đủ nước hôm nay! Chuẩn luôn!`,
        ].join("\n"),
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "water_action_not_found" });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_water_failed");
    sendJson(
      res,
      message === "internal_access_denied"
        ? 401
        : message === "feature_not_ready"
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
