import * as crypto from "node:crypto";

import {
  createServiceRoleClient,
  maybeSingle,
  requireAuthenticatedUser,
  safeString,
} from "./adminServer.js";
import { getZaloOaInternalKey } from "./zaloOaServer.js";

type AnyRecord = Record<string, any>;

export type PrimaryGoal =
  | "maintain"
  | "lose_weight"
  | "fat_loss"
  | "muscle_gain"
  | "gain_weight";

export type TargetMetric = "target_weight_kg" | "target_body_fat_pct" | null;

export type DashboardPeriod = "day" | "week" | "month";

export type BodyCompositionInput = {
  reviewId?: string | null;
  source?: string | null;
  sourceMessageId?: string | null;
  measuredAt?: string | null;
  age?: number | null;
  gender?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  skeletalMuscleMassKg?: number | null;
  bodyFatMassKg?: number | null;
  bodyFatPct?: number | null;
  bmi?: number | null;
  bmr?: number | null;
  visceralFatLevel?: number | null;
  waistHipRatio?: number | null;
  inbodyScore?: number | null;
  targetWeightKg?: number | null;
  weightControlKg?: number | null;
  fatControlKg?: number | null;
  muscleControlKg?: number | null;
  rawOcr?: unknown;
  rawExtracted?: unknown;
  overwriteDemographics?: boolean;
};

export type DashboardSummary = {
  profile: AnyRecord;
  daily: AnyRecord;
  weekly: AnyRecord;
  goalPlan: AnyRecord;
  latestBodyComposition: AnyRecord | null;
  chart7d: AnyRecord[];
  requestedPeriod: AnyRecord;
};

export type GoalPreviewInput = {
  messageText?: string | null;
  primaryGoal?: PrimaryGoal | string | null;
  targetWeightKg?: number | null;
  targetBodyFatPct?: number | null;
  weeklyRateKg?: number | null;
};

export type GoalPreviewResult = {
  matched: boolean;
  replyText: string;
  profile: AnyRecord;
  daily: AnyRecord;
  weekly: AnyRecord;
  goalPlan: AnyRecord;
  latestBodyComposition: AnyRecord | null;
  pendingGoalCandidate: AnyRecord | null;
  goalProfileUpdate: AnyRecord | null;
};

export type DashboardContext = {
  customerId: number | null;
  linkedUserId: number | null;
  userRow: AnyRecord | null;
  customerRow: AnyRecord | null;
};

const INTERNAL_KEY_HEADER = "x-calotrack-internal-key";
const GOAL_ORDER: PrimaryGoal[] = [
  "maintain",
  "lose_weight",
  "fat_loss",
  "muscle_gain",
  "gain_weight",
];
const TARGET_METRICS = new Set(["target_weight_kg", "target_body_fat_pct"]);
function roundNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const text = safeString(value);
  if (!text) return fallback;

  const normalized = text.replace(/[^\d,.\-]/g, "");
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

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInteger(value: unknown, fallback = 0) {
  return Math.round(toFiniteNumber(value, fallback));
}

function nullableRounded(value: unknown, digits = 1) {
  if (value == null) return null;
  const text = safeString(value);
  if (typeof value !== "number" && !text) return null;
  const numeric = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(numeric) ? roundNumber(numeric, digits) : null;
}

function nullableInteger(value: unknown) {
  if (value == null) return null;
  const text = safeString(value);
  if (typeof value !== "number" && !text) return null;
  const numeric = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function normalizeGender(value: unknown) {
  const raw = safeString(value)?.toLowerCase() || "";
  if (!raw) return null;
  if (/(male|nam|man|m)\b/.test(raw)) return "male";
  if (/(female|nu|nữ|woman|f)\b/.test(raw)) return "female";
  return raw;
}

function normalizePrimaryGoal(value: unknown): PrimaryGoal {
  const raw = safeString(value)?.toLowerCase() || "";
  if (GOAL_ORDER.includes(raw as PrimaryGoal)) {
    return raw as PrimaryGoal;
  }

  if (/(giam mo|si[e?]t|si?t|cut)/.test(raw)) return "fat_loss";
  if (/(giam can|xuong can|xuong ky)/.test(raw)) return "lose_weight";
  if (/(tang co|lean bulk)/.test(raw)) return "muscle_gain";
  if (/(tang can|bulk)/.test(raw)) return "gain_weight";
  return "maintain";
}

function normalizeTargetMetric(value: unknown): TargetMetric {
  const raw = safeString(value)?.toLowerCase() || null;
  if (!raw) return null;
  return TARGET_METRICS.has(raw) ? (raw as TargetMetric) : null;
}

function formatIntVi(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "chưa rõ";
  return Math.round(value).toLocaleString("vi-VN");
}

function formatFloatVi(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "chưa rõ";
  return roundNumber(value, digits).toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function normalizeLooseText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (char) => (char === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9%.,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGoalPreviewWeightKg(messageText: string) {
  const raw = safeString(messageText) || "";
  const normalized = normalizeLooseText(raw);
  const candidates = [
    /(?:giam|xuong|con|ve|muc tieu|target|dat)\s+(?:xuong\s+)?(\d{2,3}(?:[.,]\d+)?)\s*kg\b/,
    /\b(\d{2,3}(?:[.,]\d+)?)\s*kg\b/,
  ];

  for (const pattern of candidates) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = toFiniteNumber(match[1], Number.NaN);
    if (Number.isFinite(value) && value >= 30 && value <= 250) {
      return roundNumber(value, 1);
    }
  }

  return null;
}

function extractGoalPreviewBodyFatPct(messageText: string) {
  const normalized = normalizeLooseText(messageText);
  const patterns = [
    /(?:body fat|pbf|mo co the|bodyfat|bf)\s*(?:muc tieu|target|ve|con)?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/,
    /(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:body fat|pbf|mo co the|bodyfat|bf)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = toFiniteNumber(match[1], Number.NaN);
    if (Number.isFinite(value) && value > 3 && value < 60) {
      return roundNumber(value, 1);
    }
  }

  return null;
}

function extractGoalPreviewWeeklyRateKg(messageText: string) {
  const normalized = normalizeLooseText(messageText);
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*kg\s*\/\s*(?:tuan|week)\b/,
    /(\d+(?:[.,]\d+)?)\s*kg\s*(?:moi\s*)?(?:tuan|week)\b/,
    /(?:toc do|rate)\s*(\d+(?:[.,]\d+)?)\s*kg\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = toFiniteNumber(match[1], Number.NaN);
    if (Number.isFinite(value) && value > 0 && value <= 2) {
      return roundNumber(value, 2);
    }
  }

  return null;
}

function resolvePreviewPrimaryGoal(
  messageText: string,
  currentWeightKg: number,
  targetWeightKg: number | null,
  fallbackGoal: PrimaryGoal,
) {
  const normalized = normalizeLooseText(messageText);

  if (/\b(giam mo|siet|cut)\b/.test(normalized)) return "fat_loss";
  if (/\b(tang co|len co|recomp|tai cau truc)\b/.test(normalized)) return "muscle_gain";
  if (/\b(tang can|bulk)\b/.test(normalized)) return "gain_weight";
  if (/\b(giam can|xuong can|xuong ky|xuong kg|giam xuong)\b/.test(normalized)) return "lose_weight";

  if (targetWeightKg != null && currentWeightKg > 0) {
    if (targetWeightKg < currentWeightKg) return "lose_weight";
    if (targetWeightKg > currentWeightKg) return "gain_weight";
  }

  return fallbackGoal;
}

export function formatGoalLabel(goal: PrimaryGoal) {
  switch (goal) {
    case "lose_weight":
      return "Giảm cân";
    case "fat_loss":
      return "Giảm mỡ";
    case "muscle_gain":
      return "Tăng cơ";
    case "gain_weight":
      return "Tăng cân";
    case "maintain":
    default:
      return "Duy trì";
  }
}

function getSaigonFormatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon",
    ...options,
  });
}

