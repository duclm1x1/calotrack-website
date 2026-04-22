import { createHash } from "node:crypto";

import {
  createServiceRoleClient,
  maybeSingle,
  safeString,
} from "./adminServer.js";
import {
  getDashboardSummary,
  refreshStats,
  resolveContextByCustomerId,
  resolveContextByUserId,
  type DashboardContext,
} from "./dashboardSummaryServer.js";
import { sendZaloCsMessage } from "./zaloOaServer.js";

type AnyRecord = Record<string, any>;
type RetentionCampaignKind =
  | "meal_reminder"
  | "morning_greeting"
  | "water_morning_nudge"
  | "water_midday_nudge"
  | "evening_gym_nudge"
  | "end_of_day_recap"
  | "weekly_report"
  | "monthly_wrapped"
  | "body_checkin"
  | "inactive_nudge"
  | "renewal_hook"
  | "streak_milestone"
  | "quick_log_suggestion"
  | "goal_reached"
  | "weight_drop";
type NotificationSettingKey =
  | "morning_greeting"
  | "water_morning"
  | "water_midday"
  | "meal_breakfast"
  | "meal_lunch"
  | "meal_dinner"
  | "evening_gym_nudge"
  | "recap"
  | "weekly_report"
  | "monthly_wrapped"
  | "body_checkin"
  | "streak_milestone"
  | "quick_log_suggestion"
  | "goal_reached"
  | "inactive_nudge"
  | "weight_drop"
  | "renewal_hook";
type PendingEventKind =
  | "streak_milestone"
  | "quick_log_suggestion"
  | "goal_reached"
  | "weight_drop";
type ReminderSlot = "breakfast" | "lunch" | "dinner";
type DecorateKind =
  | "meal_log"
  | "weight_log"
  | "daily_summary"
  | "weekly_summary"
  | "monthly_summary";
type PendingEventPush = {
  kind: PendingEventKind;
  payload: AnyRecord;
  queued_at?: string | null;
};
type DispatchCandidate = {
  campaignKind: RetentionCampaignKind;
  notificationKey: NotificationSettingKey;
  campaignKey: string;
  scheduledFor: string;
  text: string;
  payload: AnyRecord;
  statePatch?: AnyRecord | null;
  queuedEvent?: PendingEventPush | null;
};
type PushGateDecision = { allow: true } | { allow: false; reason: string };
type RetentionSchemaHealth =
  | "schema_ready"
  | "schema_temporarily_unavailable"
  | "compat_only"
  | "unsafe_permission_denied"
  | "unsafe_unknown";
type RetentionDispatchHealth = {
  storageMode: RetentionStorageMode;
  schemaHealth: RetentionSchemaHealth;
  dispatchAllowed: boolean;
  blockerReason: string | null;
  claimBackend: "retention_dispatches" | "unavailable";
  probeErrors: string[];
  checkedTables: string[];
  checkedAt: string;
};

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_QUIET_HOURS_START_MINUTE = 22 * 60 + 30;
const DEFAULT_QUIET_HOURS_END_MINUTE = 6 * 60 + 30;
const HARD_QUIET_START_MINUTE = 22 * 60;
const HARD_QUIET_END_MINUTE = 7 * 60;
const MORNING_GREETING_MINUTE = 8 * 60;
const DEFAULT_BREAKFAST_MINUTE = MORNING_GREETING_MINUTE;
const DEFAULT_LUNCH_MINUTE = 12 * 60 + 15;
const DEFAULT_DINNER_MINUTE = 19 * 60;
const EVENING_GYM_NUDGE_MINUTE = 19 * 60;
const WATER_MORNING_MINUTE = 9 * 60;
const WATER_MIDDAY_MINUTE = 15 * 60;
const RENEWAL_HOOK_MINUTE = 9 * 60;
const INACTIVE_NUDGE_MINUTE = 9 * 60;
const DISPATCH_BUCKET_MINUTES = 15;
const QUICK_LOG_LOOKBACK_DAYS = 30;
const MAX_DAILY_PUSH = 3;
const USER_INTERACTION_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const INACTIVE_NUDGE_THRESHOLD_DAYS = 2;
const PENDING_EVENT_QUEUE_MAX = 20;
const MILESTONE_DAYS = new Set([3, 7, 14, 30, 90]);
const RETENTION_COMPAT_KEY = "retention_v1";
const RETENTION_V2_TEST_PREFIX = "retention_v2_test";
const RETENTION_TEST_SEED_PREFIX = "retention_test_seed";
const RETENTION_NOTIFICATION_KEYS = [
  "morning_greeting",
  "water_morning",
  "water_midday",
  "meal_breakfast",
  "meal_lunch",
  "meal_dinner",
  "evening_gym_nudge",
  "recap",
  "weekly_report",
  "monthly_wrapped",
  "body_checkin",
  "streak_milestone",
  "quick_log_suggestion",
  "goal_reached",
  "inactive_nudge",
  "weight_drop",
  "renewal_hook",
] as const satisfies NotificationSettingKey[];
const RETENTION_TEST_USER_RESTORE_KEYS = [
  "primary_goal",
  "goal_mode",
  "goal_mode_variant",
  "goal_weekly_rate_kg",
  "daily_calorie_goal",
  "tdee",
  "weight_kg",
  "target_metric",
  "target_weight_kg",
  "target_body_fat_pct",
  "current_body_fat_pct",
  "latest_body_composition_at",
] as const;
const RETENTION_TEST_CUSTOMER_RESTORE_KEYS = [
  "plan",
  "premium_until",
  "status",
  "access_state",
  "trial_ends_at",
  "gym_mode_until",
] as const;

type RetentionStateRow = {
  user_id: number;
  customer_id: number | null;
  channel: string | null;
  timezone: string | null;
  reminders_enabled: boolean | null;
  recap_enabled: boolean | null;
  weekly_report_enabled: boolean | null;
  monthly_wrapped_enabled: boolean | null;
  quiet_hours_start_minute: number | null;
  quiet_hours_end_minute: number | null;
  breakfast_reminder_minute: number | null;
  lunch_reminder_minute: number | null;
  dinner_reminder_minute: number | null;
  meal_pattern_basis: AnyRecord | null;
  last_pattern_refresh_at: string | null;
  current_streak_days: number | null;
  best_streak_days: number | null;
  last_log_date: string | null;
  last_meal_log_at: string | null;
  last_recap_date: string | null;
  last_weekly_report_week_start: string | null;
  last_monthly_wrapped_month_start: string | null;
  last_milestone_sent: number | null;
  freeze_tokens_remaining: number | null;
  freeze_tokens_reset_week_start: string | null;
  last_freeze_used_date: string | null;
  water_daily_goal_ml: number | null;
  body_checkin_enabled: boolean | null;
  last_body_checkin_date: string | null;
  daily_push_count: number | null;
  daily_push_count_date: string | null;
  last_user_interaction_at: string | null;
  last_water_morning_nudge_date: string | null;
  last_water_midday_nudge_date: string | null;
  last_inactive_nudge_at: string | null;
  last_inactive_nudge_iso_week: string | null;
  last_renewal_hook_t5_date: string | null;
  last_renewal_hook_t2_date: string | null;
  last_renewal_hook_t0_date: string | null;
  pending_event_pushes: PendingEventPush[] | null;
  last_quick_log_suggestion_combo_key: string | null;
  last_quick_log_suggestion_at: string | null;
  last_goal_reached_date: string | null;
  last_weight_drop_alert_iso_week: string | null;
  notification_settings: AnyRecord | null;
  updated_at: string | null;
};

type RetentionTarget = {
  state: RetentionStateRow;
  context: DashboardContext;
  userRow: AnyRecord;
  customerRow: AnyRecord | null;
  zaloChannel: AnyRecord | null;
  timeZone: string;
};

type RetentionStorageMode = "schema" | "compat";

type CompatConversationStateRow = {
  user_id: number;
  customer_id: number | null;
  state_payload: AnyRecord | null;
  updated_at: string | null;
};

type CompatDispatchRecord = {
  id: string;
  user_id: number;
  customer_id: number | null;
  channel: string;
  platform_user_id: string | null;
  campaign_kind: RetentionCampaignKind;
  campaign_key: string;
  scheduled_for: string;
  status: string;
  action_status: string;
  payload: AnyRecord | null;
  provider_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type DispatchResult = {
  user_id: number;
  customer_id: number | null;
  campaign_kind: RetentionCampaignKind;
  campaign_key: string;
  status: string;
  provider_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  scheduled_for: string;
};

type DecorateReplyInput = {
  kind?: string | null;
  user_id?: number | null;
  linked_user_id?: number | null;
  customer_id?: number | null;
  base_reply_text?: string | null;
  payload?: AnyRecord | null;
  date_local?: string | null;
  meal_log_id?: number | null;
  daily_stats_snapshot?: AnyRecord | null;
  dry_run?: boolean | null;
};

type DecorateReplyResult = {
  payload: AnyRecord;
  decorated_reply_text: string;
  insight_meta: AnyRecord;
  streak_meta: AnyRecord;
};

type FreezeApplyResult = {
  ok: boolean;
  feature_ready: boolean;
  freeze_used: boolean;
  frozen_date: string | null;
  tokens_remaining: number | null;
  reason: string | null;
};

type RetentionTestSeedItem = {
  dateKey: string;
  loggedAt: string;
  slot: ReminderSlot;
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

let cachedRetentionStorageMode: RetentionStorageMode | null = null;

const RETENTION_TEST_SEED_ITEMS: RetentionTestSeedItem[] = [
  { dateKey: "2026-04-14", loggedAt: "2026-04-14T12:12:00+07:00", slot: "lunch", title: "Cơm gà", calories: 620, protein: 35, carbs: 72, fat: 18 },
  { dateKey: "2026-04-13", loggedAt: "2026-04-13T18:35:00+07:00", slot: "dinner", title: "Bánh mì trứng", calories: 420, protein: 18, carbs: 45, fat: 17 },
  { dateKey: "2026-04-12", loggedAt: "2026-04-12T12:20:00+07:00", slot: "lunch", title: "Phở bò", calories: 520, protein: 28, carbs: 54, fat: 19 },
  { dateKey: "2026-04-10", loggedAt: "2026-04-10T12:18:00+07:00", slot: "lunch", title: "Cơm tấm sườn", calories: 710, protein: 32, carbs: 78, fat: 28 },
  { dateKey: "2026-04-08", loggedAt: "2026-04-08T19:05:00+07:00", slot: "dinner", title: "Bún bò", calories: 560, protein: 27, carbs: 63, fat: 21 },
  { dateKey: "2026-03-03", loggedAt: "2026-03-03T12:16:00+07:00", slot: "lunch", title: "Cơm gà xối mỡ", calories: 690, protein: 31, carbs: 74, fat: 27 },
  { dateKey: "2026-03-07", loggedAt: "2026-03-07T18:42:00+07:00", slot: "dinner", title: "Bún chả", calories: 610, protein: 29, carbs: 58, fat: 26 },
  { dateKey: "2026-03-12", loggedAt: "2026-03-12T12:11:00+07:00", slot: "lunch", title: "Bánh mì thịt", calories: 430, protein: 16, carbs: 44, fat: 19 },
  { dateKey: "2026-03-18", loggedAt: "2026-03-18T18:55:00+07:00", slot: "dinner", title: "Mì xào bò", calories: 590, protein: 24, carbs: 67, fat: 24 },
  { dateKey: "2026-03-25", loggedAt: "2026-03-25T12:24:00+07:00", slot: "lunch", title: "Cơm cá hồi", calories: 640, protein: 34, carbs: 69, fat: 22 },
];

function cleanJson<T extends AnyRecord>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickObjectKeys(row: AnyRecord | null | undefined, keys: readonly string[]) {
  const source = row && typeof row === "object" ? (row as AnyRecord) : {};
  const output: AnyRecord = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      output[key] = source[key];
    }
  }
  return output;
}

function filterPatchByExistingKeys(row: AnyRecord | null | undefined, patch: AnyRecord | null | undefined) {
  const source = row && typeof row === "object" ? (row as AnyRecord) : {};
  const input = patch && typeof patch === "object" ? cleanJson(patch as AnyRecord) : {};
  const output: AnyRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      output[key] = value;
    }
  }
  return output;
}

function normalizePendingEventPushes(value: unknown) {
  if (!Array.isArray(value)) return [] as PendingEventPush[];
  return value
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => {
      const row = entry as AnyRecord;
      return {
        kind: safeString(row.kind) as PendingEventKind,
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? cleanJson(row.payload as AnyRecord)
            : {},
        queued_at: safeString(row.queued_at) || null,
      } satisfies PendingEventPush;
    })
    .filter((entry) => entry.kind) as PendingEventPush[];
}

function normalizeNotificationSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Partial<Record<NotificationSettingKey, boolean>>;
  const next: Partial<Record<NotificationSettingKey, boolean>> = {};
  for (const key of RETENTION_NOTIFICATION_KEYS) {
    if ((value as AnyRecord)[key] === false) {
      next[key] = false;
    }
  }
  return next;
}

function isNotificationDisabled(
  settings: Partial<Record<NotificationSettingKey, boolean>>,
  key: NotificationSettingKey,
) {
  if (settings[key] === false) return true;
  if (key === "morning_greeting" && settings.meal_breakfast === false) return true;
  if (key === "evening_gym_nudge" && settings.meal_dinner === false) return true;
  return false;
}

function normalizeRetentionStateRow<T extends RetentionStateRow>(row: T): T {
  return {
    ...row,
    lunch_reminder_minute: DEFAULT_LUNCH_MINUTE,
    pending_event_pushes: normalizePendingEventPushes(row.pending_event_pushes),
    notification_settings: normalizeNotificationSettings(row.notification_settings),
  };
}

function mutateTargetState(target: RetentionTarget, patch: AnyRecord | null | undefined) {
  if (!patch || typeof patch !== "object") return;
  target.state = normalizeRetentionStateRow({
    ...target.state,
    ...cleanJson(patch as AnyRecord),
  } as RetentionStateRow);
}

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/[^\d,.-]/g, "");
  if (!normalized) return fallback;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  let candidate = normalized;
  if (hasComma && hasDot) {
    candidate =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (hasComma) {
    candidate = normalized.replace(",", ".");
  }
  const numeric = Number(candidate);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeInteger(value: unknown, fallback = 0) {
  const numeric = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function roundNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatIntVi(value: unknown) {
  return Math.round(toFiniteNumber(value, 0)).toLocaleString("vi-VN");
}

function formatGramVi(value: unknown, digits = 1) {
  return roundNumber(toFiniteNumber(value, 0), digits).toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
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
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

function toLocalDateKey(date: Date, timeZone: string) {
  const parts = buildLocalParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function toLocalMinuteOfDay(date: Date, timeZone: string) {
  const parts = buildLocalParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

function getLocalDayOfWeek(date: Date, timeZone: string) {
  const parts = buildLocalParts(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function getBucketRange(minuteOfDay: number) {
  const start = Math.floor(minuteOfDay / DISPATCH_BUCKET_MINUTES) * DISPATCH_BUCKET_MINUTES;
  return {
    start,
    end: start + DISPATCH_BUCKET_MINUTES - 1,
  };
}

function isMinuteInRange(minute: number, start: number, end: number) {
  if (start <= end) return minute >= start && minute <= end;
  return minute >= start || minute <= end;
}

function shiftDateKey(dateKey: string, deltaDays: number) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function startOfWeekDateKey(dateKey: string) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  const day = base.getUTCDay();
  const offset = (day + 6) % 7;
  base.setUTCDate(base.getUTCDate() - offset);
  return base.toISOString().slice(0, 10);
}

function endOfMonthDateKey(monthStartKey: string) {
  const [yearText, monthText] = monthStartKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
  return nextMonth.toISOString().slice(0, 10);
}

function currentMonthStart(dateKey: string) {
  return `${safeString(dateKey).slice(0, 7)}-01`;
}

function makeRetentionAnchorDate(dateKey: string, hour = 12, minute = 0) {
  return new Date(
    `${dateKey}T${String(Math.max(0, hour)).padStart(2, "0")}:${String(Math.max(0, minute)).padStart(2, "0")}:00+07:00`,
  );
}

function removeAccents(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, (char) => (char === "đ" ? "d" : "D"));
}

function normalizeLooseText(value: unknown) {
  return removeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classifyMealSlotFromMinute(minuteOfDay: number): ReminderSlot | null {
  if (minuteOfDay >= 5 * 60 && minuteOfDay <= 10 * 60 + 30) return "breakfast";
  if (minuteOfDay >= 11 * 60 && minuteOfDay <= 15 * 60) return "lunch";
  if (minuteOfDay >= 17 * 60 && minuteOfDay <= 21 * 60 + 30) return "dinner";
  return null;
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

function firstNonEmptyText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && typeof (value as AnyRecord).text === "string" && (value as AnyRecord).text.trim()) {
      return String((value as AnyRecord).text).trim();
    }
  }
  return "";
}

function isRetentionTableMissing(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as Error)?.message ?? error ?? "").toLowerCase();
  // SQLSTATE 42P01 = undefined_table; PGRST205 = relation not in schema cache
  if (code === "42P01" || code === "PGRST205") return true;
  // Fallback for errors without structured code (raw PostgREST text)
  return /relation ".+?" does not exist|table ".+?" does not exist/.test(message);
}

function isRetentionFunctionMissing(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "");
  // SQLSTATE 42883 = undefined_function; PGRST202 = function schema cache miss
  if (code === "42883" || code === "PGRST202") return true;
  return false;
}

function isRetentionColumnMissing(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as Error)?.message ?? error ?? "").toLowerCase();
  // SQLSTATE 42703 = undefined_column; PGRST204 = column missing from schema cache
  if (code === "42703" || code === "PGRST204") return true;
  return (
    /column ".+?" does not exist/.test(message) ||
    /could not find the '.+?' column of '.+?' in the schema cache/.test(message)
  );
}

function isRetentionPermissionDenied(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "");
  // SQLSTATE 42501 = insufficient_privilege; 28000 = invalid_authorization_specification; PGRST301 = role not found
  return code === "42501" || code === "28000" || code === "PGRST301";
}

function isRetentionCompatFallbackError(error: unknown) {
  return isRetentionTableMissing(error) || isRetentionFunctionMissing(error);
}

