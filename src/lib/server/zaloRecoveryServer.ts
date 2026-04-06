import * as crypto from "node:crypto";

import {
  createServiceRoleClient,
  readBody,
  safeString,
} from "./adminServer.js";
import {
  formatGoalLabel,
  getDashboardSummary,
  resolveDashboardAccess,
  type DashboardPeriod,
} from "./dashboardSummaryServer.js";
import { getZaloOaInternalKey } from "./zaloOaServer.js";

type AnyRecord = Record<string, any>;

type NutritionFood = {
  name: string;
  quantity: number;
  unit: string;
  portion_text: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  estimated_weight_g?: number | null;
  source?: string | null;
};

export type NutritionResult = {
  ok: true;
  status:
    | "food_logged"
    | "nutrition_fallback_estimated"
    | "nutrition_busy"
    | "nutrition_parse_error"
    | "nutrition_unknown_food";
  error_code: string | null;
  insert_allowed: boolean;
  fallback_source: "provider" | "deterministic" | "none";
  food_name_display: string;
  foods: NutritionFood[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  reply_text: string | null;
  provider_status?: number | null;
};

export type ImageApiStatus =
  | "review_ready"
  | "needs_clarification"
  | "busy"
  | "invalid"
  | "inbody_ready"
  | "inbody_missing";

type ImageFood = {
  name: string;
  name_en?: string | null;
  quantity: number;
  unit: string;
  estimated_weight_g?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes?: string | null;
};

export type ImageReviewBundle = {
  review_id: string;
  kind: string;
  title: string;
  confidence: number;
  meal_scope: string;
  primary_plate_only: boolean;
  foods: ImageFood[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
};

export type ImageResult = {
  ok: true;
  status: ImageApiStatus;
  error_code: string | null;
  reply_text: string;
  updated_pending_intent: AnyRecord | null;
  review_bundle?: ImageReviewBundle | null;
  inbody_measurement?: AnyRecord | null;
  provider_status?: number | null;
};

type SummaryResult = {
  ok: true;
  status: "ok" | "unavailable";
  error_code: string | null;
  reply_text: string;
  summary_period: "today" | "week" | "month";
  metrics: AnyRecord | null;
};

const AI_ENDPOINT_DEFAULT = "https://v98store.com/v1/chat/completions";
const INTERNAL_KEY_HEADER = "x-calotrack-internal-key";
const AI_AUTH_HEADER = "x-calotrack-ai-authorization";
const AI_ENDPOINT_HEADER = "x-calotrack-ai-endpoint";
const IMAGE_FOLLOWUP_TTL_MS = 10 * 60 * 1000;
const INBODY_CAPTURE_TTL_MS = 15 * 60 * 1000;
const PENDING_INTENT_SCHEMA_VERSION = 1;

const DETERMINISTIC_CATALOG: Array<{
  key: string;
  label: string;
  aliases: string[];
  defaultGrams: number;
  defaultUnit: string;
  defaultPortionText: string;
  per100: { calories: number; protein: number; carbs: number; fat: number };
}> = [
  {
    key: "egg_boiled",
    label: "trứng luộc",
    aliases: ["trung luoc", "trung tran"],
    defaultGrams: 50,
    defaultUnit: "quả",
    defaultPortionText: "1 quả",
    per100: { calories: 155, protein: 12.6, carbs: 1.1, fat: 10.6 },
  },
  {
    key: "white_rice",
    label: "cơm trắng",
    aliases: ["com trang", "com"],
    defaultGrams: 180,
    defaultUnit: "phần",
    defaultPortionText: "1 phần cơm",
    per100: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  },
  {
    key: "chicken_thigh",
    label: "đùi gà",
    aliases: ["dui ga", "ga nuong", "ga quay"],
    defaultGrams: 120,
    defaultUnit: "phần",
    defaultPortionText: "1 phần đùi gà",
    per100: { calories: 209, protein: 26, carbs: 0, fat: 10.9 },
  },
  {
    key: "beef",
    label: "thịt bò",
    aliases: ["thit bo", "bo nuong", "bo ap chao", "steak bo"],
    defaultGrams: 150,
    defaultUnit: "phần",
    defaultPortionText: "1 phần thịt bò",
    per100: { calories: 250, protein: 26, carbs: 0, fat: 17 },
  },
  {
    key: "banana",
    label: "chuối",
    aliases: ["chuoi"],
    defaultGrams: 100,
    defaultUnit: "quả",
    defaultPortionText: "1 quả chuối",
    per100: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
  },
  {
    key: "whey",
    label: "whey",
    aliases: ["whey", "protein shake"],
    defaultGrams: 30,
    defaultUnit: "ly",
    defaultPortionText: "1 ly whey",
    per100: { calories: 400, protein: 80, carbs: 8, fat: 6 },
  },
];

function cleanEnv(value: string | undefined) {
  return String(value || "").replace(/\r?\n/g, "").trim();
}

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function extractInternalKeyCandidate(req: any) {
  return (
    safeString(req.headers?.[INTERNAL_KEY_HEADER]) ||
    safeString(req.headers?.["x-calotrack-internal-secret"]) ||
    (() => {
      const authHeader = safeString(req.headers?.authorization);
      const match = authHeader?.match(/^Bearer\s+(.+)$/i);
      return safeString(match?.[1]);
    })()
  );
}

export async function requireInternalZaloRequest(req: any) {
  const expected = getZaloOaInternalKey();
  const candidate = extractInternalKeyCandidate(req);
  if (!expected || !candidate || !timingSafeEquals(expected, candidate)) {
    throw new Error("internal_access_denied");
  }
  return readBody(req);
}

function removeAccents(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, (char) => (char === "đ" ? "d" : "D"));
}

function normalizeLooseText(value: unknown) {
  return removeAccents(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9%.,:/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown, fallback = Number.NaN) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const text = safeString(value);
  if (!text) return fallback;
  const normalized = text.replace(/[^\d,.-]/g, "");
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

function roundNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatKcal(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("vi-VN");
}

function formatGram(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "0";
  return roundNumber(value, digits).toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

function parsePendingIntent(candidate: unknown) {
  if (!candidate) return {};
  if (typeof candidate === "object" && !Array.isArray(candidate)) {
    return cloneRecord(candidate);
  }
  try {
    const parsed = JSON.parse(String(candidate));
    return parsed && typeof parsed === "object" ? cloneRecord(parsed) : {};
  } catch {
    return {};
  }
}

function buildExpiry(ttlMs: number) {
  return new Date(Date.now() + ttlMs).toISOString();
}

function nextToken(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function basePendingIntent(candidate: unknown) {
  const pending = parsePendingIntent(candidate);
  const next = cloneRecord(pending);
  next.schema_version = PENDING_INTENT_SCHEMA_VERSION;
  next.active_surface = safeString(next.active_surface) || null;
  delete next.gateway_inbody_capture;
  return next;
}

function findDeterministicEntry(normalizedMessage: string) {
  return (
    DETERMINISTIC_CATALOG.find((entry) =>
      entry.aliases.some((alias) => normalizedMessage.includes(alias)),
    ) || null
  );
}

function extractQuantity(rawText: string) {
  const normalized = normalizeLooseText(rawText);
  if (!normalized) return 1;
  if (/\bnua\b/.test(normalized)) return 0.5;
  if (/\bruoi\b/.test(normalized)) return 1.5;
  const match = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return 1;
  const numeric = toNumber(match[1], Number.NaN);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function extractGrams(rawText: string) {
  const match = rawText.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram|grams)\b/i);
  if (!match) return null;
  const grams = Math.round(toNumber(match[1], Number.NaN));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

function buildFoodFromCatalog(
  entry: (typeof DETERMINISTIC_CATALOG)[number],
  messageText: string,
): NutritionFood {
  const quantity = extractQuantity(messageText);
  const explicitGrams = extractGrams(messageText);
  const grams = explicitGrams ?? Math.round(entry.defaultGrams * quantity);
  const factor = grams / 100;
  return {
    name: entry.label,
    quantity: roundNumber(quantity, 2),
    unit: explicitGrams ? "g" : entry.defaultUnit,
    portion_text:
      explicitGrams != null
        ? `${grams}g`
        : quantity === 1
          ? entry.defaultPortionText
          : `${formatGram(quantity, 2)} ${entry.defaultUnit}`,
    estimated_weight_g: grams,
    calories: Math.max(0, Math.round(entry.per100.calories * factor)),
    protein: roundNumber(entry.per100.protein * factor, 1),
    carbs: roundNumber(entry.per100.carbs * factor, 1),
    fat: roundNumber(entry.per100.fat * factor, 1),
    source: "deterministic",
  };
}

function sumFoods(foods: Array<{ calories: unknown; protein: unknown; carbs: unknown; fat: unknown }>) {
  return foods.reduce(
    (totals, item) => {
      totals.calories += Math.max(0, Math.round(toNumber(item.calories, 0)));
      totals.protein += roundNumber(toNumber(item.protein, 0), 1);
      totals.carbs += roundNumber(toNumber(item.carbs, 0), 1);
      totals.fat += roundNumber(toNumber(item.fat, 0), 1);
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function deterministicNutrition(messageText: string): NutritionResult | null {
  const normalized = normalizeLooseText(messageText);
  if (!normalized) return null;

  if (normalized.includes("com dui ga") || normalized.includes("com ga")) {
    const rice = buildFoodFromCatalog(
      DETERMINISTIC_CATALOG.find((item) => item.key === "white_rice")!,
      messageText,
    );
    const chicken = buildFoodFromCatalog(
      DETERMINISTIC_CATALOG.find((item) => item.key === "chicken_thigh")!,
      messageText,
    );
    const foods = [rice, chicken];
    return {
      ok: true,
      status: "nutrition_fallback_estimated",
      error_code: null,
      insert_allowed: true,
      fallback_source: "deterministic",
      food_name_display: "cơm đùi gà",
      foods,
      totals: sumFoods(foods),
      reply_text: null,
    };
  }

  const entry = findDeterministicEntry(normalized);
  if (!entry) return null;
  const foods = [buildFoodFromCatalog(entry, messageText)];
  return {
    ok: true,
    status: "nutrition_fallback_estimated",
    error_code: null,
    insert_allowed: true,
    fallback_source: "deterministic",
    food_name_display: foods[0].name,
    foods,
    totals: sumFoods(foods),
    reply_text: null,
  };
}

function getAiEndpoint(req: any) {
  return (
    cleanEnv(process.env.CALOTRACK_AI_ENDPOINT) ||
    safeString(req.headers?.[AI_ENDPOINT_HEADER]) ||
    AI_ENDPOINT_DEFAULT
  );
}

function getAiAuthorization(req: any) {
  const candidate =
    cleanEnv(process.env.CALOTRACK_AI_AUTHORIZATION) ||
    safeString(req.headers?.[AI_AUTH_HEADER]) ||
    cleanEnv(process.env.OPENAI_API_KEY);

  if (!candidate) return null;
  return /^Bearer\s+/i.test(candidate) ? candidate : `Bearer ${candidate}`;
}

async function callAiJson(
  req: any,
  messages: AnyRecord[],
  model: string,
  temperature = 0.2,
) {
  const endpoint = getAiEndpoint(req);
  const authorization = getAiAuthorization(req);
  if (!endpoint || !authorization) {
    throw Object.assign(new Error("ai_provider_unavailable"), { statusCode: 503 });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      safeString(payload?.error?.message) ||
      safeString(payload?.message) ||
      "ai_provider_error";
    throw Object.assign(new Error(message), {
      statusCode: response.status,
      payload,
    });
  }

  let content = "";
  if (typeof payload?.choices?.[0]?.message?.content === "string") {
    content = payload.choices[0].message.content;
  } else if (typeof payload?.content === "string") {
    content = payload.content;
  }

  content = String(content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!content) {
    throw Object.assign(new Error("ai_empty_content"), {
      statusCode: response.status,
      payload,
    });
  }

  let parsed: AnyRecord;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw Object.assign(new Error("ai_invalid_json"), {
      statusCode: response.status,
      payload,
    });
  }

  return {
    parsed,
    statusCode: response.status,
    payload,
  };
}

async function callAiImageJson(
  req: any,
  prompt: string,
  imageUrl: string,
  model = "gpt-4.1-mini",
) {
  return callAiJson(
    req,
    [
      {
        role: "system",
        content:
          "You are CaloTrack's image parser. Always return one valid JSON object only.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
    model,
    0.1,
  );
}

function normalizeNutritionFoods(parsed: AnyRecord, messageText: string): NutritionFood[] {
  const rawFoods = Array.isArray(parsed?.foods)
    ? parsed.foods
    : parsed?.food_name
      ? [parsed]
      : [];

  return rawFoods
    .map((food, index) => {
      const quantity = toNumber(food?.quantity ?? food?.quantity_numeric ?? 1, 1) || 1;
      const fallbackName =
        safeString(food?.food_name) ||
        safeString(food?.name) ||
        safeString(parsed?.food_name) ||
        `Món ${index + 1}`;

      return {
        name: String(fallbackName || messageText).trim(),
        quantity: roundNumber(quantity, 2),
        unit: safeString(food?.unit) || "phần",
        portion_text:
          safeString(food?.portion_text) ||
          safeString(food?.serving_size_desc) ||
          safeString(parsed?.serving_size_desc) ||
          `${formatGram(quantity, 2)} phần`,
        estimated_weight_g: (() => {
          const grams = Math.round(
            toNumber(food?.estimated_weight_g ?? food?.grams ?? null, Number.NaN),
          );
          return Number.isFinite(grams) && grams > 0 ? grams : null;
        })(),
        calories: Math.max(
          0,
          Math.round(
            toNumber(food?.calories ?? food?.total_calories ?? parsed?.total_calories, 0),
          ),
        ),
        protein: roundNumber(
          toNumber(food?.protein ?? food?.total_protein ?? parsed?.total_protein, 0),
          1,
        ),
        carbs: roundNumber(
          toNumber(food?.carbs ?? food?.total_carbs ?? parsed?.total_carbs, 0),
          1,
        ),
        fat: roundNumber(
          toNumber(food?.fat ?? food?.total_fat ?? parsed?.total_fat, 0),
          1,
        ),
        source: "provider",
      };
    })
    .filter((food) => food.name);
}

function buildUnknownFoodReply(messageText: string) {
  const display = safeString(messageText) || "món này";
  return [
    `Mình chưa chốt đủ chắc tay để log ${display}.`,
    "Bạn mô tả rõ hơn khẩu phần, gram hoặc thành phần chính giúp mình nhé. Ví dụ: `1 phần cơm niêu bò gà, cơm 180g, bò 120g, gà 80g`.",
  ].join("\n");
}

export async function estimateZaloNutrition(
  req: any,
  body: AnyRecord,
): Promise<NutritionResult> {
  const messageText =
    safeString(body.message_text) ||
    safeString(body.food_name) ||
    safeString(body.context?.message_text) ||
    "";

  const deterministic = deterministicNutrition(messageText);
  if (deterministic) {
    return deterministic;
  }

  try {
    const { parsed, statusCode } = await callAiJson(
      req,
      [
        {
          role: "system",
          content: [
            "You are CaloTrack's nutrition estimator.",
            "Return only valid JSON.",
            "Schema:",
            "{",
            '  "foods": [{"name": string, "quantity": number, "unit": string, "portion_text": string, "estimated_weight_g": number|null, "calories": number, "protein": number, "carbs": number, "fat": number}],',
            '  "totals": {"calories": number, "protein": number, "carbs": number, "fat": number},',
            '  "confidence": number,',
            '  "notes": string',
            "}",
            "If the food is unknown, return foods: [] and totals all 0.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Ước tính dinh dưỡng cho: ${messageText}`,
        },
      ],
      "gpt-4o-mini",
    );

    const foods = normalizeNutritionFoods(parsed, messageText);
    const totals = parsed?.totals && typeof parsed.totals === "object"
      ? {
          calories: Math.max(0, Math.round(toNumber(parsed.totals.calories, 0))),
          protein: roundNumber(toNumber(parsed.totals.protein, 0), 1),
          carbs: roundNumber(toNumber(parsed.totals.carbs, 0), 1),
          fat: roundNumber(toNumber(parsed.totals.fat, 0), 1),
        }
      : sumFoods(foods);

    const hasPositiveTotal =
      totals.calories > 0 ||
      totals.protein > 0 ||
      totals.carbs > 0 ||
      totals.fat > 0;

    if (!foods.length || !hasPositiveTotal) {
      return {
        ok: true,
        status: "nutrition_unknown_food",
        error_code: "nutrition_unknown_food",
        insert_allowed: false,
        fallback_source: "none",
        food_name_display: safeString(messageText) || "món này",
        foods: [],
        totals,
        reply_text: buildUnknownFoodReply(messageText),
        provider_status: statusCode,
      };
    }

    return {
      ok: true,
      status: "food_logged",
      error_code: null,
      insert_allowed: true,
      fallback_source: "provider",
      food_name_display: foods.length === 1 ? foods[0].name : (safeString(messageText) || foods[0].name),
      foods,
      totals,
      reply_text: null,
      provider_status: statusCode,
    };
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 0) || null;
    const retryable = statusCode === 429 || statusCode === 502 || statusCode === 503;
    return {
      ok: true,
      status: retryable ? "nutrition_busy" : "nutrition_parse_error",
      error_code: retryable ? "nutrition_estimate_busy" : "nutrition_parse_error",
      insert_allowed: false,
      fallback_source: "none",
      food_name_display: safeString(messageText) || "món này",
      foods: [],
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      reply_text: retryable
        ? [
            "Mình đang nghẽn lane ước tính món này nên chưa log chắc tay được.",
            "Bạn thử lại sau 10-20 giây, hoặc ghi rõ hơn khẩu phần và thành phần chính giúp mình nhé.",
          ].join("\n")
        : buildUnknownFoodReply(messageText),
      provider_status: statusCode,
    };
  }
}

function normalizeImageFoods(rawFoods: unknown): ImageFood[] {
  if (!Array.isArray(rawFoods)) return [];
  return rawFoods
    .map((food) => ({
      name: safeString(food?.name) || "Món ăn",
      name_en: safeString(food?.name_en),
      quantity: roundNumber(toNumber(food?.quantity, 1) || 1, 2),
      unit: safeString(food?.unit) || "phần",
      estimated_weight_g: (() => {
        const grams = Math.round(toNumber(food?.estimated_weight_g, Number.NaN));
        return Number.isFinite(grams) && grams > 0 ? grams : null;
      })(),
      calories: Math.max(0, Math.round(toNumber(food?.calories, 0))),
      protein: roundNumber(toNumber(food?.protein, 0), 1),
      carbs: roundNumber(toNumber(food?.carbs, 0), 1),
      fat: roundNumber(toNumber(food?.fat, 0), 1),
      notes: safeString(food?.notes),
    }))
    .filter((food) => food.name);
}

function buildImageReviewText(bundle: ImageReviewBundle, approximateNotice = false) {
  const lines = ["📸 Phân tích ảnh", ""];
  for (const food of bundle.foods) {
    lines.push(`**${food.name}**`);
    const weightText = food.estimated_weight_g ? ` (~${Math.round(food.estimated_weight_g)}g)` : "";
    lines.push(`- Số lượng: ${formatGram(food.quantity, 2)} ${food.unit}${weightText}`);
    lines.push(`- Calories: ${Math.round(food.calories)} kcal`);
    lines.push(`- Macros: P ${formatGram(food.protein)}g | C ${formatGram(food.carbs)}g | F ${formatGram(food.fat)}g`);
    if (food.notes) lines.push(`- Ghi chú: ${food.notes}`);
    lines.push("");
  }
  lines.push(`**Tổng cộng**: ${Math.round(bundle.total_calories)} kcal`);
  lines.push(
    `Macros: P ${formatGram(bundle.total_protein)}g | C ${formatGram(bundle.total_carbs)}g | F ${formatGram(bundle.total_fat)}g`,
  );
  if (approximateNotice) {
    lines.push("", "Đây là ước tính AI từ ảnh và mô tả hiện có, chưa lưu vào nhật ký.");
  }
  lines.push("", 'Ghi lại? "có" / "không lưu"');
  return lines.join("\n");
}

function buildImagePendingState(
  body: AnyRecord,
  bundle: ImageReviewBundle,
  clarificationQuestion: string | null,
) {
  const pending = basePendingIntent(
    body.pending_intent ?? body.updated_pending_intent ?? body.user_record?.pending_intent,
  );
  const reviewId = bundle.review_id;
  const createdAt = new Date().toISOString();

  delete pending.inbody_capture;
  pending.active_surface = clarificationQuestion ? "image_followup" : "image_review";
  pending.response_surface = "image_review";
  pending.conversation_focus = "image";
  pending.confirm_candidate = {
    food_name: bundle.title,
    total_calories: bundle.total_calories,
    total_protein: bundle.total_protein,
    total_carbs: bundle.total_carbs,
    total_fat: bundle.total_fat,
    quantity_numeric: 1,
  };
  pending.image_analysis = {
    review_id: reviewId,
    kind: bundle.kind,
    title: bundle.title,
    observation: clarificationQuestion || "Ảnh bữa ăn đã được phân tích.",
    source_message_id: safeString(body.source_message_id),
    trace_id: safeString(body.trace_id),
    created_at: createdAt,
    meal_scope: bundle.meal_scope,
    primary_plate_only: bundle.primary_plate_only,
    needs_clarification: Boolean(clarificationQuestion),
    clarification_questions: clarificationQuestion ? [clarificationQuestion] : [],
    foods: bundle.foods,
    total_calories: bundle.total_calories,
    total_protein: bundle.total_protein,
    total_carbs: bundle.total_carbs,
    total_fat: bundle.total_fat,
  };
  pending.image_review_queue = [
    {
      review_id: reviewId,
      source_message_id: safeString(body.source_message_id),
      trace_id: safeString(body.trace_id),
      created_at: createdAt,
      meal_scope: bundle.meal_scope,
      primary_plate_only: bundle.primary_plate_only,
      image_analysis: pending.image_analysis,
    },
  ];
  pending.active_image_review_id = reviewId;
  pending.last_image_review_id = reviewId;
  pending.interaction_context = {
    ...(pending.interaction_context && typeof pending.interaction_context === "object"
      ? pending.interaction_context
      : {}),
    last_surface: "image_review",
    last_action: clarificationQuestion ? "image_needs_clarification" : "image_review_ready",
    last_non_error_reply_at: createdAt,
  };

  if (clarificationQuestion) {
    const token = nextToken("image");
    pending.image_followup = {
      owner: "image_review",
      source_message_id: safeString(body.source_message_id),
      token,
      clarification_token: token,
      followup_kind: "image_size_clarification",
      armed_at: createdAt,
      requested_at: createdAt,
      expires_at: buildExpiry(IMAGE_FOLLOWUP_TTL_MS),
      clarification_count: 0,
      context_payload: {
        review_id: reviewId,
        clarification_question: clarificationQuestion,
      },
    };
  } else {
    delete pending.image_followup;
  }

  return pending;
}

function buildBusyImageReply(modeHint: string) {
  return modeHint === "inbody"
    ? [
        "Mình đang bị nghẽn lane đọc ảnh nên chưa kịp phân tích phiếu InBody này.",
        "Bạn giữ nguyên ảnh và gửi lại sau khoảng 10-20 giây giúp mình nhé.",
      ].join("\n")
    : [
        "Mình đang bị nghẽn lane phân tích ảnh nên chưa kịp tính món này.",
        "Bạn gửi lại ảnh sau khoảng 10-20 giây, hoặc nhắn thêm mô tả ngắn để mình xử lý tiếp.",
      ].join("\n");
}

function extractImageSource(body: AnyRecord) {
  return (
    safeString(body.image_data_url) ||
    safeString(body.image_url) ||
    safeString(body.context?.image_data_url) ||
    safeString(body.context?.image_url) ||
    null
  );
}

function resolveImageModeHint(body: AnyRecord) {
  const explicit = normalizeLooseText(body.mode_hint);
  if (explicit === "meal" || explicit === "inbody") return explicit;

  const pending = parsePendingIntent(body.pending_intent ?? body.user_record?.pending_intent);
  if (pending?.inbody_capture?.owner === "inbody_review") return "inbody";

  const text = normalizeLooseText(
    [
      body.caption,
      body.caption_text,
      body.message_text,
      body.current_message_text,
      body.text,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (/\b(inbody|body composition|smm|pbf|bmr)\b/.test(text)) return "inbody";
  return "meal";
}

function mapInbodyGender(value: unknown) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return null;
  if (/(male|nam)\b/.test(normalized)) return "male";
  if (/(female|nu)\b/.test(normalized)) return "female";
  return null;
}

function normalizeInbodyMeasurement(raw: AnyRecord) {
  return {
    measuredAt: safeString(raw.measuredAt) || new Date().toISOString(),
    age: Number.isFinite(toNumber(raw.age, Number.NaN)) ? Math.round(toNumber(raw.age, 0)) : null,
    gender: mapInbodyGender(raw.gender),
    heightCm: Number.isFinite(toNumber(raw.heightCm, Number.NaN)) ? roundNumber(toNumber(raw.heightCm, 0), 1) : null,
    weightKg: Number.isFinite(toNumber(raw.weightKg, Number.NaN)) ? roundNumber(toNumber(raw.weightKg, 0), 1) : null,
    skeletalMuscleMassKg: Number.isFinite(toNumber(raw.skeletalMuscleMassKg, Number.NaN))
      ? roundNumber(toNumber(raw.skeletalMuscleMassKg, 0), 1)
      : null,
    bodyFatPct: Number.isFinite(toNumber(raw.bodyFatPct, Number.NaN))
      ? roundNumber(toNumber(raw.bodyFatPct, 0), 1)
      : null,
    bmi: Number.isFinite(toNumber(raw.bmi, Number.NaN)) ? roundNumber(toNumber(raw.bmi, 0), 1) : null,
    bmr: Number.isFinite(toNumber(raw.bmr, Number.NaN)) ? Math.round(toNumber(raw.bmr, 0)) : null,
    visceralFatLevel: Number.isFinite(toNumber(raw.visceralFatLevel, Number.NaN))
      ? Math.round(toNumber(raw.visceralFatLevel, 0))
      : null,
    waistHipRatio: Number.isFinite(toNumber(raw.waistHipRatio, Number.NaN))
      ? roundNumber(toNumber(raw.waistHipRatio, 0), 2)
      : null,
    inbodyScore: Number.isFinite(toNumber(raw.inbodyScore, Number.NaN))
      ? Math.round(toNumber(raw.inbodyScore, 0))
      : null,
    targetWeightKg: Number.isFinite(toNumber(raw.targetWeightKg, Number.NaN))
      ? roundNumber(toNumber(raw.targetWeightKg, 0), 1)
      : null,
    rawExtracted: raw,
  };
}

function buildInbodyPendingState(body: AnyRecord, measurement: AnyRecord) {
  const pending = basePendingIntent(
    body.pending_intent ?? body.updated_pending_intent ?? body.user_record?.pending_intent,
  );
  const reviewId = `inbody:${safeString(body.source_message_id) || safeString(body.trace_id) || Date.now()}`;
  const createdAt = new Date().toISOString();

  delete pending.image_followup;
  delete pending.image_analysis;
  pending.active_surface = "inbody_review";
  pending.inbody_candidate = {
    reviewId,
    source: "zalo_inbody_image",
    sourceMessageId: safeString(body.source_message_id),
    measuredAt: measurement.measuredAt,
    extracted: measurement,
    conflicts: [],
    createdAt,
  };
  delete pending.inbody_capture;
  pending.interaction_context = {
    ...(pending.interaction_context && typeof pending.interaction_context === "object"
      ? pending.interaction_context
      : {}),
    last_surface: "inbody_review",
    last_action: "inbody_review_ready",
    last_non_error_reply_at: createdAt,
  };
  return pending;
}

function buildInbodyReviewText(measurement: AnyRecord) {
  const lines = [
    "Mình nhận ra đây là phiếu InBody.",
    `- Ngày đo: ${String(measurement.measuredAt || "").slice(0, 10) || "Chưa rõ"}`,
    measurement.age != null ? `- Tuổi: ${measurement.age}` : null,
    measurement.gender === "male" ? "- Giới tính: Nam" : measurement.gender === "female" ? "- Giới tính: Nữ" : null,
    measurement.heightCm != null ? `- Chiều cao: ${formatGram(measurement.heightCm)} cm` : null,
    measurement.weightKg != null ? `- Cân nặng: ${formatGram(measurement.weightKg)} kg` : null,
    measurement.bodyFatPct != null ? `- PBF: ${formatGram(measurement.bodyFatPct)}%` : null,
    measurement.skeletalMuscleMassKg != null ? `- SMM: ${formatGram(measurement.skeletalMuscleMassKg)} kg` : null,
    measurement.bmi != null ? `- BMI: ${formatGram(measurement.bmi)}` : null,
    measurement.bmr != null ? `- BMR: ${formatKcal(measurement.bmr)} kcal` : null,
    measurement.visceralFatLevel != null ? `- Mỡ nội tạng: level ${measurement.visceralFatLevel}` : null,
    measurement.waistHipRatio != null ? `- WHR: ${formatGram(measurement.waistHipRatio, 2)}` : null,
    measurement.inbodyScore != null ? `- InBody Score: ${measurement.inbodyScore}` : null,
    "",
    'Nếu muốn lưu làm số đo mới nhất, trả lời "có lưu inbody". Nếu chưa muốn lưu, trả lời "không lưu".',
  ].filter(Boolean);
  return lines.join("\n");
}

export async function analyzeZaloImage(
  req: any,
  body: AnyRecord,
): Promise<ImageResult> {
  const imageSource = extractImageSource(body);
  const modeHint = resolveImageModeHint(body);
  if (!imageSource) {
    return {
      ok: true,
      status: modeHint === "inbody" ? "inbody_missing" : "invalid",
      error_code: "image_missing",
      reply_text:
        modeHint === "inbody"
          ? "Mình chưa thấy ảnh InBody hợp lệ trong lượt này. Bạn gửi lại ảnh giúp mình nhé."
          : "Mình chưa nhận được ảnh hợp lệ trong lượt này.",
      updated_pending_intent: basePendingIntent(body.pending_intent),
    };
  }

  try {
    const prompt =
      modeHint === "inbody"
        ? [
            "Phân tích ảnh InBody này và trả về JSON duy nhất.",
            "Schema:",
            "{",
            '  "status": "inbody_ready|inbody_missing",',
            '  "measurement": {"measuredAt": string|null, "age": number|null, "gender": string|null, "heightCm": number|null, "weightKg": number|null, "skeletalMuscleMassKg": number|null, "bodyFatPct": number|null, "bmi": number|null, "bmr": number|null, "visceralFatLevel": number|null, "waistHipRatio": number|null, "inbodyScore": number|null, "targetWeightKg": number|null},',
            '  "confidence": number,',
            '  "notes": string',
            "}",
            "Nếu không đủ dữ liệu để xác nhận đây là phiếu InBody, trả status=inbody_missing.",
          ].join("\n")
        : [
            "Phân tích ảnh bữa ăn này và trả về JSON duy nhất.",
            "Schema:",
            "{",
            '  "status": "review_ready|needs_clarification|invalid",',
            '  "title": string,',
            '  "confidence": number,',
            '  "meal_scope": "single_plate|restaurant_table|whole_table|unknown",',
            '  "primary_plate_only": boolean,',
            '  "clarification_question": string|null,',
            '  "foods": [{"name": string, "name_en": string|null, "quantity": number, "unit": string, "estimated_weight_g": number|null, "calories": number, "protein": number, "carbs": number, "fat": number, "notes": string|null}],',
            '  "totals": {"calories": number, "protein": number, "carbs": number, "fat": number}',
            "}",
            "Nếu chỉ thiếu đúng 1 chi tiết về khẩu phần, dùng status=needs_clarification.",
            "Nếu có thể ước lượng hợp lý thì dùng review_ready.",
            `Caption: ${safeString(body.caption) || safeString(body.caption_text) || safeString(body.message_text) || "Không có"}`,
          ].join("\n");

    const { parsed, statusCode } = await callAiImageJson(req, prompt, imageSource);

    if (modeHint === "inbody") {
      if (String(parsed?.status || "") !== "inbody_ready") {
        const pending = basePendingIntent(body.pending_intent ?? body.user_record?.pending_intent);
        const token = nextToken("inbody");
        pending.active_surface = "inbody_capture";
        pending.inbody_capture = {
          owner: "inbody_review",
          source_message_id: safeString(body.source_message_id),
          token,
          clarification_token: token,
          armed_at: new Date().toISOString(),
          requested_at: new Date().toISOString(),
          expires_at: buildExpiry(INBODY_CAPTURE_TTL_MS),
          clarification_count: 1,
          context_payload: {},
        };
        return {
          ok: true,
          status: "inbody_missing",
          error_code: "inbody_missing",
          reply_text: [
            "Mình chưa nhận ra đây là phiếu InBody rõ ràng.",
            "Bạn gửi lại ảnh chụp thẳng hoặc xoay đúng chiều, đủ sáng, thấy rõ các mục InBody Score / SMM / PBF / BMR / Target Weight giúp mình nhé.",
          ].join("\n"),
          updated_pending_intent: pending,
          provider_status: statusCode,
        };
      }

      const measurement = normalizeInbodyMeasurement(parsed.measurement || {});
      const updatedPendingIntent = buildInbodyPendingState(body, measurement);
      return {
        ok: true,
        status: "inbody_ready",
        error_code: null,
        reply_text: buildInbodyReviewText(measurement),
        updated_pending_intent: updatedPendingIntent,
        inbody_measurement: measurement,
        provider_status: statusCode,
      };
    }

    const foods = normalizeImageFoods(parsed?.foods);
    const totals = parsed?.totals && typeof parsed.totals === "object"
      ? {
          calories: Math.max(0, Math.round(toNumber(parsed.totals.calories, 0))),
          protein: roundNumber(toNumber(parsed.totals.protein, 0), 1),
          carbs: roundNumber(toNumber(parsed.totals.carbs, 0), 1),
          fat: roundNumber(toNumber(parsed.totals.fat, 0), 1),
        }
      : sumFoods(foods);

    if (!foods.length) {
      return {
        ok: true,
        status: "invalid",
        error_code: "image_invalid",
        reply_text: "Mình chưa đọc chắc món trong ảnh này. Bạn gửi lại ảnh rõ hơn hoặc thêm mô tả ngắn giúp mình nhé.",
        updated_pending_intent: basePendingIntent(body.pending_intent),
        provider_status: statusCode,
      };
    }

    const bundle: ImageReviewBundle = {
      review_id: `image:${safeString(body.source_message_id) || safeString(body.trace_id) || Date.now()}`,
      kind: "analysis",
      title: safeString(parsed?.title) || foods[0].name,
      confidence: roundNumber(toNumber(parsed?.confidence, 0.6), 2),
      meal_scope: safeString(parsed?.meal_scope) || "single_plate",
      primary_plate_only: parsed?.primary_plate_only !== false,
      foods,
      total_calories: Math.max(0, Math.round(toNumber(totals.calories, 0))),
      total_protein: roundNumber(toNumber(totals.protein, 0), 1),
      total_carbs: roundNumber(toNumber(totals.carbs, 0), 1),
      total_fat: roundNumber(toNumber(totals.fat, 0), 1),
    };

    const clarificationQuestion =
      String(parsed?.status || "") === "needs_clarification"
        ? safeString(parsed?.clarification_question) ||
          "Phần món chính trong ảnh này gần cỡ nhỏ, vừa hay lớn?"
        : null;
    const updatedPendingIntent = buildImagePendingState(
      body,
      bundle,
      clarificationQuestion,
    );

    return {
      ok: true,
      status: clarificationQuestion ? "needs_clarification" : "review_ready",
      error_code: null,
      reply_text: clarificationQuestion
        ? [
            "📸 Phân tích ảnh",
            "",
            "Mình cần chốt đúng 1 chi tiết trước khi log để không lệch số.",
            `- ${clarificationQuestion}`,
            "Bạn trả lời ngắn một câu là mình tính tiếp ngay.",
          ].join("\n")
        : buildImageReviewText(bundle, true),
      updated_pending_intent: updatedPendingIntent,
      review_bundle: bundle,
      provider_status: statusCode,
    };
  } catch (error: any) {
    return {
      ok: true,
      status: modeHint === "inbody" ? "inbody_missing" : "busy",
      error_code: modeHint === "inbody" ? "inbody_analysis_busy" : "image_analysis_busy",
      reply_text: buildBusyImageReply(modeHint),
      updated_pending_intent: basePendingIntent(body.pending_intent ?? body.user_record?.pending_intent),
      provider_status: Number(error?.statusCode || 0) || null,
    };
  }
}

function normalizeSummaryPeriod(value: unknown): "today" | "week" | "month" {
  const normalized = normalizeLooseText(value);
  if (normalized === "day" || normalized === "daily" || normalized === "today" || normalized === "homnay") {
    return "today";
  }
  if (normalized === "month" || normalized === "monthly" || normalized === "thangnay") {
    return "month";
  }
  return "week";
}

function mapSummaryPeriod(period: "today" | "week" | "month"): DashboardPeriod {
  if (period === "today") return "day";
  if (period === "month") return "month";
  return "week";
}

function buildSummaryReplyText(period: "today" | "week" | "month", summary: AnyRecord) {
  if (period === "today") {
    const daily = summary.daily || {};
    const profile = summary.profile || {};
    const requested = summary.requestedPeriod || {};
    const items = Array.isArray(requested.items) ? requested.items : [];
    return [
      `📊 Hôm nay của bạn (${requested.endDate || requested.startDate || "?"})`,
      "━━━━━━━━━━━━━━━━━━━━━━",
      `🔥 Đã nạp: ${formatKcal(daily.totalCalories)} kcal`,
      `🏃 Calories vận động: ${formatKcal(daily.exerciseCalories)} kcal`,
      `📉 Net intake: ${formatKcal(daily.netCalories)} kcal`,
      `🧭 TDEE: ${formatKcal(profile.tdee)} kcal | Daily goal: ${formatKcal(profile.dailyGoalKcal)} kcal`,
      `✅ Chênh lệch so với daily goal: ${formatKcal((profile.dailyGoalKcal || 0) - (daily.totalCalories || 0))} kcal`,
      `💪 Protein ${formatGram(daily.totalProtein)}g/${formatGram(profile.macroTargets?.proteinG)}g`,
      `🥑 Fat ${formatGram(daily.totalFat)}g/tối thiểu ${formatGram(profile.macroTargets?.fatG)}g`,
      `🍚 Carb ${formatGram(daily.totalCarbs)}g`,
      `🎯 Mục tiêu hiện tại: ${formatGoalLabel(profile.primaryGoal || "maintain")}`,
      items.length ? "" : null,
      items.length ? "🍽️ Món đã ghi hôm nay:" : null,
      ...items.map((item: AnyRecord) => `• ${item.foodName || item.food_name || "Món ăn"}: ${formatKcal(item.calories)} kcal`),
    ]
      .filter(Boolean)
      .join("\n");
  }

  const requested = summary.requestedPeriod || {};
  const goalLabel = summary.profile?.goalLabel || formatGoalLabel(summary.profile?.primaryGoal || "maintain");
  const header =
    period === "month"
      ? `📆 Tháng này của bạn (${requested.startDate || "?"} - ${requested.endDate || "?"})`
      : `📆 Tuần này của bạn (${requested.startDate || "?"} - ${requested.endDate || "?"})`;
  return [
    header,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `🎯 Mục tiêu kỳ này: ${formatKcal(requested.targetKcal)} kcal`,
    `🔥 Đã nạp: ${formatKcal(requested.consumedKcal)} kcal`,
    `📉 Còn lại: ${formatKcal(requested.remainingKcal)} kcal`,
    `💪 Protein: ${formatGram(requested.consumedProteinG)}g / ${formatGram(requested.targetProteinG)}g`,
    `🍚 Carb: ${formatGram(requested.consumedCarbsG)}g / ${formatGram(requested.targetCarbsG)}g`,
    `🥑 Fat: ${formatGram(requested.consumedFatG)}g / ${formatGram(requested.targetFatG)}g`,
    `🗓️ Số ngày đã log: ${Math.round(toNumber(requested.daysLogged, 0))}`,
    `🎯 Goal mode: ${goalLabel}`,
  ].join("\n");
}

export async function buildZaloSummary(
  _req: any,
  body: AnyRecord,
): Promise<SummaryResult> {
  const period = normalizeSummaryPeriod(body.period || body.query_type);
  try {
    const access = await resolveDashboardAccess(
      {
        headers: {
          [INTERNAL_KEY_HEADER]: getZaloOaInternalKey(),
        },
        query: {},
      },
      {
        linkedUserId: Number(body.linkedUserId ?? body.linked_user_id ?? body.user_id ?? 0) || null,
        customerId: Number(body.customerId ?? body.customer_id ?? 0) || null,
      },
    );
    const summary = await getDashboardSummary(
      access.admin,
      access.context,
      mapSummaryPeriod(period),
    );
    return {
      ok: true,
      status: "ok",
      error_code: null,
      reply_text: buildSummaryReplyText(period, summary),
      summary_period: period,
      metrics: summary.requestedPeriod || null,
    };
  } catch (error: any) {
    const errorCode = safeString(error?.message) || "dashboard_summary_unavailable";
    return {
      ok: true,
      status: "unavailable",
      error_code: errorCode,
      reply_text:
        period === "month"
          ? "Mình chưa tổng hợp được dashboard tháng này. Bạn thử lại /thangnay giúp mình nhé."
          : period === "today"
            ? "Mình chưa tổng hợp được dashboard hôm nay. Bạn thử lại /homnay giúp mình nhé."
            : "Mình chưa tổng hợp được dashboard tuần này. Bạn thử lại /tuannay giúp mình nhé.",
      summary_period: period,
      metrics: null,
    };
  }
}

export function createZaloRecoveryAdmin() {
  return createServiceRoleClient();
}
