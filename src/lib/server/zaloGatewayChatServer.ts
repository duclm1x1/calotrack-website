import { maybeSingle, safeString } from "./adminServer.js";
import {
  computeDailyGoalKcal,
  computeMacroTargets,
  formatGoalModeDisplayLabel,
  resolveDashboardAccess,
  resolveWeeklyRateKg,
  type DashboardContext,
  type GoalModeVariant,
  type PrimaryGoal,
} from "./dashboardSummaryServer.js";
import { getZaloOaInternalKey } from "./zaloOaServer.js";

type AnyRecord = Record<string, any>;

type GatewayAccess = {
  senderUserRow: AnyRecord | null;
  channelAccountRow: AnyRecord | null;
  customerId: number | null;
  linkedUserId: number | null;
  linked: boolean;
  context: DashboardContext | null;
};

type DirectFoodItem = {
  foodName: string;
  quantityValue: number;
  quantityUnit: string | null;
  portionLabel: string;
  grams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sourceConfidence: number;
};

type FoodCatalogEntry = {
  key: string;
  name: string;
  aliases: string[];
  defaultGrams: number;
  defaultPortionLabel: string;
  portionGrams?: Record<string, number>;
  per100: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

const SAIGON_TIMEZONE = "Asia/Saigon";
const PENDING_INTENT_SCHEMA_VERSION = 1;
const IMAGE_FOLLOWUP_TTL_MS = 10 * 60 * 1000;
const INBODY_CAPTURE_TTL_MS = 15 * 60 * 1000;

const DIRECT_FOOD_CATALOG: FoodCatalogEntry[] = [
  {
    key: "trung_luoc",
    name: "Trứng luộc",
    aliases: ["trung luoc", "trung"],
    defaultGrams: 50,
    defaultPortionLabel: "1 quả",
    portionGrams: { qua: 50, trung: 50 },
    per100: { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
  },
  {
    key: "trung_chien",
    name: "Trứng chiên",
    aliases: ["trung chien", "op la"],
    defaultGrams: 50,
    defaultPortionLabel: "1 quả",
    portionGrams: { qua: 50, trung: 50 },
    per100: { calories: 196, protein: 13.6, carbs: 1.2, fat: 15 },
  },
  {
    key: "com_trang",
    name: "Cơm trắng",
    aliases: ["com trang", "com"],
    defaultGrams: 150,
    defaultPortionLabel: "1 chén",
    portionGrams: { chen: 150, bat: 150 },
    per100: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  },
  {
    key: "dui_ga",
    name: "Đùi gà",
    aliases: ["dui ga", "ga nuong", "ga quay"],
    defaultGrams: 120,
    defaultPortionLabel: "1 phần",
    portionGrams: { phan: 120, suat: 120, mieng: 120 },
    per100: { calories: 209, protein: 26, carbs: 0, fat: 10.9 },
  },
  {
    key: "uc_ga",
    name: "Ức gà",
    aliases: ["uc ga"],
    defaultGrams: 120,
    defaultPortionLabel: "1 phần",
    portionGrams: { phan: 120, suat: 120, mieng: 120 },
    per100: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  },
  {
    key: "thit_bo",
    name: "Thịt bò",
    aliases: ["thit bo", "bo nuong", "bo"],
    defaultGrams: 100,
    defaultPortionLabel: "100g",
    portionGrams: { mieng: 100, phan: 100, suat: 100 },
    per100: { calories: 250, protein: 26, carbs: 0, fat: 17 },
  },
  {
    key: "whey",
    name: "Whey protein",
    aliases: ["whey", "1 ly whey", "ly whey"],
    defaultGrams: 30,
    defaultPortionLabel: "30g",
    portionGrams: { ly: 30 },
    per100: { calories: 400, protein: 80, carbs: 8, fat: 6 },
  },
  {
    key: "chuoi",
    name: "Chuối",
    aliases: ["chuoi"],
    defaultGrams: 100,
    defaultPortionLabel: "1 quả",
    portionGrams: { qua: 100 },
    per100: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
  },
  {
    key: "sua_chua",
    name: "Sữa chua",
    aliases: ["sua chua", "yaourt"],
    defaultGrams: 100,
    defaultPortionLabel: "1 hũ",
    portionGrams: { hu: 100, hop: 100 },
    per100: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3 },
  },
];

function roundNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toFiniteNumber(value: unknown, fallback = Number.NaN) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const text = safeString(value) || "";
  if (!text) return fallback;
  const normalized = text.replace(/[^\d,.\-]/g, "");
  if (!normalized) return fallback;
  let candidate = normalized;
  if (normalized.includes(",") && normalized.includes(".")) {
    candidate =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    candidate = normalized.replace(",", ".");
  }
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatIntVi(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("vi-VN");
}

function formatFloatVi(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "0";
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
    .replace(/[^a-z0-9%.,/\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCommandText(value: unknown) {
  return normalizeLooseText(value).replace(/\s+/g, " ").trim();
}

export function parsePendingIntentValue(value: unknown) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return JSON.parse(JSON.stringify(value));
  }

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? JSON.parse(JSON.stringify(parsed)) : {};
  } catch {
    return {};
  }
}

function buildPendingExpiry(ttlMs: number) {
  return new Date(Date.now() + ttlMs).toISOString();
}

function nextPendingToken(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function cloneObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : {};
}

function normalizePendingSurface(
  value: unknown,
  defaults: {
    owner: string;
    ttlMs: number;
    includeFollowupKind?: boolean;
  },
) {
  const next = cloneObject(value);
  const nowIso = new Date().toISOString();
  const sharedToken = safeString(next.token || next.clarification_token) || nextPendingToken(defaults.owner);
  const requestedAt = safeString(next.requested_at || next.armed_at) || nowIso;

  return {
    owner: safeString(next.owner) || defaults.owner,
    source_message_id: safeString(next.source_message_id) || null,
    token: sharedToken,
    clarification_token: safeString(next.clarification_token) || sharedToken,
    followup_kind: defaults.includeFollowupKind ? (safeString(next.followup_kind) || null) : undefined,
    armed_at: safeString(next.armed_at) || requestedAt,
    requested_at: requestedAt,
    expires_at: safeString(next.expires_at) || buildPendingExpiry(defaults.ttlMs),
    clarification_count: Math.max(0, Math.round(toFiniteNumber(next.clarification_count, 0) || 0)),
    context_payload: cloneObject(next.context_payload),
  };
}

function parseSurfaceTime(value: unknown) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}

