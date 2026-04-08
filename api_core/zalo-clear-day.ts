import { createServiceRoleClient, sendJson, safeString } from "../src/lib/server/adminServer.js";
import { requireInternalZaloRequest } from "../src/lib/server/zaloRecoveryServer.js";

type AnyRecord = Record<string, any>;

function formatSaigonDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildSaigonDayRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function toNumber(value: unknown, fallback = 0) {
  const text = safeString(value);
  if (!text && typeof value !== "number") return fallback;
  const numeric = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hasMeaningfulNutrition(item: AnyRecord) {
  return (
    toNumber(item?.calories, 0) > 0 ||
    toNumber(item?.protein, 0) > 0 ||
    toNumber(item?.carbs, 0) > 0 ||
    toNumber(item?.fat, 0) > 0
  );
}

function rowStamp(item: AnyRecord) {
  const isoStamp =
    Date.parse(String(item?.logged_at || item?.created_at || "")) ||
    Date.parse(`${safeString(item?.date) || ""}T${String(item?.time || "00:00:00").slice(0, 8)}+07:00`) ||
    0;
  return isoStamp;
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
    const body = (await requireInternalZaloRequest(req)) as AnyRecord;
    const userId = Number.parseInt(String(body.user_id || body.user_id_db || body.user_record?.id || ""), 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      sendJson(res, 400, { ok: false, error: "invalid_user_id" });
      return;
    }

    const currentDate = safeString(body.current_date || body.date) || formatSaigonDateKey(new Date());
    const { start, end } = buildSaigonDayRange(currentDate);
    const admin = createServiceRoleClient();
    const select =
      "id,user_id,food_name,calories,protein,carbs,fat,time,date,created_at,logged_at,deleted_at";

    const [byDate, byLoggedAt] = await Promise.all([
      admin
        .from("food_logs")
        .select(select)
        .eq("user_id", userId)
        .eq("date", currentDate)
        .is("deleted_at", null)
        .limit(100),
      admin
        .from("food_logs")
        .select(select)
        .eq("user_id", userId)
        .gte("logged_at", start.toISOString())
        .lt("logged_at", end.toISOString())
        .is("deleted_at", null)
        .limit(100),
    ]);

    if (byDate.error) throw byDate.error;
    if (byLoggedAt.error) throw byLoggedAt.error;

    const merged = new Map<number, AnyRecord>();
    for (const row of [...(byDate.data || []), ...(byLoggedAt.data || [])]) {
      const id = Number.parseInt(String(row?.id || ""), 10);
      if (!Number.isFinite(id) || id <= 0) continue;
      merged.set(id, row);
    }

    const items = Array.from(merged.values())
      .filter((row) => hasMeaningfulNutrition(row))
      .sort((left, right) => rowStamp(left) - rowStamp(right));

    sendJson(res, 200, {
      ok: true,
      current_date: currentDate,
      count: items.length,
      items,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "zalo_clear_day_failed");
    sendJson(res, message === "internal_access_denied" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