async function resolveRetentionStorageMode(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<RetentionStorageMode> {
  try {
    const { error } = await admin
      .from("user_retention_state")
      .select("user_id")
      .limit(1);
    if (error) throw error;
    return "schema";
  } catch (error) {
    if (isRetentionTableMissing(error) || isRetentionFunctionMissing(error)) {
      return "compat";
    } else {
      throw error;
    }
  }
}

export async function readRetentionDispatchHealth(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<RetentionDispatchHealth> {
  const probeErrors: string[] = [];
  const checkedTables = ["user_retention_state", "retention_dispatches"];
  const checkedAt = new Date().toISOString();
  const captureError = (error: unknown) => {
    const message = String((error as Error)?.message || error || "unknown_error");
    probeErrors.push(message);
    return message.toLowerCase();
  };

  try {
    const { error: stateError } = await admin
      .from("user_retention_state")
      .select("user_id")
      .limit(1);
    if (stateError) throw stateError;

    const { error: dispatchError } = await admin
      .from("retention_dispatches")
      .select("id")
      .limit(1);
    if (dispatchError) throw dispatchError;

    cachedRetentionStorageMode = "schema";
    return {
      storageMode: "schema",
      schemaHealth: "schema_ready",
      dispatchAllowed: true,
      blockerReason: null,
      claimBackend: "retention_dispatches",
      probeErrors,
      checkedTables,
      checkedAt,
    };
  } catch (error) {
    const message = captureError(error);
    const compatLike = isRetentionTableMissing(error) || isRetentionFunctionMissing(error);
    cachedRetentionStorageMode = compatLike ? "compat" : cachedRetentionStorageMode;
    if (compatLike) {
      return {
        storageMode: "compat",
        schemaHealth: "compat_only",
        dispatchAllowed: false,
        blockerReason: "unsafe_retention_storage_mode",
        claimBackend: "unavailable",
        probeErrors,
        checkedTables,
        checkedAt,
      };
    }

    if (isRetentionPermissionDenied(error)) {
      return {
        storageMode: "schema",
        schemaHealth: "unsafe_permission_denied",
        dispatchAllowed: false,
        blockerReason: "retention_permission_denied",
        claimBackend: "unavailable",
        probeErrors,
        checkedTables,
        checkedAt,
      };
    }

    if (message.includes("schema cache") || message.includes("timeout") || message.includes("connection")) {
      return {
        storageMode: "schema",
        schemaHealth: "schema_temporarily_unavailable",
        dispatchAllowed: false,
        blockerReason: "retention_schema_unavailable",
        claimBackend: "unavailable",
        probeErrors,
        checkedTables,
        checkedAt,
      };
    }

    return {
      storageMode: "schema",
      schemaHealth: "unsafe_unknown",
      dispatchAllowed: false,
      blockerReason: "retention_schema_unknown",
      claimBackend: "unavailable",
      probeErrors,
      checkedTables,
      checkedAt,
    };
  }
}

function buildRetentionDispatchHealthFromError(
  error: unknown,
  checkedTables: string[],
): RetentionDispatchHealth {
  const probeErrors = [String((error as Error)?.message || error || "unknown_error")];
  const checkedAt = new Date().toISOString();
  const compatLike = isRetentionTableMissing(error) || isRetentionFunctionMissing(error);
  if (compatLike) {
    cachedRetentionStorageMode = "compat";
    return {
      storageMode: "compat",
      schemaHealth: "compat_only",
      dispatchAllowed: false,
      blockerReason: "unsafe_retention_storage_mode",
      claimBackend: "unavailable",
      probeErrors,
      checkedTables,
      checkedAt,
    };
  }
  if (isRetentionPermissionDenied(error)) {
    return {
      storageMode: "schema",
      schemaHealth: "unsafe_permission_denied",
      dispatchAllowed: false,
      blockerReason: "retention_permission_denied",
      claimBackend: "unavailable",
      probeErrors,
      checkedTables,
      checkedAt,
    };
  }
  const message = probeErrors[0].toLowerCase();
  if (message.includes("schema cache") || message.includes("timeout") || message.includes("connection")) {
    return {
      storageMode: "schema",
      schemaHealth: "schema_temporarily_unavailable",
      dispatchAllowed: false,
      blockerReason: "retention_schema_unavailable",
      claimBackend: "unavailable",
      probeErrors,
      checkedTables,
      checkedAt,
    };
  }
  return {
    storageMode: "schema",
    schemaHealth: "unsafe_unknown",
    dispatchAllowed: false,
    blockerReason: "retention_schema_unknown",
    claimBackend: "unavailable",
    probeErrors,
    checkedTables,
    checkedAt,
  };
}

async function readRetentionDispatchStateRows(
  admin: ReturnType<typeof createServiceRoleClient>,
  options?: {
    userId?: number | null;
  },
): Promise<{
  rows: RetentionStateRow[];
  health: RetentionDispatchHealth | null;
}> {
  const checkedTables = ["user_retention_state"];
  try {
    const query = admin
      .from("user_retention_state")
      .select("*")
      .eq("channel", "zalo");
    if (options?.userId) {
      query.eq("user_id", options.userId);
    }
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(options?.userId ? 1 : 500);
    if (error) throw error;
    return {
      rows: Array.isArray(data) ? (data as RetentionStateRow[]) : [],
      health: null,
    };
  } catch (error) {
    return {
      rows: [],
      health: buildRetentionDispatchHealthFromError(error, checkedTables),
    };
  }
}

function retentionSourceMessageId(
  payload: Pick<
    DispatchResult,
    "campaign_kind" | "campaign_key" | "user_id"
  >,
) {
  return `retention:${payload.campaign_kind}:${payload.campaign_key}:${payload.user_id}`;
}

function normalizeRetentionCompatPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as AnyRecord;
  return cleanJson(value as AnyRecord);
}

function shouldOverlayCompatRetentionState(
  row: RetentionStateRow,
  compatPayload: AnyRecord,
) {
  if (!compatPayload || !Object.keys(compatPayload).length) return false;
  if (!Object.prototype.hasOwnProperty.call(row, "notification_settings")) return true;
  const rowUpdatedAt = Date.parse(safeString(row.updated_at) || "");
  const compatUpdatedAt = Date.parse(safeString(compatPayload.updated_at) || "");
  if (!Number.isFinite(compatUpdatedAt)) return false;
  if (!Number.isFinite(rowUpdatedAt)) return true;
  return compatUpdatedAt >= rowUpdatedAt;
}

function mergeRetentionStateWithCompatPayload(
  row: RetentionStateRow,
  compatPayloadRaw: unknown,
) {
  const compatPayload = normalizeRetentionCompatPayload(compatPayloadRaw);
  if (!shouldOverlayCompatRetentionState(row, compatPayload)) {
    return normalizeRetentionStateRow(row);
  }
  return normalizeRetentionStateRow({
    ...row,
    ...compatPayload,
    user_id: row.user_id,
    customer_id: row.customer_id,
    channel: row.channel,
  } as RetentionStateRow);
}

function readRetentionCompatStatePayload(row: CompatConversationStateRow | null) {
  const statePayload =
    row?.state_payload && typeof row.state_payload === "object" && !Array.isArray(row.state_payload)
      ? (row.state_payload as AnyRecord)
      : {};
  return normalizeRetentionCompatPayload(statePayload[RETENTION_COMPAT_KEY]);
}

function normalizeRetentionCompatDispatchesPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, CompatDispatchRecord>;
  const input = value as Record<string, AnyRecord>;
  const entries = Object.entries(input)
    .filter(([key, entry]) => key && entry && typeof entry === "object" && !Array.isArray(entry))
    .map(([key, entry]) => {
      const nowIso = new Date().toISOString();
      const normalized = {
        id: safeString(entry.id) || key,
        user_id: safeInteger(entry.user_id, 0),
        customer_id: entry.customer_id == null ? null : safeInteger(entry.customer_id, 0),
        channel: safeString(entry.channel) || "zalo",
        platform_user_id: safeString(entry.platform_user_id) || null,
        campaign_kind: safeString(entry.campaign_kind) as RetentionCampaignKind,
        campaign_key: safeString(entry.campaign_key) || "",
        scheduled_for: safeString(entry.scheduled_for) || "",
        status: safeString(entry.status) || "scheduled",
        action_status: safeString(entry.action_status) || "received",
        payload: entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
          ? cleanJson(entry.payload as AnyRecord)
          : null,
        provider_msg_id: safeString(entry.provider_msg_id) || null,
        error_code: safeString(entry.error_code) || null,
        error_message: safeString(entry.error_message) || null,
        sent_at: safeString(entry.sent_at) || null,
        created_at: safeString(entry.created_at) || nowIso,
        updated_at: safeString(entry.updated_at) || nowIso,
      } satisfies CompatDispatchRecord;
      return [normalized.id, normalized] as const;
    });
  return Object.fromEntries(entries) as Record<string, CompatDispatchRecord>;
}

function pruneRetentionCompatDispatches(
  dispatches: Record<string, CompatDispatchRecord>,
  maxEntries = 120,
) {
  const rows = Object.values(dispatches)
    .sort((left, right) => {
      const rightAt = safeString(right.updated_at || right.created_at) || "";
      const leftAt = safeString(left.updated_at || left.created_at) || "";
      return rightAt.localeCompare(leftAt);
    })
    .slice(0, Math.max(10, maxEntries));
  return Object.fromEntries(rows.map((row) => [row.id, row])) as Record<string, CompatDispatchRecord>;
}

function extractUserIdFromRetentionDispatchId(dispatchId: string) {
  const match = String(dispatchId || "").match(/:(\d+)$/);
  return match ? safeInteger(match[1], 0) : 0;
}

async function readConversationStateRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  return (
    (await maybeSingle<CompatConversationStateRow>(
      admin
        .from("conversation_state")
        .select("user_id, customer_id, state_payload, updated_at")
        .eq("user_id", userId)
        .limit(1),
    )) || null
  );
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
      ? cleanJson(current.state_payload as AnyRecord)
      : {};
  const nextRetention = {
    ...readRetentionCompatStatePayload(current),
    ...cleanJson(patch),
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

async function replaceRetentionCompatState(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  customerId: number | null,
  nextRetentionRaw: AnyRecord,
) {
  const current = await readConversationStateRow(admin, userId);
  const baseStatePayload =
    current?.state_payload && typeof current.state_payload === "object" && !Array.isArray(current.state_payload)
      ? cleanJson(current.state_payload as AnyRecord)
      : {};
  const nextStatePayload = {
    ...baseStatePayload,
    [RETENTION_COMPAT_KEY]: cleanJson(nextRetentionRaw || {}),
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

async function readLastMealLogRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("meal_logs")
        .select("date_local, logged_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(1),
    )) || null
  );
}

function medianOfNumbers(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return roundNumber((sorted[middle - 1] + sorted[middle]) / 2, 0);
}

function clampMinuteOfDay(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, safeInteger(value, min)));
}

async function readRecentMealLogsForPattern(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate: string,
) {
  const lookbackStart = shiftDateKey(anchorDate, -13);
  const { data, error } = await admin
    .from("meal_logs")
    .select("date_local, logged_at")
    .eq("user_id", userId)
    .gte("date_local", lookbackStart)
    .order("logged_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? (data as AnyRecord[]) : [];
}

async function readLoggedDateKeys(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  let rows: AnyRecord[] = [];
  const dailyResult = await admin
    .from("daily_user_stats")
    .select("date_local, meal_count")
    .eq("user_id", userId)
    .gt("meal_count", 0)
    .order("date_local", { ascending: true })
    .limit(2000);
  if (!dailyResult.error) {
    rows = Array.isArray(dailyResult.data) ? (dailyResult.data as AnyRecord[]) : [];
  }

  if (!rows.length) {
    const mealResult = await admin
      .from("meal_logs")
      .select("date_local")
      .eq("user_id", userId)
      .order("date_local", { ascending: true })
      .limit(2000);
    if (mealResult.error) throw mealResult.error;
    rows = Array.isArray(mealResult.data) ? (mealResult.data as AnyRecord[]) : [];
  }

  return Array.from(
    new Set(
      rows
        .map((row) => safeString(row.date_local))
        .filter(Boolean),
    ),
  ) as string[];
}

function computeStreakFromDates(dateKeys: string[]) {
  const sorted = [...dateKeys].sort();
  if (!sorted.length) {
    return {
      current: 0,
      best: 0,
      lastLogDate: null as string | null,
    };
  }

  let best = 0;
  let running = 0;
  let previous: string | null = null;
  for (const dateKey of sorted) {
    if (previous && shiftDateKey(previous, 1) === dateKey) {
      running += 1;
    } else {
      running = 1;
    }
    best = Math.max(best, running);
    previous = dateKey;
  }

  const lastLogDate = sorted[sorted.length - 1] || null;
  let current = 0;
  let cursor = lastLogDate;
  const dateSet = new Set(sorted);
  while (cursor && dateSet.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return {
    current,
    best,
    lastLogDate,
  };
}

function withSyntheticLoggedDate(dateKeys: string[], syntheticDate: string | null) {
  const normalized = safeString(syntheticDate);
  if (!normalized) return [...dateKeys];
  return Array.from(new Set([...dateKeys, normalized])).sort();
}

async function buildCompatRetentionState(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate = toLocalDateKey(new Date(), DEFAULT_TIMEZONE),
) {
  const context = await resolveContextByUserId(admin, userId);
  const conversationState = await readConversationStateRow(admin, userId);
  const compatPayload = readRetentionCompatStatePayload(conversationState);
  const timeZone = normalizeTimezone(compatPayload.timezone || context.userRow?.timezone);
  const recentLogs = await readRecentMealLogsForPattern(admin, userId, anchorDate);
  const lastMealLog = await readLastMealLogRow(admin, userId);
  const loggedDateKeys = await readLoggedDateKeys(admin, userId);
  const anchorWeekStart = startOfWeekDateKey(anchorDate);
  const compatFreezeResetWeekStart = safeString(compatPayload.freeze_tokens_reset_week_start);
  const compatFreezeTokensRemaining =
    compatFreezeResetWeekStart === anchorWeekStart
      ? Math.max(0, safeInteger(compatPayload.freeze_tokens_remaining, 1))
      : 1;
  const compatFreezeDate =
    compatFreezeResetWeekStart === anchorWeekStart
      ? safeString(compatPayload.last_freeze_used_date)
      : "";
  const streak = computeStreakFromDates(withSyntheticLoggedDate(loggedDateKeys, compatFreezeDate));
  const effectiveLastLogDate = safeString(streak.lastLogDate) || safeString(lastMealLog?.date_local) || null;
  const currentStreakDays =
    effectiveLastLogDate && daysBetween(effectiveLastLogDate, anchorDate) <= 1
      ? streak.current
      : 0;

  const slotMinutes: Record<ReminderSlot, number[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };
  for (const row of recentLogs) {
    const loggedAt = safeString(row.logged_at);
    if (!loggedAt) continue;
    const minuteOfDay = toLocalMinuteOfDay(new Date(loggedAt), timeZone);
    const slot = classifyMealSlotFromMinute(minuteOfDay);
    if (!slot) continue;
    slotMinutes[slot].push(minuteOfDay);
  }

  const breakfastCount = slotMinutes.breakfast.length;
  const lunchCount = slotMinutes.lunch.length;
  const dinnerCount = slotMinutes.dinner.length;
  const breakfastReminderMinute =
    breakfastCount >= 2
      ? clampMinuteOfDay(medianOfNumbers(slotMinutes.breakfast) - 15, 7 * 60, 9 * 60 + 30)
      : null;
  const lunchReminderMinute = DEFAULT_LUNCH_MINUTE;
  const dinnerReminderMinute =
    dinnerCount >= 1
      ? clampMinuteOfDay(medianOfNumbers(slotMinutes.dinner) - 15, 18 * 60, 20 * 60 + 30)
      : DEFAULT_DINNER_MINUTE;

  return normalizeRetentionStateRow({
    user_id: userId,
    customer_id: context.customerId,
    channel: "zalo",
    timezone: timeZone,
    reminders_enabled: compatPayload.reminders_enabled !== false,
    recap_enabled: compatPayload.recap_enabled !== false,
    weekly_report_enabled: compatPayload.weekly_report_enabled !== false,
    monthly_wrapped_enabled: compatPayload.monthly_wrapped_enabled !== false,
    quiet_hours_start_minute: safeInteger(
      compatPayload.quiet_hours_start_minute,
      DEFAULT_QUIET_HOURS_START_MINUTE,
    ),
    quiet_hours_end_minute: safeInteger(
      compatPayload.quiet_hours_end_minute,
      DEFAULT_QUIET_HOURS_END_MINUTE,
    ),
    breakfast_reminder_minute: breakfastReminderMinute,
    lunch_reminder_minute: lunchReminderMinute,
    dinner_reminder_minute: dinnerReminderMinute,
    meal_pattern_basis: {
      lookback_days: 14,
      breakfast_count: breakfastCount,
      lunch_count: lunchCount,
      dinner_count: dinnerCount,
      breakfast_median_minute: breakfastCount ? medianOfNumbers(slotMinutes.breakfast) : null,
      lunch_median_minute: lunchCount ? medianOfNumbers(slotMinutes.lunch) : null,
      dinner_median_minute: dinnerCount ? medianOfNumbers(slotMinutes.dinner) : null,
    },
    last_pattern_refresh_at: new Date().toISOString(),
    current_streak_days: currentStreakDays,
    best_streak_days: Math.max(streak.best, safeInteger(compatPayload.best_streak_days, 0)),
    last_log_date: effectiveLastLogDate,
    last_meal_log_at: safeString(lastMealLog?.logged_at),
    last_recap_date: safeString(compatPayload.last_recap_date),
    last_weekly_report_week_start: safeString(compatPayload.last_weekly_report_week_start),
    last_monthly_wrapped_month_start: safeString(compatPayload.last_monthly_wrapped_month_start),
    last_milestone_sent: safeInteger(compatPayload.last_milestone_sent, 0) || null,
    freeze_tokens_remaining: compatFreezeTokensRemaining,
    freeze_tokens_reset_week_start: anchorWeekStart,
    last_freeze_used_date: compatFreezeDate,
    water_daily_goal_ml: safeInteger(compatPayload.water_daily_goal_ml, 2000),
    body_checkin_enabled: compatPayload.body_checkin_enabled !== false,
    last_body_checkin_date: safeString(compatPayload.last_body_checkin_date),
    daily_push_count: safeInteger(compatPayload.daily_push_count, 0),
    daily_push_count_date: safeString(compatPayload.daily_push_count_date) || null,
    last_user_interaction_at: safeString(compatPayload.last_user_interaction_at) || null,
    last_water_morning_nudge_date: safeString(compatPayload.last_water_morning_nudge_date) || null,
    last_water_midday_nudge_date: safeString(compatPayload.last_water_midday_nudge_date) || null,
    last_inactive_nudge_at: safeString(compatPayload.last_inactive_nudge_at) || null,
    last_inactive_nudge_iso_week: safeString(compatPayload.last_inactive_nudge_iso_week) || null,
    last_renewal_hook_t5_date: safeString(compatPayload.last_renewal_hook_t5_date) || null,
    last_renewal_hook_t2_date: safeString(compatPayload.last_renewal_hook_t2_date) || null,
    last_renewal_hook_t0_date: safeString(compatPayload.last_renewal_hook_t0_date) || null,
    pending_event_pushes: normalizePendingEventPushes(compatPayload.pending_event_pushes),
    last_quick_log_suggestion_combo_key: safeString(compatPayload.last_quick_log_suggestion_combo_key) || null,
    last_quick_log_suggestion_at: safeString(compatPayload.last_quick_log_suggestion_at) || null,
    last_goal_reached_date: safeString(compatPayload.last_goal_reached_date) || null,
    last_weight_drop_alert_iso_week: safeString(compatPayload.last_weight_drop_alert_iso_week) || null,
    notification_settings: normalizeNotificationSettings(compatPayload.notification_settings),
    updated_at: new Date().toISOString(),
  } satisfies RetentionStateRow);
}

async function applyCompatStreakFreeze(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate: string,
): Promise<FreezeApplyResult> {
  const compatState = await buildCompatRetentionState(admin, userId, anchorDate);
  const loggedDateKeys = await readLoggedDateKeys(admin, userId);
  const anchorLoggedDates = new Set(loggedDateKeys);
  const missedDate = shiftDateKey(anchorDate, -1);
  const previousDate = shiftDateKey(anchorDate, -2);
  const anchorWeekStart = startOfWeekDateKey(anchorDate);
  const tokensRemaining = Math.max(0, safeInteger(compatState.freeze_tokens_remaining, 1));

  if (!anchorLoggedDates.has(anchorDate)) {
    return {
      ok: true,
      feature_ready: true,
      freeze_used: false,
      frozen_date: null,
      tokens_remaining: tokensRemaining,
      reason: "no_anchor_log",
    };
  }
  if (anchorLoggedDates.has(missedDate)) {
    return {
      ok: true,
      feature_ready: true,
      freeze_used: false,
      frozen_date: null,
      tokens_remaining: tokensRemaining,
      reason: "no_gap",
    };
  }
  if (!anchorLoggedDates.has(previousDate)) {
    return {
      ok: true,
      feature_ready: true,
      freeze_used: false,
      frozen_date: null,
      tokens_remaining: tokensRemaining,
      reason: "gap_too_wide",
    };
  }
  if (safeString(compatState.last_freeze_used_date) === missedDate) {
    return {
      ok: true,
      feature_ready: true,
      freeze_used: false,
      frozen_date: missedDate,
      tokens_remaining: tokensRemaining,
      reason: "already_frozen",
    };
  }
  if (tokensRemaining <= 0) {
    return {
      ok: true,
      feature_ready: true,
      freeze_used: false,
      frozen_date: null,
      tokens_remaining: 0,
      reason: "no_tokens",
    };
  }

  await writeRetentionCompatState(admin, userId, compatState.customer_id, {
    freeze_tokens_remaining: Math.max(0, tokensRemaining - 1),
    freeze_tokens_reset_week_start: anchorWeekStart,
    last_freeze_used_date: missedDate,
  });
  return {
    ok: true,
    feature_ready: true,
    freeze_used: true,
    frozen_date: missedDate,
    tokens_remaining: Math.max(0, tokensRemaining - 1),
    reason: "",
  };
}

async function requireRetentionState(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate = toLocalDateKey(new Date(), DEFAULT_TIMEZONE),
) {
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    return buildCompatRetentionState(admin, userId, anchorDate);
  }

  let row: RetentionStateRow | null = null;
  try {
    row =
      (await maybeSingle<RetentionStateRow>(
        admin
          .from("user_retention_state")
          .select("*")
          .eq("user_id", userId)
          .limit(1),
      )) || null;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      return buildCompatRetentionState(admin, userId, anchorDate);
    }
    throw error;
  }
  if (row) {
    const compatPayload = readRetentionCompatStatePayload(
      await readConversationStateRow(admin, userId),
    );
    return mergeRetentionStateWithCompatPayload(row, compatPayload);
  }

  try {
    const { error } = await admin.rpc("refresh_user_retention_state", {
      p_user_id: userId,
      p_anchor_date: anchorDate,
    });
    if (error) throw error;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      return buildCompatRetentionState(admin, userId, anchorDate);
    }
    throw error;
  }

  try {
    row =
      (await maybeSingle<RetentionStateRow>(
        admin
          .from("user_retention_state")
          .select("*")
          .eq("user_id", userId)
          .limit(1),
      )) || null;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      return buildCompatRetentionState(admin, userId, anchorDate);
    }
    throw error;
  }
  if (!row) throw new Error("retention_state_not_found");
  const compatPayload = readRetentionCompatStatePayload(await readConversationStateRow(admin, userId));
  return mergeRetentionStateWithCompatPayload(row, compatPayload);
}