function isPendingSurfaceExpired(value: unknown, ttlMs: number) {
  if (!value || typeof value !== "object") return true;
  const next = value as AnyRecord;
  const expiresAtMs =
    parseSurfaceTime(next.expires_at) ??
    (() => {
      const requestedAtMs =
        parseSurfaceTime(next.requested_at) ??
        parseSurfaceTime(next.armed_at);
      return requestedAtMs != null ? requestedAtMs + ttlMs : null;
    })();
  return expiresAtMs != null ? expiresAtMs <= Date.now() : false;
}

function hasPositiveMacroTotals(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const next = value as AnyRecord;
  const totals = [
    toFiniteNumber(next.total_calories, 0),
    toFiniteNumber(next.total_protein, 0),
    toFiniteNumber(next.total_carbs, 0),
    toFiniteNumber(next.total_fat, 0),
  ];
  return totals.some((item) => item > 0);
}

function isZeroMacroFoodBundle(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const next = value as AnyRecord;
  const foods = Array.isArray(next.foods) ? next.foods : [];
  if (!foods.length) return false;
  if (hasPositiveMacroTotals(next)) return false;
  return !foods.some((food) => hasPositiveMacroTotals(food));
}

function resolveLegacyInbodyCapture(next: AnyRecord) {
  const directCapture =
    next.inbody_capture && typeof next.inbody_capture === "object"
      ? cloneObject(next.inbody_capture)
      : null;
  if (directCapture) return directCapture;

  const gatewayCapture =
    next.gateway_inbody_capture && typeof next.gateway_inbody_capture === "object"
      ? cloneObject(next.gateway_inbody_capture)
      : null;
  if (gatewayCapture) return gatewayCapture;

  if (next.waiting_for_image === true) {
    return {
      waiting_for_image: true,
      requested_at: new Date().toISOString(),
    };
  }

  return null;
}