function getSaigonDateKey(date = new Date()) {
  return getSaigonFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getStartOfSaigonDay(date = new Date()) {
  const key = getSaigonDateKey(date);
  return new Date(`${key}T00:00:00+07:00`);
}

function getSaigonNoon(date = new Date()) {
  const key = getSaigonDateKey(date);
  return new Date(`${key}T12:00:00+07:00`);
}

function getCurrentWeekStart(date = new Date()) {
  const noon = getSaigonNoon(date);
  const day = noon.getUTCDay();
  const distance = day === 0 ? 6 : day - 1;
  noon.setUTCDate(noon.getUTCDate() - distance);
  return getStartOfSaigonDay(noon);
}

function getCurrentMonthStart(date = new Date()) {
  const [year, month] = getSaigonDateKey(date).split("-");
  return new Date(`${year}-${month}-01T00:00:00+07:00`);
}

function addDays(date: Date, days: number) {
  const next = getSaigonNoon(date);
  next.setUTCDate(next.getUTCDate() + days);
  return getStartOfSaigonDay(next);
}

function toIsoDate(date: Date) {
  return getSaigonDateKey(date);
}

function getPeriodRange(period: DashboardPeriod, now = new Date()) {
  if (period === "day") {
    const start = getStartOfSaigonDay(now);
    return { start, end: start, dayCount: 1 };
  }

  if (period === "month") {
    const start = getCurrentMonthStart(now);
    const [yearText, monthText] = getSaigonDateKey(start).split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const nextMonthStart =
      month === 12
        ? new Date(`${year + 1}-01-01T00:00:00+07:00`)
        : new Date(`${yearText}-${String(month + 1).padStart(2, "0")}-01T00:00:00+07:00`);
    const end = addDays(nextMonthStart, -1);
    const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    return { start, end, dayCount };
  }

  const start = getCurrentWeekStart(now);
  const end = addDays(start, 6);
  return { start, end, dayCount: 7 };
}

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hasInternalAccess(req: any) {
  const internalKey = getZaloOaInternalKey();
  if (!internalKey) return false;

  const candidate = safeString(req.headers?.[INTERNAL_KEY_HEADER]) ||
    (() => {
      const authHeader = safeString(req.headers?.authorization);
      const match = authHeader?.match(/^Bearer\s+(.+)$/i);
      return safeString(match?.[1]);
    })();

  return !!(candidate && timingSafeEquals(candidate, internalKey));
}

function parseBody(value: unknown) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as AnyRecord;
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? (value as AnyRecord) : {};
}