async function forceRefreshRetentionState(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate = toLocalDateKey(new Date(), DEFAULT_TIMEZONE),
) {
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const compatState = await buildCompatRetentionState(admin, userId, anchorDate);
    await writeRetentionCompatState(admin, userId, compatState.customer_id, {
      timezone: compatState.timezone,
      reminders_enabled: compatState.reminders_enabled,
      recap_enabled: compatState.recap_enabled,
      weekly_report_enabled: compatState.weekly_report_enabled,
      monthly_wrapped_enabled: compatState.monthly_wrapped_enabled,
      quiet_hours_start_minute: compatState.quiet_hours_start_minute,
      quiet_hours_end_minute: compatState.quiet_hours_end_minute,
      best_streak_days: compatState.best_streak_days,
      last_recap_date: compatState.last_recap_date,
      last_weekly_report_week_start: compatState.last_weekly_report_week_start,
      last_monthly_wrapped_month_start: compatState.last_monthly_wrapped_month_start,
      last_milestone_sent: compatState.last_milestone_sent,
      freeze_tokens_remaining: compatState.freeze_tokens_remaining,
      freeze_tokens_reset_week_start: compatState.freeze_tokens_reset_week_start,
      last_freeze_used_date: compatState.last_freeze_used_date,
      water_daily_goal_ml: compatState.water_daily_goal_ml,
      body_checkin_enabled: compatState.body_checkin_enabled,
      last_body_checkin_date: compatState.last_body_checkin_date,
      daily_push_count: compatState.daily_push_count,
      daily_push_count_date: compatState.daily_push_count_date,
      last_user_interaction_at: compatState.last_user_interaction_at,
      last_water_morning_nudge_date: compatState.last_water_morning_nudge_date,
      last_water_midday_nudge_date: compatState.last_water_midday_nudge_date,
      last_inactive_nudge_at: compatState.last_inactive_nudge_at,
      last_inactive_nudge_iso_week: compatState.last_inactive_nudge_iso_week,
      last_renewal_hook_t5_date: compatState.last_renewal_hook_t5_date,
      last_renewal_hook_t2_date: compatState.last_renewal_hook_t2_date,
      last_renewal_hook_t0_date: compatState.last_renewal_hook_t0_date,
      pending_event_pushes: compatState.pending_event_pushes,
      last_quick_log_suggestion_combo_key: compatState.last_quick_log_suggestion_combo_key,
      last_quick_log_suggestion_at: compatState.last_quick_log_suggestion_at,
      last_goal_reached_date: compatState.last_goal_reached_date,
      last_weight_drop_alert_iso_week: compatState.last_weight_drop_alert_iso_week,
      notification_settings: compatState.notification_settings,
    });
    return compatState;
  }

  try {
    const { error } = await admin.rpc("refresh_user_retention_state", {
      p_user_id: userId,
      p_anchor_date: anchorDate,
    });
    if (error) throw error;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      const compatState = await buildCompatRetentionState(admin, userId, anchorDate);
      await writeRetentionCompatState(admin, userId, compatState.customer_id, {
        timezone: compatState.timezone,
        reminders_enabled: compatState.reminders_enabled,
        recap_enabled: compatState.recap_enabled,
        weekly_report_enabled: compatState.weekly_report_enabled,
        monthly_wrapped_enabled: compatState.monthly_wrapped_enabled,
        quiet_hours_start_minute: compatState.quiet_hours_start_minute,
        quiet_hours_end_minute: compatState.quiet_hours_end_minute,
        best_streak_days: compatState.best_streak_days,
        last_recap_date: compatState.last_recap_date,
        last_weekly_report_week_start: compatState.last_weekly_report_week_start,
        last_monthly_wrapped_month_start: compatState.last_monthly_wrapped_month_start,
        last_milestone_sent: compatState.last_milestone_sent,
        freeze_tokens_remaining: compatState.freeze_tokens_remaining,
        freeze_tokens_reset_week_start: compatState.freeze_tokens_reset_week_start,
        last_freeze_used_date: compatState.last_freeze_used_date,
        water_daily_goal_ml: compatState.water_daily_goal_ml,
        body_checkin_enabled: compatState.body_checkin_enabled,
        last_body_checkin_date: compatState.last_body_checkin_date,
        daily_push_count: compatState.daily_push_count,
        daily_push_count_date: compatState.daily_push_count_date,
        last_user_interaction_at: compatState.last_user_interaction_at,
        last_water_morning_nudge_date: compatState.last_water_morning_nudge_date,
        last_water_midday_nudge_date: compatState.last_water_midday_nudge_date,
        last_inactive_nudge_at: compatState.last_inactive_nudge_at,
        last_inactive_nudge_iso_week: compatState.last_inactive_nudge_iso_week,
        last_renewal_hook_t5_date: compatState.last_renewal_hook_t5_date,
        last_renewal_hook_t2_date: compatState.last_renewal_hook_t2_date,
        last_renewal_hook_t0_date: compatState.last_renewal_hook_t0_date,
        pending_event_pushes: compatState.pending_event_pushes,
        last_quick_log_suggestion_combo_key: compatState.last_quick_log_suggestion_combo_key,
        last_quick_log_suggestion_at: compatState.last_quick_log_suggestion_at,
        last_goal_reached_date: compatState.last_goal_reached_date,
        last_weight_drop_alert_iso_week: compatState.last_weight_drop_alert_iso_week,
        notification_settings: compatState.notification_settings,
      });
      return compatState;
    }
    throw error;
  }
  return normalizeRetentionStateRow(await requireRetentionState(admin, userId, anchorDate));
}

async function readLinkedZaloChannel(
  admin: ReturnType<typeof createServiceRoleClient>,
  customerId: number | null,
) {
  if (!customerId) return null;
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_channel_accounts")
        .select("*")
        .eq("customer_id", customerId)
        .eq("channel", "zalo")
        .eq("link_status", "linked")
        .order("updated_at", { ascending: false })
        .limit(1),
    )) || null
  );
}

async function resolveRetentionTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate = toLocalDateKey(new Date(), DEFAULT_TIMEZONE),
): Promise<RetentionTarget> {
  const state = await requireRetentionState(admin, userId, anchorDate);
  const context = await resolveContextByUserId(admin, userId);
  const zaloChannel = await readLinkedZaloChannel(admin, context.customerId);
  return {
    state: normalizeRetentionStateRow(state),
    context,
    userRow: context.userRow || {},
    customerRow: context.customerRow || null,
    zaloChannel,
    timeZone: normalizeTimezone(state.timezone),
  };
}

async function resolveRetentionTargetForPreview(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  now: Date,
  stateRow?: Pick<RetentionStateRow, "timezone"> | null,
) {
  const anchorDate = toLocalDateKey(now, normalizeTimezone(stateRow?.timezone));
  return await resolveRetentionTarget(admin, userId, anchorDate);
}

async function readMealLogsForDate(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  dateKey: string,
) {
  const { data, error } = await admin
    .from("meal_logs")
    .select("id, logged_at, date_local")
    .eq("user_id", userId)
    .eq("date_local", dateKey)
    .order("logged_at", { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function hasMealLoggedInSlotToday(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  dateKey: string,
  timeZone: string,
  slot: ReminderSlot,
) {
  const logs = await readMealLogsForDate(admin, userId, dateKey);
  return logs.some((row) => {
    const loggedAt = safeString(row.logged_at);
    if (!loggedAt) return false;
    return classifyMealSlotFromMinute(toLocalMinuteOfDay(new Date(loggedAt), timeZone)) === slot;
  });
}

async function readTopMealCombos(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  options?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    limitLogs?: number | null;
    topN?: number | null;
  },
) {
  const afterDate =
    safeString(options?.dateFrom) || shiftDateKey(toLocalDateKey(new Date(), DEFAULT_TIMEZONE), -QUICK_LOG_LOOKBACK_DAYS);
  const beforeDate = safeString(options?.dateTo) || null;
  const limitLogs = Math.max(10, Math.min(200, safeInteger(options?.limitLogs, 60)));
  const topN = Math.max(1, Math.min(5, safeInteger(options?.topN, 2)));
  const { data: mealLogs, error: mealLogsError } = await admin
    .from("meal_logs")
    .select("id, logged_at, date_local")
    .eq("user_id", userId)
    .gte("date_local", afterDate)
    .lte("date_local", beforeDate || "9999-12-31")
    .order("logged_at", { ascending: false })
    .limit(limitLogs);
  if (mealLogsError) throw mealLogsError;
  const logRows = Array.isArray(mealLogs) ? mealLogs : [];
  const logIds = logRows.map((row) => Number(row.id)).filter((value) => Number.isFinite(value) && value > 0);
  if (!logIds.length) return [] as string[];

  const { data: itemRows, error: itemsError } = await admin
    .from("meal_log_items")
    .select("meal_log_id, food_name_snapshot")
    .in("meal_log_id", logIds)
    .order("meal_log_id", { ascending: false })
    .order("id", { ascending: true });
  if (itemsError) throw itemsError;

  const grouped = new Map<number, string[]>();
  for (const row of Array.isArray(itemRows) ? itemRows : []) {
    const mealLogId = Number(row.meal_log_id);
    if (!Number.isFinite(mealLogId)) continue;
    const foodName = safeString(row.food_name_snapshot);
    if (!foodName) continue;
    const next = grouped.get(mealLogId) || [];
    if (next.length < 3) next.push(foodName);
    grouped.set(mealLogId, next);
  }

  const counts = new Map<string, { display: string; count: number }>();
  for (const row of logRows) {
    const mealLogId = Number(row.id);
    const names = grouped.get(mealLogId) || [];
    if (!names.length) continue;
    const display = names.join(", ");
    const normalized = normalizeLooseText(display);
    if (!normalized) continue;
    const current = counts.get(normalized);
    if (current) {
      current.count += 1;
    } else {
      counts.set(normalized, { display, count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, topN)
    .map((item) => item.display);
}

async function readTopQuickLogCombos(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  return readTopMealCombos(admin, userId, {
    topN: 2,
    limitLogs: 60,
  });
}

function daysBetween(fromKey: string, toKey: string) {
  const fromTime = Date.parse(`${safeString(fromKey)}T00:00:00Z`);
  const toTime = Date.parse(`${safeString(toKey)}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 0;
  return Math.round((toTime - fromTime) / 86400000);
}

function isoWeekKeyFromDateKey(dateKey: string) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(base.getTime())) return "";
  const isoDay = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() + 4 - isoDay);
  const year = base.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstIsoDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstIsoDay);
  const week = Math.floor((base.getTime() - firstThursday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(Math.max(1, week)).padStart(2, "0")}`;
}

function isoWeekKey(date: Date, timeZone: string) {
  return isoWeekKeyFromDateKey(toLocalDateKey(date, timeZone));
}

function isoWeekStartDateKey(isoWeek: string) {
  const match = String(isoWeek || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week <= 0) return "";
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  jan4.setUTCDate(jan4.getUTCDate() + (week - 1) * 7);
  return jan4.toISOString().slice(0, 10);
}

function prevIsoWeek(isoWeek: string) {
  const start = isoWeekStartDateKey(isoWeek);
  return start ? isoWeekKeyFromDateKey(shiftDateKey(start, -7)) : "";
}

async function readWaterTotalMlForDate(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  dateKey: string,
  _timeZone: string,
) {
  try {
    const { data, error } = await admin
      .from("water_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .eq("date_local", dateKey);
    if (error) throw error;
    return Array.isArray(data)
      ? data.reduce((sum, row) => sum + safeInteger((row as AnyRecord).amount_ml, 0), 0)
      : 0;
  } catch (error) {
    const message = String((error as Error)?.message || error || "").toLowerCase();
    if (!message.includes("water_logs") && !message.includes("schema cache")) {
      throw error;
    }
    const current = await readConversationStateRow(admin, userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const totals =
      retentionPayload.water_daily_totals &&
      typeof retentionPayload.water_daily_totals === "object" &&
      !Array.isArray(retentionPayload.water_daily_totals)
        ? (retentionPayload.water_daily_totals as Record<string, unknown>)
        : {};
    return Math.max(0, safeInteger(totals[dateKey], 0));
  }
}

async function readWeightDeltaSinceFirstLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  const { data: firstRows, error: firstError } = await admin
    .from("weight_logs")
    .select("weight, date")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .limit(1);
  if (firstError) throw firstError;

  const { data: latestRows, error: latestError } = await admin
    .from("weight_logs")
    .select("weight, date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1);
  if (latestError) throw latestError;

  const firstWeight = toFiniteNumber((Array.isArray(firstRows) ? firstRows[0] : null)?.weight, Number.NaN);
  const latestWeight = toFiniteNumber((Array.isArray(latestRows) ? latestRows[0] : null)?.weight, Number.NaN);
  if (!Number.isFinite(firstWeight) || !Number.isFinite(latestWeight) || firstWeight <= latestWeight) return 0;
  return roundNumber(firstWeight - latestWeight, 1);
}

async function readWeekAverageWeight(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  isoWeek: string,
) {
  const weekStart = isoWeekStartDateKey(isoWeek);
  if (!weekStart) return null;
  const weekEnd = shiftDateKey(weekStart, 6);
  const { data, error } = await admin
    .from("weight_logs")
    .select("weight, date")
    .eq("user_id", userId)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .order("date", { ascending: true });
  if (error) throw error;
  const values = (Array.isArray(data) ? data : [])
    .map((row) => toFiniteNumber((row as AnyRecord).weight, Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

async function readDailyGoalForDate(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  dateKey: string,
) {
  const row =
    (await maybeSingle<AnyRecord>(
      admin
        .from("daily_user_stats")
        .select("goal_snapshot")
        .eq("user_id", userId)
        .eq("date_local", dateKey)
        .limit(1),
    )) || null;
  const snapshot =
    row?.goal_snapshot && typeof row.goal_snapshot === "object" && !Array.isArray(row.goal_snapshot)
      ? (row.goal_snapshot as AnyRecord)
      : null;
  const snapshotGoal = toFiniteNumber(snapshot?.daily_calorie_goal, 0);
  if (snapshotGoal > 0) return snapshotGoal;
  const userRow =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("daily_calorie_goal")
        .eq("id", userId)
        .limit(1),
    )) || null;
  return Math.max(0, toFiniteNumber(userRow?.daily_calorie_goal, 0));
}

async function countConsecutiveOnTargetDays(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  todayKey: string,
) {
  const lookbackStart = shiftDateKey(todayKey, -59);
  const { data, error } = await admin
    .from("daily_user_stats")
    .select("date_local,total_calories,goal_snapshot")
    .eq("user_id", userId)
    .gte("date_local", lookbackStart)
    .lte("date_local", todayKey)
    .order("date_local", { ascending: false });
  if (error) throw error;
  const rows = new Map<string, AnyRecord>();
  for (const row of Array.isArray(data) ? data : []) {
    const dateKey = safeString((row as AnyRecord).date_local);
    if (!dateKey) continue;
    rows.set(dateKey, row as AnyRecord);
  }
  let count = 0;
  let cursor = todayKey;
  while (cursor) {
    const row = rows.get(cursor);
    if (!row) break;
    const snapshot =
      row.goal_snapshot && typeof row.goal_snapshot === "object" && !Array.isArray(row.goal_snapshot)
        ? (row.goal_snapshot as AnyRecord)
        : {};
    const target = Math.max(
      0,
      toFiniteNumber(snapshot.daily_calorie_goal, 0) || (await readDailyGoalForDate(admin, userId, cursor)),
    );
    const consumed = Math.max(0, toFiniteNumber(row.total_calories, 0));
    if (target <= 0 || consumed < target * 0.95 || consumed > target * 1.05) break;
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return count;
}

async function readMealComboEntries(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  options?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    mealLogId?: number | null;
    limitLogs?: number | null;
  },
) {
  const mealLogId = safeInteger(options?.mealLogId, 0);
  let query = admin
    .from("meal_logs")
    .select("id, logged_at, date_local")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false });

  if (mealLogId > 0) {
    query = query.eq("id", mealLogId).limit(1);
  } else {
    const dateFrom = safeString(options?.dateFrom) || shiftDateKey(toLocalDateKey(new Date(), DEFAULT_TIMEZONE), -QUICK_LOG_LOOKBACK_DAYS);
    const dateTo = safeString(options?.dateTo) || "9999-12-31";
    query = query.gte("date_local", dateFrom).lte("date_local", dateTo).limit(Math.max(10, Math.min(240, safeInteger(options?.limitLogs, 120))));
  }

  const { data: mealLogs, error: mealLogsError } = await query;
  if (mealLogsError) throw mealLogsError;
  const logRows = Array.isArray(mealLogs) ? (mealLogs as AnyRecord[]) : [];
  const logIds = logRows.map((row) => safeInteger(row.id, 0)).filter((value) => value > 0);
  if (!logIds.length) return [] as Array<{ mealLogId: number; comboKey: string; label: string; slot: ReminderSlot | null }>;

  const { data: itemRows, error: itemsError } = await admin
    .from("meal_log_items")
    .select("meal_log_id, food_name_snapshot")
    .in("meal_log_id", logIds)
    .order("meal_log_id", { ascending: false })
    .order("id", { ascending: true });
  if (itemsError) throw itemsError;

  const grouped = new Map<number, string[]>();
  for (const row of Array.isArray(itemRows) ? itemRows : []) {
    const currentMealLogId = safeInteger((row as AnyRecord).meal_log_id, 0);
    const foodName = safeString((row as AnyRecord).food_name_snapshot);
    if (!currentMealLogId || !foodName) continue;
    const next = grouped.get(currentMealLogId) || [];
    next.push(foodName);
    grouped.set(currentMealLogId, next);
  }

  return logRows
    .map((row) => {
      const currentMealLogId = safeInteger(row.id, 0);
      const loggedAt = safeString(row.logged_at);
      const minuteOfDay = loggedAt ? toLocalMinuteOfDay(new Date(loggedAt), DEFAULT_TIMEZONE) : 0;
      const slot = classifyMealSlotFromMinute(minuteOfDay);
      const names = (grouped.get(currentMealLogId) || [])
        .map((name) => safeString(name))
        .filter(Boolean);
      if (!slot || !names.length) return null;
      const normalizedNames = [...names]
        .map((name) => normalizeLooseText(name))
        .filter(Boolean)
        .sort();
      if (!normalizedNames.length) return null;
      const comboSeed = `${slot}:${normalizedNames.join("|")}`;
      return {
        mealLogId: currentMealLogId,
        comboKey: createHash("sha1").update(comboSeed).digest("hex"),
        label: names.slice(0, 3).join(", "),
        slot,
      };
    })
    .filter(Boolean) as Array<{ mealLogId: number; comboKey: string; label: string; slot: ReminderSlot }>;
}

async function deriveComboKeyForMealLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  mealLogId: number,
) {
  const row =
    (await maybeSingle<AnyRecord>(
      admin
        .from("meal_logs")
        .select("user_id")
        .eq("id", mealLogId)
        .limit(1),
    )) || null;
  const userId = safeInteger(row?.user_id, 0);
  if (!userId) return null;
  const combos = await readMealComboEntries(admin, userId, { mealLogId });
  return combos[0]?.comboKey || null;
}

async function readComboCountForUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  comboKey: string,
  lookbackDays: number,
) {
  const combos = await readMealComboEntries(admin, userId, {
    dateFrom: shiftDateKey(toLocalDateKey(new Date(), DEFAULT_TIMEZONE), -Math.max(1, lookbackDays - 1)),
    limitLogs: 200,
  });
  return combos.filter((entry) => entry.comboKey === comboKey).length;
}

async function readComboLabel(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  comboKey: string,
) {
  const combos = await readMealComboEntries(admin, userId, {
    dateFrom: shiftDateKey(toLocalDateKey(new Date(), DEFAULT_TIMEZONE), -QUICK_LOG_LOOKBACK_DAYS),
    limitLogs: 200,
  });
  return combos.find((entry) => entry.comboKey === comboKey)?.label || "combo quen";
}

async function queuePendingEvent(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  kind: PendingEventKind,
  payload: AnyRecord,
) {
  const cleanedPayload = cleanJson(payload || {});
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const current = await readConversationStateRow(admin, userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const existing = normalizePendingEventPushes(retentionPayload.pending_event_pushes);
    const signature = `${kind}:${JSON.stringify(cleanedPayload)}`;
    if (existing.some((entry) => `${entry.kind}:${JSON.stringify(entry.payload || {})}` === signature)) {
      return existing;
    }
    const next = [...existing, { kind, payload: cleanedPayload, queued_at: new Date().toISOString() }];
    while (next.length > PENDING_EVENT_QUEUE_MAX) next.shift();
    await writeRetentionCompatState(admin, userId, current?.customer_id ?? null, {
      pending_event_pushes: next,
    });
    return next;
  }

  const { data, error } = await admin.rpc("append_pending_event_push", {
    p_user_id: userId,
    p_kind: kind,
    p_payload: cleanedPayload,
    p_max: PENDING_EVENT_QUEUE_MAX,
  });
  if (error) throw error;
  return normalizePendingEventPushes(data);
}

async function removePendingEvent(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  event: PendingEventPush,
) {
  const payload = cleanJson(event.payload || {});
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const current = await readConversationStateRow(admin, userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const existing = normalizePendingEventPushes(retentionPayload.pending_event_pushes);
    const next = existing.filter(
      (entry) => !(entry.kind === event.kind && JSON.stringify(entry.payload || {}) === JSON.stringify(payload)),
    );
    await writeRetentionCompatState(admin, userId, current?.customer_id ?? null, {
      pending_event_pushes: next,
    });
    return next;
  }

  const { data, error } = await admin.rpc("remove_pending_event_push", {
    p_user_id: userId,
    p_kind: event.kind,
    p_payload: payload,
  });
  if (error) throw error;
  return normalizePendingEventPushes(data);
}

async function readMealReminderCountForDate(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  dateKey: string,
) {
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const current = await readConversationStateRow(admin, userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const dispatches = Object.values(normalizeRetentionCompatDispatchesPayload(retentionPayload.dispatches));
    return dispatches.filter((row) => {
      if (row.campaign_kind !== "meal_reminder") return false;
      if (!["scheduled", "sent", "blocked", "failed"].includes(safeString(row.status) || "")) return false;
      if ((safeString(row.campaign_key) || "").startsWith(`${dateKey}:`)) return true;
      const scheduledFor = safeString(row.scheduled_for) || "";
      return scheduledFor.startsWith(`${dateKey}T`) || scheduledFor.startsWith(dateKey);
    }).length;
  }

  try {
    const { count, error } = await admin
      .from("retention_dispatches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("campaign_kind", "meal_reminder")
      .gte("scheduled_for", `${dateKey}T00:00:00+07:00`)
      .lt("scheduled_for", `${shiftDateKey(dateKey, 1)}T00:00:00+07:00`)
      .in("status", ["sent", "blocked", "failed"]);
    if (error) throw error;
    return Number(count || 0);
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      return readMealReminderCountForDate(admin, userId, dateKey);
    }
    throw error;
  }
}

async function claimDispatchSlot(
  admin: ReturnType<typeof createServiceRoleClient>,
  payload: {
    userId: number;
    customerId: number | null;
    channel: string;
    platformUserId: string;
    campaignKind: RetentionCampaignKind;
    campaignKey: string;
    scheduledFor: string;
    payload: AnyRecord;
  },
) {
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const sourceMessageId = retentionSourceMessageId({
      user_id: payload.userId,
      campaign_kind: payload.campaignKind,
      campaign_key: payload.campaignKey,
    });
    const current = await readConversationStateRow(admin, payload.userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const dispatches = normalizeRetentionCompatDispatchesPayload(retentionPayload.dispatches);
    if (dispatches[sourceMessageId]) {
      return { claimed: false, row: null as AnyRecord | null };
    }

    const nowIso = new Date().toISOString();
    const nextRecord: CompatDispatchRecord = {
      id: sourceMessageId,
      user_id: payload.userId,
      customer_id: payload.customerId,
      channel: payload.channel,
      platform_user_id: payload.platformUserId,
      campaign_kind: payload.campaignKind,
      campaign_key: payload.campaignKey,
      scheduled_for: payload.scheduledFor,
      status: "scheduled",
      action_status: "received",
      payload: cleanJson(payload.payload),
      provider_msg_id: null,
      error_code: null,
      error_message: null,
      sent_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await writeRetentionCompatState(admin, payload.userId, payload.customerId, {
      dispatches: pruneRetentionCompatDispatches({
        ...dispatches,
        [sourceMessageId]: nextRecord,
      }),
    });

    return { claimed: true, row: cleanJson(nextRecord) as AnyRecord };
  }

  try {
    const { data, error } = await admin
      .from("retention_dispatches")
      .insert({
        user_id: payload.userId,
        customer_id: payload.customerId,
        channel: payload.channel,
        platform_user_id: payload.platformUserId,
        campaign_kind: payload.campaignKind,
        campaign_key: payload.campaignKey,
        scheduled_for: payload.scheduledFor,
        status: "scheduled",
        payload: payload.payload,
      })
      .select("*")
      .limit(1)
      .single();

    if (error) {
      const message = String(error.message || error || "").toLowerCase();
      if (message.includes("duplicate key") || message.includes("retention_dispatches")) {
        return { claimed: false, row: null as AnyRecord | null };
      }
      throw error;
    }

    return { claimed: true, row: (data as AnyRecord) || null };
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      return claimDispatchSlot(admin, payload);
    }
    throw error;
  }
}

async function updateDispatchStatus(
  admin: ReturnType<typeof createServiceRoleClient>,
  dispatchId: number | string,
  patch: AnyRecord,
  options?: {
    userId?: number | null;
    customerId?: number | null;
  },
) {
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const nextStatus = String(patch.status || "").trim().toLowerCase();
    const actionStatus =
      nextStatus === "sent"
        ? "completed"
        : nextStatus === "blocked"
          ? "blocked"
          : nextStatus === "failed"
            ? "failed_with_trace"
            : "degraded";
    const dispatchKey = safeString(dispatchId) || "";
    const userId = safeInteger(options?.userId, 0) || extractUserIdFromRetentionDispatchId(dispatchKey);
    if (!userId || !dispatchKey) throw new Error("retention_dispatch_id_required");
    const current = await readConversationStateRow(admin, userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const dispatches = normalizeRetentionCompatDispatchesPayload(retentionPayload.dispatches);
    const existing = dispatches[dispatchKey];
    if (!existing) return;
    const nowIso = new Date().toISOString();
    dispatches[dispatchKey] = {
      ...existing,
      status: nextStatus || existing.status,
      action_status: actionStatus,
      provider_msg_id: safeString(patch.provider_msg_id) || existing.provider_msg_id,
      error_code: safeString(patch.error_code) || null,
      error_message: safeString(patch.error_message) || null,
      sent_at: safeString(patch.sent_at) || existing.sent_at,
      payload: patch.payload && typeof patch.payload === "object" && !Array.isArray(patch.payload)
        ? cleanJson(patch.payload as AnyRecord)
        : existing.payload,
      updated_at: nowIso,
    };
    await writeRetentionCompatState(admin, userId, options?.customerId ?? current?.customer_id ?? null, {
      dispatches: pruneRetentionCompatDispatches(dispatches),
    });
    return;
  }

  try {
    const { error } = await admin
      .from("retention_dispatches")
      .update(patch)
      .eq("id", dispatchId);
    if (error) throw error;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      cachedRetentionStorageMode = "compat";
      await updateDispatchStatus(admin, dispatchId, patch, options);
      return;
    }
    throw error;
  }
}

function buildQuickLogLines(combos: string[]) {
  if (!combos.length) return [] as string[];
  return [
    "Gợi ý log nhanh:",
    ...combos.map((combo) => `- ${combo}`),
  ];
}

function buildMealReminderText(params: {
  slot: ReminderSlot;
  combos: string[];
  summary: AnyRecord | null;
}) {
  const slotMeta =
    params.slot === "breakfast"
      ? { emoji: "🌅", label: "bữa sáng" }
      : params.slot === "lunch"
        ? { emoji: "☀️", label: "bữa trưa" }
        : { emoji: "🌙", label: "bữa tối" };
  const remaining = Math.max(
    0,
    safeInteger(params.summary?.daily?.goalKcal, 0) - safeInteger(params.summary?.daily?.intakeKcal, 0),
  );
  const hasGoalSnapshot =
    safeInteger(params.summary?.daily?.goalKcal, 0) > 0 ||
    safeInteger(params.summary?.daily?.intakeKcal, 0) > 0;
  const lines = [
    `${slotMeta.emoji} Đến giờ ${slotMeta.label} rồi!`,
    "Vừa ăn xong thì nhắn món hoặc gửi ảnh để mình log ngay nhé.",
  ];
  if (hasGoalSnapshot) {
    lines.push("", `Calories còn lại hôm nay: ~${formatIntVi(remaining)} kcal.`);
  }
  if (params.combos.length) {
    lines.push("", ...buildQuickLogLines(params.combos));
  }
  if (params.slot === "dinner") {
    const primaryGoal = safeString(params.summary?.profile?.primaryGoal)?.toLowerCase() || "";
    const goalVariant = safeString(params.summary?.profile?.goalModeVariant)?.toLowerCase() || "";
    const cutMode =
      primaryGoal === "lose_weight" ||
      primaryGoal === "fat_loss" ||
      goalVariant === "recomp_fat_loss_bias";
    const bulkMode =
      primaryGoal === "gain_weight" ||
      primaryGoal === "muscle_gain" ||
      goalVariant === "recomp_muscle_bias";
    if (cutMode) {
      lines.push("", "Tối nay giữ bữa gọn thôi, ưu tiên đạm và rau là đẹp.");
    } else if (bulkMode) {
      lines.push("", "Tối nay nhớ giữ đủ đạm và carb để hồi phục tốt nha.");
    }
  }
  lines.push("Nhắn tên món hoặc gửi ảnh — mình lo hết 🙌");
  return lines.filter(Boolean).join("\n");
}

function buildCoachProteinLine(summary: AnyRecord | null | undefined) {
  const daily = summary?.daily || {};
  const consumed = toFiniteNumber(daily.consumedProteinG, 0);
  const target = toFiniteNumber(daily.targetProteinG, 0);
  if (target <= 0) return "";
  const remaining = roundNumber(Math.max(0, target - consumed), 1);
  if (remaining <= 5) return "Protein hôm nay gần chạm mục tiêu rồi, giữ nhịp rất ổn.";
  if (remaining <= 20) return `Protein còn thiếu khoảng ${formatGramVi(remaining)}g, thêm 1 nguồn đạm gọn là đẹp.`;
  return `Protein hôm nay còn thiếu khoảng ${formatGramVi(remaining)}g, bữa tới ưu tiên đạm trước.`;
}

function buildEndOfDayRecapText(params: {
  summary: AnyRecord;
  streakDays: number;
  combos: string[];
}) {
  const daily = params.summary.daily || {};
  const goal = toFiniteNumber(daily.goalKcal, 0);
  const intake = toFiniteNumber(daily.intakeKcal, 0);
  const protein = toFiniteNumber(daily.consumedProteinG, 0);
  const proteinTarget = toFiniteNumber(daily.targetProteinG, 0);
  const delta = intake - goal;
  const remaining = Math.max(0, goal - intake);
  const proteinGap = Math.max(0, proteinTarget - protein);
  const lines = [
    "🌙 Tổng kết hôm nay:",
    delta > 0
      ? `🍽 ${formatIntVi(intake)} / ${formatIntVi(goal)} kcal — vượt ~${formatIntVi(delta)} kcal`
      : `🍽 ${formatIntVi(intake)} / ${formatIntVi(goal)} kcal — còn ~${formatIntVi(remaining)} kcal chưa dùng`,
  ];
  if (proteinTarget > 0) {
    if (proteinGap <= 5) {
      lines.push(`💪 Protein: ${formatGramVi(protein)} / ${formatGramVi(proteinTarget)} g — gần chạm mục tiêu rồi`);
    } else {
      lines.push(
        `💪 Protein: ${formatGramVi(protein)} / ${formatGramVi(proteinTarget)} g — thiếu ~${formatGramVi(proteinGap)}g, thêm đạm vào bữa tối nha`,
      );
    }
  }
  if (params.streakDays > 0) {
    lines.push(`🔥 Chuỗi: ${params.streakDays} ngày liên tiếp — giữ vững!`);
  }
  lines.push("", "Ngày mai log thêm 1-2 bữa là streak đẹp luôn 👍");
  return lines.join("\n");
}

function buildWeeklyReportTextV15(params: {
  weekStart: string;
  weekly: AnyRecord;
  previousWeekly?: AnyRecord | null;
  currentStreakDays?: number;
}) {
  const previous = params.previousWeekly && typeof params.previousWeekly === "object"
    ? (params.previousWeekly as AnyRecord)
    : null;
  const daysLogged = safeInteger(params.weekly.days_logged, 0);
  const avgIntake = safeInteger(params.weekly.avg_intake, 0);
  const proteinAdequacyPct = roundNumber(toFiniteNumber(params.weekly.protein_adequacy, 0) * 100, 0);
  const previousDaysLogged = safeInteger(previous?.days_logged, 0);
  const daysDelta = daysLogged - previousDaysLogged;
  const daysDeltaLabel =
    !previous
      ? ""
      : daysDelta > 0
        ? ` (+${formatIntVi(daysDelta)} so với tuần trước — tốt!)`
        : daysDelta < 0
          ? ` (${daysDelta} so với tuần trước)`
          : "";
  const coachLine =
    proteinAdequacyPct >= 90
      ? "Coach: protein đang rất ổn — cứ giữ nhịp này là tuần sau xanh tiếp 🌱"
      : proteinAdequacyPct >= 75
        ? "Coach: protein gần ổn rồi — mỗi bữa thêm 1 nguồn đạm là tuần sau xanh hết 🌱"
        : "Coach: protein còn thiếu khá đều — thêm 1 nguồn đạm rõ ở mỗi bữa chính là tuần sau khác ngay 🌱";
  const lines = [
    `📊 Tuần của bạn (${params.weekStart.slice(5)}):`,
    `✅ Đã log: ${formatIntVi(daysLogged)}/7 ngày${daysDeltaLabel}`,
    `🍽 Avg: ${formatIntVi(avgIntake)} kcal/ngày`,
    `💪 Protein đạt ~${formatIntVi(proteinAdequacyPct)}% mục tiêu`,
  ];
  if (safeInteger(params.currentStreakDays, 0) > 0) {
    lines.push("", `🔥 Streak hiện tại: ${formatIntVi(params.currentStreakDays)} ngày`);
  }
  lines.push("", coachLine);
  return lines.join("\n");
}

function buildMonthlyWrappedTextV15(params: {
  monthStart: string;
  monthEnd: string;
  stats: AnyRecord;
  topFoods: string[];
}) {
  const lines = [
    `🎉 Tháng ${params.monthStart.slice(5, 7)} Wrapped!`,
    "",
    `📅 Log: ${formatIntVi(params.stats.daysLogged)} ngày / ${formatIntVi(params.stats.mealCount)} bữa`,
    `🔥 Best streak: ${formatIntVi(params.stats.bestStreak)} ngày`,
    `🍽 Trung bình: ${formatIntVi(params.stats.avgCalories)} kcal — ${formatGramVi(params.stats.avgProtein)}g protein/ngày`,
  ];
  if (params.topFoods.length) {
    lines.push(`🏅 Top món của bạn: ${params.topFoods.join(", ")}`);
  }
  lines.push(
    "",
    "Bạn đã tracking đủ lâu để nhìn ra pattern ăn uống thật sự — giữ nhịp tháng sau là data càng có ý nghĩa hơn 🙌",
  );
  return lines.join("\n");
}

async function readPreviousWeekRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  localDateKey: string,
) {
  const thisWeekStart = startOfWeekDateKey(localDateKey);
  const previousWeekStart = shiftDateKey(thisWeekStart, -7);
  const row =
    (await maybeSingle<AnyRecord>(
      admin
        .from("weekly_user_stats")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", previousWeekStart)
        .limit(1),
    )) || null;
  return { weekStart: previousWeekStart, row };
}

async function readWeekRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  weekStart: string,
) {
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("weekly_user_stats")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .limit(1),
    )) || null
  );
}