export function normalizePendingIntentState(value: unknown) {
  const pendingIntent = parsePendingIntentValue(value);
  const next: AnyRecord = cloneObject(pendingIntent);

  next.schema_version = PENDING_INTENT_SCHEMA_VERSION;
  next.active_surface = safeString(next.active_surface) || null;

  if (next.image_followup && !isPendingSurfaceExpired(next.image_followup, IMAGE_FOLLOWUP_TTL_MS)) {
    next.image_followup = normalizePendingSurface(next.image_followup, {
      owner: "image_review",
      ttlMs: IMAGE_FOLLOWUP_TTL_MS,
      includeFollowupKind: true,
    });
  } else {
    delete next.image_followup;
  }

  const legacyInbodyCapture = resolveLegacyInbodyCapture(next);
  if (legacyInbodyCapture && !isPendingSurfaceExpired(legacyInbodyCapture, INBODY_CAPTURE_TTL_MS)) {
    next.inbody_capture = normalizePendingSurface(legacyInbodyCapture, {
      owner: "inbody_review",
      ttlMs: INBODY_CAPTURE_TTL_MS,
    });
  } else {
    delete next.inbody_capture;
  }

  if (isZeroMacroFoodBundle(next.last_saved_food_bundle)) {
    delete next.last_saved_food_bundle;
  }

  if (next.confirm_candidate && !hasPositiveMacroTotals(next.confirm_candidate)) {
    delete next.confirm_candidate;
  }

  const hasImageReview = hasPositiveMacroTotals(next.confirm_candidate) || hasPositiveMacroTotals(next.last_saved_food_bundle);

  if (next.image_followup && next.inbody_capture) {
    if (next.active_surface === "inbody_capture") {
      delete next.image_followup;
    } else {
      delete next.inbody_capture;
      next.active_surface = "image_followup";
    }
  }

  const activeSurface =
    next.image_followup
      ? "image_followup"
      : next.inbody_capture
        ? "inbody_capture"
        : hasImageReview
          ? "image_review"
          : null;

  if (
    (next.active_surface === "image_followup" && !next.image_followup) ||
    (next.active_surface === "inbody_capture" && !next.inbody_capture) ||
    (next.active_surface === "image_review" && !hasImageReview) ||
    !next.active_surface
  ) {
    next.active_surface = activeSurface;
  }

  delete next.gateway_inbody_capture;
  delete next.waiting_for_image;
  delete next.response_surface;
  delete next.conversation_focus;

  return next;
}

export async function persistPendingIntent(admin: any, userRow: AnyRecord | null, pendingIntent: Record<string, unknown>) {
  const userId = Number(userRow?.id ?? 0) || null;
  if (!userId) return;
  await admin.from("users").update({ pending_intent: JSON.stringify(pendingIntent) }).eq("id", userId);
}

function getSaigonDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAIGON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getInternalAccessBody(customerId: number | null, linkedUserId: number | null) {
  return {
    customerId: customerId ?? undefined,
    linkedUserId: linkedUserId ?? undefined,
  };
}

async function resolveInternalContext(customerId: number | null, linkedUserId: number | null) {
  const internalKey = getZaloOaInternalKey();
  if (!internalKey || (!customerId && !linkedUserId)) return null;
  const access = await resolveDashboardAccess(
    { headers: { "x-calotrack-internal-key": internalKey } },
    getInternalAccessBody(customerId, linkedUserId),
  );
  return access.context;
}

async function findSenderUser(admin: any, senderId: string) {
  if (!senderId) return null;
  const byPlatform =
    await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("*")
        .eq("platform", "zalo")
        .eq("platform_id", senderId)
        .limit(1),
    );
  if (byPlatform) return byPlatform;
  return maybeSingle<AnyRecord>(
    admin
      .from("users")
      .select("*")
      .eq("platform", "zalo")
      .eq("chat_id", senderId)
      .limit(1),
  );
}