export async function readJsonBody(req: any): Promise<AnyRecord> {
  if (req.body && typeof req.body === "object") {
    return req.body as AnyRecord;
  }

  if (typeof req.body === "string") {
    return parseBody(req.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return parseBody(raw);
}

async function rpc<T>(
  admin: ReturnType<typeof createServiceRoleClient>,
  fn: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc(fn, params);
  if (error) throw error;
  return data as T;
}

function errorMessageParts(error: unknown) {
  if (!error || typeof error !== "object") {
    return [String(error || "")];
  }

  const record = error as AnyRecord;
  return [
    safeString(record.message),
    safeString(record.details),
    safeString(record.hint),
    safeString(record.code),
  ].filter(Boolean) as string[];
}

function isMissingColumnError(error: unknown, columnName: string) {
  const haystack = errorMessageParts(error).join(" ").toLowerCase();
  return haystack.includes(columnName.toLowerCase()) && haystack.includes("does not exist");
}

function isMissingRelationError(error: unknown, relationName: string) {
  const haystack = errorMessageParts(error).join(" ").toLowerCase();
  return (
    haystack.includes(relationName.toLowerCase()) &&
    (haystack.includes("does not exist") || haystack.includes("could not find the table"))
  );
}

async function refreshStats(admin: ReturnType<typeof createServiceRoleClient>, userId: number, anchorDate: string) {
  await rpc(admin, "refresh_daily_user_stats", {
    p_user_id: userId,
    p_date: anchorDate,
  });
  await rpc(admin, "refresh_weekly_user_stats", {
    p_user_id: userId,
    p_anchor_date: anchorDate,
  });
}

async function resolveContextByCustomerId(
  admin: ReturnType<typeof createServiceRoleClient>,
  customerId: number,
  preferredUserId?: number | null,
): Promise<DashboardContext> {
  const customerRow =
    (await maybeSingle<AnyRecord>(
      admin.from("customers").select("*").eq("id", customerId).limit(1),
    )) || null;

  let userRows: AnyRecord[] | null = null;
  let userError: unknown = null;

  {
    const result = await admin
      .from("users")
      .select("*")
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("latest_body_composition_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });

    userRows = result.data as AnyRecord[] | null;
    userError = result.error;
  }

  if (userError && isMissingColumnError(userError, "latest_body_composition_at")) {
    const fallback = await admin
      .from("users")
      .select("*")
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });

    userRows = fallback.data as AnyRecord[] | null;
    userError = fallback.error;
  }

  if (userError) throw userError;

  const selectedUser =
    (preferredUserId
      ? (userRows || []).find((row: AnyRecord) => Number(row.id) === preferredUserId)
      : null) ||
    (userRows || [])[0] ||
    null;

  return {
    customerId,
    linkedUserId: selectedUser?.id == null ? preferredUserId ?? null : Number(selectedUser.id),
    userRow: selectedUser,
    customerRow,
  };
}

async function resolveContextByUserId(
  admin: ReturnType<typeof createServiceRoleClient>,
  linkedUserId: number,
): Promise<DashboardContext> {
  const userRow =
    (await maybeSingle<AnyRecord>(
      admin.from("users").select("*").eq("id", linkedUserId).limit(1),
    )) || null;

  if (!userRow?.id) {
    throw new Error("dashboard_user_not_found");
  }

  const customerId = Number(userRow.customer_id ?? 0) || null;
  if (!customerId) {
    return {
      customerId: null,
      linkedUserId,
      userRow,
      customerRow: null,
    };
  }

  return resolveContextByCustomerId(admin, customerId, linkedUserId);
}

export async function resolveDashboardAccess(req: any, body?: AnyRecord) {
  if (hasInternalAccess(req)) {
    const payload = body || {};
    const admin = createServiceRoleClient();
    const linkedUserId = Number(payload.linkedUserId ?? payload.linked_user_id ?? req.query?.linkedUserId ?? 0) || null;
    const customerId = Number(payload.customerId ?? payload.customer_id ?? req.query?.customerId ?? 0) || null;

    if (!linkedUserId && !customerId) {
      throw new Error("dashboard_subject_required");
    }

    const context = linkedUserId
      ? await resolveContextByUserId(admin, linkedUserId)
      : await resolveContextByCustomerId(admin, customerId as number, null);

    return {
      admin,
      accessKind: "internal" as const,
      context,
    };
  }

  const authAccess = await requireAuthenticatedUser(req);
  const authLink =
    (await maybeSingle<AnyRecord>(
      authAccess.admin
        .from("customer_auth_links")
        .select("customer_id")
        .eq("auth_user_id", authAccess.authUser.id)
        .in("link_status", ["linked", "active"])
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  const customerId = Number(authLink?.customer_id ?? 0) || null;
  if (!customerId) {
    throw new Error("customer_not_linked");
  }

  const context = await resolveContextByCustomerId(authAccess.admin, customerId, null);
  return {
    admin: authAccess.admin,
    accessKind: "portal" as const,
    context,
  };
}

export function resolveWeeklyRateKg(goal: PrimaryGoal, gender: string | null, storedRate: number) {
  if (storedRate > 0) return storedRate;
  if (goal === "lose_weight") return 0.5;
  if (goal === "fat_loss") return gender === "female" ? 0.4 : 0.5;
  if (goal === "gain_weight") return 0.35;
  if (goal === "muscle_gain") return 0.2;
  return 0;
}

export function computeDailyGoalKcal(tdee: number, goal: PrimaryGoal, weeklyRateKg: number) {
  const safeTdee = tdee > 0 ? tdee : 2000;
  if (goal === "maintain") return roundNumber(safeTdee, 0);

  const delta = (weeklyRateKg * 7700) / 7;
  if (goal === "gain_weight") {
    return roundNumber(safeTdee + delta, 0);
  }

  if (goal === "muscle_gain") {
    return roundNumber(safeTdee + delta, 0);
  }

  return roundNumber(Math.max(1200, safeTdee - delta), 0);
}

export function computeMacroTargets(
  goal: PrimaryGoal,
  gender: string | null,
  weightKg: number,
  dailyGoalKcal: number,
) {
  const safeWeight = weightKg > 0 ? weightKg : 70;
  let proteinPerKg = 1.6;
  let fatPerKg = 0.8;

  if (goal === "lose_weight") {
    proteinPerKg = 2.0;
    fatPerKg = 0.7;
  } else if (goal === "fat_loss") {
    proteinPerKg = gender === "female" ? 1.8 : 2.0;
    fatPerKg = gender === "female" ? 0.8 : 0.7;
  } else if (goal === "muscle_gain") {
    proteinPerKg = gender === "female" ? 1.8 : 2.0;
    fatPerKg = gender === "female" ? 0.75 : 0.8;
  } else if (goal === "gain_weight") {
    proteinPerKg = 1.8;
    fatPerKg = 0.8;
  }

  const proteinG = roundNumber(safeWeight * proteinPerKg, 1);
  const fatG = roundNumber(safeWeight * fatPerKg, 1);
  const carbCalories = Math.max(0, dailyGoalKcal - proteinG * 4 - fatG * 9);
  const carbsG = roundNumber(carbCalories / 4, 1);

  return {
    proteinG,
    fatG,
    carbsG,
  };
}

function computeTargetWeightFromBodyFat(currentWeightKg: number, currentBodyFatPct: number, targetBodyFatPct: number) {
  if (currentWeightKg <= 0 || currentBodyFatPct <= 0 || targetBodyFatPct <= 0 || targetBodyFatPct >= 100) {
    return null;
  }

  const leanMassKg = currentWeightKg * (1 - currentBodyFatPct / 100);
  if (!Number.isFinite(leanMassKg) || leanMassKg <= 0) return null;
  return roundNumber(leanMassKg / (1 - targetBodyFatPct / 100), 1);
}

function computeGoalTimeline(params: {
  currentWeightKg: number;
  currentBodyFatPct: number;
  primaryGoal: PrimaryGoal;
  targetMetric: TargetMetric;
  targetWeightKg: number;
  targetBodyFatPct: number;
  weeklyRateKg: number;
  dailyGoalKcal: number;
}) {
  const resolvedTargetWeight =
    params.targetMetric === "target_body_fat_pct"
      ? computeTargetWeightFromBodyFat(
          params.currentWeightKg,
          params.currentBodyFatPct,
          params.targetBodyFatPct,
        )
      : params.targetWeightKg > 0
        ? params.targetWeightKg
        : null;

  const deltaKg =
    resolvedTargetWeight && params.currentWeightKg > 0
      ? roundNumber(params.currentWeightKg - resolvedTargetWeight, 1)
      : 0;

  const etaWeeks =
    resolvedTargetWeight && params.weeklyRateKg > 0
      ? roundNumber(Math.abs(params.currentWeightKg - resolvedTargetWeight) / params.weeklyRateKg, 1)
      : null;

  return {
    primaryGoal: params.primaryGoal,
    targetMetric: params.targetMetric,
    targetWeightKg: resolvedTargetWeight,
    targetBodyFatPct: params.targetMetric === "target_body_fat_pct" ? params.targetBodyFatPct : null,
    currentWeightKg: params.currentWeightKg > 0 ? roundNumber(params.currentWeightKg, 1) : null,
    currentBodyFatPct: params.currentBodyFatPct > 0 ? roundNumber(params.currentBodyFatPct, 1) : null,
    dailyGoalKcal: roundNumber(params.dailyGoalKcal, 0),
    weeklyRateKg: params.weeklyRateKg > 0 ? roundNumber(params.weeklyRateKg, 2) : null,
    deltaKg,
    estimatedWeeksToGoal: etaWeeks,
    kcalDeltaPerDay:
      params.primaryGoal === "maintain"
        ? 0
        : roundNumber((params.weeklyRateKg * 7700) / 7, 0),
  };
}

function buildBodyCompositionConflicts(userRow: AnyRecord | null, input: BodyCompositionInput) {
  const conflicts: { field: string; current: unknown; incoming: unknown }[] = [];
  if (!userRow) return conflicts;

  const checks: Array<[string, unknown, unknown]> = [
    ["age", userRow.age, input.age],
    ["gender", userRow.gender, normalizeGender(input.gender)],
    ["height_cm", userRow.height_cm, input.heightCm],
  ];

  for (const [field, current, incoming] of checks) {
    if (incoming == null || incoming === "") continue;
    if (current == null || current === "") continue;

    if (String(current).trim().toLowerCase() !== String(incoming).trim().toLowerCase()) {
      conflicts.push({ field, current, incoming });
    }
  }

  return conflicts;
}

async function fetchChartRows(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  const today = getStartOfSaigonDay();
  const start = addDays(today, -6);
  const { data, error } = await admin
    .from("daily_user_stats")
    .select("date_local,total_calories,total_protein,total_carbs,total_fat,exercise_calories,net_calories,meal_count")
    .eq("user_id", userId)
    .gte("date_local", toIsoDate(start))
    .lte("date_local", toIsoDate(today))
    .order("date_local", { ascending: true });

  if (error) throw error;

  const rowsByDate = new Map<string, AnyRecord>();
  for (const row of data || []) {
    rowsByDate.set(String((row as AnyRecord).date_local), row as AnyRecord);
  }

  const chart: AnyRecord[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const cursor = addDays(today, -offset);
    const key = toIsoDate(cursor);
    const row = rowsByDate.get(key) || {};
    chart.push({
      date: key,
      totalCalories: roundNumber(toFiniteNumber(row.total_calories), 0),
      totalProtein: roundNumber(toFiniteNumber(row.total_protein), 1),
      totalCarbs: roundNumber(toFiniteNumber(row.total_carbs), 1),
      totalFat: roundNumber(toFiniteNumber(row.total_fat), 1),
      exerciseCalories: roundNumber(toFiniteNumber(row.exercise_calories), 0),
      netCalories: roundNumber(toFiniteNumber(row.net_calories), 0),
      mealCount: safeInteger(row.meal_count),
    });
  }

  return chart;
}

async function fetchLatestBodyComposition(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: number,
) {
  try {
    return await maybeSingle<AnyRecord>(
      admin
        .from("body_composition_logs")
        .select("*")
        .eq("user_id", userId)
        .order("measured_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),
    );
  } catch (error) {
    if (isMissingRelationError(error, "body_composition_logs")) {
      return null;
    }
    throw error;
  }
}

export async function getDashboardSummary(
  admin: ReturnType<typeof createServiceRoleClient>,
  context: DashboardContext,
  period: DashboardPeriod = "week",
): Promise<DashboardSummary> {
  if (!context.userRow?.id) {
    throw new Error("dashboard_user_not_found");
  }

  const userId = Number(context.userRow.id);
  const todayKey = getSaigonDateKey();
  await refreshStats(admin, userId, todayKey);

  const dayRange = getPeriodRange("day");
  const weekRange = getPeriodRange("week");
  const requestedRange = getPeriodRange(period);

  const [dailyRow, weeklyRows, latestBodyComposition, chart7d] = await Promise.all([
    maybeSingle<AnyRecord>(
      admin
        .from("daily_user_stats")
        .select("*")
        .eq("user_id", userId)
        .eq("date_local", toIsoDate(dayRange.start))
        .limit(1),
    ),
    admin
      .from("daily_user_stats")
      .select("date_local,total_calories,total_protein,total_carbs,total_fat,exercise_calories,net_calories,meal_count")
      .eq("user_id", userId)
      .gte("date_local", toIsoDate(weekRange.start))
      .lte("date_local", toIsoDate(weekRange.end))
      .order("date_local", { ascending: true }),
    fetchLatestBodyComposition(admin, userId),
    fetchChartRows(admin, userId),
  ]);

  const weeklyDailyRows = Array.isArray(weeklyRows.data) ? weeklyRows.data : [];
  if (weeklyRows.error) throw weeklyRows.error;

  const requestedRowsResult = await admin
    .from("daily_user_stats")
    .select("date_local,total_calories,total_protein,total_carbs,total_fat,exercise_calories,net_calories,meal_count")
    .eq("user_id", userId)
    .gte("date_local", toIsoDate(requestedRange.start))
    .lte("date_local", toIsoDate(requestedRange.end))
    .order("date_local", { ascending: true });

  if (requestedRowsResult.error) throw requestedRowsResult.error;

  const requestedRows = Array.isArray(requestedRowsResult.data) ? requestedRowsResult.data : [];
  const gender = normalizeGender(latestBodyComposition?.gender ?? context.userRow.gender);
  const currentWeightKg = toFiniteNumber(latestBodyComposition?.weight_kg ?? context.userRow.weight_kg);
  const currentBodyFatPct = toFiniteNumber(
    latestBodyComposition?.body_fat_pct ?? context.userRow.current_body_fat_pct,
  );
  const primaryGoal = normalizePrimaryGoal(context.userRow.primary_goal ?? context.userRow.goal_mode);
  const targetMetric = normalizeTargetMetric(context.userRow.target_metric);
  const weeklyRateKg = resolveWeeklyRateKg(
    primaryGoal,
    gender,
    toFiniteNumber(context.userRow.goal_weekly_rate_kg),
  );
  const tdee = toFiniteNumber(context.userRow.tdee);
  const dailyGoalKcal = computeDailyGoalKcal(tdee, primaryGoal, weeklyRateKg);
  const macros = computeMacroTargets(primaryGoal, gender, currentWeightKg, dailyGoalKcal);

  const sumRows = (rows: AnyRecord[]) =>
    rows.reduce(
      (accumulator, row) => {
        accumulator.totalCalories += toFiniteNumber(row.total_calories);
        accumulator.totalProtein += toFiniteNumber(row.total_protein);
        accumulator.totalCarbs += toFiniteNumber(row.total_carbs);
        accumulator.totalFat += toFiniteNumber(row.total_fat);
        accumulator.exerciseCalories += toFiniteNumber(row.exercise_calories);
        accumulator.netCalories += toFiniteNumber(row.net_calories);
        accumulator.mealCount += safeInteger(row.meal_count);
        accumulator.daysLogged +=
          toFiniteNumber(row.total_calories) > 0 ||
          toFiniteNumber(row.total_protein) > 0 ||
          toFiniteNumber(row.total_carbs) > 0 ||
          toFiniteNumber(row.total_fat) > 0
            ? 1
            : 0;
        return accumulator;
      },
      {
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        exerciseCalories: 0,
        netCalories: 0,
        mealCount: 0,
        daysLogged: 0,
      },
    );

  const weeklyConsumed = sumRows(weeklyDailyRows as AnyRecord[]);
  const requestedConsumed = sumRows(requestedRows as AnyRecord[]);
  const dailyConsumed = sumRows(dailyRow ? [dailyRow] : []);
  const weeklyTargets = {
    targetKcal: roundNumber(dailyGoalKcal * 7, 0),
    targetProteinG: roundNumber(macros.proteinG * 7, 1),
    targetCarbsG: roundNumber(macros.carbsG * 7, 1),
    targetFatG: roundNumber(macros.fatG * 7, 1),
  };

  return {
    profile: {
      customerId: context.customerId,
      linkedUserId: context.linkedUserId,
      onboardingStatus: safeString(context.customerRow?.onboarding_status) || safeString(context.userRow.onboarding_status),
      primaryGoal,
      goalLabel: formatGoalLabel(primaryGoal),
      weightKg: currentWeightKg > 0 ? roundNumber(currentWeightKg, 1) : null,
      heightCm: toFiniteNumber(latestBodyComposition?.height_cm ?? context.userRow.height_cm) || null,
      age: safeInteger(latestBodyComposition?.age ?? context.userRow.age) || null,
      gender,
      activityLevel: safeString(context.userRow.activity_level) || null,
      tdee: tdee > 0 ? roundNumber(tdee, 0) : null,
      dailyGoalKcal,
      gymModeEnabled: !!context.userRow.gym_mode_until && Date.parse(String(context.userRow.gym_mode_until)) > Date.now(),
    },
    daily: {
      intakeKcal: roundNumber(dailyConsumed.totalCalories, 0),
      exerciseKcal: roundNumber(dailyConsumed.exerciseCalories, 0),
      netKcal: roundNumber(dailyConsumed.netCalories, 0),
      goalKcal: roundNumber(dailyGoalKcal, 0),
      consumedProteinG: roundNumber(dailyConsumed.totalProtein, 1),
      consumedCarbsG: roundNumber(dailyConsumed.totalCarbs, 1),
      consumedFatG: roundNumber(dailyConsumed.totalFat, 1),
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      mealCount: dailyConsumed.mealCount,
      date: todayKey,
    },
    weekly: {
      ...weeklyTargets,
      consumedKcal: roundNumber(weeklyConsumed.totalCalories, 0),
      consumedProteinG: roundNumber(weeklyConsumed.totalProtein, 1),
      consumedCarbsG: roundNumber(weeklyConsumed.totalCarbs, 1),
      consumedFatG: roundNumber(weeklyConsumed.totalFat, 1),
      remainingKcal: roundNumber(weeklyTargets.targetKcal - weeklyConsumed.totalCalories, 0),
      remainingProteinG: roundNumber(weeklyTargets.targetProteinG - weeklyConsumed.totalProtein, 1),
      remainingCarbsG: roundNumber(weeklyTargets.targetCarbsG - weeklyConsumed.totalCarbs, 1),
      remainingFatG: roundNumber(weeklyTargets.targetFatG - weeklyConsumed.totalFat, 1),
      daysLogged: weeklyConsumed.daysLogged,
      startDate: toIsoDate(weekRange.start),
      endDate: toIsoDate(weekRange.end),
    },
    goalPlan: computeGoalTimeline({
      currentWeightKg,
      currentBodyFatPct,
      primaryGoal,
      targetMetric,
      targetWeightKg: toFiniteNumber(context.userRow.target_weight_kg),
      targetBodyFatPct: toFiniteNumber(context.userRow.target_body_fat_pct),
      weeklyRateKg,
      dailyGoalKcal,
    }),
    latestBodyComposition: latestBodyComposition
      ? {
          measuredAt: safeString(latestBodyComposition.measured_at),
          age: nullableInteger(latestBodyComposition.age),
          gender: normalizeGender(latestBodyComposition.gender),
          heightCm: nullableRounded(latestBodyComposition.height_cm, 1),
          weightKg: nullableRounded(latestBodyComposition.weight_kg, 1),
          skeletalMuscleMassKg: nullableRounded(latestBodyComposition.skeletal_muscle_mass_kg, 1),
          bodyFatMassKg: nullableRounded(latestBodyComposition.body_fat_mass_kg, 1),
          bodyFatPct: nullableRounded(latestBodyComposition.body_fat_pct, 1),
          bmi: nullableRounded(latestBodyComposition.bmi, 1),
          bmr: nullableRounded(latestBodyComposition.bmr, 0),
          visceralFatLevel: nullableInteger(latestBodyComposition.visceral_fat_level),
          waistHipRatio: nullableRounded(latestBodyComposition.waist_hip_ratio, 2),
          inbodyScore: nullableInteger(latestBodyComposition.inbody_score),
          targetWeightKg: nullableRounded(latestBodyComposition.target_weight_kg, 1),
        }
      : null,
    chart7d,
    requestedPeriod: {
      period,
      startDate: toIsoDate(requestedRange.start),
      endDate: toIsoDate(requestedRange.end),
      targetKcal: roundNumber(dailyGoalKcal * requestedRange.dayCount, 0),
      targetProteinG: roundNumber(macros.proteinG * requestedRange.dayCount, 1),
      targetCarbsG: roundNumber(macros.carbsG * requestedRange.dayCount, 1),
      targetFatG: roundNumber(macros.fatG * requestedRange.dayCount, 1),
      consumedKcal: roundNumber(requestedConsumed.totalCalories, 0),
      consumedProteinG: roundNumber(requestedConsumed.totalProtein, 1),
      consumedCarbsG: roundNumber(requestedConsumed.totalCarbs, 1),
      consumedFatG: roundNumber(requestedConsumed.totalFat, 1),
      exerciseKcal: roundNumber(requestedConsumed.exerciseCalories, 0),
      netKcal: roundNumber(requestedConsumed.netCalories, 0),
      daysLogged: requestedConsumed.daysLogged,
    },
  };
}

export async function getGoalPreview(
  admin: ReturnType<typeof createServiceRoleClient>,
  context: DashboardContext,
  input: GoalPreviewInput,
): Promise<GoalPreviewResult> {
  const currentSummary = await getDashboardSummary(admin, context, "week");
  const profile = currentSummary.profile || {};
  const latestBodyComposition = currentSummary.latestBodyComposition || null;
  const messageText = safeString(input.messageText) || "";
  const currentWeightKg = toFiniteNumber(
    latestBodyComposition?.weightKg ?? profile.weightKg ?? context.userRow?.weight_kg,
    0,
  );
  const currentBodyFatPct = toFiniteNumber(
    latestBodyComposition?.bodyFatPct ?? currentSummary.goalPlan?.currentBodyFatPct ?? context.userRow?.current_body_fat_pct,
    0,
  );
  const gender = normalizeGender(
    latestBodyComposition?.gender ?? profile.gender ?? context.userRow?.gender,
  );
  const tdee = toFiniteNumber(profile.tdee ?? context.userRow?.tdee, 0);
  const explicitGoal = safeString(input.primaryGoal);
  const fallbackGoal = normalizePrimaryGoal(explicitGoal ?? context.userRow?.primary_goal ?? context.userRow?.goal_mode);
  const explicitTargetWeightKg =
    input.targetWeightKg != null ? toFiniteNumber(input.targetWeightKg, Number.NaN) : Number.NaN;
  const explicitTargetBodyFatPct =
    input.targetBodyFatPct != null ? toFiniteNumber(input.targetBodyFatPct, Number.NaN) : Number.NaN;
  const targetWeightKg = Number.isFinite(explicitTargetWeightKg)
    ? roundNumber(explicitTargetWeightKg, 1)
    : extractGoalPreviewWeightKg(messageText);
  const targetBodyFatPct = Number.isFinite(explicitTargetBodyFatPct)
    ? roundNumber(explicitTargetBodyFatPct, 1)
    : extractGoalPreviewBodyFatPct(messageText);
  const targetMetric: TargetMetric =
    targetBodyFatPct != null ? "target_body_fat_pct" : targetWeightKg != null ? "target_weight_kg" : null;

  if (!targetMetric) {
    return {
      matched: false,
      replyText: "",
      profile: currentSummary.profile,
      daily: currentSummary.daily,
      weekly: currentSummary.weekly,
      goalPlan: currentSummary.goalPlan,
      latestBodyComposition,
      pendingGoalCandidate: null,
      goalProfileUpdate: null,
    };
  }

  const primaryGoal = normalizePrimaryGoal(
    explicitGoal ||
      resolvePreviewPrimaryGoal(messageText, currentWeightKg, targetWeightKg, fallbackGoal),
  );
  const explicitWeeklyRateKg =
    input.weeklyRateKg != null
      ? toFiniteNumber(input.weeklyRateKg, Number.NaN)
      : extractGoalPreviewWeeklyRateKg(messageText) ?? Number.NaN;
  const weeklyRateKg = resolveWeeklyRateKg(
    primaryGoal,
    gender,
    Number.isFinite(explicitWeeklyRateKg)
      ? explicitWeeklyRateKg
      : toFiniteNumber(context.userRow?.goal_weekly_rate_kg),
  );
  const dailyGoalKcal = computeDailyGoalKcal(tdee, primaryGoal, weeklyRateKg);
  const macros = computeMacroTargets(primaryGoal, gender, currentWeightKg, dailyGoalKcal);
  const weekly = {
    targetKcal: roundNumber(dailyGoalKcal * 7, 0),
    targetProteinG: roundNumber(macros.proteinG * 7, 1),
    targetCarbsG: roundNumber(macros.carbsG * 7, 1),
    targetFatG: roundNumber(macros.fatG * 7, 1),
  };
  const goalPlan = computeGoalTimeline({
    currentWeightKg,
    currentBodyFatPct,
    primaryGoal,
    targetMetric,
    targetWeightKg: targetWeightKg ?? 0,
    targetBodyFatPct: targetBodyFatPct ?? 0,
    weeklyRateKg,
    dailyGoalKcal,
  });
  const pendingGoalCandidate = {
    createdAt: new Date().toISOString(),
    source: "goal_preview",
    messageText,
    primaryGoal,
    targetMetric,
    targetWeightKg: goalPlan.targetWeightKg,
    targetBodyFatPct: goalPlan.targetBodyFatPct,
    weeklyRateKg: goalPlan.weeklyRateKg,
    dailyGoalKcal: goalPlan.dailyGoalKcal,
    targetProteinG: macros.proteinG,
    targetCarbsG: macros.carbsG,
    targetFatG: macros.fatG,
    weeklyTargetKcal: weekly.targetKcal,
    weeklyTargetProteinG: weekly.targetProteinG,
    weeklyTargetCarbsG: weekly.targetCarbsG,
    weeklyTargetFatG: weekly.targetFatG,
  };
  const goalProfileUpdate = {
    primary_goal: primaryGoal,
    target_metric: targetMetric,
    target_weight_kg: goalPlan.targetWeightKg,
    target_body_fat_pct: goalPlan.targetBodyFatPct,
    goal_weekly_rate_kg: goalPlan.weeklyRateKg,
    daily_calorie_goal: goalPlan.dailyGoalKcal,
  };

  const cleanReplyLines = [
    "Mình đã tính thử lộ trình theo hồ sơ hiện tại của bạn:",
    `- Goal mode đề xuất: ${formatGoalLabel(primaryGoal)}`,
    currentWeightKg > 0 ? `- Cân nặng hiện tại: ${formatFloatVi(currentWeightKg)} kg` : null,
    goalPlan.targetWeightKg != null ? `- Mục tiêu cân nặng: ${formatFloatVi(goalPlan.targetWeightKg)} kg` : null,
    goalPlan.targetBodyFatPct != null ? `- Mục tiêu body fat: ${formatFloatVi(goalPlan.targetBodyFatPct)}%` : null,
    goalPlan.deltaKg != null ? `- Chênh lệch cần đi: ${formatFloatVi(Math.abs(goalPlan.deltaKg))} kg` : null,
    goalPlan.weeklyRateKg != null ? `- Tốc độ đang tính: ${formatFloatVi(goalPlan.weeklyRateKg, 2)} kg/tuần` : null,
    goalPlan.estimatedWeeksToGoal != null
      ? `- ETA ước tính: khoảng ${formatFloatVi(goalPlan.estimatedWeeksToGoal, 1)} tuần`
      : null,
    `- Daily goal: ${formatIntVi(goalPlan.dailyGoalKcal)} kcal/ngày`,
    `- Mục tiêu tuần: ${formatIntVi(weekly.targetKcal)} kcal | P ${formatFloatVi(weekly.targetProteinG)} g | C ${formatFloatVi(weekly.targetCarbsG)} g | F ${formatFloatVi(weekly.targetFatG)} g`,
    `- Macro mỗi ngày: P ${formatFloatVi(macros.proteinG)} g | C ${formatFloatVi(macros.carbsG)} g | F ${formatFloatVi(macros.fatG)} g`,
    "",
    'Nếu muốn lưu mục tiêu này vào hồ sơ, trả lời "lưu mục tiêu này". Nếu chỉ muốn tham khảo, trả lời "không lưu mục tiêu".',
  ].filter(Boolean) as string[];

  return {
    matched: true,
    replyText: cleanReplyLines.join("\n"),
    profile: currentSummary.profile,
    daily: {
      goalKcal: goalPlan.dailyGoalKcal,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
    },
    weekly,
    goalPlan,
    latestBodyComposition,
    pendingGoalCandidate,
    goalProfileUpdate,
  };
}

export async function saveBodyCompositionLog(
  admin: ReturnType<typeof createServiceRoleClient>,
  context: DashboardContext,
  input: BodyCompositionInput,
) {
  if (!context.userRow?.id) {
    throw new Error("dashboard_user_not_found");
  }

  const conflicts = buildBodyCompositionConflicts(context.userRow, input);
  if (conflicts.length && !input.overwriteDemographics) {
    return {
      saved: false,
      requiresOverwrite: true,
      conflicts,
    };
  }

  const userId = Number(context.userRow.id);
  const customerId = context.customerId ?? (Number(context.userRow.customer_id ?? 0) || null);
  const measuredAt = safeString(input.measuredAt) || new Date().toISOString();
  const normalizedGender = normalizeGender(input.gender);

  const payload = {
    user_id: userId,
    customer_id: customerId,
    review_id: safeString(input.reviewId),
    source: safeString(input.source) || "inbody_image",
    source_message_id: safeString(input.sourceMessageId),
    measured_at: measuredAt,
    age: input.age ?? null,
    gender: normalizedGender,
    height_cm: input.heightCm ?? null,
    weight_kg: input.weightKg ?? null,
    skeletal_muscle_mass_kg: input.skeletalMuscleMassKg ?? null,
    body_fat_mass_kg: input.bodyFatMassKg ?? null,
    body_fat_pct: input.bodyFatPct ?? null,
    bmi: input.bmi ?? null,
    bmr: input.bmr ?? null,
    visceral_fat_level: input.visceralFatLevel ?? null,
    waist_hip_ratio: input.waistHipRatio ?? null,
    inbody_score: input.inbodyScore ?? null,
    target_weight_kg: input.targetWeightKg ?? null,
    weight_control_kg: input.weightControlKg ?? null,
    fat_control_kg: input.fatControlKg ?? null,
    muscle_control_kg: input.muscleControlKg ?? null,
    raw_ocr: input.rawOcr ?? null,
    raw_extracted: input.rawExtracted ?? null,
  };

  let inserted: AnyRecord[] | null = null;
  try {
    let writeResult:
      | {
          data: AnyRecord[] | null;
          error: unknown;
        }
      | undefined;

    const reviewId = safeString(input.reviewId);
    if (reviewId) {
      const existingResult = await admin
        .from("body_composition_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("review_id", reviewId)
        .order("id", { ascending: false })
        .limit(1);

      if (existingResult.error) throw existingResult.error;

      const existingRow = Array.isArray(existingResult.data) ? existingResult.data[0] ?? null : null;
      writeResult = existingRow?.id
        ? await admin
            .from("body_composition_logs")
            .update(payload)
            .eq("id", existingRow.id)
            .select("*")
            .limit(1)
        : await admin
            .from("body_composition_logs")
            .insert(payload)
            .select("*")
            .limit(1);
    } else {
      writeResult = await admin
        .from("body_composition_logs")
        .insert(payload)
        .select("*")
        .limit(1);
    }

    if (writeResult.error) throw writeResult.error;
    inserted = Array.isArray(writeResult.data) ? writeResult.data : null;
  } catch (error) {
    if (!isMissingRelationError(error, "body_composition_logs")) {
      throw error;
    }
  }

  const userUpdate: AnyRecord = {};

  if ("latest_body_composition_at" in context.userRow) userUpdate.latest_body_composition_at = measuredAt;
  if (input.weightKg != null) userUpdate.weight_kg = input.weightKg;
  if ("current_body_fat_pct" in context.userRow && input.bodyFatPct != null) {
    userUpdate.current_body_fat_pct = input.bodyFatPct;
  }
  if ("target_weight_kg" in context.userRow && input.targetWeightKg != null) {
    userUpdate.target_weight_kg = input.targetWeightKg;
  }
  if (conflicts.length === 0 || input.overwriteDemographics) {
    if ("age" in context.userRow && input.age != null) userUpdate.age = input.age;
    if ("gender" in context.userRow && normalizedGender) userUpdate.gender = normalizedGender;
    if ("height_cm" in context.userRow && input.heightCm != null) userUpdate.height_cm = input.heightCm;
  }

  const { error: updateError } = Object.keys(userUpdate).length
    ? await admin
        .from("users")
        .update(userUpdate)
        .eq("id", userId)
    : { error: null };

  if (updateError) throw updateError;

  await refreshStats(admin, userId, getSaigonDateKey());
  const refreshedContext = await resolveContextByUserId(admin, userId);

  return {
    saved: true,
    requiresOverwrite: false,
    conflicts,
    log: Array.isArray(inserted) ? inserted[0] || payload : payload,
    summary: await getDashboardSummary(admin, refreshedContext, "week"),
  };
}