async function readMonthSnapshot(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  monthStart: string,
) {
  const monthEnd = endOfMonthDateKey(monthStart);
  const { data: dailyRows, error: dailyError } = await admin
    .from("daily_user_stats")
    .select("date_local,total_calories,total_protein,meal_count")
    .eq("user_id", userId)
    .gte("date_local", monthStart)
    .lte("date_local", monthEnd)
    .order("date_local", { ascending: true });
  if (dailyError) throw dailyError;

  const rows = Array.isArray(dailyRows) ? dailyRows : [];
  const daysLogged = rows.filter((row) => safeInteger(row.meal_count, 0) > 0).length;
  const mealCount = rows.reduce((sum, row) => sum + safeInteger(row.meal_count, 0), 0);
  const totalCalories = rows.reduce((sum, row) => sum + toFiniteNumber(row.total_calories, 0), 0);
  const totalProtein = rows.reduce((sum, row) => sum + toFiniteNumber(row.total_protein, 0), 0);

  let bestStreak = 0;
  let current = 0;
  let cursor = monthStart;
  const rowMap = new Map(rows.map((row) => [String(row.date_local), row]));
  while (cursor <= monthEnd) {
    const row = rowMap.get(cursor);
    if (row && safeInteger(row.meal_count, 0) > 0) {
      current += 1;
      bestStreak = Math.max(bestStreak, current);
    } else {
      current = 0;
    }
    cursor = shiftDateKey(cursor, 1);
  }

  return {
    monthStart,
    monthEnd,
    daysLogged,
    mealCount,
    avgCalories: daysLogged ? roundNumber(totalCalories / daysLogged, 0) : 0,
    avgProtein: daysLogged ? roundNumber(totalProtein / daysLogged, 1) : 0,
    bestStreak,
    topFoods: await readTopMealCombos(admin, userId, {
      dateFrom: monthStart,
      dateTo: monthEnd,
      limitLogs: 120,
      topN: 3,
    }),
  };
}

async function readRecentBodyWeights(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  limit = 4,
) {
  try {
    const { data, error } = await admin
      .from("body_composition_logs")
      .select("weight_kg, measured_at, created_at")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.max(1, Math.min(10, limit)));
    if (error) throw error;
    return Array.isArray(data) ? (data as AnyRecord[]) : [];
  } catch (error) {
    const message = String((error as Error)?.message || error || "").toLowerCase();
    if (message.includes("body_composition_logs")) return [] as AnyRecord[];
    throw error;
  }
}

function buildBodyCheckInText(params: {
  weights: AnyRecord[];
  streakDays: number;
}) {
  const latest = Array.isArray(params.weights) ? params.weights[0] || null : null;
  const toRelativeLabel = (value: unknown) => {
    const raw = safeString(value);
    if (!raw) return "lần gần nhất";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
    const diffDays = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 86400000));
    if (diffDays >= 6 && diffDays <= 10) return "tuần trước";
    if (diffDays >= 11 && diffDays <= 17) return "2 tuần trước";
    return raw.slice(0, 10);
  };
  const lines = ["⚖️ Check-in tuần này — cân nặng của bạn bao nhiêu rồi?"];
  if (latest && latest.weight_kg != null) {
    const latestWeight = roundNumber(toFiniteNumber(latest.weight_kg, 0), 1);
    lines.push(`Lần gần nhất: ${formatGramVi(latestWeight, 1)} kg (${toRelativeLabel(latest.measured_at || latest.created_at)}).`);
  }
  lines.push('Cân xong rồi nhắn 1 số — ví dụ "70.5" — là mình ghi ngay 🙌');
  if (params.streakDays > 0) {
    lines.push(`🔥 Streak tracking: ${params.streakDays} ngày — tiếp tục giữ nhịp!`);
  }
  return lines.join("\n");
}

async function maybeApplyStreakFreeze(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate: string,
): Promise<FreezeApplyResult> {
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    return applyCompatStreakFreeze(admin, userId, anchorDate);
  }

  try {
    const { data, error } = await admin.rpc("maybe_apply_streak_freeze", {
      p_user_id: userId,
      p_anchor_date: anchorDate,
    });
    if (error) throw error;
    const result = data && typeof data === "object" ? (data as AnyRecord) : {};
    return {
      ok: result.ok !== false,
      feature_ready: true,
      freeze_used: result.freeze_used === true,
      frozen_date: safeString(result.frozen_date),
      tokens_remaining:
        result.tokens_remaining == null ? null : safeInteger(result.tokens_remaining, 0),
      reason: safeString(result.reason),
    };
  } catch (error) {
    const message = String((error as Error)?.message || error || "").toLowerCase();
    if (
      message.includes("maybe_apply_streak_freeze") ||
      message.includes("freeze_tokens_remaining") ||
      message.includes("last_freeze_used_date") ||
      message.includes("notification_settings") ||
      isRetentionColumnMissing(error) ||
      message.includes("schema cache")
    ) {
      return applyCompatStreakFreeze(admin, userId, anchorDate);
    }
    throw error;
  }
}

function buildFreezeNoticeText(result: FreezeApplyResult) {
  if (!result.freeze_used) return "";
  const remaining = result.tokens_remaining == null ? "?" : String(result.tokens_remaining);
  return [
    "",
    "❄️ Chuỗi của bạn được giữ nguyên — mình đã bù 1 lượt cho hôm qua.",
    `Tuần này còn ${remaining} lượt bảo vệ chuỗi nhé.`,
  ].join("\n");
}

function buildMilestoneCelebrationText(milestoneHit: number) {
  if (milestoneHit === 3) return "🔥 3 ngày rồi — momentum đang lên!";
  if (milestoneHit === 7) return "🎉 7 ngày liên tiếp! Một tuần tracking đầy đủ — solid!";
  if (milestoneHit === 14) return "🏆 14 ngày! Hai tuần không gián đoạn — đỉnh cao đó!";
  if (milestoneHit === 30) return "🥇 30 ngày! Một tháng hoàn hảo — siêu ấn tượng!";
  if (milestoneHit === 90) return "🌟 90 ngày! Quán tính tracking này đã thành nền rồi.";
  return "";
}

function buildStreakMilestonePushText(days: number) {
  return buildMilestoneCelebrationText(days) || `🔥 ${formatIntVi(days)} ngày rồi — tiếp tục giữ nhịp nhé!`;
}

async function updateRetentionStateAfterDispatch(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  patch: AnyRecord,
) {
  if (!Object.keys(patch).length) return;
  if ((await resolveRetentionStorageMode(admin)) === "compat") {
    const context = await resolveContextByUserId(admin, userId);
    await writeRetentionCompatState(admin, userId, context.customerId, patch);
    return;
  }

  try {
    const { error } = await admin
      .from("user_retention_state")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    if (isRetentionCompatFallbackError(error) || isRetentionColumnMissing(error)) {
      if (isRetentionCompatFallbackError(error)) {
        cachedRetentionStorageMode = "compat";
      }
      const context = await resolveContextByUserId(admin, userId);
      await writeRetentionCompatState(admin, userId, context.customerId, patch);
      return;
    }
    throw error;
  }
}

