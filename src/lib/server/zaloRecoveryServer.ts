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
import { normalizePendingIntentState } from "./zaloGatewayChatServer.js";
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
    | "search_ready"
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
const OPENAI_CHAT_COMPLETIONS_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const INTERNAL_KEY_HEADER = "x-calotrack-internal-key";
const IMAGE_FOLLOWUP_TTL_MS = 10 * 60 * 1000;
const INBODY_CAPTURE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_AI_TIMEOUT_MS = 45_000;
const DEFAULT_IMAGE_AI_TIMEOUT_MS = 60_000;
const RETRYABLE_AI_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

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
    aliases: ["com trang"],
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
    key: "chicken_breast",
    label: "ức gà",
    aliases: ["uc ga", "lang uc ga", "thit uc ga"],
    defaultGrams: 100,
    defaultUnit: "phần",
    defaultPortionText: "100g ức gà",
    per100: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
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
  {
    key: "fried_egg",
    label: "trứng chiên",
    aliases: ["trung chien", "op la", "trung ran"],
    defaultGrams: 50,
    defaultUnit: "quả",
    defaultPortionText: "1 quả trứng chiên",
    per100: { calories: 196, protein: 13.6, carbs: 1.2, fat: 15 },
  },
  {
    key: "pho_bo",
    label: "phở bò",
    aliases: ["pho bo"],
    defaultGrams: 450,
    defaultUnit: "tô",
    defaultPortionText: "1 tô phở bò",
    per100: { calories: 120, protein: 7.5, carbs: 14, fat: 3.5 },
  },
  {
    key: "fried_rice_beef_pickles",
    label: "cơm rang dưa bò",
    aliases: ["com rang dua bo"],
    defaultGrams: 320,
    defaultUnit: "phần",
    defaultPortionText: "1 phần cơm rang dưa bò",
    per100: { calories: 190, protein: 8.8, carbs: 21, fat: 7.5 },
  },
  {
    key: "fried_rice_beef_mustard",
    label: "cơm rang cải bò",
    aliases: ["com rang cai bo"],
    defaultGrams: 320,
    defaultUnit: "phần",
    defaultPortionText: "1 phần cơm rang cải bò",
    per100: { calories: 188, protein: 8.5, carbs: 21, fat: 7.2 },
  },
];

function cleanEnv(value: string | undefined) {
  return String(value || "").replace(/\r?\n/g, "").trim();
}