async function findChannelAccount(admin: any, senderId: string, linkedOnly: boolean) {
  if (!senderId) return null;
  let query = admin
    .from("customer_channel_accounts")
    .select("*")
    .eq("channel", "zalo")
    .or(`platform_user_id.eq.${senderId},platform_chat_id.eq.${senderId}`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (linkedOnly) {
    query = query.in("link_status", ["linked", "active"]);
  }
  return maybeSingle<AnyRecord>(query);
}

export async function resolveZaloGatewayAccess(admin: any, senderId: string): Promise<GatewayAccess> {
  const [senderUserRow, linkedChannelRow, anyChannelRow] = await Promise.all([
    findSenderUser(admin, senderId),
    findChannelAccount(admin, senderId, true),
    findChannelAccount(admin, senderId, false),
  ]);

  const selectedChannelRow = linkedChannelRow || anyChannelRow;
  const customerId =
    Number(linkedChannelRow?.customer_id ?? senderUserRow?.customer_id ?? 0) || null;
  const linkedUserId =
    Number(linkedChannelRow?.linked_user_id ?? (customerId ? senderUserRow?.id : 0) ?? 0) || null;

  let context: DashboardContext | null = null;
  try {
    context = await resolveInternalContext(customerId, linkedUserId);
  } catch {
    context = null;
  }

  if (!context && senderUserRow?.id) {
    context = {
      customerId: Number(senderUserRow.customer_id ?? 0) || null,
      linkedUserId: Number(senderUserRow.id),
      userRow: senderUserRow,
      customerRow: null,
    };
  }

  return {
    senderUserRow,
    channelAccountRow: selectedChannelRow,
    customerId: context?.customerId ?? customerId,
    linkedUserId: context?.linkedUserId ?? linkedUserId,
    linked: Boolean(context?.linkedUserId ?? linkedUserId ?? senderUserRow?.id),
    context,
  };
}

export function buildLinkRequiredTextClean() {
  return [
    "Để dùng CaloTrack trên Zalo, bạn cần xác thực số điện thoại trước.",
    "Mở portal: https://calotrack-website.vercel.app/login",
    "Xác thực OTP xong rồi quay lại chat là dùng tiếp được.",
  ].join("\n");
}

export function buildLogHelpTextClean() {
  return [
    "Cách ghi món nhanh:",
    "- /log 2 trứng luộc",
    "- /log cơm đùi gà",
    "- /ghi bữa sáng: 1 ly whey và 1 quả chuối",
    "",
    "Bạn cũng có thể gửi ảnh món ăn để mình ước tính trước rồi hỏi thêm nếu cần.",
  ].join("\n");
}

export async function armInbodyCapture(admin: any, userRow: AnyRecord | null) {
  const pendingIntent = normalizePendingIntentState(userRow?.pending_intent);
  const token = nextPendingToken("inbody");
  const requestedAt = new Date().toISOString();

  delete pendingIntent.inbody_candidate;
  delete pendingIntent.image_followup;

  pendingIntent.schema_version = PENDING_INTENT_SCHEMA_VERSION;
  pendingIntent.active_surface = "inbody_capture";
  pendingIntent.inbody_capture = {
    owner: "inbody_review",
    source_message_id: null,
    token,
    clarification_token: token,
    armed_at: requestedAt,
    requested_at: requestedAt,
    expires_at: buildPendingExpiry(INBODY_CAPTURE_TTL_MS),
    clarification_count: 0,
    context_payload: {},
  };

  await persistPendingIntent(admin, userRow, pendingIntent);
  return pendingIntent;
}

export async function prepareImagePendingIntent(admin: any, userRow: AnyRecord | null) {
  const pendingIntent = normalizePendingIntentState(userRow?.pending_intent);
  const capture = pendingIntent.inbody_capture && typeof pendingIntent.inbody_capture === "object"
    ? cloneObject(pendingIntent.inbody_capture)
    : null;

  if (!capture?.owner) {
    return {
      pendingIntent,
      inbodyCaptureArmed: false,
      clearedStaleCapture: false,
    };
  }

  const expiresAtMs = Date.parse(String(capture.expires_at || ""));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    delete pendingIntent.inbody_capture;
    if (pendingIntent.active_surface === "inbody_capture") {
      pendingIntent.active_surface = null;
    }
    await persistPendingIntent(admin, userRow, pendingIntent);
    return {
      pendingIntent,
      inbodyCaptureArmed: false,
      clearedStaleCapture: true,
    };
  }

  pendingIntent.schema_version = PENDING_INTENT_SCHEMA_VERSION;
  pendingIntent.active_surface = "inbody_capture";
  pendingIntent.inbody_capture = normalizePendingSurface(capture, {
    owner: "inbody_review",
    ttlMs: INBODY_CAPTURE_TTL_MS,
  });

  await persistPendingIntent(admin, userRow, pendingIntent);
  return {
    pendingIntent,
    inbodyCaptureArmed: true,
    clearedStaleCapture: false,
  };
}

function computeFromPer100(per100: FoodCatalogEntry["per100"], grams: number) {
  const factor = grams / 100;
  return {
    calories: roundNumber(per100.calories * factor, 0),
    protein: roundNumber(per100.protein * factor, 1),
    carbs: roundNumber(per100.carbs * factor, 1),
    fat: roundNumber(per100.fat * factor, 1),
  };
}

function buildPortionLabel(quantityValue: number, quantityUnit: string | null, grams: number | null, fallback: string) {
  if (quantityUnit && quantityValue > 0) {
    return `${formatFloatVi(quantityValue, quantityValue % 1 === 0 ? 0 : 1)} ${quantityUnit}`;
  }
  if (grams && grams > 0) {
    return `${formatIntVi(grams)}g`;
  }
  return fallback;
}

function resolveCatalogEntry(normalizedText: string) {
  const sorted = [...DIRECT_FOOD_CATALOG].sort((left, right) => {
    const leftSize = Math.max(...left.aliases.map((value) => value.length));
    const rightSize = Math.max(...right.aliases.map((value) => value.length));
    return rightSize - leftSize;
  });

  for (const entry of sorted) {
    if (entry.aliases.some((alias) => normalizedText.includes(alias))) {
      return entry;
    }
  }
  return null;
}

function stripLogPrefix(text: string) {
  let result = text.replace(/^\/(log|ghi)\b/i, "").trim();
  result = result.replace(/^(bua sang|bua trua|bua toi|bua phu)\s*:\s*/i, "");
  return result.trim();
}