function resolveNotificationKeyForCampaign(candidate: Pick<DispatchCandidate, "campaignKind" | "payload" | "notificationKey">) {
  if (candidate.notificationKey) return candidate.notificationKey;
  if (candidate.campaignKind === "meal_reminder") {
    const slot = safeString(candidate.payload?.slot) as ReminderSlot;
    if (slot === "breakfast") return "meal_breakfast";
    if (slot === "dinner") return "meal_dinner";
    return "meal_lunch";
  }
  if (candidate.campaignKind === "end_of_day_recap") return "recap";
  return candidate.campaignKind as NotificationSettingKey;
}

async function evaluatePushGate(
  target: RetentionTarget,
  notificationKey: NotificationSettingKey,
  now: Date,
  localDateKey: string,
  minuteOfDay: number,
): Promise<PushGateDecision> {
  if (isMinuteInRange(minuteOfDay, HARD_QUIET_START_MINUTE, HARD_QUIET_END_MINUTE)) {
    return { allow: false, reason: "hard_quiet_hours" };
  }

  const settings = normalizeNotificationSettings(target.state.notification_settings);
  if (isNotificationDisabled(settings, notificationKey)) {
    return { allow: false, reason: "user_opted_out" };
  }

  const countDate = safeString(target.state.daily_push_count_date);
  const currentCount =
    countDate === localDateKey ? safeInteger(target.state.daily_push_count, 0) : 0;
  if (currentCount >= MAX_DAILY_PUSH) {
    return { allow: false, reason: "daily_push_cap_reached" };
  }

  const lastInteraction = Date.parse(safeString(target.state.last_user_interaction_at) || "");
  if (Number.isFinite(lastInteraction) && now.getTime() - lastInteraction < USER_INTERACTION_COOLDOWN_MS) {
    return { allow: false, reason: "user_interaction_cooldown" };
  }

  return { allow: true };
}

async function incrementPushCount(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  localDateKey: string,
  prevCount: number,
  prevDate: string | null,
  extraPatch?: AnyRecord | null,
) {
  const nextCount = prevDate === localDateKey ? prevCount + 1 : 1;
  await updateRetentionStateAfterDispatch(admin, userId, {
    daily_push_count: nextCount,
    daily_push_count_date: localDateKey,
    ...(extraPatch && typeof extraPatch === "object" ? cleanJson(extraPatch) : {}),
  });
  return nextCount;
}

export async function readRetentionNotificationSettings(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  anchorDate = toLocalDateKey(new Date(), DEFAULT_TIMEZONE),
) {
  const state = await requireRetentionState(admin, userId, anchorDate);
  const raw = normalizeNotificationSettings(state.notification_settings);
  const resolved = Object.fromEntries(
    RETENTION_NOTIFICATION_KEYS.map((key) => [key, !isNotificationDisabled(raw, key)]),
  ) as Record<NotificationSettingKey, boolean>;
  return {
    raw,
    resolved,
  };
}

export async function setRetentionNotificationSetting(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  kind: NotificationSettingKey,
  enabled: boolean,
  anchorDate = toLocalDateKey(new Date(), DEFAULT_TIMEZONE),
) {
  const current = await requireRetentionState(admin, userId, anchorDate);
  const next = normalizeNotificationSettings(current.notification_settings);
  const deprecatedKey =
    kind === "morning_greeting"
      ? "meal_breakfast"
      : kind === "evening_gym_nudge"
        ? "meal_dinner"
        : null;
  if (enabled) {
    delete next[kind];
    if (deprecatedKey) delete next[deprecatedKey];
  } else {
    next[kind] = false;
    if (deprecatedKey) next[deprecatedKey] = false;
  }
  await updateRetentionStateAfterDispatch(admin, userId, {
    notification_settings: next,
  });
  return readRetentionNotificationSettings(admin, userId, anchorDate);
}

async function maybeAppendMilestone(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  summary: AnyRecord,
  dryRun = false,
) {
  const currentStreak = safeInteger(target.state.current_streak_days, 0);
  const lastMilestoneSent = safeInteger(target.state.last_milestone_sent, 0);
  const mealCount = safeInteger(summary?.daily?.mealCount, 0);
  if (!MILESTONE_DAYS.has(currentStreak) || mealCount !== 1 || currentStreak === lastMilestoneSent) {
    return {
      milestoneHit: null as number | null,
      streakDays: currentStreak,
    };
  }

  if (!dryRun) {
    await queuePendingEvent(
      admin,
      safeInteger(target.userRow.id, 0),
      "streak_milestone",
      { days: currentStreak },
    );
    await updateRetentionStateAfterDispatch(admin, safeInteger(target.userRow.id, 0), {
      last_milestone_sent: currentStreak,
    });
  }

  return {
    milestoneHit: currentStreak,
    streakDays: currentStreak,
  };
}

function inferDecorateKind(payload: AnyRecord): DecorateKind | null {
  const explicit = safeString(payload.kind || payload.retention_kind)?.toLowerCase() || null;
  if (
    explicit === "meal_log" ||
    explicit === "weight_log" ||
    explicit === "daily_summary" ||
    explicit === "weekly_summary" ||
    explicit === "monthly_summary"
  ) {
    return explicit;
  }

  const queryType = safeString(payload.query_type || payload.period || payload.summary_period)?.toLowerCase() || "";
  if (queryType === "monthly_stats" || queryType === "month") return "monthly_summary";
  if (queryType === "weekly_stats" || queryType === "week") return "weekly_summary";
  if (queryType === "daily_stats" || queryType === "day") return "daily_summary";

  const actionStatus = safeString(payload.action_status || payload.status)?.toLowerCase() || "";
  if (actionStatus.includes("weight")) return "weight_log";
  if (
    actionStatus.includes("food") ||
    actionStatus.includes("meal") ||
    safeString(payload.db_effect)?.toLowerCase() === "insert_food_log" ||
    payload.food_log_insert_allowed === true
  ) {
    return "meal_log";
  }

  if (payload.daily && typeof payload.daily === "object") return "daily_summary";
  if (payload.weekly && typeof payload.weekly === "object") return "weekly_summary";
  return null;
}

function readDecorateUserId(payload: AnyRecord) {
  return (
    safeInteger(payload.user_id, 0) ||
    safeInteger(payload.linked_user_id, 0) ||
    safeInteger(payload.user_id_db, 0) ||
    safeInteger(payload.user_record?.id, 0) ||
    0
  );
}