function looksLikeOpenAiBearer(value: string | undefined) {
  const candidate = cleanEnv(value);
  return /^sk-[a-z0-9]/i.test(candidate) || /^Bearer\s+sk-[a-z0-9]/i.test(candidate);
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

function looksLikeInbodyText(value: unknown) {
  const normalized = normalizeLooseText(value);
  return /\b(inbody|body composition|smm|pbf|bmr|body fat|skeletal muscle|visceral fat)\b/.test(
    normalized,
  );
}

function looksLikeFoodText(value: unknown) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return false;
  return (
    /\b\d+(?:[.,]\d+)?\s*(g|gr|gram|kg|ml|lon|qua|mieng|phan|to|dia|ly)\b/.test(normalized) ||
    /\b(uc ga|ga|bo|heo|ca hoi|ca ngu|ca|trung|com|pho|bun|mi|my|salad|steak|suon|thit|banh|pasta|pizza|xuc xich|bia|ca phe|coffee|sua chua|yaourt|khoai tay chien|fries)\b/.test(
      normalized,
    )
  );
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

function resolveTimeoutMs(value: unknown, fallbackMs: number) {
  const numeric = Math.round(toNumber(value, Number.NaN));
  if (!Number.isFinite(numeric) || numeric < 5_000) return fallbackMs;
  return numeric;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return normalizePendingIntentState(candidate);
}

function findDeterministicEntry(normalizedMessage: string) {
  const padded = ` ${normalizedMessage} `;
  return (
    DETERMINISTIC_CATALOG.find((entry) =>
      entry.aliases.some((alias) => padded.includes(` ${alias.trim()} `)),
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

function buildFoodFromCatalogGrams(
  entry: (typeof DETERMINISTIC_CATALOG)[number],
  grams: number,
  options?: {
    quantity?: number;
    unit?: string;
    portionText?: string;
    label?: string;
  },
): NutritionFood {
  const safeGrams = Math.max(1, Math.round(grams));
  const factor = safeGrams / 100;
  return {
    name: options?.label || entry.label,
    quantity: roundNumber(options?.quantity ?? 1, 2),
    unit: String(options?.unit || "phần").trim() || "phần",
    portion_text: String(options?.portionText || `${safeGrams}g`).trim() || `${safeGrams}g`,
    estimated_weight_g: safeGrams,
    calories: Math.max(0, Math.round(entry.per100.calories * factor)),
    protein: roundNumber(entry.per100.protein * factor, 1),
    carbs: roundNumber(entry.per100.carbs * factor, 1),
    fat: roundNumber(entry.per100.fat * factor, 1),
    source: "deterministic",
  };
}

function normalizeMacroTotals(value: AnyRecord | null | undefined): MacroTotals {
  return {
    calories: Math.max(0, Math.round(toNumber(value?.calories, 0))),
    protein: roundNumber(toNumber(value?.protein, 0), 1),
    carbs: roundNumber(toNumber(value?.carbs, 0), 1),
    fat: roundNumber(toNumber(value?.fat, 0), 1),
  };
}

function sumFoods(foods: Array<{ calories: unknown; protein: unknown; carbs: unknown; fat: unknown }>): MacroTotals {
  return foods.reduce<MacroTotals>(
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

function normalizeFoodLookupText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, (char) => (char === "\u0111" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9%.,:/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicNutrition(messageText: string): NutritionResult | null {
  const normalized = normalizeFoodLookupText(messageText);
  if (!normalized) return null;

  if (normalized.includes("com nieu bo ga")) {
    const riceEntry = DETERMINISTIC_CATALOG.find((item) => item.key === "white_rice");
    const beefEntry = DETERMINISTIC_CATALOG.find((item) => item.key === "beef");
    const chickenEntry = DETERMINISTIC_CATALOG.find((item) => item.key === "chicken_thigh");
    if (riceEntry && beefEntry && chickenEntry) {
      const foods = [
        buildFoodFromCatalogGrams(riceEntry, 180, {
          quantity: 1,
          unit: "phần",
          portionText: "1 phần cơm",
          label: "cơm trắng",
        }),
        buildFoodFromCatalogGrams(beefEntry, 90, {
          quantity: 1,
          unit: "phần",
          portionText: "bò ~90g",
          label: "thịt bò",
        }),
        buildFoodFromCatalogGrams(chickenEntry, 90, {
          quantity: 1,
          unit: "phần",
          portionText: "gà ~90g",
          label: "đùi gà",
        }),
      ];
      return {
        ok: true,
        status: "nutrition_fallback_estimated",
        error_code: null,
        insert_allowed: true,
        fallback_source: "deterministic",
        food_name_display: "cơm niêu bò gà",
        foods,
        totals: sumFoods(foods),
        reply_text: null,
      };
    }
  }

  if (
    /\bcom\b/.test(normalized) &&
    /\bbo\b/.test(normalized) &&
    /\bga\b/.test(normalized)
  ) {
    const riceEntry = DETERMINISTIC_CATALOG.find((item) => item.key === "white_rice");
    const beefEntry = DETERMINISTIC_CATALOG.find((item) => item.key === "beef");
    const chickenEntry = DETERMINISTIC_CATALOG.find((item) => item.key === "chicken_thigh");
    if (riceEntry && beefEntry && chickenEntry) {
      const foods = [
        buildFoodFromCatalogGrams(riceEntry, 180, {
          quantity: 1,
          unit: "phần",
          portionText: "1 phần cơm",
          label: "cơm trắng",
        }),
        buildFoodFromCatalogGrams(beefEntry, 90, {
          quantity: 1,
          unit: "phần",
          portionText: "bò ~90g",
          label: "thịt bò",
        }),
        buildFoodFromCatalogGrams(chickenEntry, 90, {
          quantity: 1,
          unit: "phần",
          portionText: "gà ~90g",
          label: "đùi gà",
        }),
      ];
      return {
        ok: true,
        status: "nutrition_fallback_estimated",
        error_code: null,
        insert_allowed: true,
        fallback_source: "deterministic",
        food_name_display: "cơm niêu bò gà",
        foods,
        totals: sumFoods(foods),
        reply_text: null,
      };
    }
  }

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

function getAiEndpoint(_req: any) {
  const explicitEndpoint = cleanEnv(process.env.CALOTRACK_AI_ENDPOINT);
  const authCandidate =
    cleanEnv(process.env.CALOTRACK_AI_AUTHORIZATION) ||
    cleanEnv(process.env.OPENAI_API_KEY);

  if (!explicitEndpoint) {
    if (looksLikeOpenAiBearer(process.env.OPENAI_API_KEY) || looksLikeOpenAiBearer(authCandidate)) {
      return OPENAI_CHAT_COMPLETIONS_ENDPOINT;
    }
    return AI_ENDPOINT_DEFAULT;
  }

  const candidate = explicitEndpoint;

  if (/calotrack-website(?:-[^.]+)?\.vercel\.app\/api\/zalo-(nutrition-estimate|image-analyze|summary)/i.test(candidate)) {
    return AI_ENDPOINT_DEFAULT;
  }

  if (/\/api\/zalo-(nutrition-estimate|image-analyze|summary)\b/i.test(candidate)) {
    return AI_ENDPOINT_DEFAULT;
  }

  return candidate;
}

function getAiAuthorization(_req: any) {
  const candidate =
    cleanEnv(process.env.CALOTRACK_AI_AUTHORIZATION) ||
    cleanEnv(process.env.OPENAI_API_KEY);

  if (!candidate) return null;
  return /^Bearer\s+/i.test(candidate) ? candidate : `Bearer ${candidate}`;
}

async function callAiJson(
  req: any,
  messages: AnyRecord[],
  model: string,
  temperature = 0.2,
  options?: {
    maxAttempts?: number;
    retryModels?: string[];
    timeoutMs?: number;
  },
) {
  const endpoint = getAiEndpoint(req);
  const authorization = getAiAuthorization(req);
  if (!endpoint || !authorization) {
    throw Object.assign(new Error("ai_provider_unavailable"), { statusCode: 503 });
  }

  const retryModels = Array.isArray(options?.retryModels)
    ? options?.retryModels.filter(Boolean)
    : [];
  const attemptModels = [model, ...retryModels];
  const maxAttempts = Math.max(
    1,
    Number.isFinite(options?.maxAttempts) ? Number(options?.maxAttempts) : attemptModels.length,
  );
  const timeoutMs = resolveTimeoutMs(
    options?.timeoutMs ?? process.env.CALOTRACK_AI_TIMEOUT_MS,
    DEFAULT_AI_TIMEOUT_MS,
  );

  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptModel = attemptModels[Math.min(attempt, attemptModels.length - 1)] || model;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: attemptModel,
          temperature,
          response_format: { type: "json_object" },
          messages,
        }),
      });
      clearTimeout(timeoutHandle);

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
    } catch (error: any) {
      clearTimeout(timeoutHandle);
      lastError = error;
      if (error?.name === "AbortError") {
        lastError = Object.assign(new Error("ai_request_timed_out"), {
          statusCode: 408,
        });
      }
      const statusCode = Number(error?.statusCode || 0);
      const shouldRetry =
        RETRYABLE_AI_STATUS_CODES.has(statusCode) && attempt < maxAttempts - 1;

      if (!shouldRetry) {
        throw error;
      }

      await delay(Math.min(8000, 1500 * 2 ** attempt));
    }
  }

  throw lastError || Object.assign(new Error("ai_provider_unavailable"), { statusCode: 503 });
}

function dedupeModels(values: Array<string | null | undefined>) {
  const unique: string[] = [];
  for (const value of values) {
    const candidate = safeString(value);
    if (!candidate || unique.includes(candidate)) continue;
    unique.push(candidate);
  }
  return unique;
}

function normalizePreferredImageModel(value: unknown) {
  const raw = safeString(value);
  const normalized = raw.toLowerCase();
  if (!normalized) return "gpt-4.1-mini";
  if (normalized === "gpt-4.1") return "gpt-4.1-mini";
  if (normalized === "gpt-4o") return "gpt-4o-mini";
  return raw;
}

async function callAiImageJson(
  req: any,
  prompt: string,
  imageUrl: string,
  model = "gpt-4.1-mini",
) {
  const primaryModel = normalizePreferredImageModel(model);
  const retryModels = dedupeModels([
    primaryModel === "gpt-4.1-mini" ? "gpt-4o-mini" : "gpt-4.1-mini",
    primaryModel === "gpt-4o-mini" ? "gpt-4.1-mini" : "gpt-4o-mini",
  ]).filter((candidate) => candidate !== primaryModel);
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
    primaryModel,
    0.1,
    {
      maxAttempts: 1 + retryModels.length,
      retryModels,
      timeoutMs: resolveTimeoutMs(
        process.env.CALOTRACK_IMAGE_AI_TIMEOUT_MS,
        DEFAULT_IMAGE_AI_TIMEOUT_MS,
      ),
    },
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
    `Mình chưa chốt đủ chắc tay để log ${display}, nên chưa lưu vào nhật ký.`,
    "Bạn mô tả rõ hơn khẩu phần, gram hoặc thành phần chính giúp mình nhé. Ví dụ: `1 phần cơm niêu bò gà, cơm 180g, bò 120g, gà 80g`.",
  ].join("\n");
}

function buildSearchUnknownFoodReply(messageText: string) {
  const display = safeString(messageText) || "món này";
  return [
    `Mình chưa ước tính đủ chắc tay cho ${display}, nên chưa chốt calories và macros lúc này.`,
    "Bạn thử ghi rõ hơn khẩu phần hoặc thành phần chính, ví dụ: `ức gà 150g`, `cơm rang dưa bò 1 phần`.",
  ].join("\n");
}

function buildNutritionBusyReply(_messageText: string, purpose: "log" | "search") {
  if (purpose === "search") {
    return [
      "Mình đang nghẽn lane ước tính món này nên chưa tra ra ngay được.",
      "Bạn thử lại sau 10-20 giây, hoặc nhắn rõ hơn khẩu phần như `ức gà 150g` giúp mình nhé.",
    ].join("\n");
  }

  return [
    "Mình đang nghẽn lane ước tính món này nên chưa log chắc tay được.",
    "Bạn thử lại sau 10-20 giây, hoặc ghi rõ hơn khẩu phần và thành phần chính giúp mình nhé.",
  ].join("\n");
}

function stripFoodSearchPrompt(rawText: string) {
  let next = String(rawText || "").trim();
  next = next.replace(/^\/?(?:tìm|tim|kiếm|kiem|search|tra cứu|tra cuu)(?:\s+(?:tôi|toi))?(?:\s+(?:món|mon))?\s*/i, "");
  next = next.replace(/\b(?:bao nhiêu|bao nhieu)\s*(?:calo|kcal|protein|carb|carbs|fat)\b/gi, "");
  next = next.replace(/\b(?:calo|kcal|protein|carb|carbs|fat)\s*(?:bao nhiêu|bao nhieu)\b/gi, "");
  next = next.replace(/\b(?:là|la)\s*bao nhiêu\b/gi, "");
  next = next.replace(/\s+/g, " ").replace(/^[,.:;\-]+|[,.:;\-]+$/g, "").trim();
  return next.trim();
}

function buildNutritionMessageCandidates(body: AnyRecord, purpose: "log" | "search") {
  const rawCandidates = [
    safeString(body.message_text),
    safeString(body.food_name),
    safeString(body.context?.message_text),
    safeString(body.context?.query),
    safeString(body.context?.search_term),
    safeString(body.context?.source_message_text),
    safeString(body.context?.normalized_query),
    safeString(body.context?.normalized_text),
  ].filter(Boolean) as string[];

  const sanitizer = purpose === "search" ? stripFoodSearchPrompt : stripFoodLogPrefix;
  const deduped = new Set<string>();
  const candidates: string[] = [];

  for (const rawCandidate of rawCandidates) {
    const sanitized = sanitizer(rawCandidate) || rawCandidate;
    const normalizedKey = normalizeFoodLookupText(sanitized);
    if (!normalizedKey || deduped.has(normalizedKey)) continue;
    deduped.add(normalizedKey);
    candidates.push(sanitized);
  }

  return candidates;
}

function normalizeNutritionPurpose(body: AnyRecord): "log" | "search" {
  const purpose = safeString(body?.purpose || body?.context?.purpose);
  return purpose?.toLowerCase() === "search"
    ? "search"
    : "log";
}

function stripFoodLogPrefix(rawText: string) {
  let next = String(rawText || "").trim();
  next = next.replace(/^\/(?:log|ghi)\b/i, "").trim();
  next = next.replace(/^(?:bua|bữa)\s+(?:sang|sáng|trua|trưa|toi|tối|phu|phụ)\s*:\s*/i, "");
  return next.trim();
}

function buildSearchNutritionReplyV2(
  queryText: string,
  foods: NutritionFood[],
  totals: NutritionResult["totals"],
  fallbackSource: NutritionResult["fallback_source"],
) {
  const display = safeString(queryText) || foods[0]?.name || "món này";
  const sourceLine =
    fallbackSource === "deterministic"
      ? "📚 Mình đang ước tính nhanh theo dữ liệu nội bộ của CaloTrack."
      : "🤖 Mình đang ước tính nhanh theo AI cho món này.";

  return [
    sourceLine,
    `🍽️ ${display}`,
    `- Calories: ${Math.round(toNumber(totals.calories, 0))} kcal`,
    `- Protein: ${formatGram(toNumber(totals.protein, 0))}g | Carbs: ${formatGram(toNumber(totals.carbs, 0))}g | Fat: ${formatGram(toNumber(totals.fat, 0))}g`,
    "",
    "Mình mới tra cứu/ước tính thôi, chưa lưu vào nhật ký.",
    "Nếu muốn mình so sánh thêm theo mục tiêu hiện tại thì nhắn tiếp tên món hoặc gram cụ thể.",
  ].join("\n");
}

export async function estimateZaloNutrition(
  req: any,
  body: AnyRecord,
): Promise<NutritionResult> {
  const purpose = normalizeNutritionPurpose(body);
  const candidateTexts = buildNutritionMessageCandidates(body, purpose);
  const rawMessageText =
    candidateTexts[0] ||
    safeString(body.message_text) ||
    safeString(body.food_name) ||
    safeString(body.context?.message_text) ||
    "";
  const messageText = candidateTexts[0] || rawMessageText;

  let matchedCandidate = messageText;
  let deterministic: NutritionResult | null = null;
  for (const candidate of candidateTexts) {
    deterministic = deterministicNutrition(candidate);
    if (deterministic) {
      matchedCandidate = candidate;
      break;
    }
  }

  if (deterministic) {
    if (purpose === "search") {
      return {
        ...deterministic,
        status: "search_ready",
        insert_allowed: false,
        reply_text: buildSearchNutritionReplyV2(
          deterministic.food_name_display || matchedCandidate,
          deterministic.foods,
          deterministic.totals,
          deterministic.fallback_source,
        ),
      };
    }
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
      ? normalizeMacroTotals(parsed.totals as AnyRecord)
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
        reply_text:
          purpose === "search"
            ? buildSearchUnknownFoodReply(messageText)
            : buildUnknownFoodReply(messageText),
        provider_status: statusCode,
      };
    }

    const foodNameDisplay =
      foods.length === 1 ? foods[0].name : (safeString(messageText) || foods[0].name);

    if (purpose === "search") {
      return {
        ok: true,
        status: "search_ready",
        error_code: null,
        insert_allowed: false,
        fallback_source: "provider",
        food_name_display: foodNameDisplay,
        foods,
        totals,
        reply_text: buildSearchNutritionReplyV2(foodNameDisplay, foods, totals, "provider"),
        provider_status: statusCode,
      };
    }

    return {
      ok: true,
      status: "food_logged",
      error_code: null,
      insert_allowed: true,
      fallback_source: "provider",
      food_name_display: foodNameDisplay,
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
        ? buildNutritionBusyReply(messageText, purpose)
        : purpose === "search"
          ? buildSearchUnknownFoodReply(messageText)
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

function buildImageReviewBundleFromNutrition(
  sourceMessageId: string | null,
  traceId: string | null,
  title: string,
  foods: NutritionFood[],
  totals: NutritionResult["totals"],
): ImageReviewBundle {
  return {
    review_id: `image:${sourceMessageId || traceId || Date.now()}`,
    kind: "caption_fallback",
    title: safeString(title) || foods[0]?.name || "Bữa ăn",
    confidence: 0.55,
    meal_scope: "single_plate",
    primary_plate_only: true,
    foods: foods.map((food) => ({
      name: food.name,
      name_en: null,
      quantity: food.quantity,
      unit: food.unit,
      estimated_weight_g: food.estimated_weight_g ?? null,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      notes: food.portion_text,
    })),
    total_calories: Math.max(0, Math.round(toNumber(totals.calories, 0))),
    total_protein: roundNumber(toNumber(totals.protein, 0), 1),
    total_carbs: roundNumber(toNumber(totals.carbs, 0), 1),
    total_fat: roundNumber(toNumber(totals.fat, 0), 1),
  };
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

function shouldRetainImageClarification(parsed: AnyRecord, bundle: ImageReviewBundle) {
  if (String(parsed?.status || "") !== "needs_clarification") return false;
  if (!bundle.foods.length || bundle.total_calories <= 0) return true;

  const confidence = roundNumber(toNumber(parsed?.confidence, 0.6), 2);
  const mealScope = safeString(parsed?.meal_scope) || "unknown";
  const primaryPlateOnly = parsed?.primary_plate_only !== false;

  if (mealScope === "single_plate" && confidence >= 0.35) {
    return false;
  }

  if (primaryPlateOnly && mealScope !== "whole_table" && confidence >= 0.45) {
    return false;
  }

  return true;
}

function resolveImageClarificationQuestion(parsed: AnyRecord, bundle: ImageReviewBundle) {
  if (!shouldRetainImageClarification(parsed, bundle)) return null;
  const question = safeString(parsed?.clarification_question);
  return question || null;
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
        "Mình chưa lưu số đo ở lượt này. Bạn giữ nguyên ảnh và gửi lại sau khoảng 10-20 giây giúp mình nhé.",
      ].join("\n")
    : [
        "Mình đang bị nghẽn lane phân tích ảnh nên chưa kịp đọc trực tiếp ảnh này.",
        "Mình chưa lưu gì cho lượt này. Bạn giữ nguyên ảnh và gửi lại sau khoảng 10-20 giây giúp mình nhé.",
      ].join("\n");
}

function buildProviderFailureReply(modeHint: string, providerStatus: number | null) {
  const normalizedStatus = Number.isFinite(providerStatus) ? Number(providerStatus) : 0;

  if (normalizedStatus === 401 || normalizedStatus === 403) {
    return modeHint === "inbody"
      ? {
          status: "inbody_missing" as const,
          error_code: "inbody_provider_auth_failed",
          reply_text: [
            "Lane đọc phiếu InBody đang lỗi xác thực nên mình chưa phân tích được ảnh này.",
            "Mình chưa lưu số đo ở lượt này. Bạn giữ nguyên ảnh và gửi lại sau một lát giúp mình nhé.",
          ].join("\n"),
        }
      : {
          status: "busy" as const,
          error_code: "image_provider_auth_failed",
          reply_text: [
            "Lane phân tích ảnh đang lỗi xác thực nên mình chưa đọc được ảnh này.",
            "Bạn không cần thêm caption. Mình sẽ đọc lại trực tiếp từ ảnh khi lane ổn hơn; bạn giữ nguyên ảnh và gửi lại sau một lát giúp mình nhé.",
          ].join("\n"),
        };
  }

  if (normalizedStatus === 429) {
    return modeHint === "inbody"
      ? {
          status: "inbody_missing" as const,
          error_code: "inbody_provider_rate_limited",
          reply_text: [
            "Lane đọc phiếu InBody đang quá tải nên mình chưa kịp phân tích ảnh này.",
            "Mình chưa lưu số đo ở lượt này. Bạn giữ nguyên ảnh và gửi lại sau khoảng 10-20 giây giúp mình nhé.",
          ].join("\n"),
        }
      : {
          status: "busy" as const,
          error_code: "image_provider_rate_limited",
          reply_text: [
            "Lane phân tích ảnh đang quá tải nên mình chưa kịp đọc ảnh này.",
            "Bạn không cần thêm caption. Mình sẽ đọc trực tiếp từ ảnh khi lane ổn hơn; bạn giữ nguyên ảnh và gửi lại sau khoảng 10-20 giây giúp mình nhé.",
          ].join("\n"),
        };
  }

  if (normalizedStatus >= 500 || normalizedStatus === 408) {
    return modeHint === "inbody"
      ? {
          status: "inbody_missing" as const,
          error_code: "inbody_provider_unavailable",
          reply_text: [
            "Dịch vụ đọc phiếu InBody đang tạm lỗi nên mình chưa phân tích được ảnh này.",
            "Mình chưa lưu số đo ở lượt này. Bạn giữ nguyên ảnh và gửi lại sau ít phút giúp mình nhé.",
          ].join("\n"),
        }
      : {
          status: "busy" as const,
          error_code: "image_provider_unavailable",
          reply_text: [
            "Dịch vụ phân tích ảnh đang tạm lỗi nên mình chưa đọc được ảnh này.",
            "Bạn không cần thêm caption. Mình sẽ đọc trực tiếp từ ảnh khi lane ổn hơn; bạn giữ nguyên ảnh và gửi lại sau ít phút giúp mình nhé.",
          ].join("\n"),
        };
  }

  return {
    status: modeHint === "inbody" ? ("inbody_missing" as const) : ("busy" as const),
    error_code: modeHint === "inbody" ? "inbody_analysis_busy" : "image_analysis_busy",
    reply_text: buildBusyImageReply(modeHint),
  };
}

function extractImageSources(body: AnyRecord) {
  const ordered = [
    safeString(body.image_data_url),
    safeString(body.context?.image_data_url),
    safeString(body.image_url),
    safeString(body.context?.image_url),
  ];
  const unique: string[] = [];
  for (const candidate of ordered) {
    if (!candidate || unique.includes(candidate)) continue;
    unique.push(candidate);
  }
  return unique;
}

function extractImageCaptionText(body: AnyRecord) {
  return safeString(
    body.caption ||
      body.caption_text ||
      body.message_text ||
      body.current_message_text ||
      body.text ||
      body.context?.caption ||
      body.context?.caption_text ||
      body.context?.message_text,
  );
}

function resolveImageModeHint(body: AnyRecord) {
  const explicit = normalizeLooseText(body.mode_hint);
  if (explicit === "meal" || explicit === "inbody") return explicit;

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

  if (looksLikeInbodyText(text)) return "inbody";
  if (looksLikeFoodText(text)) return "meal";

  const pending = parsePendingIntent(body.pending_intent ?? body.user_record?.pending_intent);
  if (pending?.inbody_capture?.owner === "inbody_review") return "inbody";

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

function buildInbodyRetryPendingState(body: AnyRecord) {
  const pending = basePendingIntent(
    body.pending_intent ?? body.updated_pending_intent ?? body.user_record?.pending_intent,
  );
  const existingCapture =
    pending.inbody_capture && typeof pending.inbody_capture === "object"
      ? pending.inbody_capture
      : {};
  const requestedAt = new Date().toISOString();
  const token = safeString(existingCapture.token || existingCapture.clarification_token) || nextToken("inbody");

  delete pending.image_followup;
  pending.active_surface = "inbody_capture";
  pending.inbody_capture = {
    owner: "inbody_review",
    source_message_id: safeString(body.source_message_id),
    token,
    clarification_token: token,
    armed_at: safeString(existingCapture.armed_at) || requestedAt,
    requested_at: requestedAt,
    expires_at: buildExpiry(INBODY_CAPTURE_TTL_MS),
    clarification_count: Number(existingCapture.clarification_count || 0),
    context_payload:
      existingCapture.context_payload && typeof existingCapture.context_payload === "object"
        ? existingCapture.context_payload
        : {},
  };
  pending.interaction_context = {
    ...(pending.interaction_context && typeof pending.interaction_context === "object"
      ? pending.interaction_context
      : {}),
    last_surface: "inbody_capture",
    last_action: "inbody_retry_pending",
    last_non_error_reply_at: requestedAt,
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
  const imageSources = extractImageSources(body);
  const modeHint = resolveImageModeHint(body);
  const requestedModel = normalizePreferredImageModel(body.model || process.env.CALOTRACK_IMAGE_MODEL);
  if (!imageSources.length) {
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
            "Ưu tiên đọc trực tiếp từ hình ảnh. Caption chỉ là ngữ cảnh bổ sung, không phải điều kiện bắt buộc.",
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
            "Nếu ảnh đủ rõ để ước lượng hợp lý thì luôn dùng review_ready.",
            "Chỉ dùng needs_clarification khi lưu ngay có nguy cơ lệch số đáng kể.",
            `Caption bổ sung (nếu có): ${safeString(body.caption) || safeString(body.caption_text) || safeString(body.message_text) || "Không có"}`,
          ].join("\n");

    let parsed: AnyRecord | null = null;
    let statusCode: number | null = null;
    let lastError: any = null;
    for (const imageSource of imageSources) {
      try {
        const result = await callAiImageJson(req, prompt, imageSource, requestedModel);
        parsed = result.parsed;
        statusCode = result.statusCode;
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
        statusCode = Number(error?.statusCode || 0) || null;
        if (statusCode === 401 || statusCode === 403) break;
      }
    }
    if (!parsed) {
      throw Object.assign(lastError || new Error("image_analysis_failed"), {
        statusCode,
      });
    }

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

    const clarificationQuestion = resolveImageClarificationQuestion(parsed, bundle);
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
    const providerStatus = Number(error?.statusCode || 0) || null;
    if (modeHint !== "inbody") {
      const captionText = extractImageCaptionText(body);
      if (captionText) {
        const captionNutrition = await estimateZaloNutrition(req, {
          ...body,
          message_text: captionText,
          food_name: captionText,
        }).catch(() => null);

        if (
          captionNutrition?.ok &&
          captionNutrition.insert_allowed &&
          Array.isArray(captionNutrition.foods) &&
          captionNutrition.foods.length
        ) {
          const bundle = buildImageReviewBundleFromNutrition(
            safeString(body.source_message_id),
            safeString(body.trace_id),
            captionText,
            captionNutrition.foods,
            captionNutrition.totals,
          );
          const updatedPendingIntent = buildImagePendingState(body, bundle, null);
          return {
            ok: true,
            status: "review_ready",
            error_code: "image_caption_fallback",
            reply_text: buildImageReviewText(bundle, true),
            updated_pending_intent: updatedPendingIntent,
            review_bundle: bundle,
            provider_status: providerStatus,
          };
        }
      }
    }

    const providerFailure = buildProviderFailureReply(modeHint, providerStatus);

    return {
      ok: true,
      status: providerFailure.status,
      error_code: providerFailure.error_code,
      reply_text: providerFailure.reply_text,
      updated_pending_intent:
        modeHint === "inbody"
          ? buildInbodyRetryPendingState(body)
          : basePendingIntent(body.pending_intent ?? body.user_record?.pending_intent),
      provider_status: providerStatus,
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

function buildSummaryReplyTextV2(period: "today" | "week" | "month", summary: AnyRecord) {
  if (period === "today") {
    const daily = summary.daily || {};
    const profile = summary.profile || {};
    const requested = summary.requestedPeriod || {};
    const items = Array.isArray(requested.items) ? requested.items : [];
    const goalKcal = toNumber(daily.goalKcal ?? profile.dailyGoalKcal, 0);
    const intakeKcal = toNumber(daily.intakeKcal, 0);
    const exerciseKcal = toNumber(daily.exerciseKcal, 0);
    const netKcal = toNumber(daily.netKcal, 0);
    const goalModeLabel =
      safeString(profile.goalModeDisplayLabel) ||
      safeString(profile.goalLabel) ||
      formatGoalLabel(profile.primaryGoal || "maintain");
    return [
      `📊 Hôm nay của bạn (${requested.endDate || requested.startDate || "?"})`,
      "━━━━━━━━━━━━━━━━━━━━━━",
      `🔥 Đã nạp: ${formatKcal(intakeKcal)} kcal`,
      `🏃 Vận động: ${formatKcal(exerciseKcal)} kcal`,
      `📉 Net calories: ${formatKcal(netKcal)} kcal`,
      `🧭 TDEE: ${formatKcal(profile.tdee)} kcal`,
      `🎯 Goal hôm nay: ${formatKcal(goalKcal)} kcal`,
      `💪 Protein: ${formatGram(daily.consumedProteinG)}g / ${formatGram(daily.targetProteinG ?? daily.dailyProteinG)}g`,
      `🍚 Carb: ${formatGram(daily.consumedCarbsG)}g / ${formatGram(daily.targetCarbsG ?? daily.dailyCarbsG)}g`,
      `🥑 Fat: ${formatGram(daily.consumedFatG)}g / ${formatGram(daily.targetFatG ?? daily.dailyFatG)}g`,
      `🎯 Goal mode: ${goalModeLabel}`,
      items.length ? "" : null,
      items.length ? "🍽️ Món đã ghi hôm nay:" : null,
      ...items.map((item: AnyRecord) => `• ${item.foodName || item.food_name || "Món ăn"}: ${formatKcal(item.calories)} kcal`),
    ]
      .filter(Boolean)
      .join("\n");
  }

  const requested = summary.requestedPeriod || {};
  const goalLabel =
    safeString(summary.profile?.goalModeDisplayLabel) ||
    safeString(summary.profile?.goalLabel) ||
    formatGoalLabel(summary.profile?.primaryGoal || "maintain");
  const remainingKcal = toNumber(requested.targetKcal, 0) - toNumber(requested.consumedKcal, 0);
  const header =
    period === "month"
      ? `📆 Tháng này của bạn (${requested.startDate || "?"} - ${requested.endDate || "?"})`
      : `📆 Tuần này của bạn (${requested.startDate || "?"} - ${requested.endDate || "?"})`;
  return [
    header,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `🎯 Mục tiêu kỳ này: ${formatKcal(requested.targetKcal)} kcal`,
    `🔥 Đã nạp: ${formatKcal(requested.consumedKcal)} kcal`,
    `📉 Còn lại: ${formatKcal(remainingKcal)} kcal`,
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
      reply_text: buildSummaryReplyTextV2(period, summary),
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