function parseFoodSegments(payload: string) {
  const normalized = normalizeLooseText(payload);
  if (!normalized) return [];
  if (normalized.includes("com dui ga") || normalized.includes("com ga")) {
    return ["com", "dui ga"];
  }
  return normalized
    .split(/\s*(?:,|\+|\bva\b)\s*/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveDirectFoodItem(admin: any, normalizedSegment: string): Promise<DirectFoodItem | null> {
  const gramsMatch = normalizedSegment.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram)\b/);
  const unitMatch = normalizedSegment.match(/(\d+(?:[.,]\d+)?)\s*(qua|chen|bat|ly|hop|hu|mieng|phan|suat)\b/);
  const grams = gramsMatch ? toFiniteNumber(gramsMatch[1], Number.NaN) : Number.NaN;
  const quantityValue = unitMatch ? toFiniteNumber(unitMatch[1], Number.NaN) : Number.NaN;
  const quantityUnit = unitMatch?.[2] ?? null;

  const catalogEntry = resolveCatalogEntry(normalizedSegment);
  if (catalogEntry) {
    const effectiveGrams = Number.isFinite(grams)
      ? grams
      : Number.isFinite(quantityValue) && quantityUnit && catalogEntry.portionGrams?.[quantityUnit]
        ? catalogEntry.portionGrams[quantityUnit] * quantityValue
        : catalogEntry.defaultGrams;
    const macros = computeFromPer100(catalogEntry.per100, effectiveGrams);
    return {
      foodName: catalogEntry.name,
      quantityValue: Number.isFinite(quantityValue) ? quantityValue : 1,
      quantityUnit,
      portionLabel: buildPortionLabel(
        Number.isFinite(quantityValue) ? quantityValue : 1,
        quantityUnit,
        effectiveGrams,
        catalogEntry.defaultPortionLabel,
      ),
      grams: roundNumber(effectiveGrams, 0),
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      sourceConfidence: 0.85,
    };
  }

  const searchText = normalizedSegment
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram)\b/g, "")
    .replace(/(\d+(?:[.,]\d+)?)\s*(qua|chen|bat|ly|hop|hu|mieng|phan|suat)\b/g, "")
    .trim();
  if (!searchText) return null;

  const exactFood =
    await maybeSingle<AnyRecord>(
      admin
        .from("foods")
        .select("id,name,name_norm,default_serving_grams,default_portion_label")
        .eq("name_norm", searchText)
        .limit(1),
    ) ||
    await maybeSingle<AnyRecord>(
      admin
        .from("foods")
        .select("id,name,name_norm,default_serving_grams,default_portion_label")
        .ilike("name_norm", `%${searchText}%`)
        .limit(1),
    );

  if (!exactFood?.id) return null;

  const nutrition = await maybeSingle<AnyRecord>(
    admin
      .from("food_nutrition")
      .select("*")
      .eq("food_id", exactFood.id)
      .eq("is_primary", true)
      .limit(1),
  );
  if (!nutrition) return null;

  const portions =
    (
      await admin
        .from("food_portions")
        .select("*")
        .eq("food_id", exactFood.id)
        .limit(20)
    ).data ?? [];

  const matchedPortion =
    quantityUnit
      ? (portions as AnyRecord[]).find((row) => normalizeLooseText(row.label_norm || row.label) === quantityUnit)
      : null;

  const effectiveGrams = Number.isFinite(grams)
    ? grams
    : Number.isFinite(quantityValue) && matchedPortion?.grams
      ? Number(matchedPortion.grams) * quantityValue
      : Number(exactFood.default_serving_grams ?? nutrition.serving_grams ?? 100);

  const macros = computeFromPer100(
    {
      calories: Number(nutrition.calories ?? nutrition.kcal_per_100g ?? 0),
      protein: Number(nutrition.protein ?? nutrition.protein_per_100g ?? 0),
      carbs: Number(nutrition.carbs ?? nutrition.carbs_per_100g ?? 0),
      fat: Number(nutrition.fat ?? nutrition.fat_per_100g ?? 0),
    },
    effectiveGrams,
  );

  return {
    foodName: String(exactFood.name || searchText),
    quantityValue: Number.isFinite(quantityValue) ? quantityValue : 1,
    quantityUnit,
    portionLabel: buildPortionLabel(
      Number.isFinite(quantityValue) ? quantityValue : 1,
      quantityUnit,
      effectiveGrams,
      String(matchedPortion?.label || exactFood.default_portion_label || `${formatIntVi(effectiveGrams)}g`),
    ),
    grams: roundNumber(effectiveGrams, 0),
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    sourceConfidence: 0.75,
  };
}