function readMealCaloriesFromPayload(payload: AnyRecord) {
  const candidates = [
    payload.total_calories,
    payload.meal_total_calories,
    payload.logged_total_calories,
    payload.metrics?.total_calories,
    payload.food_log_totals?.total_calories,
    payload.meal_log?.total_calories,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate, Number.NaN);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function buildMealLogInsightText(summary: AnyRecord, mealCalories: number, streakDays: number, milestoneHit: number | null) {
  const daily = summary.daily || {};
  const goal = Math.max(1, toFiniteNumber(daily.goalKcal, 0));
  const intake = toFiniteNumber(daily.intakeKcal, 0);
  const remaining = Math.max(0, goal - intake);
  const mealShare = roundNumber((mealCalories / goal) * 100, 0);
  const protein = toFiniteNumber(daily.consumedProteinG, 0);
  const proteinTarget = toFiniteNumber(daily.targetProteinG, 0);
  const proteinGap = Math.max(0, roundNumber(proteinTarget - protein, 1));
  const lines = [
    "",
    `Bữa này: ~${formatIntVi(mealShare)}% tổng kcal ngày 👍`,
    `Còn lại hôm nay: ~${formatIntVi(remaining)} kcal`,
  ];
  if (proteinTarget > 0) {
    if (proteinGap <= 5) {
      lines.push("Protein: gần chạm mục tiêu rồi — giữ nhịp nhé 💪");
    } else {
      lines.push(`Protein: còn thiếu ~${formatGramVi(proteinGap)}g — ưu tiên đạm bữa tới nha 💪`);
    }
  }
  if (streakDays > 0) {
    lines.push(`🔥 Streak: ${streakDays} ngày — tiếp tục!`);
  }
  if (milestoneHit) {
    lines.push(buildMilestoneCelebrationText(milestoneHit));
  }
  return lines.join("\n");
}

function buildWeightInsightText(summary: AnyRecord) {
  const profile = summary.profile || {};
  const goalPlan = summary.goalPlan || {};
  const weight = toFiniteNumber(profile.weightKg, 0);
  const targetWeight = toFiniteNumber(goalPlan.targetWeightKg, 0);
  const dailyGoal = toFiniteNumber(profile.dailyGoalKcal, 0);
  const lines = [
    "",
    `TDEE hiện tại đang ở khoảng ${formatIntVi(profile.tdee || 0)} kcal, daily goal đang là ${formatIntVi(dailyGoal)} kcal.`,
  ];
  if (weight > 0 && targetWeight > 0) {
    const delta = roundNumber(Math.abs(weight - targetWeight), 1);
    lines.push(`Bạn còn khoảng ${formatGramVi(delta, 1)} kg tới mốc mục tiêu.`);
  }
  return lines.join("\n");
}

function buildDailySummaryInsightText(summary: AnyRecord, streakDays: number) {
  const daily = summary.daily || {};
  const remaining = Math.max(0, toFiniteNumber(daily.goalKcal, 0) - toFiniteNumber(daily.intakeKcal, 0));
  const lines = ["", `Coach note: bạn còn khoảng ${formatIntVi(remaining)} kcal trong ngày.`];
  const proteinLine = buildCoachProteinLine(summary);
  if (proteinLine) lines.push(proteinLine);
  if (streakDays > 0) {
    lines.push(`Chuỗi hiện tại: ${streakDays} ngày.`);
  }
  return lines.join("\n");
}

function buildSummaryInsightText(period: DecorateKind) {
  const lines = [""];
  if (period === "monthly_summary") {
    lines.push("Insight tháng này: chỉ cần giữ thêm nhịp log đều là bạn sẽ nhìn ra pattern ăn uống rất rõ.");
  } else {
    lines.push("Insight tuần này: ưu tiên thêm 1-2 ngày log đủ bữa để report tuần sau sắc hơn.");
  }
  return lines.join("\n");
}

export async function decorateRetentionReply(
  admin: ReturnType<typeof createServiceRoleClient>,
  input: DecorateReplyInput,
): Promise<DecorateReplyResult> {
  if (input.user_id && input.dry_run !== true) {
    await updateRetentionStateAfterDispatch(admin, safeInteger(input.user_id, 0), {
      last_user_interaction_at: new Date().toISOString(),
    });
  }

  const payload = cleanJson((input.payload && typeof input.payload === "object" ? input.payload : {}) as AnyRecord);
  const kind = inferDecorateKind({
    ...payload,
    kind: input.kind,
  });
  const baseReplyText =
    firstNonEmptyText(
      input.base_reply_text,
      payload.reply_text,
      payload.final_response,
      payload.text,
    ) || "";
  if (!kind || !baseReplyText) {
    return {
      payload: {
        ...payload,
        reply_text: baseReplyText || payload.reply_text,
      },
      decorated_reply_text: baseReplyText,
      insight_meta: {},
      streak_meta: {},
    };
  }

  const userId = safeInteger(input.user_id, 0) || readDecorateUserId(payload);
  if (!userId) {
    return {
      payload: {
        ...payload,
        reply_text: baseReplyText,
      },
      decorated_reply_text: baseReplyText,
      insight_meta: {},
      streak_meta: {},
    };
  }
  if (input.dry_run !== true && !input.user_id) {
    await updateRetentionStateAfterDispatch(admin, userId, {
      last_user_interaction_at: new Date().toISOString(),
    });
  }

  const anchorDate = safeString(input.date_local) || toLocalDateKey(new Date(), DEFAULT_TIMEZONE);
  await refreshStats(admin, userId, anchorDate);
  let freezeResult: FreezeApplyResult = {
    ok: true,
    feature_ready: false,
    freeze_used: false,
    frozen_date: null,
    tokens_remaining: null,
    reason: null,
  };
  if (kind === "meal_log" && input.dry_run !== true) {
    freezeResult = await maybeApplyStreakFreeze(admin, userId, anchorDate);
  }
  if (kind === "meal_log") {
    await forceRefreshRetentionState(admin, userId, anchorDate);
  }
  const target = await resolveRetentionTarget(admin, userId, anchorDate);
  const summaryPeriod =
    kind === "monthly_summary" ? "month" : kind === "weekly_summary" ? "week" : "day";
  const summary = await getDashboardSummary(admin, target.context, summaryPeriod as any);

  let decorated = baseReplyText;
  let insightMeta: AnyRecord = { kind };
  const streakDays = safeInteger(target.state.current_streak_days, 0);
  let milestoneHit: number | null = null;

  if (kind === "meal_log") {
    const mealCalories = readMealCaloriesFromPayload(payload);
    const milestone = await maybeAppendMilestone(admin, target, summary, input.dry_run === true);
    milestoneHit = milestone.milestoneHit;
    if (input.dry_run !== true) {
      const targetKcal = safeInteger(summary?.daily?.goalKcal, 0);
      const consumedKcal = safeInteger(summary?.daily?.intakeKcal, 0);
      if (
        targetKcal > 0 &&
        consumedKcal >= targetKcal * 0.95 &&
        consumedKcal <= targetKcal * 1.05 &&
        safeString(target.state.last_goal_reached_date) !== anchorDate
      ) {
        const consecutiveDays = await countConsecutiveOnTargetDays(admin, userId, anchorDate);
        await queuePendingEvent(admin, userId, "goal_reached", {
          consecutive_days: consecutiveDays,
        });
      }

      if (safeInteger(input.meal_log_id, 0) > 0) {
        const comboKey = await deriveComboKeyForMealLog(admin, safeInteger(input.meal_log_id, 0));
        if (
          comboKey &&
          safeString(target.state.last_quick_log_suggestion_combo_key) !== comboKey
        ) {
          const comboCount = await readComboCountForUser(admin, userId, comboKey, QUICK_LOG_LOOKBACK_DAYS);
          if (comboCount === 3) {
            const comboLabel = await readComboLabel(admin, userId, comboKey);
            await queuePendingEvent(admin, userId, "quick_log_suggestion", {
              combo_key: comboKey,
              label: comboLabel,
            });
          }
        }
      }
    }
    decorated = `${baseReplyText}${buildMealLogInsightText(summary, mealCalories, milestone.streakDays, milestoneHit)}${buildFreezeNoticeText(freezeResult)}`;
    insightMeta = {
      kind,
      meal_calories: roundNumber(mealCalories, 0),
      meal_share_pct: roundNumber((mealCalories / Math.max(1, toFiniteNumber(summary?.daily?.goalKcal, 0))) * 100, 0),
      remaining_kcal: Math.max(0, safeInteger(summary?.daily?.goalKcal, 0) - safeInteger(summary?.daily?.intakeKcal, 0)),
      freeze_feature_ready: freezeResult.feature_ready,
      freeze_used: freezeResult.freeze_used,
      freeze_tokens_remaining: freezeResult.tokens_remaining,
    };
  } else if (kind === "weight_log") {
    if (input.dry_run !== true) {
      const currentIsoWeek = isoWeekKey(new Date(), target.timeZone);
      if (safeString(target.state.last_weight_drop_alert_iso_week) !== currentIsoWeek) {
        const thisWeekAverage = await readWeekAverageWeight(admin, userId, currentIsoWeek);
        const previousWeekAverage = await readWeekAverageWeight(admin, userId, prevIsoWeek(currentIsoWeek));
        if (
          thisWeekAverage != null &&
          previousWeekAverage != null &&
          previousWeekAverage - thisWeekAverage >= 0.3
        ) {
          await queuePendingEvent(admin, userId, "weight_drop", {
            delta_kg: roundNumber(previousWeekAverage - thisWeekAverage, 1),
            iso_week: currentIsoWeek,
          });
        }
      }
    }
    decorated = `${baseReplyText}${buildWeightInsightText(summary)}`;
    insightMeta = {
      kind,
      weight_kg: toFiniteNumber(summary?.profile?.weightKg, 0),
      daily_goal_kcal: toFiniteNumber(summary?.profile?.dailyGoalKcal, 0),
    };
  } else if (kind === "daily_summary") {
    decorated = `${baseReplyText}${buildDailySummaryInsightText(summary, streakDays)}`;
    insightMeta = {
      kind,
      remaining_kcal: Math.max(0, safeInteger(summary?.daily?.goalKcal, 0) - safeInteger(summary?.daily?.intakeKcal, 0)),
      protein_gap_g: Math.max(0, roundNumber(toFiniteNumber(summary?.daily?.targetProteinG, 0) - toFiniteNumber(summary?.daily?.consumedProteinG, 0), 1)),
    };
  } else if (kind === "weekly_summary" || kind === "monthly_summary") {
    const summaryRecord = (summary || {}) as AnyRecord;
    decorated = `${baseReplyText}${buildSummaryInsightText(kind)}`;
    insightMeta = {
      kind,
      days_logged: safeInteger(
        summaryRecord.weekly?.daysLogged ||
          summaryRecord.monthly?.daysLogged ||
          summaryRecord.requestedPeriod?.daysLogged,
        0,
      ),
    };
  }

  const nextPayload = {
    ...payload,
    reply_text: decorated,
    text: decorated,
    final_response: {
      ...(payload.final_response && typeof payload.final_response === "object" ? payload.final_response : {}),
      text: decorated,
      parse_mode: "Markdown",
    },
    retention_kind: kind,
    streak_days: streakDays,
    milestone_hit: milestoneHit,
    insight_meta: insightMeta,
  };

  return {
    payload: nextPayload,
    decorated_reply_text: decorated,
    insight_meta: insightMeta,
    streak_meta: {
      current_streak_days: streakDays,
      best_streak_days: safeInteger(target.state.best_streak_days, 0),
      milestone_hit: milestoneHit,
      freeze_used: freezeResult.freeze_used,
      freeze_tokens_remaining: freezeResult.tokens_remaining,
    },
  };
}

async function sendRetentionDispatch(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  campaignKind: RetentionCampaignKind,
  campaignKey: string,
  scheduledFor: string,
  text: string,
  payload: AnyRecord,
): Promise<DispatchResult> {
  const platformUserId = safeString(target.zaloChannel?.platform_user_id);
  if (!platformUserId) {
    return {
      user_id: safeInteger(target.userRow.id, 0),
      customer_id: target.context.customerId,
      campaign_kind: campaignKind,
      campaign_key: campaignKey,
      status: "skipped_not_linked",
      provider_msg_id: null,
      error_code: "missing_platform_user_id",
      error_message: "missing_platform_user_id",
      scheduled_for: scheduledFor,
    };
  }

  const claim = await claimDispatchSlot(admin, {
    userId: safeInteger(target.userRow.id, 0),
    customerId: target.context.customerId,
    channel: "zalo",
    platformUserId,
    campaignKind,
    campaignKey,
    scheduledFor,
    payload,
  });
  if (!claim.claimed || !claim.row?.id) {
    return {
      user_id: safeInteger(target.userRow.id, 0),
      customer_id: target.context.customerId,
      campaign_kind: campaignKind,
      campaign_key: campaignKey,
      status: "deduped",
      provider_msg_id: null,
      error_code: null,
      error_message: null,
      scheduled_for: scheduledFor,
    };
  }

  const result = await sendZaloCsMessage(admin, buildTextPayload(platformUserId, text));
  const status = result.accepted
    ? "sent"
    : result.providerStatus === "blocked"
      ? "blocked"
      : "failed";

  await updateDispatchStatus(admin, claim.row.id, {
    sent_at: result.accepted ? new Date().toISOString() : null,
    status,
    provider_msg_id: safeString(result.providerMsgId),
    error_code: safeString(result.providerErrorCode) || safeString(result.reason),
    error_message: safeString(result.providerError),
    updated_at: new Date().toISOString(),
    payload: {
      ...payload,
      mojibake_detected: result.mojibakeDetected === true,
      mojibake_repaired: result.mojibakeRepaired === true,
      outbound_guard_reason: result.outboundGuardReason || null,
    },
  }, {
    userId: safeInteger(target.userRow.id, 0),
    customerId: target.context.customerId,
  });

  return {
    user_id: safeInteger(target.userRow.id, 0),
    customer_id: target.context.customerId,
    campaign_kind: campaignKind,
    campaign_key: campaignKey,
    status,
    provider_msg_id: safeString(result.providerMsgId),
    error_code: safeString(result.providerErrorCode) || safeString(result.reason),
    error_message: safeString(result.providerError),
    scheduled_for: scheduledFor,
  };
}

function shouldAllowRetentionTarget(target: RetentionTarget) {
  const accessState = safeString(target.userRow.access_state) || safeString(target.customerRow?.access_state) || "";
  const onboardingComplete = target.userRow.onboarding_complete === true;
  return Boolean(
    target.zaloChannel?.id &&
      safeString(target.zaloChannel?.link_status) === "linked" &&
      onboardingComplete &&
      !["blocked", "pending_verification"].includes(accessState),
  );
}

async function collectDueMealReminder(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  _now: Date,
  localDateKey: string,
  minuteOfDay: number,
  bucket: { start: number; end: number },
) {
  const quietStart = safeInteger(target.state.quiet_hours_start_minute, DEFAULT_QUIET_HOURS_START_MINUTE);
  const quietEnd = safeInteger(target.state.quiet_hours_end_minute, DEFAULT_QUIET_HOURS_END_MINUTE);
  if (isMinuteInRange(minuteOfDay, quietStart, quietEnd)) return null;

  const sentToday = await readMealReminderCountForDate(admin, safeInteger(target.userRow.id, 0), localDateKey);
  if (sentToday >= 1) return null;

  const slot = "lunch" as const;
  const scheduledMinute = DEFAULT_LUNCH_MINUTE;
  if (scheduledMinute < bucket.start || scheduledMinute > bucket.end) return null;
  if (await hasMealLoggedInSlotToday(admin, safeInteger(target.userRow.id, 0), localDateKey, target.timeZone, slot)) {
    return null;
  }

  const combos = await readTopQuickLogCombos(admin, safeInteger(target.userRow.id, 0));
  const summary = await getDashboardSummary(admin, target.context, "day", {
    now: makeRetentionAnchorDate(localDateKey, 12, 0),
  });
  const text = buildMealReminderText({
    slot,
    combos,
    summary,
  });
  return {
    campaignKind: "meal_reminder" as const,
    notificationKey: "meal_lunch" as const,
    campaignKey: `${localDateKey}:${slot}`,
    scheduledFor: `${localDateKey}T12:15:00+07:00`,
    text,
    payload: {
      slot,
      local_date: localDateKey,
      combos,
      dispatch_campaign_kind: "meal_reminder",
      retention_kind: "meal_reminder",
    },
  };
}

async function collectDueMorningGreeting(
  _admin: ReturnType<typeof createServiceRoleClient>,
  _target: RetentionTarget,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (MORNING_GREETING_MINUTE < bucket.start || MORNING_GREETING_MINUTE > bucket.end) return null;
  return {
    campaignKind: "morning_greeting" as const,
    notificationKey: "morning_greeting" as const,
    campaignKey: localDateKey,
    scheduledFor: `${localDateKey}T08:00:00+07:00`,
    text: "Chào buổi sáng. Chúc bạn một ngày thật năng động. Nếu cần bắt đầu nhanh, cứ nhắn món ăn, gửi ảnh bữa ăn hoặc mở /daily nhé.",
    payload: {
      local_date: localDateKey,
      dispatch_campaign_kind: "morning_greeting",
      retention_kind: "morning_greeting",
    },
  };
}

async function collectDueEveningGymNudge(
  _admin: ReturnType<typeof createServiceRoleClient>,
  _target: RetentionTarget,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (EVENING_GYM_NUDGE_MINUTE < bucket.start || EVENING_GYM_NUDGE_MINUTE > bucket.end) return null;
  return {
    campaignKind: "evening_gym_nudge" as const,
    notificationKey: "evening_gym_nudge" as const,
    campaignKey: localDateKey,
    scheduledFor: `${localDateKey}T19:00:00+07:00`,
    text: "Tối rồi, bạn có cần mình hỗ trợ gì không? Nếu muốn vào chế độ specialist cho buổi tập, cứ mở /gym on nhé.",
    payload: {
      local_date: localDateKey,
      dispatch_campaign_kind: "evening_gym_nudge",
      retention_kind: "evening_gym_nudge",
    },
  };
}

async function collectDueRecap(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  const recapMinute = 21 * 60 + 30;
  if (recapMinute < bucket.start || recapMinute > bucket.end) return null;
  if (safeString(target.state.last_recap_date) === localDateKey) return null;

  await refreshStats(admin, safeInteger(target.userRow.id, 0), localDateKey);
  const summary = await getDashboardSummary(admin, target.context, "day", {
    now: makeRetentionAnchorDate(localDateKey, 21, 30),
  });
  const mealCount = safeInteger(summary?.daily?.mealCount, 0);
  if (mealCount <= 0) return null;
  const combos = await readTopQuickLogCombos(admin, safeInteger(target.userRow.id, 0));
  return {
    campaignKind: "end_of_day_recap" as const,
    notificationKey: "recap" as const,
    campaignKey: localDateKey,
    scheduledFor: `${localDateKey}T21:30:00+07:00`,
    text: buildEndOfDayRecapText({
      summary,
      streakDays: safeInteger(target.state.current_streak_days, 0),
      combos,
    }),
    payload: {
      local_date: localDateKey,
      dispatch_campaign_kind: "end_of_day_recap",
      retention_kind: "daily_summary",
    },
    statePatch: {
      last_recap_date: localDateKey,
    },
  };
}

async function collectDueWeeklyReport(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  now: Date,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  const sunday = getLocalDayOfWeek(now, target.timeZone) === 0;
  const dueMinute = 21 * 60;
  if (!sunday || dueMinute < bucket.start || dueMinute > bucket.end) return null;
  const weekStart = startOfWeekDateKey(localDateKey);
  const row = await readWeekRow(admin, safeInteger(target.userRow.id, 0), weekStart);
  if (!row || safeInteger(row.days_logged, 0) < 3) return null;
  if (safeString(target.state.last_weekly_report_week_start) === weekStart) return null;
  const previousWeekly = await readWeekRow(
    admin,
    safeInteger(target.userRow.id, 0),
    shiftDateKey(weekStart, -7),
  );

  return {
    campaignKind: "weekly_report" as const,
    notificationKey: "weekly_report" as const,
    campaignKey: weekStart,
    scheduledFor: `${localDateKey}T21:00:00+07:00`,
    text: buildWeeklyReportTextV15({
      weekStart,
      weekly: row,
      previousWeekly,
      currentStreakDays: safeInteger(target.state.current_streak_days, 0),
    }),
    payload: {
      week_start: weekStart,
      dispatch_campaign_kind: "weekly_report",
      retention_kind: "weekly_summary",
    },
    statePatch: {
      last_weekly_report_week_start: weekStart,
    },
  };
}

async function collectDueMonthlyWrapped(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  _now: Date,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  const dueMinute = 21 * 60;
  const monthStart = currentMonthStart(localDateKey);
  const monthEnd = endOfMonthDateKey(monthStart);
  if (localDateKey !== monthEnd || dueMinute < bucket.start || dueMinute > bucket.end) return null;
  if (safeString(target.state.last_monthly_wrapped_month_start) === monthStart) return null;

  const snapshot = await readMonthSnapshot(admin, safeInteger(target.userRow.id, 0), monthStart);
  if (snapshot.daysLogged < 5) return null;
  return {
    campaignKind: "monthly_wrapped" as const,
    notificationKey: "monthly_wrapped" as const,
    campaignKey: monthStart,
    scheduledFor: `${localDateKey}T21:00:00+07:00`,
    text: buildMonthlyWrappedTextV15({
      monthStart: snapshot.monthStart,
      monthEnd: snapshot.monthEnd,
      stats: snapshot,
      topFoods: snapshot.topFoods,
    }),
    payload: {
      month_start: snapshot.monthStart,
      month_end: snapshot.monthEnd,
      dispatch_campaign_kind: "monthly_wrapped",
      retention_kind: "monthly_summary",
    },
    statePatch: {
      last_monthly_wrapped_month_start: monthStart,
    },
  };
}

async function collectDueBodyCheckIn(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  now: Date,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (target.state.body_checkin_enabled === false) return null;
  const friday = getLocalDayOfWeek(now, target.timeZone) === 5;
  const dueMinute = 8 * 60;
  if (!friday || dueMinute < bucket.start || dueMinute > bucket.end) return null;
  if (safeString(target.state.last_body_checkin_date) === localDateKey) return null;
  const weights = await readRecentBodyWeights(admin, safeInteger(target.userRow.id, 0), 4);
  return {
    campaignKind: "body_checkin" as const,
    notificationKey: "body_checkin" as const,
    campaignKey: localDateKey,
    scheduledFor: `${localDateKey}T08:00:00+07:00`,
    text: buildBodyCheckInText({
      weights,
      streakDays: safeInteger(target.state.current_streak_days, 0),
    }),
    payload: {
      dispatch_campaign_kind: "body_checkin",
      body_checkin_preview: true,
    },
    statePatch: {
      last_body_checkin_date: localDateKey,
    },
  };
}

async function collectDueWaterMorningNudge(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (WATER_MORNING_MINUTE < bucket.start || WATER_MORNING_MINUTE > bucket.end) return null;
  if (safeString(target.state.last_water_morning_nudge_date) === localDateKey) return null;
  const waterMl = await readWaterTotalMlForDate(admin, safeInteger(target.userRow.id, 0), localDateKey, target.timeZone);
  if (waterMl > 0) return null;
  return {
    campaignKind: "water_morning_nudge" as const,
    notificationKey: "water_morning" as const,
    campaignKey: localDateKey,
    scheduledFor: `${localDateKey}T09:00:00+07:00`,
    text: "9 giờ rồi, nhớ uống nước nhé. Gõ nuoc 250 để bắt đầu track hôm nay.",
    payload: {
      dispatch_campaign_kind: "water_morning_nudge",
      local_date: localDateKey,
    },
    statePatch: {
      last_water_morning_nudge_date: localDateKey,
    },
  } satisfies DispatchCandidate;
}

async function collectDueWaterMiddayNudge(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (WATER_MIDDAY_MINUTE < bucket.start || WATER_MIDDAY_MINUTE > bucket.end) return null;
  if (safeString(target.state.last_water_midday_nudge_date) === localDateKey) return null;
  const userId = safeInteger(target.userRow.id, 0);
  const goalMl = Math.max(250, safeInteger(target.state.water_daily_goal_ml, 2000));
  const waterMl = await readWaterTotalMlForDate(admin, userId, localDateKey, target.timeZone);
  if (waterMl >= goalMl * 0.5) return null;
  return {
    campaignKind: "water_midday_nudge" as const,
    notificationKey: "water_midday" as const,
    campaignKey: localDateKey,
    scheduledFor: `${localDateKey}T15:00:00+07:00`,
    text: `3 giờ chiều rồi — bạn đã uống ${formatIntVi(waterMl)}ml / ${formatIntVi(goalMl)}ml. Uống thêm ly nữa nhé!`,
    payload: {
      dispatch_campaign_kind: "water_midday_nudge",
      local_date: localDateKey,
      current_ml: waterMl,
      goal_ml: goalMl,
    },
    statePatch: {
      last_water_midday_nudge_date: localDateKey,
    },
  } satisfies DispatchCandidate;
}

async function collectDueInactiveNudge(
  _admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  now: Date,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (INACTIVE_NUDGE_MINUTE < bucket.start || INACTIVE_NUDGE_MINUTE > bucket.end) return null;
  if (safeInteger(target.state.current_streak_days, 0) > 0) return null;
  const lastLogDate = safeString(target.state.last_log_date);
  if (!lastLogDate) return null;
  const daysSince = daysBetween(lastLogDate, localDateKey);
  if (daysSince < INACTIVE_NUDGE_THRESHOLD_DAYS) return null;
  const currentIsoWeek = isoWeekKey(now, target.timeZone);
  if (safeString(target.state.last_inactive_nudge_iso_week) === currentIsoWeek) return null;
  return {
    campaignKind: "inactive_nudge" as const,
    notificationKey: "inactive_nudge" as const,
    campaignKey: `${localDateKey}:inactive`,
    scheduledFor: now.toISOString(),
    text: "2 ngày chưa thấy bạn log. Không cần perfect — chỉ cần 1 bữa hôm nay là đủ để tiếp tục.",
    payload: {
      dispatch_campaign_kind: "inactive_nudge",
      local_date: localDateKey,
      days_since: daysSince,
    },
    statePatch: {
      last_inactive_nudge_iso_week: currentIsoWeek,
      last_inactive_nudge_at: now.toISOString(),
    },
  } satisfies DispatchCandidate;
}

async function collectDueRenewalHook(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  now: Date,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  if (RENEWAL_HOOK_MINUTE < bucket.start || RENEWAL_HOOK_MINUTE > bucket.end) return null;
  if (safeString(target.customerRow?.plan) === "lifetime") return null;
  const premiumUntil = safeString(target.customerRow?.premium_until);
  if (!premiumUntil) return null;
  const expiry = new Date(premiumUntil);
  if (!Number.isFinite(expiry.getTime())) return null;

  const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
  let hookKind: "t5" | "t2" | "t0" | null = null;
  if (daysUntil === 5 && safeString(target.state.last_renewal_hook_t5_date) !== localDateKey) {
    hookKind = "t5";
  } else if (daysUntil === 2 && safeString(target.state.last_renewal_hook_t2_date) !== localDateKey) {
    hookKind = "t2";
  } else if (daysUntil <= 0 && daysUntil >= -1 && safeString(target.state.last_renewal_hook_t0_date) !== localDateKey) {
    hookKind = "t0";
  }
  if (!hookKind) return null;

  const userId = safeInteger(target.userRow.id, 0);
  const totalLogged = (await readLoggedDateKeys(admin, userId)).length;
  const streak = safeInteger(target.state.current_streak_days, 0);
  const weightDelta = await readWeightDeltaSinceFirstLog(admin, userId);
  const portalUrl = "https://calotrack.pro/portal";
  const text =
    hookKind === "t0"
      ? `Hôm nay gói Pro hết hạn. Streak ${formatIntVi(streak)} ngày và ${formatIntVi(totalLogged)} ngày đã log của bạn vẫn được lưu — chỉ cần gia hạn để tiếp tục.\n${portalUrl}`
      : hookKind === "t2"
        ? `Gói Pro hết hạn sau 2 ngày. Đừng để chuỗi ${formatIntVi(streak)} ngày đứt nhé.\nGia hạn: ${portalUrl}`
        : `Gói Pro hết hạn sau 5 ngày. Bạn đã log ${formatIntVi(totalLogged)} ngày${weightDelta > 0 ? ` và giảm ${formatGramVi(weightDelta, 1)}kg` : ""} — đừng để chuỗi này đứt nhé.\nGia hạn ngay: ${portalUrl}`;

  return {
    campaignKind: "renewal_hook" as const,
    notificationKey: "renewal_hook" as const,
    campaignKey: `${hookKind}:${localDateKey}`,
    scheduledFor: now.toISOString(),
    text,
    payload: {
      dispatch_campaign_kind: "renewal_hook",
      hook_kind: hookKind,
      days_until_expiry: daysUntil,
    },
    statePatch: {
      [`last_renewal_hook_${hookKind}_date`]: localDateKey,
    },
  } satisfies DispatchCandidate;
}

const EVENT_PUSH_BUILDERS: Record<
  PendingEventKind,
  (
    admin: ReturnType<typeof createServiceRoleClient>,
    target: RetentionTarget,
    event: PendingEventPush,
    now: Date,
    localDateKey: string,
    bucket: { start: number; end: number },
  ) => Promise<DispatchCandidate | null>
> = {
  streak_milestone: async (_admin, _target, event, now, localDateKey) => ({
    campaignKind: "streak_milestone",
    notificationKey: "streak_milestone",
    campaignKey: `${safeInteger(event.payload?.days, 0)}:${localDateKey}`,
    scheduledFor: now.toISOString(),
    text: buildStreakMilestonePushText(safeInteger(event.payload?.days, 0)),
    payload: {
      dispatch_campaign_kind: "streak_milestone",
      days: safeInteger(event.payload?.days, 0),
    },
    queuedEvent: event,
  }),
  quick_log_suggestion: async (_admin, _target, event, now, localDateKey) => ({
    campaignKind: "quick_log_suggestion",
    notificationKey: "quick_log_suggestion",
    campaignKey: `${safeString(event.payload?.combo_key)}:${localDateKey}`,
    scheduledFor: now.toISOString(),
    text: `Bạn hay log ${safeString(event.payload?.label) || "combo này"} ở cùng một khung giờ. Nếu muốn mình có thể set quick log riêng cho combo này.`,
    payload: {
      dispatch_campaign_kind: "quick_log_suggestion",
      combo_key: safeString(event.payload?.combo_key),
      label: safeString(event.payload?.label),
    },
    statePatch: {
      last_quick_log_suggestion_combo_key: safeString(event.payload?.combo_key) || null,
      last_quick_log_suggestion_at: now.toISOString(),
    },
    queuedEvent: event,
  }),
  goal_reached: async (_admin, _target, event, now, localDateKey) => ({
    campaignKind: "goal_reached",
    notificationKey: "goal_reached",
    campaignKey: localDateKey,
    scheduledFor: now.toISOString(),
    text: `Bạn vừa đạt đúng mục tiêu calo hôm nay! Ngày hoàn hảo — ${formatIntVi(safeInteger(event.payload?.consecutive_days, 0))} ngày liên tiếp on-target rồi. 🎯`,
    payload: {
      dispatch_campaign_kind: "goal_reached",
      consecutive_days: safeInteger(event.payload?.consecutive_days, 0),
    },
    statePatch: {
      last_goal_reached_date: localDateKey,
    },
    queuedEvent: event,
  }),
  weight_drop: async (_admin, _target, event, now) => ({
    campaignKind: "weight_drop",
    notificationKey: "weight_drop",
    campaignKey: `${safeString(event.payload?.iso_week)}:weight_drop`,
    scheduledFor: now.toISOString(),
    text: `Cân nặng tuần này giảm ${formatGramVi(toFiniteNumber(event.payload?.delta_kg, 0), 1)}kg so với tuần trước — kết quả thật rồi! Tiếp tục hướng này nhé. 📉`,
    payload: {
      dispatch_campaign_kind: "weight_drop",
      delta_kg: roundNumber(toFiniteNumber(event.payload?.delta_kg, 0), 1),
      iso_week: safeString(event.payload?.iso_week),
    },
    statePatch: {
      last_weight_drop_alert_iso_week: safeString(event.payload?.iso_week) || null,
    },
    queuedEvent: event,
  }),
};

async function collectPendingEventPushes(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  now: Date,
  localDateKey: string,
  bucket: { start: number; end: number },
) {
  const pending = normalizePendingEventPushes(target.state.pending_event_pushes);
  for (const event of pending) {
    const builder = EVENT_PUSH_BUILDERS[event.kind];
    if (!builder) continue;
    const candidate = await builder(admin, target, event, now, localDateKey, bucket);
    if (candidate) return [candidate];
  }
  return [] as DispatchCandidate[];
}

async function buildDueDispatchCandidates(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: RetentionTarget,
  now: Date,
  localDateKey: string,
  minuteOfDay: number,
  bucket: { start: number; end: number },
) {
  return [
    ...(await collectPendingEventPushes(admin, target, now, localDateKey, bucket)),
    target.state.reminders_enabled === false ? null : await collectDueMorningGreeting(admin, target, localDateKey, bucket),
    target.state.reminders_enabled === false ? null : await collectDueMealReminder(admin, target, now, localDateKey, minuteOfDay, bucket),
    target.state.reminders_enabled === false ? null : await collectDueWaterMorningNudge(admin, target, localDateKey, bucket),
    target.state.reminders_enabled === false ? null : await collectDueWaterMiddayNudge(admin, target, localDateKey, bucket),
    target.state.reminders_enabled === false ? null : await collectDueEveningGymNudge(admin, target, localDateKey, bucket),
    target.state.recap_enabled === false ? null : await collectDueRecap(admin, target, localDateKey, bucket),
    target.state.weekly_report_enabled === false ? null : await collectDueWeeklyReport(admin, target, now, localDateKey, bucket),
    target.state.monthly_wrapped_enabled === false ? null : await collectDueMonthlyWrapped(admin, target, now, localDateKey, bucket),
    target.state.body_checkin_enabled === false ? null : await collectDueBodyCheckIn(admin, target, now, localDateKey, bucket),
    await collectDueInactiveNudge(admin, target, now, localDateKey, bucket),
    await collectDueRenewalHook(admin, target, now, localDateKey, bucket),
  ].filter(Boolean) as DispatchCandidate[];
}

export async function dispatchDueRetentionMessages(
  admin: ReturnType<typeof createServiceRoleClient>,
  options?: {
    now?: Date;
    userId?: number | null;
  },
) {
  const now = options?.now || new Date();
  const dispatchHealth = await readRetentionDispatchHealth(admin);
  if (!dispatchHealth.dispatchAllowed) {
    return {
      storage_mode: dispatchHealth.storageMode,
      schema_health: dispatchHealth.schemaHealth,
      dispatch_allowed: false,
      blocker_reason: dispatchHealth.blockerReason,
      claim_backend: dispatchHealth.claimBackend,
      probe_errors: dispatchHealth.probeErrors,
      processed_at: now.toISOString(),
      processed_count: 0,
      evaluated_candidates: 0,
      claimed_count: 0,
      dispatched_count: 0,
      blocked_count: 0,
      failed_count: 0,
      deduped_count: 0,
      skipped_count: 0,
      results: [] as DispatchResult[],
    };
  }
  const storageMode = dispatchHealth.storageMode;
  const stateRowsResult = await readRetentionDispatchStateRows(admin, {
    userId: options?.userId ?? null,
  });
  if (stateRowsResult.health) {
    const stateHealth = stateRowsResult.health;
    return {
      storage_mode: stateHealth.storageMode,
      schema_health: stateHealth.schemaHealth,
      dispatch_allowed: false,
      blocker_reason: stateHealth.blockerReason,
      claim_backend: stateHealth.claimBackend,
      probe_errors: [...dispatchHealth.probeErrors, ...stateHealth.probeErrors],
      processed_at: now.toISOString(),
      processed_count: 0,
      evaluated_candidates: 0,
      claimed_count: 0,
      dispatched_count: 0,
      blocked_count: 0,
      failed_count: 0,
      deduped_count: 0,
      skipped_count: 0,
      results: [] as DispatchResult[],
    };
  }
  const stateRows = stateRowsResult.rows;

  const results: DispatchResult[] = [];
  let evaluatedCandidates = 0;
  let claimedCount = 0;
  for (const row of stateRows) {
    try {
      const anchorDate = toLocalDateKey(now, normalizeTimezone(row.timezone));
      const target = await resolveRetentionTarget(admin, safeInteger(row.user_id, 0), anchorDate);
      if (!shouldAllowRetentionTarget(target)) continue;
      const localDateKey = toLocalDateKey(now, target.timeZone);
      const minuteOfDay = toLocalMinuteOfDay(now, target.timeZone);
      const bucket = getBucketRange(minuteOfDay);

      const dueCampaigns = await buildDueDispatchCandidates(
        admin,
        target,
        now,
        localDateKey,
        minuteOfDay,
        bucket,
      );
      evaluatedCandidates += dueCampaigns.length;

      for (const campaign of dueCampaigns) {
        const notificationKey = resolveNotificationKeyForCampaign(campaign);
        const gate = await evaluatePushGate(target, notificationKey, now, localDateKey, minuteOfDay);
        if (!gate.allow) {
          if (campaign.queuedEvent && gate.reason === "user_opted_out") {
            const pending = await removePendingEvent(admin, safeInteger(target.userRow.id, 0), campaign.queuedEvent);
            mutateTargetState(target, { pending_event_pushes: pending });
          }
          results.push({
            user_id: safeInteger(target.userRow.id, 0),
            customer_id: target.context.customerId,
            campaign_kind: campaign.campaignKind,
            campaign_key: campaign.campaignKey,
            status: "blocked",
            provider_msg_id: null,
            error_code: gate.reason,
            error_message: null,
            scheduled_for: campaign.scheduledFor,
          });
          continue;
        }

        const dispatch = await sendRetentionDispatch(
          admin,
          target,
          campaign.campaignKind,
          campaign.campaignKey,
          campaign.scheduledFor,
          campaign.text,
          campaign.payload,
        );
        results.push(dispatch);
        if (dispatch.status !== "deduped") {
          claimedCount += 1;
        }
        if (dispatch.status === "sent" || dispatch.status === "completed") {
          const nextCount = await incrementPushCount(
            admin,
            safeInteger(target.userRow.id, 0),
            localDateKey,
            safeInteger(target.state.daily_push_count, 0),
            safeString(target.state.daily_push_count_date) || null,
            campaign.statePatch || null,
          );
          mutateTargetState(target, {
            daily_push_count: nextCount,
            daily_push_count_date: localDateKey,
            ...(campaign.statePatch || {}),
          });
          if (campaign.queuedEvent) {
            const pending = await removePendingEvent(admin, safeInteger(target.userRow.id, 0), campaign.queuedEvent);
            mutateTargetState(target, { pending_event_pushes: pending });
          }
        }
      }
    } catch (error) {
      results.push({
        user_id: safeInteger(row.user_id, 0),
        customer_id: row.customer_id || null,
        campaign_kind: "meal_reminder",
        campaign_key: "dispatch_error",
        status: "failed_runtime",
        provider_msg_id: null,
        error_code: "dispatch_runtime_error",
        error_message: `${storageMode}:${String((error as Error)?.message || error || "dispatch_runtime_error")}`,
        scheduled_for: now.toISOString(),
      });
    }
  }

  return {
    storage_mode: storageMode,
    schema_health: dispatchHealth.schemaHealth,
    dispatch_allowed: true,
    blocker_reason: null,
    claim_backend: dispatchHealth.claimBackend,
    probe_errors: dispatchHealth.probeErrors,
    processed_at: now.toISOString(),
    processed_count: stateRows.length,
    evaluated_candidates: evaluatedCandidates,
    claimed_count: claimedCount,
    dispatched_count: results.filter((item) => item.status === "sent").length,
    blocked_count: results.filter((item) => item.status === "blocked").length,
    failed_count: results.filter((item) => item.status.startsWith("failed")).length,
    deduped_count: results.filter((item) => item.status === "deduped").length,
    skipped_count: results.filter((item) => item.status === "blocked" || item.status === "deduped").length,
    results,
  };
}

export async function queueRetentionEvent(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    kind: PendingEventKind;
    payload?: AnyRecord | null;
  },
) {
  await queuePendingEvent(
    admin,
    safeInteger(params.userId, 0),
    params.kind,
    cleanJson((params.payload && typeof params.payload === "object" ? params.payload : {}) as AnyRecord),
  );
  return {
    user_id: safeInteger(params.userId, 0),
    kind: params.kind,
    queued: true,
  };
}

