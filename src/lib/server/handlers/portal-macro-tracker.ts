import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const DEFAULT_SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

type AnyRecord = Record<string, any>;

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function getBearerToken(req: any): string | null {
  const rawHeader = safeString(req.headers?.authorization);
  if (!rawHeader) return null;
  const match = rawHeader.match(/^Bearer\s+(.+)$/i);
  return safeString(match?.[1]);
}

async function maybeSingle<T>(
  query: PromiseLike<{ data: T[] | T | null; error: any }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw error;
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as T) || null;
  return data as T;
}

function getSaigonDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function buildLast7Days(): string[] {
  const todayKey = getSaigonDateKey(new Date());
  const today = new Date(`${todayKey}T00:00:00+07:00`);
  const days: string[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const cursor = new Date(today);
    cursor.setUTCDate(cursor.getUTCDate() - offset);
    days.push(getSaigonDateKey(cursor));
  }

  return days;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const accessToken = getBearerToken(req);

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: "supabase_runtime_config_missing" });
    return;
  }

  if (!accessToken) {
    sendJson(res, 401, { ok: false, error: "auth_required" });
    return;
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(accessToken);

    if (authError || !user) {
      sendJson(res, 401, { ok: false, error: "auth_required" });
      return;
    }

    const customerLink = await maybeSingle<{ customer_id: number | null }>(
      admin
        .from("customer_auth_links")
        .select("customer_id")
        .eq("auth_user_id", user.id)
        .in("link_status", ["linked", "active"])
        .order("created_at", { ascending: false })
        .limit(1),
    );

    const customerId = customerLink?.customer_id ?? null;
    if (!customerId) {
      sendJson(res, 200, { ok: true, data: [] });
      return;
    }

    const { data: compatUsers, error: userError } = await admin
      .from("users")
      .select("id,daily_calorie_goal")
      .eq("customer_id", customerId)
      .is("deleted_at", null);

    if (userError) throw userError;

    const userIds = Array.isArray(compatUsers)
      ? compatUsers.map((row) => Number(row.id)).filter((value) => Number.isFinite(value))
      : [];

    const calorieGoal =
      Array.isArray(compatUsers) && compatUsers.length
        ? compatUsers.reduce<number | null>((maxValue, row) => {
            const candidate = Number(row.daily_calorie_goal ?? 0);
            if (!Number.isFinite(candidate) || candidate <= 0) return maxValue;
            return maxValue == null ? candidate : Math.max(maxValue, candidate);
          }, null)
        : null;

    const days = buildLast7Days();
    if (!userIds.length) {
      sendJson(res, 200, {
        ok: true,
        data: days.map((date) => ({
          date,
          total_calories: 0,
          total_protein: 0,
          total_carbs: 0,
          total_fat: 0,
          calorie_goal: calorieGoal,
        })),
      });
      return;
    }

    const startDate = days[0];
    const endDate = days[days.length - 1];
    const { data: mealLogs, error: mealLogError } = await admin
      .from("meal_logs")
      .select("id,date_local,user_id")
      .in("user_id", userIds)
      .gte("date_local", startDate)
      .lte("date_local", endDate);

    if (mealLogError) throw mealLogError;

    const logIds = Array.isArray(mealLogs)
      ? mealLogs.map((row) => Number(row.id)).filter((value) => Number.isFinite(value))
      : [];
    const logDateById = new Map<number, string>();

    for (const row of mealLogs || []) {
      const logId = Number((row as AnyRecord).id);
      const dateLocal = safeString((row as AnyRecord).date_local);
      if (Number.isFinite(logId) && dateLocal) {
        logDateById.set(logId, dateLocal);
      }
    }

    const { data: items, error: itemError } = logIds.length
      ? await admin
          .from("meal_log_items")
          .select("meal_log_id,calories,protein,carbs,fat")
          .in("meal_log_id", logIds)
      : { data: [], error: null };

    if (itemError) throw itemError;

    const totalsByDate = new Map<
      string,
      { total_calories: number; total_protein: number; total_carbs: number; total_fat: number }
    >();

    for (const date of days) {
      totalsByDate.set(date, {
        total_calories: 0,
        total_protein: 0,
        total_carbs: 0,
        total_fat: 0,
      });
    }

    for (const item of items || []) {
      const mealLogId = Number((item as AnyRecord).meal_log_id);
      const dateLocal = logDateById.get(mealLogId);
      if (!dateLocal) continue;

      const bucket = totalsByDate.get(dateLocal);
      if (!bucket) continue;

      bucket.total_calories += toNumber((item as AnyRecord).calories);
      bucket.total_protein += toNumber((item as AnyRecord).protein);
      bucket.total_carbs += toNumber((item as AnyRecord).carbs);
      bucket.total_fat += toNumber((item as AnyRecord).fat);
    }

    sendJson(res, 200, {
      ok: true,
      data: days.map((date) => {
        const bucket = totalsByDate.get(date) || {
          total_calories: 0,
          total_protein: 0,
          total_carbs: 0,
          total_fat: 0,
        };

        return {
          date,
          ...bucket,
          calorie_goal: calorieGoal,
        };
      }),
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: "portal_macro_tracker_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