async function refreshStats(admin: any, userId: number, anchorDate: string) {
  await admin.rpc("refresh_daily_user_stats", {
    p_user_id: userId,
    p_date: anchorDate,
  });
  await admin.rpc("refresh_weekly_user_stats", {
    p_user_id: userId,
    p_anchor_date: anchorDate,
  });
}

export async function handleDirectFoodLog(admin: any, access: GatewayAccess, rawText: string, sourceMessageId?: string | null) {
  const normalized = normalizeCommandText(rawText);
  if (!/^(\/)?(log|ghi)\b/.test(normalized)) {
    return null;
  }

  if (!access.linked || !access.context?.userRow?.id) {
    return { handled: true, replyText: buildLinkRequiredTextClean() };
  }

  const payload = stripLogPrefix(rawText);
  if (!payload) {
    return { handled: true, replyText: buildLogHelpTextClean() };
  }

  const segments = parseFoodSegments(payload);
  if (!segments.length) {
    return { handled: true, replyText: buildLogHelpTextClean() };
  }

  const items: DirectFoodItem[] = [];
  for (const segment of segments) {
    const item = await resolveDirectFoodItem(admin, segment);
    if (!item) return null;
    items.push(item);
  }

  const now = new Date();
  const loggedAt = new Date().toISOString();
  const dateLocal = getSaigonDateKey(now);
  const traceId = `gateway_log:${access.context.userRow.id}:${Date.now()}`;
  const mealLogInsert = await admin
    .from("meal_logs")
    .insert({
      user_id: Number(access.context.userRow.id),
      customer_id: access.context.customerId,
      source_channel: "zalo",
      source_message_id: safeString(sourceMessageId),
      log_mode: "gateway_direct_text",
      logged_at: loggedAt,
      date_local: dateLocal,
      trace_id: traceId,
      compat_food_log_id: null,
    })
    .select("*")
    .limit(1)
    .single();

  if (mealLogInsert.error) throw mealLogInsert.error;
  const mealLogId = Number(mealLogInsert.data?.id);

  const itemRows = items.map((item) => ({
    meal_log_id: mealLogId,
    food_id: null,
    food_name_snapshot: item.foodName,
    quantity_value: item.quantityValue,
    quantity_unit: item.quantityUnit,
    portion_label: item.portionLabel,
    grams: item.grams,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    source_type: "gateway_direct",
    source_confidence: item.sourceConfidence,
    compat_food_log_id: null,
  }));

  const insertItems = await admin.from("meal_log_items").insert(itemRows);
  if (insertItems.error) throw insertItems.error;

  await refreshStats(admin, Number(access.context.userRow.id), dateLocal);

  const total = items.reduce(
    (acc, item) => ({
      calories: acc.calories + Number(item.calories || 0),
      protein: acc.protein + Number(item.protein || 0),
      carbs: acc.carbs + Number(item.carbs || 0),
      fat: acc.fat + Number(item.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const lines = [
    "Đã ghi món cho bạn rồi.",
    ...items.map((item) => `- ${item.foodName}: ${item.portionLabel} • ${formatIntVi(item.calories)} kcal`),
    `- Tổng: ${formatIntVi(total.calories)} kcal | P ${formatFloatVi(total.protein)} g | C ${formatFloatVi(total.carbs)} g | F ${formatFloatVi(total.fat)} g`,
    "",
    "Muốn xem lại dashboard hôm nay thì nhắn /stats.",
  ];

  return {
    handled: true,
    replyText: lines.join("\n"),
  };
}

function parseDurationMinutes(normalizedText: string) {
  const match = normalizedText.match(/(\d+(?:[.,]\d+)?)\s*(?:phut|p|')\b/);
  return match ? toFiniteNumber(match[1], Number.NaN) : Number.NaN;
}

function parseDistanceKm(normalizedText: string) {
  const match = normalizedText.match(/(\d+(?:[.,]\d+)?)\s*km\b/);
  return match ? toFiniteNumber(match[1], Number.NaN) : Number.NaN;
}

function parsePaceMinutes(normalizedText: string) {
  const match = normalizedText.match(/\bpace\s*(\d+(?:[.,]\d+)?)\b/);
  return match ? toFiniteNumber(match[1], Number.NaN) : Number.NaN;
}

function normalizeActivityName(normalizedText: string) {
  if (/\b(chay bo|jog|run)\b/.test(normalizedText)) return "Chạy bộ";
  if (/\b(di bo|walk)\b/.test(normalizedText)) return "Đi bộ";
  if (/\b(dap xe|cycling|bike)\b/.test(normalizedText)) return "Đạp xe";
  if (/\b(tap gym|gym)\b/.test(normalizedText)) return "Tập gym";
  return null;
}

function estimateExerciseCalories(activityName: string, weightKg: number, durationMinutes: number, distanceKm: number, paceMinPerKm: number) {
  const safeWeight = weightKg > 0 ? weightKg : 70;
  if (activityName === "Chạy bộ") {
    if (distanceKm > 0) {
      return Math.max(1, roundNumber(distanceKm * safeWeight, 0));
    }
    if (durationMinutes > 0 && paceMinPerKm > 0) {
      const inferredDistanceKm = durationMinutes / paceMinPerKm;
      return Math.max(1, roundNumber(inferredDistanceKm * safeWeight, 0));
    }
    if (durationMinutes > 0) {
      return Math.max(1, roundNumber((8.3 * 3.5 * safeWeight / 200) * durationMinutes, 0));
    }
  }

  if (activityName === "Đi bộ" && durationMinutes > 0) {
    return Math.max(1, roundNumber((3.5 * 3.5 * safeWeight / 200) * durationMinutes, 0));
  }

  if (activityName === "Đạp xe" && durationMinutes > 0) {
    return Math.max(1, roundNumber((6.8 * 3.5 * safeWeight / 200) * durationMinutes, 0));
  }

  if (activityName === "Tập gym" && durationMinutes > 0) {
    return Math.max(1, roundNumber((6.0 * 3.5 * safeWeight / 200) * durationMinutes, 0));
  }

  return 0;
}

export async function handleDirectExerciseLog(admin: any, access: GatewayAccess, rawText: string) {
  const normalized = normalizeCommandText(rawText);
  const activityName = normalizeActivityName(normalized);
  if (!activityName) return null;

  if (!access.linked || !access.context?.userRow?.id) {
    return { handled: true, replyText: buildLinkRequiredTextClean() };
  }

  const durationMinutes = parseDurationMinutes(normalized);
  const paceMinPerKm = parsePaceMinutes(normalized);
  const distanceKm = parseDistanceKm(normalized) || (
    Number.isFinite(durationMinutes) && Number.isFinite(paceMinPerKm) && paceMinPerKm > 0
      ? durationMinutes / paceMinPerKm
      : Number.NaN
  );
  const weightKg = toFiniteNumber(access.context.userRow?.weight_kg, 0);
  const calories = estimateExerciseCalories(
    activityName,
    weightKg,
    Number.isFinite(durationMinutes) ? durationMinutes : 0,
    Number.isFinite(distanceKm) ? distanceKm : 0,
    Number.isFinite(paceMinPerKm) ? paceMinPerKm : 0,
  );

  const dateLocal = getSaigonDateKey(new Date());
  const insert = await admin.from("exercise_logs").insert({
    user_id: Number(access.context.userRow.id),
    activity_name: activityName,
    calories_burned: calories,
    date: dateLocal,
  });
  if (insert.error) throw insert.error;

  await refreshStats(admin, Number(access.context.userRow.id), dateLocal);

  const lines = [
    "Đã ghi vận động cho bạn rồi.",
    `- Hoạt động: ${activityName}`,
    `- Calories đốt: ${formatIntVi(calories)} kcal`,
    Number.isFinite(durationMinutes) ? `- Thời lượng: ${formatFloatVi(durationMinutes, durationMinutes % 1 === 0 ? 0 : 1)} phút` : null,
    Number.isFinite(paceMinPerKm) ? `- Pace: ${formatFloatVi(paceMinPerKm, 2)} min/km` : null,
    Number.isFinite(distanceKm) ? `- Quãng đường: ${formatFloatVi(distanceKm, 2)} km` : null,
    "",
    "Muốn xem lại dashboard hôm nay thì nhắn /stats.",
  ].filter(Boolean);

  return {
    handled: true,
    replyText: lines.join("\n"),
  };
}

function normalizeModeGoal(
  normalizedText: string,
): { primaryGoal: PrimaryGoal; goalModeVariant: GoalModeVariant } | null {
  const modeMatch = normalizedText.match(/^\/mode\s+(.+)$/);
  if (!modeMatch) return null;
  const mode = modeMatch[1].trim().replace(/\s+/g, " ");
  const compactMode = mode.replace(/\s+/g, "");
  if (/(giu can|duy tri|maintain)/.test(mode)) {
    return { primaryGoal: "maintain", goalModeVariant: null };
  }
  if (/(giam can|lose)/.test(mode)) {
    return { primaryGoal: "lose_weight", goalModeVariant: null };
  }
  if (/(tangcogiammo|recompmuscle|musclerecomp)/.test(compactMode) || /(tang co giam mo)/.test(mode)) {
    return { primaryGoal: "muscle_gain", goalModeVariant: "recomp_muscle_bias" };
  }
  if (/(giammotangco|recompfat|fatrecomp)/.test(compactMode) || /(giam mo tang co)/.test(mode)) {
    return { primaryGoal: "fat_loss", goalModeVariant: "recomp_fat_loss_bias" };
  }
  if (/(giam mo|fat loss|cut|siet)/.test(mode)) {
    return { primaryGoal: "fat_loss", goalModeVariant: null };
  }
  if (/(tang co|muscle gain|recomp)/.test(mode)) {
    return { primaryGoal: "muscle_gain", goalModeVariant: null };
  }
  if (/(tang can|bulk|gain)/.test(mode)) {
    return { primaryGoal: "gain_weight", goalModeVariant: null };
  }
  return null;
}

export async function handleDirectGoalMode(admin: any, access: GatewayAccess, rawText: string) {
  const normalized = normalizeCommandText(rawText);
  const goalSelection = normalizeModeGoal(normalized);
  if (!normalized.startsWith("/mode")) return null;

  if (!access.linked || !access.context?.userRow?.id) {
    return { handled: true, replyText: buildLinkRequiredTextClean() };
  }

  if (!goalSelection) {
    return {
      handled: true,
      replyText: [
        "Các mode hiện có:",
        "- /mode giucan",
        "- /mode giamcan",
        "- /mode giammo",
        "- /mode tangco",
        "- /mode tangcan",
        "- /mode tangcogiammo",
        "- /mode giammotangco",
      ].join("\n"),
    };
  }

  const { primaryGoal, goalModeVariant } = goalSelection;

  const weeklyRateMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*kg\s*\/\s*(?:tuan|week)\b/);
  const explicitRate = weeklyRateMatch ? toFiniteNumber(weeklyRateMatch[1], Number.NaN) : Number.NaN;
  const gender = safeString(access.context.userRow?.gender)?.toLowerCase() || null;
  const tdee = toFiniteNumber(access.context.userRow?.tdee, 0);
  const weightKg = toFiniteNumber(access.context.userRow?.weight_kg, 70);
  const weeklyRateKg = resolveWeeklyRateKg(
    primaryGoal,
    gender,
    Number.isFinite(explicitRate) ? explicitRate : toFiniteNumber(access.context.userRow?.goal_weekly_rate_kg, 0),
    goalModeVariant,
  );
  const dailyGoalKcal = computeDailyGoalKcal(tdee, primaryGoal, weeklyRateKg);
  const macros = computeMacroTargets(primaryGoal, gender, weightKg, dailyGoalKcal, goalModeVariant);

  const updatePayload: Record<string, unknown> = {
    primary_goal: primaryGoal,
    goal_weekly_rate_kg: weeklyRateKg > 0 ? weeklyRateKg : null,
    daily_calorie_goal: dailyGoalKcal,
  };
  if (Object.prototype.hasOwnProperty.call(access.context.userRow || {}, "goal_mode_variant")) {
    updatePayload.goal_mode_variant = goalModeVariant;
  }
  if (Object.prototype.hasOwnProperty.call(access.context.userRow || {}, "goal_mode")) {
    updatePayload.goal_mode =
      goalModeVariant === "recomp_muscle_bias"
        ? "tangcogiammo"
        : goalModeVariant === "recomp_fat_loss_bias"
          ? "giammotangco"
          : primaryGoal;
  }

  const updateResult = await admin.from("users").update(updatePayload).eq("id", Number(access.context.userRow.id));
  if (updateResult.error) throw updateResult.error;

  const weeklyTargetKcal = roundNumber(dailyGoalKcal * 7, 0);
  const modeLabel = formatGoalModeDisplayLabel(primaryGoal, goalModeVariant);
  return {
    handled: true,
    replyText: [
      "Đã cập nhật goal mode cho bạn.",
      `- Goal mode: ${modeLabel}`,
      `- Daily macro: P ${formatFloatVi(macros.proteinG)} g | C ${formatFloatVi(macros.carbsG)} g | F ${formatFloatVi(macros.fatG)} g`,
      `- Daily goal: ${formatIntVi(dailyGoalKcal)} kcal/ngày`,
      `- Mục tiêu tuần: ${formatIntVi(weeklyTargetKcal)} kcal | P ${formatFloatVi(macros.proteinG * 7)} g | C ${formatFloatVi(macros.carbsG * 7)} g | F ${formatFloatVi(macros.fatG * 7)} g`,
      weeklyRateKg > 0 ? `- Tốc độ đang tính: ${formatFloatVi(weeklyRateKg, 2)} kg/tuần` : null,
    ].filter(Boolean).join("\n"),
  };
}