export async function previewRetentionWaterMorning(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: { userId: number; now?: Date },
) {
  const now = params.now || new Date();
  const target = await resolveRetentionTargetForPreview(admin, params.userId, now);
  const localDateKey = toLocalDateKey(now, target.timeZone);
  const bucket = getBucketRange(toLocalMinuteOfDay(now, target.timeZone));
  return {
    user_id: params.userId,
    local_date: localDateKey,
    time_zone: target.timeZone,
    reply: await collectDueWaterMorningNudge(admin, target, localDateKey, bucket),
  };
}

export async function previewRetentionWaterMidday(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: { userId: number; now?: Date },
) {
  const now = params.now || new Date();
  const target = await resolveRetentionTargetForPreview(admin, params.userId, now);
  const localDateKey = toLocalDateKey(now, target.timeZone);
  const bucket = getBucketRange(toLocalMinuteOfDay(now, target.timeZone));
  return {
    user_id: params.userId,
    local_date: localDateKey,
    time_zone: target.timeZone,
    reply: await collectDueWaterMiddayNudge(admin, target, localDateKey, bucket),
  };
}

export async function previewRetentionRenewalHook(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: { userId: number; now?: Date },
) {
  const now = params.now || new Date();
  const target = await resolveRetentionTargetForPreview(admin, params.userId, now);
  const localDateKey = toLocalDateKey(now, target.timeZone);
  const bucket = getBucketRange(toLocalMinuteOfDay(now, target.timeZone));
  return {
    user_id: params.userId,
    local_date: localDateKey,
    time_zone: target.timeZone,
    reply: await collectDueRenewalHook(admin, target, now, localDateKey, bucket),
  };
}

export async function previewRetentionEventPush(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    kind: PendingEventKind;
    payload?: AnyRecord | null;
    now?: Date;
  },
) {
  const now = params.now || new Date();
  const target = await resolveRetentionTargetForPreview(admin, params.userId, now);
  const localDateKey = toLocalDateKey(now, target.timeZone);
  const bucket = getBucketRange(toLocalMinuteOfDay(now, target.timeZone));
  const event: PendingEventPush = {
    kind: params.kind,
    payload: cleanJson((params.payload && typeof params.payload === "object" ? params.payload : {}) as AnyRecord),
    queued_at: now.toISOString(),
  };
  const builder = EVENT_PUSH_BUILDERS[event.kind];
  return {
    user_id: params.userId,
    local_date: localDateKey,
    time_zone: target.timeZone,
    reply: builder ? await builder(admin, target, event, now, localDateKey, bucket) : null,
  };
}

export async function previewRetentionUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    now?: Date;
  },
) {
  const now = params.now || new Date();
  const dispatchHealth = await readRetentionDispatchHealth(admin);
  const stateRowsResult = await readRetentionDispatchStateRows(admin, {
    userId: params.userId,
  });
  if (stateRowsResult.health) {
    const stateHealth = stateRowsResult.health;
    return {
      storage_mode: stateHealth.storageMode,
      schema_health: stateHealth.schemaHealth,
      dispatch_allowed: false,
      blocker_reason: stateHealth.blockerReason,
      claim_backend: stateHealth.claimBackend,
      probe_errors: [...dispatchHealth.probeErrors, ...stateHealth.probeErrors],
      user_id: params.userId,
      local_date: null,
      minute_of_day: null,
      bucket: null,
      time_zone: null,
      state: null,
      quick_log_combos: [] as string[],
      preview: {} as AnyRecord,
      summary: null,
    };
  }
  const stateRow = stateRowsResult.rows[0] || null;
  const target = await resolveRetentionTargetForPreview(admin, params.userId, now, stateRow);
  const localDateKey = toLocalDateKey(now, target.timeZone);
  const minuteOfDay = toLocalMinuteOfDay(now, target.timeZone);
  const bucket = getBucketRange(minuteOfDay);

  return {
    storage_mode: dispatchHealth.storageMode,
    schema_health: dispatchHealth.schemaHealth,
    dispatch_allowed: dispatchHealth.dispatchAllowed,
    blocker_reason: dispatchHealth.blockerReason,
    claim_backend: dispatchHealth.claimBackend,
    probe_errors: dispatchHealth.probeErrors,
    user_id: params.userId,
    local_date: localDateKey,
    minute_of_day: minuteOfDay,
    bucket,
    time_zone: target.timeZone,
    state: target.state,
    quick_log_combos: await readTopQuickLogCombos(admin, params.userId),
    preview: {
      pending_event_pushes: await collectPendingEventPushes(admin, target, now, localDateKey, bucket),
      morning_greeting: await collectDueMorningGreeting(admin, target, localDateKey, bucket),
      meal_reminder: await collectDueMealReminder(admin, target, now, localDateKey, minuteOfDay, bucket),
      water_morning_nudge: await collectDueWaterMorningNudge(admin, target, localDateKey, bucket),
      water_midday_nudge: await collectDueWaterMiddayNudge(admin, target, localDateKey, bucket),
      evening_gym_nudge: await collectDueEveningGymNudge(admin, target, localDateKey, bucket),
      end_of_day_recap: await collectDueRecap(admin, target, localDateKey, bucket),
      weekly_report: await collectDueWeeklyReport(admin, target, now, localDateKey, bucket),
      monthly_wrapped: await collectDueMonthlyWrapped(admin, target, now, localDateKey, bucket),
      body_checkin: await collectDueBodyCheckIn(admin, target, now, localDateKey, bucket),
      inactive_nudge: await collectDueInactiveNudge(admin, target, now, localDateKey, bucket),
      renewal_hook: await collectDueRenewalHook(admin, target, now, localDateKey, bucket),
    },
    summary: await getDashboardSummary(admin, target.context, "day", {
      now: makeRetentionAnchorDate(localDateKey, 12, 0),
    }),
  };
}

export async function previewRetentionBodyCheckIn(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    now?: Date;
  },
) {
  const now = params.now || new Date();
  const target = await resolveRetentionTargetForPreview(admin, params.userId, now);
  const localDateKey = toLocalDateKey(now, target.timeZone);
  const weights = await readRecentBodyWeights(admin, params.userId, 4);
  return {
    user_id: params.userId,
    local_date: localDateKey,
    time_zone: target.timeZone,
    latest_weights: weights,
    reply_text: buildBodyCheckInText({
      weights,
      streakDays: safeInteger(target.state.current_streak_days, 0),
    }),
  };
}

export async function backfillRetentionState(
  admin: ReturnType<typeof createServiceRoleClient>,
  params?: {
    userId?: number | null;
    limit?: number | null;
  },
) {
  const storageMode = await resolveRetentionStorageMode(admin);
  const touched: number[] = [];
  if (params?.userId) {
    await forceRefreshRetentionState(admin, params.userId);
    touched.push(params.userId);
  } else {
    const limit = Math.max(1, Math.min(500, safeInteger(params?.limit, 200)));
    const { data, error } = await admin
      .from("meal_logs")
      .select("user_id")
      .order("logged_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const ids = Array.from(
      new Set(
        (Array.isArray(data) ? data : [])
          .map((row) => safeInteger((row as AnyRecord).user_id, 0))
          .filter((value) => value > 0),
      ),
    );
    for (const userId of ids) {
      await forceRefreshRetentionState(admin, userId);
      touched.push(userId);
    }
  }
  return {
    storage_mode: storageMode,
    refreshed_count: touched.length,
    user_ids: touched,
  };
}

async function resetRetentionDispatchMarkers(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  await updateRetentionStateAfterDispatch(admin, userId, {
    last_recap_date: null,
    last_weekly_report_week_start: null,
    last_monthly_wrapped_month_start: null,
    last_milestone_sent: null,
    daily_push_count: 0,
    daily_push_count_date: null,
    last_user_interaction_at: null,
    last_water_morning_nudge_date: null,
    last_water_midday_nudge_date: null,
    last_inactive_nudge_at: null,
    last_inactive_nudge_iso_week: null,
    last_renewal_hook_t5_date: null,
    last_renewal_hook_t2_date: null,
    last_renewal_hook_t0_date: null,
    pending_event_pushes: [],
    last_quick_log_suggestion_combo_key: null,
    last_quick_log_suggestion_at: null,
    last_goal_reached_date: null,
    last_weight_drop_alert_iso_week: null,
    notification_settings: {},
  });
}

export async function cleanupRetentionTestFixture(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
  },
) {
  const userId = safeInteger(params.userId, 0);
  if (!userId) throw new Error("retention_test_user_id_required");
  const tracePrefix = `retention_test_seed:${userId}:`;

  const { data: seededLogs, error: seededLogsError } = await admin
    .from("meal_logs")
    .select("id, date_local")
    .eq("user_id", userId)
    .like("trace_id", `${tracePrefix}%`)
    .order("logged_at", { ascending: false });
  if (seededLogsError) throw seededLogsError;

  const mealLogIds = (Array.isArray(seededLogs) ? seededLogs : [])
    .map((row) => safeInteger((row as AnyRecord).id, 0))
    .filter((value) => value > 0);
  const affectedDates = Array.from(
    new Set(
      (Array.isArray(seededLogs) ? seededLogs : [])
        .map((row) => safeString((row as AnyRecord).date_local))
        .filter(Boolean),
    ),
  ) as string[];

  if (mealLogIds.length) {
    const { error: deleteItemsError } = await admin
      .from("meal_log_items")
      .delete()
      .in("meal_log_id", mealLogIds);
    if (deleteItemsError) throw deleteItemsError;

    const { error: deleteLogsError } = await admin
      .from("meal_logs")
      .delete()
      .in("id", mealLogIds);
    if (deleteLogsError) throw deleteLogsError;
  }

  for (const dateKey of affectedDates) {
    await refreshStats(admin, userId, dateKey);
  }
  await resetRetentionDispatchMarkers(admin, userId);
  await forceRefreshRetentionState(admin, userId, toLocalDateKey(new Date(), DEFAULT_TIMEZONE));

  return {
    user_id: userId,
    deleted_meal_log_count: mealLogIds.length,
    affected_dates: affectedDates,
  };
}

export async function seedRetentionTestFixture(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
  },
) {
  const userId = safeInteger(params.userId, 0);
  if (!userId) throw new Error("retention_test_user_id_required");
  const context = await resolveContextByUserId(admin, userId);
  if (!context.customerId) throw new Error("retention_test_customer_not_found");

  await cleanupRetentionTestFixture(admin, { userId });

  const insertedMealLogIds: number[] = [];
  const affectedDates = Array.from(new Set(RETENTION_TEST_SEED_ITEMS.map((item) => item.dateKey)));
  let index = 0;
  for (const item of RETENTION_TEST_SEED_ITEMS) {
    index += 1;
    const traceId = `retention_test_seed:${userId}:${item.dateKey}:${index}`;
    const sourceMessageId = `retention-test-seed:${userId}:${item.dateKey}:${index}`;
    const mealLogInsert = await admin
      .from("meal_logs")
      .insert({
        user_id: userId,
        customer_id: context.customerId,
        source_channel: "zalo",
        source_message_id: sourceMessageId,
        log_mode: "retention_test_seed",
        logged_at: item.loggedAt,
        date_local: item.dateKey,
        trace_id: traceId,
        compat_food_log_id: null,
      })
      .select("id")
      .limit(1)
      .single();
    if (mealLogInsert.error) throw mealLogInsert.error;
    const mealLogId = safeInteger(mealLogInsert.data?.id, 0);
    if (!mealLogId) throw new Error("retention_test_meal_log_insert_failed");
    insertedMealLogIds.push(mealLogId);

    const { error: itemError } = await admin.from("meal_log_items").insert({
      meal_log_id: mealLogId,
      food_id: null,
      food_name_snapshot: item.title,
      quantity_value: 1,
      quantity_unit: "phần",
      portion_label: "1 phần",
      grams: 100,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source_type: "retention_test_seed",
      source_confidence: 1,
      compat_food_log_id: null,
    });
    if (itemError) throw itemError;
  }

  for (const dateKey of affectedDates) {
    await refreshStats(admin, userId, dateKey);
  }
  await resetRetentionDispatchMarkers(admin, userId);
  const refreshed = await forceRefreshRetentionState(admin, userId, toLocalDateKey(new Date(), DEFAULT_TIMEZONE));

  return {
    user_id: userId,
    inserted_meal_log_count: insertedMealLogIds.length,
    affected_dates: affectedDates,
    current_streak_days: safeInteger(refreshed.current_streak_days, 0),
    best_streak_days: safeInteger(refreshed.best_streak_days, 0),
  };
}

export async function decorateRetentionReplyWithServiceRole(input: DecorateReplyInput) {
  const admin = createServiceRoleClient();
  return decorateRetentionReply(admin, input);
}

function normalizeRetentionTestPhone(value: unknown) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("84")) return `0${digits.slice(2)}`;
  return digits;
}

function buildRetentionTestCleanupWindow(baseDate: string) {
  return {
    waterFrom: shiftDateKey(baseDate, -120),
    waterTo: shiftDateKey(baseDate, 7),
    weightDates: Array.from({ length: 120 }, (_, index) => shiftDateKey(baseDate, index - 90)),
  };
}

function omitRetentionTestKeys(row: AnyRecord | null | undefined, keys: string[]) {
  const payload = row && typeof row === "object" ? { ...(row as AnyRecord) } : {};
  for (const key of keys) delete payload[key];
  return payload;
}

async function insertRetentionTestRows(
  admin: ReturnType<typeof createServiceRoleClient>,
  table: string,
  rows: AnyRecord[],
) {
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200);
    if (!batch.length) continue;
    const { error } = await admin.from(table).insert(batch);
    if (error) throw error;
  }
}

async function updateRetentionTestRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  table: string,
  keyName: string,
  keyValue: number,
  row: AnyRecord | null | undefined,
) {
  if (!row || typeof row !== "object") return;
  const { error } = await admin
    .from(table)
    .update(omitRetentionTestKeys(row, [keyName]))
    .eq(keyName, keyValue);
  if (error) throw error;
}

async function readRetentionTestMealArtifacts(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  const rows: AnyRecord[] = [];
  for (const prefix of [`${RETENTION_V2_TEST_PREFIX}:${userId}:`, `${RETENTION_TEST_SEED_PREFIX}:${userId}:`]) {
    const { data, error } = await admin
      .from("meal_logs")
      .select("*")
      .eq("user_id", userId)
      .like("trace_id", `${prefix}%`)
      .order("logged_at", { ascending: true });
    if (error) throw error;
    rows.push(...(Array.isArray(data) ? (data as AnyRecord[]) : []));
  }
  const seen = new Set<string>();
  const mealLogs = rows.filter((row) => {
    const key = String(row.id ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const mealLogIds = mealLogs.map((row) => safeInteger(row.id, 0)).filter((value) => value > 0);
  let mealLogItems: AnyRecord[] = [];
  if (mealLogIds.length) {
    const { data, error } = await admin
      .from("meal_log_items")
      .select("*")
      .in("meal_log_id", mealLogIds)
      .order("id", { ascending: true });
    if (error) throw error;
    mealLogItems = Array.isArray(data) ? (data as AnyRecord[]) : [];
  }
  return { mealLogs, mealLogItems };
}

async function cleanupRetentionV2TestArtifacts(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
  baseDate: string,
) {
  const context = await resolveContextByUserId(admin, userId);
  const window = buildRetentionTestCleanupWindow(baseDate);
  const artifacts = await readRetentionTestMealArtifacts(admin, userId);
  const mealLogIds = artifacts.mealLogs.map((row) => safeInteger(row.id, 0)).filter((value) => value > 0);
  const mealDates = Array.from(
    new Set(
      artifacts.mealLogs
        .map((row) => safeString(row.date_local))
        .filter(Boolean),
    ),
  );
  if (mealLogIds.length) {
    const { error: deleteItemsError } = await admin.from("meal_log_items").delete().in("meal_log_id", mealLogIds);
    if (deleteItemsError) throw deleteItemsError;
    const { error: deleteLogsError } = await admin.from("meal_logs").delete().in("id", mealLogIds);
    if (deleteLogsError) throw deleteLogsError;
  }
  for (const dateKey of mealDates) {
    await refreshStats(admin, userId, dateKey);
  }

  try {
    const { error: dispatchDeleteError } = await admin.from("retention_dispatches").delete().eq("user_id", userId);
    if (dispatchDeleteError) throw dispatchDeleteError;
  } catch (error) {
    if (!isRetentionCompatFallbackError(error)) throw error;
    await writeRetentionCompatState(admin, userId, context.customerId, {
      dispatches: {},
    });
  }
  try {
    const { error: waterDeleteError } = await admin
      .from("water_logs")
      .delete()
      .eq("user_id", userId)
      .gte("date_local", window.waterFrom)
      .lte("date_local", window.waterTo);
    if (waterDeleteError) throw waterDeleteError;
  } catch (error) {
    if (!isRetentionCompatFallbackError(error)) throw error;
    await writeRetentionCompatState(admin, userId, context.customerId, {
      water_daily_totals: {},
      water_recent_entries: [],
    });
  }
  const { error: weightDeleteError } = await admin
    .from("weight_logs")
    .delete()
    .eq("user_id", userId)
    .in("date", window.weightDates);
  if (weightDeleteError) throw weightDeleteError;

  return {
    water_from: window.waterFrom,
    water_to: window.waterTo,
    deleted_meal_log_count: mealLogIds.length,
    deleted_retention_dispatch_count: true,
    deleted_weight_dates: window.weightDates.length,
  };
}

export async function cleanupRetentionV2TestTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    baseDate: string;
  },
) {
  return cleanupRetentionV2TestArtifacts(admin, params.userId, params.baseDate);
}

export async function readRetentionTestSchemaStatus(
  admin: ReturnType<typeof createServiceRoleClient>,
) {
  const dispatchHealth = await readRetentionDispatchHealth(admin);
  const requiredTables = dispatchHealth.storageMode === "schema" ? ["user_retention_state"] : ["conversation_state"];
  for (const table of requiredTables) {
    const { error } = await admin.from(table).select("*").limit(1);
    if (error) throw new Error(`retention_v2_schema_missing:${table}:${error.message}`);
  }
  let waterStorage: "table" | "compat" = "table";
  try {
    const { error } = await admin.from("water_logs").select("*").limit(1);
    if (error) throw error;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      waterStorage = "compat";
    } else {
      throw new Error(`retention_v2_schema_missing:water_logs:${String((error as Error)?.message || error || "unknown_error")}`);
    }
  }
  let dispatchStorage: "table" | "compat" = "table";
  try {
    const { error } = await admin.from("retention_dispatches").select("*").limit(1);
    if (error) throw error;
  } catch (error) {
    if (isRetentionCompatFallbackError(error)) {
      dispatchStorage = "compat";
    } else {
      throw new Error(`retention_v2_schema_missing:retention_dispatches:${String((error as Error)?.message || error || "unknown_error")}`);
    }
  }
  return {
    ok: true,
    storage_mode: dispatchHealth.storageMode,
    schema_health: dispatchHealth.schemaHealth,
    dispatch_allowed: dispatchHealth.dispatchAllowed,
    blocker_reason: dispatchHealth.blockerReason,
    claim_backend: dispatchHealth.claimBackend,
    probe_errors: dispatchHealth.probeErrors,
    water_storage: waterStorage,
    dispatch_storage: dispatchStorage,
    tables: requiredTables,
  };
}

export async function readRetentionTestPreflight(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    expectedPhone?: string | null;
  },
) {
  const context = await resolveContextByUserId(admin, params.userId);
  const linkedZaloRows =
    context.customerId > 0
      ? ((await admin
          .from("customer_channel_accounts")
          .select("*")
          .eq("customer_id", context.customerId)
          .eq("channel", "zalo")
          .eq("link_status", "linked")
          .order("updated_at", { ascending: false })
          .limit(5)).data as AnyRecord[] | null) || []
      : [];
  const matchedPhones = Array.from(
    new Set(
      [
        context.customerRow?.phone_e164,
        context.customerRow?.phone_display,
        context.userRow?.phone,
        context.userRow?.phone_e164,
      ]
        .map((value) => normalizeRetentionTestPhone(value))
        .filter(Boolean),
    ),
  );
  const expectedPhone = normalizeRetentionTestPhone(params.expectedPhone);
  if (expectedPhone && !matchedPhones.includes(expectedPhone)) {
    throw new Error(`retention_test_phone_mismatch:${matchedPhones.join(",") || "none"}`);
  }
  if (!context.customerId) throw new Error("retention_test_customer_not_found");
  if (!linkedZaloRows.length) throw new Error("retention_test_zalo_link_missing");
  return {
    user_id: params.userId,
    customer_id: context.customerId,
    expected_phone: expectedPhone || null,
    matched_phones: matchedPhones,
    linked_zalo_rows: linkedZaloRows,
  };
}

export async function readRetentionTestStateRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: { userId: number },
) {
  return requireRetentionState(admin, params.userId);
}

export async function updateRetentionTestUserRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    patch: AnyRecord;
  },
) {
  const context = await resolveContextByUserId(admin, params.userId);
  const patch = filterPatchByExistingKeys(context.userRow, params.patch || {});
  if (!Object.keys(patch).length) return { ok: true, skipped: true };
  const { error } = await admin.from("users").update(patch).eq("id", params.userId);
  if (error) throw error;
  return { ok: true };
}

export async function updateRetentionTestCustomerRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    customerId: number;
    patch: AnyRecord;
  },
) {
  const customerRow =
    (await maybeSingle<AnyRecord>(
      admin.from("customers").select("*").eq("id", params.customerId).limit(1),
    )) || null;
  const patch = filterPatchByExistingKeys(customerRow, params.patch || {});
  if (!Object.keys(patch).length) return { ok: true, skipped: true };
  const { error } = await admin.from("customers").update(patch).eq("id", params.customerId);
  if (error) throw error;
  return { ok: true };
}

export async function updateRetentionTestStateRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    patch: AnyRecord;
  },
) {
  await updateRetentionStateAfterDispatch(admin, params.userId, cleanJson(params.patch || {}));
  return { ok: true };
}

export async function refreshRetentionTestDates(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    dateKeys: string[];
  },
) {
  const dateKeys = Array.from(new Set((Array.isArray(params.dateKeys) ? params.dateKeys : []).map((value) => safeString(value)).filter(Boolean)));
  for (const dateKey of dateKeys) {
    await refreshStats(admin, params.userId, dateKey);
  }
  return {
    ok: true,
    refreshed_dates: dateKeys,
  };
}

export async function insertRetentionTestWaterLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    dateLocal: string;
    amountMl: number;
    label?: string | null;
  },
) {
  const context = await resolveContextByUserId(admin, params.userId);
  const traceId = `${RETENTION_V2_TEST_PREFIX}:${params.userId}:water:${safeString(params.label) || "water"}:${params.dateLocal}:${safeInteger(params.amountMl, 0)}`;
  try {
    const { error } = await admin.from("water_logs").insert({
      user_id: params.userId,
      customer_id: context.customerId,
      date_local: params.dateLocal,
      amount_ml: safeInteger(params.amountMl, 0),
      source_channel: "zalo",
      source_message_id: traceId,
      trace_id: traceId,
    });
    if (error) throw error;
    return { ok: true, trace_id: traceId, storage_mode: "table" };
  } catch (error) {
    if (!isRetentionCompatFallbackError(error)) throw error;
    const state = await requireRetentionState(admin, params.userId);
    const current = await readConversationStateRow(admin, params.userId);
    const retentionPayload = readRetentionCompatStatePayload(current);
    const totals =
      retentionPayload.water_daily_totals &&
      typeof retentionPayload.water_daily_totals === "object" &&
      !Array.isArray(retentionPayload.water_daily_totals)
        ? cleanJson(retentionPayload.water_daily_totals as AnyRecord)
        : {};
    const entries = Array.isArray(retentionPayload.water_recent_entries)
      ? cleanJson(retentionPayload.water_recent_entries as AnyRecord[])
      : [];
    totals[params.dateLocal] = Math.max(0, safeInteger(totals[params.dateLocal], 0)) + safeInteger(params.amountMl, 0);
    entries.push({
      date_local: params.dateLocal,
      amount_ml: safeInteger(params.amountMl, 0),
      source_message_id: traceId,
      trace_id: traceId,
      source_channel: "zalo",
      logged_at: new Date().toISOString(),
    });
    await writeRetentionCompatState(admin, params.userId, context.customerId, {
      water_daily_goal_ml: Math.max(250, safeInteger(state.water_daily_goal_ml, 2000)),
      water_daily_totals: totals,
      water_recent_entries: entries.slice(-80),
    });
    return { ok: true, trace_id: traceId, storage_mode: "compat" };
  }
}

export async function insertRetentionTestWeightLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    dateLocal: string;
    weight: number;
  },
) {
  const { error } = await admin.from("weight_logs").insert({
    user_id: params.userId,
    date: params.dateLocal,
    weight: toFiniteNumber(params.weight, 0),
  });
  if (error) throw error;
  return { ok: true };
}

export async function insertRetentionTestMealLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    dateLocal: string;
    hour: number;
    minute: number;
    label?: string | null;
    traceId?: string | null;
    foods: Array<{
      name: string;
      grams?: number | null;
      calories: number;
      protein?: number | null;
      carbs?: number | null;
      fat?: number | null;
    }>;
  },
) {
  const context = await resolveContextByUserId(admin, params.userId);
  const traceId = safeString(params.traceId) || `${RETENTION_V2_TEST_PREFIX}:${params.userId}:meal:${params.dateLocal}:${safeString(params.label) || "meal"}`;
  const logInsert = await admin
    .from("meal_logs")
    .insert({
      user_id: params.userId,
      customer_id: context.customerId,
      source_channel: "zalo",
      source_message_id: `${traceId}:msg`,
      log_mode: RETENTION_V2_TEST_PREFIX,
      logged_at: `${params.dateLocal}T${String(safeInteger(params.hour, 0)).padStart(2, "0")}:${String(safeInteger(params.minute, 0)).padStart(2, "0")}:00+07:00`,
      date_local: params.dateLocal,
      trace_id: traceId,
      compat_food_log_id: null,
    })
    .select("id")
    .limit(1)
    .single();
  if (logInsert.error) throw logInsert.error;
  const mealLogId = safeInteger(logInsert.data?.id, 0);
  if (!mealLogId) throw new Error("retention_test_meal_log_insert_failed");

  for (const food of Array.isArray(params.foods) ? params.foods : []) {
    const { error } = await admin.from("meal_log_items").insert({
      meal_log_id: mealLogId,
      food_id: null,
      food_name_snapshot: safeString(food.name),
      quantity_value: 1,
      quantity_unit: "phần",
      portion_label: "1 phần",
      grams: toFiniteNumber(food.grams, 100),
      calories: toFiniteNumber(food.calories, 0),
      protein: toFiniteNumber(food.protein, 20),
      carbs: toFiniteNumber(food.carbs, 30),
      fat: toFiniteNumber(food.fat, 10),
      source_type: RETENTION_V2_TEST_PREFIX,
      source_confidence: 1,
      compat_food_log_id: null,
    });
    if (error) throw error;
  }

  return {
    ok: true,
    meal_log_id: mealLogId,
    trace_id: traceId,
  };
}

export async function insertRetentionTestMealLogBatch(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    items: Array<{
      dateLocal: string;
      hour: number;
      minute: number;
      label?: string | null;
      traceId?: string | null;
      foods: Array<{
        name: string;
        grams?: number | null;
        calories: number;
        protein?: number | null;
        carbs?: number | null;
        fat?: number | null;
      }>;
    }>;
  },
) {
  const outputs: Array<{ meal_log_id: number; trace_id: string }> = [];
  for (const item of Array.isArray(params.items) ? params.items : []) {
    const inserted = await insertRetentionTestMealLog(admin, {
      userId: params.userId,
      dateLocal: safeString(item?.dateLocal),
      hour: safeInteger(item?.hour, 0),
      minute: safeInteger(item?.minute, 0),
      label: safeString(item?.label) || null,
      traceId: safeString(item?.traceId) || null,
      foods: Array.isArray(item?.foods) ? item.foods : [],
    });
    outputs.push({
      meal_log_id: safeInteger(inserted.meal_log_id, 0),
      trace_id: safeString(inserted.trace_id),
    });
  }
  return {
    ok: true,
    count: outputs.length,
    items: outputs,
    last_meal_log_id: outputs.length ? outputs[outputs.length - 1]?.meal_log_id ?? 0 : 0,
  };
}

export async function prepareRetentionTestTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    baseDate: string;
  },
) {
  const context = await resolveContextByUserId(admin, params.userId);
  await cleanupRetentionTestFixture(admin, { userId: params.userId });
  await cleanupRetentionV2TestArtifacts(admin, params.userId, params.baseDate);
  const userPatch = filterPatchByExistingKeys(context.userRow, {
    primary_goal: "maintain",
    goal_mode_variant: null,
    goal_mode: "maintain",
    goal_weekly_rate_kg: null,
    daily_calorie_goal: 2000,
    tdee: 2000,
  });
  if (Object.keys(userPatch).length) {
    const { error: userError } = await admin.from("users").update(userPatch).eq("id", params.userId);
    if (userError) throw userError;
  }
  if (context.customerId) {
    const { error: customerError } = await admin.from("customers").update({
      plan: "pro",
      premium_until: `${shiftDateKey(params.baseDate, 30)}T00:00:00+07:00`,
      status: "active",
    }).eq("id", context.customerId);
    if (customerError) throw customerError;
  }
  await backfillRetentionState(admin, { userId: params.userId });
  await updateRetentionStateAfterDispatch(admin, params.userId, {
    reminders_enabled: true,
    recap_enabled: true,
    weekly_report_enabled: true,
    monthly_wrapped_enabled: true,
    body_checkin_enabled: true,
    breakfast_reminder_minute: 8 * 60,
    lunch_reminder_minute: 12 * 60 + 15,
    dinner_reminder_minute: 19 * 60,
    meal_pattern_basis: null,
    last_pattern_refresh_at: null,
    current_streak_days: 5,
    best_streak_days: 12,
    last_log_date: shiftDateKey(params.baseDate, -1),
    last_recap_date: null,
    last_weekly_report_week_start: null,
    last_monthly_wrapped_month_start: null,
    last_milestone_sent: null,
    water_daily_goal_ml: 2000,
    daily_push_count: 0,
    daily_push_count_date: null,
    last_user_interaction_at: null,
    last_water_morning_nudge_date: null,
    last_water_midday_nudge_date: null,
    last_inactive_nudge_at: null,
    last_inactive_nudge_iso_week: null,
    last_renewal_hook_t5_date: null,
    last_renewal_hook_t2_date: null,
    last_renewal_hook_t0_date: null,
    pending_event_pushes: [],
    last_quick_log_suggestion_combo_key: null,
    last_quick_log_suggestion_at: null,
    last_goal_reached_date: null,
    last_weight_drop_alert_iso_week: null,
    notification_settings: {},
  });
  return {
    ok: true,
    user_id: params.userId,
    customer_id: context.customerId,
  };
}

export async function snapshotRetentionTestTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    userId: number;
    baseDate: string;
  },
) {
  const context = await resolveContextByUserId(admin, params.userId);
  const window = buildRetentionTestCleanupWindow(params.baseDate);
  const stateRow = await requireRetentionState(admin, params.userId);
  const compatState = readRetentionCompatStatePayload(await readConversationStateRow(admin, params.userId));
  let dispatchStorage: "table" | "compat" = "table";
  let dispatchRows: AnyRecord[] = [];
  try {
    const { data, error: dispatchError } = await admin
      .from("retention_dispatches")
      .select("*")
      .eq("user_id", params.userId)
      .order("id", { ascending: true });
    if (dispatchError) throw dispatchError;
    dispatchRows = Array.isArray(data) ? (data as AnyRecord[]) : [];
  } catch (error) {
    if (!isRetentionCompatFallbackError(error)) throw error;
    dispatchStorage = "compat";
  }
  let waterStorage: "table" | "compat" = "table";
  let waterRows: AnyRecord[] = [];
  try {
    const { data, error: waterError } = await admin
      .from("water_logs")
      .select("*")
      .eq("user_id", params.userId)
      .gte("date_local", window.waterFrom)
      .lte("date_local", window.waterTo)
      .order("date_local", { ascending: true });
    if (waterError) throw waterError;
    waterRows = Array.isArray(data) ? (data as AnyRecord[]) : [];
  } catch (error) {
    if (!isRetentionCompatFallbackError(error)) throw error;
    waterStorage = "compat";
  }
  const { data: weightRows, error: weightError } = await admin
    .from("weight_logs")
    .select("*")
    .eq("user_id", params.userId)
    .in("date", window.weightDates)
    .order("date", { ascending: true });
  if (weightError) throw weightError;
  const mealArtifacts = await readRetentionTestMealArtifacts(admin, params.userId);
  return {
    generated_at: new Date().toISOString(),
    target: {
      user_id: params.userId,
      customer_id: context.customerId,
    },
    storage_mode: await resolveRetentionStorageMode(admin),
    water_storage: waterStorage,
    dispatch_storage: dispatchStorage,
    cleanup_window: window,
    user_row: context.userRow || null,
    customer_row: context.customerRow || null,
    user_restore_patch: pickObjectKeys(context.userRow, RETENTION_TEST_USER_RESTORE_KEYS),
    customer_restore_patch: pickObjectKeys(context.customerRow, RETENTION_TEST_CUSTOMER_RESTORE_KEYS),
    retention_state: stateRow,
    compat_retention_payload: compatState,
    retention_dispatches: dispatchRows,
    water_logs: waterRows,
    weight_logs: Array.isArray(weightRows) ? weightRows : [],
    meal_logs: mealArtifacts.mealLogs,
    meal_log_items: mealArtifacts.mealLogItems,
  };
}

export async function restoreRetentionTestTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  params: {
    snapshot: AnyRecord;
  },
) {
  const snapshot = params.snapshot && typeof params.snapshot === "object" ? (params.snapshot as AnyRecord) : {};
  const userId = safeInteger(snapshot.target?.user_id, 0);
  const customerId = safeInteger(snapshot.target?.customer_id, 0);
  if (!userId || !customerId) throw new Error("retention_snapshot_target_missing");

  await updateRetentionTestUserRow(admin, {
    userId,
    patch: (snapshot.user_restore_patch as AnyRecord) || {},
  });
  await updateRetentionTestCustomerRow(admin, {
    customerId,
    patch: (snapshot.customer_restore_patch as AnyRecord) || {},
  });
  if (Array.isArray(snapshot.meal_logs) && snapshot.meal_logs.length) {
    await insertRetentionTestRows(admin, "meal_logs", cleanJson(snapshot.meal_logs as AnyRecord[]));
  }
  if (Array.isArray(snapshot.meal_log_items) && snapshot.meal_log_items.length) {
    await insertRetentionTestRows(admin, "meal_log_items", cleanJson(snapshot.meal_log_items as AnyRecord[]));
  }
  if (Array.isArray(snapshot.water_logs) && snapshot.water_logs.length) {
    try {
      await insertRetentionTestRows(admin, "water_logs", cleanJson(snapshot.water_logs as AnyRecord[]));
    } catch (error) {
      if (!isRetentionCompatFallbackError(error)) throw error;
    }
  }
  if (Array.isArray(snapshot.weight_logs) && snapshot.weight_logs.length) {
    await insertRetentionTestRows(admin, "weight_logs", cleanJson(snapshot.weight_logs as AnyRecord[]));
  }
  if (Array.isArray(snapshot.retention_dispatches) && snapshot.retention_dispatches.length) {
    try {
      await insertRetentionTestRows(admin, "retention_dispatches", cleanJson(snapshot.retention_dispatches as AnyRecord[]));
    } catch (error) {
      if (!isRetentionCompatFallbackError(error)) throw error;
    }
  }
  const affectedDates = Array.from(
    new Set(
      (Array.isArray(snapshot.meal_logs) ? (snapshot.meal_logs as AnyRecord[]) : [])
        .map((row) => safeString(row.date_local))
        .filter(Boolean),
    ),
  );
  for (const dateKey of affectedDates) {
    await refreshStats(admin, userId, dateKey);
  }
  await backfillRetentionState(admin, { userId });
  await updateRetentionStateAfterDispatch(
    admin,
    userId,
    cleanJson((snapshot.retention_state as AnyRecord) || {}),
  );
  if (snapshot.compat_retention_payload && typeof snapshot.compat_retention_payload === "object") {
    await replaceRetentionCompatState(
      admin,
      userId,
      customerId || null,
      cleanJson(snapshot.compat_retention_payload as AnyRecord),
    );
  }
  return {
    restored: true,
    storage_mode: safeString(snapshot.storage_mode) || null,
    water_storage: safeString(snapshot.water_storage) || null,
    dispatch_storage: safeString(snapshot.dispatch_storage) || null,
    restored_retention_dispatches: Array.isArray(snapshot.retention_dispatches) ? snapshot.retention_dispatches.length : 0,
    restored_water_logs: Array.isArray(snapshot.water_logs) ? snapshot.water_logs.length : 0,
    restored_weight_logs: Array.isArray(snapshot.weight_logs) ? snapshot.weight_logs.length : 0,
    restored_meal_logs: Array.isArray(snapshot.meal_logs) ? snapshot.meal_logs.length : 0,
    restored_meal_log_items: Array.isArray(snapshot.meal_log_items) ? snapshot.meal_log_items.length : 0,
  };
}
