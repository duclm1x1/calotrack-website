import { maybeSingle, safeString } from "./adminServer.js";
import {
  computeDailyGoalKcal,
  computeMacroTargets,
  formatGoalModeDisplayLabel,
  resolveCanonicalPortalCustomerForAuthUser,
  resolveContextByCustomerId,
  resolveContextByUserId,
  resolveDashboardAccess,
  resolveWeeklyRateKg,
  type DashboardContext,
  type GoalModeVariant,
  type PrimaryGoal,
} from "./dashboardSummaryServer.js";
import {
  readPhoneOnboardingTruth,
  runPhoneOnboardingAutomationReconcile,
  type PhoneOnboardingTruth,
  type PhoneOnboardingTruthState,
} from "./handlers/portal.js";
import { buildZaloPhoneAuthGateText } from "./zaloAuthBridgeServer.js";
import { getZaloOaInternalKey } from "./zaloOaServer.js";

type AnyRecord = Record<string, any>;

type GatewayAccess = {
  senderId: string;
  senderUserRow: AnyRecord | null;
  channelAccountRow: AnyRecord | null;
  customerId: number | null;
  linkedUserId: number | null;
  authUserId: string | null;
  phoneE164: string | null;
  truthState: PhoneOnboardingTruthState | null;
  repairRequired: boolean;
  chatLinkStatus: string;
  zaloLinkStatus: string;
  bridgeStatus: string | null;
  blockedReason: string | null;
  challengeIdentityKnown: boolean;
  repairAttempted: boolean;
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

function isPgUniqueViolation(error: unknown) {
  const code = String((error as { code?: string })?.code || "").trim();
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique constraint");
}

async function readExistingMealLogBySourceMessageId(
  admin: any,
  userId: number,
  sourceChannel: string,
  sourceMessageId: string,
) {
  if (!sourceMessageId) return null;
  return (
    (await maybeSingle<AnyRecord>(
      admin
        .from("meal_logs")
        .select("id, date_local, logged_at")
        .eq("user_id", userId)
        .eq("source_channel", sourceChannel)
        .eq("source_message_id", sourceMessageId)
        .order("id", { ascending: false })
        .limit(1),
    )) || null
  );
}

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
    .replace(/[\u0111\u0110]/g, (char) => (char === "\u0111" ? "d" : "D"))
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

async function resolveInternalContext(admin: any, customerId: number | null, linkedUserId: number | null) {
  if (!customerId && !linkedUserId) return null;
  const internalKey = getZaloOaInternalKey();
  if (internalKey) {
    try {
      const access = await resolveDashboardAccess(
        { headers: { "x-calotrack-internal-key": internalKey } },
        getInternalAccessBody(customerId, linkedUserId),
      );
      if (access.context) {
        return access.context;
      }
    } catch {
      // Fall through to direct DB resolution below.
    }
  }

  try {
    if (linkedUserId) {
      return await resolveContextByUserId(admin, linkedUserId);
    }
    if (customerId) {
      return await resolveContextByCustomerId(admin, customerId, linkedUserId);
    }
  } catch {
    return null;
  }

  return null;
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
  const byChat = await maybeSingle<AnyRecord>(
    admin
      .from("users")
      .select("*")
      .eq("platform", "zalo")
      .eq("chat_id", senderId)
      .limit(1),
  );
  if (byChat) return byChat;
  return maybeSingle<AnyRecord>(
    admin
      .from("users")
      .select("*")
      .eq("platform", "zalo")
      .eq("username", senderId)
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

const AUTH_PHONE_CHALLENGE_GATEWAY_BASE_SELECT =
  "id, auth_user_id, phone_e164, status, provider_request_payload, provider_response_payload, created_at";
const AUTH_PHONE_CHALLENGE_GATEWAY_IDENTITY_SELECT =
  `${AUTH_PHONE_CHALLENGE_GATEWAY_BASE_SELECT}, source_channel, platform_user_id, platform_chat_id, platform_display_name, bridge_token, source_origin, chat_identity_snapshot`;

let authPhoneChallengeGatewayIdentitySchemaAvailable: boolean | null = null;

function isGatewayAuthPhoneChallengeIdentitySchemaError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (!message.includes("auth_phone_challenges")) return false;
  return [
    "source_channel",
    "platform_user_id",
    "platform_chat_id",
    "platform_display_name",
    "bridge_token",
    "source_origin",
    "chat_identity_snapshot",
  ].some((column) => message.includes(column));
}

function canUseGatewayAuthPhoneChallengeIdentitySchema() {
  return authPhoneChallengeGatewayIdentitySchemaAvailable !== false;
}

function markGatewayAuthPhoneChallengeIdentitySchemaAvailable(available: boolean) {
  authPhoneChallengeGatewayIdentitySchemaAvailable = available;
}

function readGatewayChallengeIdentitySnapshot(challenge: AnyRecord | null | undefined) {
  const snapshot =
    challenge?.chat_identity_snapshot && typeof challenge.chat_identity_snapshot === "object"
      ? (challenge.chat_identity_snapshot as AnyRecord)
      : {};
  const requestPayload =
    challenge?.provider_request_payload && typeof challenge.provider_request_payload === "object"
      ? (challenge.provider_request_payload as AnyRecord)
      : {};
  const responsePayload =
    challenge?.provider_response_payload && typeof challenge.provider_response_payload === "object"
      ? (challenge.provider_response_payload as AnyRecord)
      : {};
  const legacySnapshot =
    requestPayload?._challenge_identity && typeof requestPayload._challenge_identity === "object"
      ? (requestPayload._challenge_identity as AnyRecord)
      : responsePayload?._challenge_identity && typeof responsePayload._challenge_identity === "object"
        ? (responsePayload._challenge_identity as AnyRecord)
        : {};

  return {
    sourceChannel: safeString(challenge?.source_channel ?? snapshot.source_channel ?? legacySnapshot.source_channel),
    platformUserId: safeString(challenge?.platform_user_id ?? snapshot.platform_user_id ?? legacySnapshot.platform_user_id),
    platformChatId: safeString(challenge?.platform_chat_id ?? snapshot.platform_chat_id ?? legacySnapshot.platform_chat_id),
    platformDisplayName: safeString(
      challenge?.platform_display_name ?? snapshot.platform_display_name ?? legacySnapshot.platform_display_name,
    ),
    bridgeToken: safeString(challenge?.bridge_token ?? snapshot.bridge_token ?? legacySnapshot.bridge_token),
    sourceOrigin: safeString(challenge?.source_origin ?? snapshot.source_origin ?? legacySnapshot.source_origin),
  };
}

async function findLatestVerifiedChallengeForSender(admin: any, senderId: string) {
  if (!senderId) return null;
  if (canUseGatewayAuthPhoneChallengeIdentitySchema()) {
    try {
      const row =
        (await maybeSingle<AnyRecord>(
          admin
            .from("auth_phone_challenges")
            .select(AUTH_PHONE_CHALLENGE_GATEWAY_IDENTITY_SELECT)
            .eq("status", "verified")
            .or(`platform_user_id.eq.${senderId},platform_chat_id.eq.${senderId}`)
            .order("created_at", { ascending: false })
            .limit(1),
        )) || null;
      markGatewayAuthPhoneChallengeIdentitySchemaAvailable(true);
      if (row) return row;
    } catch (error) {
      if (!isGatewayAuthPhoneChallengeIdentitySchemaError(error)) throw error;
      markGatewayAuthPhoneChallengeIdentitySchemaAvailable(false);
    }
  }

  const rows =
    (
      await admin
        .from("auth_phone_challenges")
        .select(AUTH_PHONE_CHALLENGE_GATEWAY_BASE_SELECT)
        .eq("status", "verified")
        .eq("channel", "zalo_phone_template")
        .order("created_at", { ascending: false })
        .limit(50)
    ).data ?? [];

  for (const row of rows as AnyRecord[]) {
    const identity = readGatewayChallengeIdentitySnapshot(row);
    if (identity.platformUserId === senderId || identity.platformChatId === senderId) {
      return row;
    }
  }

  return null;
}

type GatewayChallengeTruth = {
  verifiedChallenge: AnyRecord | null;
  identity: {
    sourceChannel: string | null;
    platformUserId: string | null;
    platformChatId: string | null;
    platformDisplayName: string | null;
    bridgeToken: string | null;
    sourceOrigin: string | null;
  };
  authUserId: string | null;
  phoneE164: string | null;
  truth: PhoneOnboardingTruth | null;
  senderMatchesIdentity: boolean;
  challengeIdentityKnown: boolean;
  bridgeStatus: string | null;
};

async function readGatewayChallengeTruth(admin: any, senderId: string): Promise<GatewayChallengeTruth> {
  const verifiedChallenge = await findLatestVerifiedChallengeForSender(admin, senderId);
  const identity = readGatewayChallengeIdentitySnapshot(verifiedChallenge);
  const authUserId = safeString(verifiedChallenge?.auth_user_id);
  const phoneE164 = safeString(verifiedChallenge?.phone_e164);
  const senderMatchesIdentity = Boolean(
    senderId && (identity.platformUserId === senderId || identity.platformChatId === senderId),
  );
  const challengeIdentityKnown = Boolean(
    identity.sourceChannel === "zalo" || identity.platformUserId || identity.platformChatId,
  );

  let truth: PhoneOnboardingTruth | null = null;
  if (authUserId && phoneE164) {
    try {
      truth = await readPhoneOnboardingTruth(admin, { authUserId, phoneE164 });
    } catch {
      truth = null;
    }
  }

  return {
    verifiedChallenge,
    identity,
    authUserId,
    phoneE164,
    truth,
    senderMatchesIdentity,
    challengeIdentityKnown,
    bridgeStatus: identity.bridgeToken ? "present" : challengeIdentityKnown ? "missing" : null,
  };
}

async function attemptGatewayAccessRepair(admin: any, senderId: string, preloaded?: GatewayChallengeTruth | null) {
  const gatewayTruth = preloaded || (await readGatewayChallengeTruth(admin, senderId));
  const authUserId = gatewayTruth.authUserId;
  const phoneE164 = gatewayTruth.phoneE164;
  if (!authUserId || !phoneE164) {
    return false;
  }

  try {
    const authLookup = await admin.auth.admin.getUserById(authUserId);
    const authUser = (authLookup.data?.user || null) as AnyRecord | null;
    if (authUser) {
      await resolveCanonicalPortalCustomerForAuthUser(admin, authUser);
    }
  } catch {
    // Reconcile below is the real fix path; auth lookup is only a fast local self-heal.
  }

  try {
    await runPhoneOnboardingAutomationReconcile(admin, {
      scopedAuthUserId: authUserId,
      scopedPhoneE164: phoneE164,
      previewLimit: 1,
    });
    return true;
  } catch {
    return false;
  }
}

async function resolveZaloGatewayAccessInternal(
  admin: any,
  senderId: string,
  allowRepair: boolean,
  repairAttempted = false,
): Promise<GatewayAccess> {
  const [senderUserRow, linkedChannelRow, anyChannelRow, gatewayTruth] = await Promise.all([
    findSenderUser(admin, senderId),
    findChannelAccount(admin, senderId, true),
    findChannelAccount(admin, senderId, false),
    readGatewayChallengeTruth(admin, senderId),
  ]);

  const selectedChannelRow = linkedChannelRow || anyChannelRow;
  const inferredCustomerId =
    Number(linkedChannelRow?.customer_id ?? senderUserRow?.customer_id ?? 0) || null;
  const canonicalCustomerId =
    gatewayTruth.senderMatchesIdentity ? gatewayTruth.truth?.customerId ?? null : null;
  const customerId = canonicalCustomerId ?? inferredCustomerId;
  const senderUserIsZalo =
    (safeString(senderUserRow?.platform) || "").toLowerCase() === "zalo" &&
    Boolean(customerId) &&
    Number(senderUserRow?.customer_id ?? 0) === customerId;
  const inferredLinkedUserId =
    Number(linkedChannelRow?.linked_user_id ?? (senderUserIsZalo ? senderUserRow?.id : 0) ?? 0) || null;
  const linkedUserId = inferredLinkedUserId;

  let context: DashboardContext | null = null;
  try {
    context = await resolveInternalContext(admin, customerId, linkedUserId);
  } catch {
    context = null;
  }

  if (!context && senderUserRow?.id && (!customerId || senderUserIsZalo)) {
    context = {
      customerId: customerId ?? (Number(senderUserRow.customer_id ?? 0) || null),
      linkedUserId: Number(senderUserRow.id),
      userRow: senderUserRow,
      customerRow: null,
    };
  }

  const resolvedCustomerId = context?.customerId ?? customerId;
  const resolvedLinkedUserId = context?.linkedUserId ?? linkedUserId;
  const senderCustomerId = Number(senderUserRow?.customer_id ?? 0) || null;
  const rowBackedLinked =
    Boolean(resolvedCustomerId) &&
    (
      ["linked", "active"].includes((safeString(linkedChannelRow?.link_status) || "").toLowerCase()) ||
      (Boolean(resolvedLinkedUserId) && senderCustomerId === resolvedCustomerId)
    );
  const hasCanonicalTruth = Boolean(gatewayTruth.senderMatchesIdentity && gatewayTruth.truth);
  const linked = hasCanonicalTruth
    ? gatewayTruth.truth?.truthState === "zalo_linked"
    : rowBackedLinked;

  if (!linked && allowRepair) {
    const repaired = await attemptGatewayAccessRepair(admin, senderId, gatewayTruth);
    if (repaired) {
      return resolveZaloGatewayAccessInternal(admin, senderId, false, true);
    }
    repairAttempted = true;
  }

  const truthState = gatewayTruth.truth?.truthState ?? null;
  const repairRequired = gatewayTruth.truth?.repairRequired ?? false;
  const zaloLinkStatus =
    gatewayTruth.truth?.zaloLinkStatus ||
    (linked ? "linked" : safeString(selectedChannelRow?.link_status) || "unlinked");
  const bridgeContextMissingAfterZaloStart = Boolean(
    gatewayTruth.truth?.customerId &&
      gatewayTruth.truth?.phoneVerifiedAt &&
      gatewayTruth.truth?.authLinked &&
      gatewayTruth.truth?.webLinked &&
      !gatewayTruth.challengeIdentityKnown,
  );
  const claimPending =
    !linked &&
    truthState === "customer_linked" &&
    Boolean(gatewayTruth.authUserId) &&
    Boolean(gatewayTruth.phoneE164);
  const blockedReason = linked
    ? null
    : bridgeContextMissingAfterZaloStart
      ? "bridge_context_missing_after_zalo_start"
      : claimPending
        ? "pending_claim"
      : repairRequired
        ? "repair_required"
        : gatewayTruth.truth?.customerId && gatewayTruth.truth?.phoneVerifiedAt
          ? "zalo_link_missing"
          : gatewayTruth.authUserId
            ? "phone_verified_unlinked"
            : "pending_verification";
  const chatLinkStatus = linked
    ? "linked"
    : truthState === "repair_required"
      ? "pending_repair"
      : claimPending
        ? "pending_claim"
      : truthState === "customer_linked"
        ? "pending_auto_link"
        : "pending_verification";

  return {
    senderId,
    senderUserRow,
    channelAccountRow: selectedChannelRow,
    customerId: resolvedCustomerId,
    linkedUserId: resolvedLinkedUserId,
    authUserId: gatewayTruth.authUserId,
    phoneE164: gatewayTruth.phoneE164,
    truthState,
    repairRequired,
    chatLinkStatus,
    zaloLinkStatus,
    bridgeStatus: gatewayTruth.bridgeStatus,
    blockedReason,
    challengeIdentityKnown: gatewayTruth.challengeIdentityKnown,
    repairAttempted,
    linked,
    context,
  };
}

export async function resolveZaloGatewayAccess(admin: any, senderId: string): Promise<GatewayAccess> {
  return resolveZaloGatewayAccessInternal(admin, senderId, true);
}

function buildSenderDisplayName(access: GatewayAccess) {
  const normalizeNameCandidate = (value: unknown) =>
    (safeString(value) || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u0111\u0110]/g, (char) => (char === "\u0111" ? "d" : "D"))
      .replace(/[đ]/g, "d")
      .replace(/[Đ]/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isPlaceholderName = (value: unknown) => {
    const raw = (safeString(value) || "").trim();
    if (!raw) return true;
    if (/^\d+$/.test(raw)) return true;
    if (/^phone\.\d+@/i.test(raw)) return true;
    if (/^phone[._\s-]*\d+/i.test(raw)) return true;
    const normalized = normalizeNameCandidate(raw);
    if (!normalized) return true;
    return (
      normalized === "fixture zalo" ||
      normalized === "zalo fixture" ||
      normalized === "test zalo" ||
      normalized === "test user" ||
      normalized === "demo user" ||
      normalized === "internal test" ||
      normalized.includes("canary") ||
      normalized.includes("fixture") ||
      normalized.includes("sandbox") ||
      normalized.startsWith("phone 84") ||
      normalized.startsWith("phone 0") ||
      normalized.startsWith("phone 9") ||
      normalized === "guest" ||
      normalized === "unknown" ||
      normalized === "user"
    );
  };
  const fullName = [
    safeString(access.senderUserRow?.first_name),
    safeString(access.senderUserRow?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const candidates = [
    safeString(access.context?.customerRow?.full_name),
    safeString(access.context?.userRow?.full_name),
    safeString(access.context?.userRow?.username),
    safeString(access.channelAccountRow?.display_name),
    fullName,
    safeString(access.senderUserRow?.first_name),
    safeString(access.senderUserRow?.username),
  ];
  for (const candidate of candidates) {
    if (!isPlaceholderName(candidate)) {
      return (safeString(candidate) || "").trim();
    }
  }
  return "b\u1ea1n";
}

export async function buildLinkRequiredTextClean(admin: any, access: GatewayAccess) {
  if (
    access.chatLinkStatus === "pending_claim" ||
    access.blockedReason === "pending_claim" ||
    (access.truthState === "customer_linked" && access.authUserId && access.phoneE164)
  ) {
    return [
      "Số điện thoại của bạn đã xác thực rồi.",
      "Hãy confirm lại mã vừa được gửi ở ngay ở trên nhé để mình nối đúng chat này.",
      "Nếu mã đã hết hạn, mở dashboard để gửi lại mã mới.",
    ].join("\n");
  }

  const platformUserId =
    safeString(access.channelAccountRow?.platform_user_id) ||
    safeString(access.senderUserRow?.platform_id) ||
    safeString(access.senderUserRow?.chat_id) ||
    safeString(access.senderId);

  if (!platformUserId) {
    return [
      "\u0110\u1ec3 d\u00f9ng CaloTrack tr\u00ean Zalo, b\u1ea1n c\u1ea7n x\u00e1c th\u1ef1c s\u1ed1 \u0111i\u1ec7n tho\u1ea1i tr\u01b0\u1edbc.",
      "H\u00e3y nh\u1eafn l\u1ea1i 'hi' trong ch\u00ednh chat Zalo n\u00e0y \u0111\u1ec3 h\u1ec7 th\u1ed1ng g\u1eedi link x\u00e1c th\u1ef1c chu\u1ea9n.",
      "N\u1ebfu b\u1ea1n \u0111\u00e3 x\u00e1c th\u1ef1c tr\u00ean web tr\u01b0\u1edbc \u0111\u00f3, dashboard s\u1ebd hi\u1ec7n b\u01b0\u1edbc kh\u1eafc ph\u1ee5c k\u1ebft n\u1ed1i.",
    ].join("\n");
  }

  try {
    const gate = await buildZaloPhoneAuthGateText(admin, {
      platformUserId,
      platformChatId:
        safeString(access.channelAccountRow?.platform_chat_id) ||
        safeString(access.senderUserRow?.chat_id) ||
        null,
      displayName: buildSenderDisplayName(access),
      nextPath: "/dashboard",
    });
    return [
      "Để bắt đầu dùng CaloTrack trên Zalo, bạn cần xác thực số điện thoại trước.",
      `Mở portal: ${gate.portalUrl}`,
      "Xác thực OTP xong hệ thống sẽ mở Pro dùng thử 7 ngày và hướng dẫn bạn confirm lại mã vừa được gửi ở ngay ở trên trong chính chat này.",
    ].join("\n");
  } catch {
    return [
      "\u0110\u1ec3 d\u00f9ng CaloTrack tr\u00ean Zalo, b\u1ea1n c\u1ea7n x\u00e1c th\u1ef1c s\u1ed1 \u0111i\u1ec7n tho\u1ea1i tr\u01b0\u1edbc.",
      "H\u00e3y nh\u1eafn l\u1ea1i 'hi' trong ch\u00ednh chat Zalo n\u00e0y \u0111\u1ec3 h\u1ec7 th\u1ed1ng ph\u00e1t l\u1ea1i link x\u00e1c th\u1ef1c c\u00f3 bridge.",
      "N\u1ebfu Zalo ch\u01b0a v\u00e0o \u0111\u01b0\u1ee3c ngay sau khi x\u00e1c th\u1ef1c, dashboard s\u1ebd hi\u1ec7n b\u01b0\u1edbc kh\u1eafc ph\u1ee5c k\u1ebft n\u1ed1i.",
    ].join("\n");
  }
}

export function buildLogHelpTextClean() {
  return [
    "C\u00e1ch ghi m\u00f3n nhanh:",
    "- /log 2 tr\u1ee9ng lu\u1ed9c",
    "- /log c\u01a1m \u0111\u00f9i g\u00e0",
    "- /ghi b\u1eefa s\u00e1ng: 1 ly whey v\u00e0 1 qu\u1ea3 chu\u1ed1i",
    "",
    "B\u1ea1n c\u0169ng c\u00f3 th\u1ec3 g\u1eedi \u1ea3nh m\u00f3n \u0103n \u0111\u1ec3 m\u00ecnh \u01b0\u1edbc t\u00ednh tr\u01b0\u1edbc r\u1ed3i h\u1ecfi th\u00eam n\u1ebfu c\u1ea7n.",
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

export async function insertExerciseLog(
  admin: any,
  params: {
    userId: number;
    activityName: string;
    caloriesBurned: number;
    dateLocal: string;
  },
) {
  const insert = await admin.from("exercise_logs").insert({
    user_id: params.userId,
    activity_name: params.activityName,
    calories_burned: params.caloriesBurned,
    date: params.dateLocal,
  });
  if (insert.error) throw insert.error;
  await refreshStats(admin, params.userId, params.dateLocal);
}

export async function handleDirectFoodLog(admin: any, access: GatewayAccess, rawText: string, sourceMessageId?: string | null) {
  const normalized = normalizeCommandText(rawText);
  if (!/^(\/)?(log|ghi)\b/.test(normalized)) {
    return null;
  }

  if (!access.linked || !access.context?.userRow?.id) {
    return { handled: true, replyText: await buildLinkRequiredTextClean(admin, access) };
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
  const normalizedSourceMessageId = safeString(sourceMessageId);
  if (normalizedSourceMessageId) {
    const existingMealLog = await readExistingMealLogBySourceMessageId(
      admin,
      Number(access.context.userRow.id),
      "zalo",
      normalizedSourceMessageId,
    );
    if (existingMealLog?.id) {
      return {
        handled: true,
        replyText: "\u0110\u00e3 ghi nh\u1eadn m\u00f3n n\u00e0y tr\u01b0\u1edbc \u0111\u00f3 r\u1ed3i. Nh\u1eafn /stats \u0111\u1ec3 xem l\u1ea1i dashboard h\u00f4m nay.",
      };
    }
  }
  const traceId = `gateway_log:${access.context.userRow.id}:${Date.now()}`;
  let mealLogInsert = await admin
    .from("meal_logs")
    .insert({
      user_id: Number(access.context.userRow.id),
      customer_id: access.context.customerId,
      source_channel: "zalo",
      source_message_id: normalizedSourceMessageId,
      log_mode: "gateway_direct_text",
      logged_at: loggedAt,
      date_local: dateLocal,
      trace_id: traceId,
      compat_food_log_id: null,
    })
    .select("*")
    .limit(1)
    .single();

  if (mealLogInsert.error) {
    if (!isPgUniqueViolation(mealLogInsert.error) || !normalizedSourceMessageId) {
      throw mealLogInsert.error;
    }
    const existingMealLog = await readExistingMealLogBySourceMessageId(
      admin,
      Number(access.context.userRow.id),
      "zalo",
      normalizedSourceMessageId,
    );
    if (existingMealLog?.id) {
      return {
        handled: true,
        replyText: "\u0110\u00e3 ghi nh\u1eadn m\u00f3n n\u00e0y tr\u01b0\u1edbc \u0111\u00f3 r\u1ed3i. Nh\u1eafn /stats \u0111\u1ec3 xem l\u1ea1i dashboard h\u00f4m nay.",
      };
    }
    throw mealLogInsert.error;
  }
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


  const normalizedReplyText = [
    "\u0110\u00e3 ghi m\u00f3n cho b\u1ea1n r\u1ed3i.",
    ...items.map((item) => `- ${item.foodName}: ${item.portionLabel} \u2022 ${formatIntVi(item.calories)} kcal`),
    `- T\u1ed5ng: ${formatIntVi(total.calories)} kcal | P ${formatFloatVi(total.protein)} g | C ${formatFloatVi(total.carbs)} g | F ${formatFloatVi(total.fat)} g`,
    "",
    "Mu\u1ed1n xem l\u1ea1i dashboard h\u00f4m nay th\u00ec nh\u1eafn /stats.",
  ].join("\n");

  return {
    handled: true,
    replyText: normalizedReplyText,
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
  if (/\b(chay bo|jog|run)\b/.test(normalizedText)) return "Ch\u1ea1y b\u1ed9";
  if (/\b(di bo|walk)\b/.test(normalizedText)) return "\u0110i b\u1ed9";
  if (/\b(dap xe|cycling|bike)\b/.test(normalizedText)) return "\u0110\u1ea1p xe";
  if (/\b(tap gym|gym)\b/.test(normalizedText)) return "T\u1eadp gym";
  // Legacy mojibake activity-name fallbacks removed; canonical mappings above are authoritative.
  return null;
}

function parseDirectExerciseCalories(normalizedText: string) {
  const match = normalizedText.match(
    /^\/(?:workout|vandong|tapluyen)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:kcal|cal|calories))?$/,
  );
  const calories = match ? toFiniteNumber(match[1], Number.NaN) : Number.NaN;
  return Number.isFinite(calories) && calories > 0 ? Math.max(1, Math.round(calories)) : null;
}

function estimateExerciseCalories(activityName: string, weightKg: number, durationMinutes: number, distanceKm: number, paceMinPerKm: number) {
  const safeWeight = weightKg > 0 ? weightKg : 70;
  if (activityName === "Ch\u1ea1y b\u1ed9") {
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

  if (activityName === "\u0110i b\u1ed9" && durationMinutes > 0) {
    return Math.max(1, roundNumber((3.5 * 3.5 * safeWeight / 200) * durationMinutes, 0));
  }

  if (activityName === "\u0110\u1ea1p xe" && durationMinutes > 0) {
    return Math.max(1, roundNumber((6.8 * 3.5 * safeWeight / 200) * durationMinutes, 0));
  }

  if (activityName === "T\u1eadp gym" && durationMinutes > 0) {
    return Math.max(1, roundNumber((6.0 * 3.5 * safeWeight / 200) * durationMinutes, 0));
  }

  return 0;
}

export async function handleDirectExerciseLog(admin: any, access: GatewayAccess, rawText: string) {
  const normalized = normalizeCommandText(rawText);
  if (/^\/gym\b/.test(normalized) || /^\/tips\s+gym\b/.test(normalized)) return null;
  const directCalories = parseDirectExerciseCalories(normalized);
  const activityName = normalizeActivityName(normalized);
  if (!activityName && directCalories == null) return null;

  if (!access.linked || !access.context?.userRow?.id) {
    return { handled: true, replyText: await buildLinkRequiredTextClean(admin, access) };
  }

  const durationMinutes = parseDurationMinutes(normalized);
  const paceMinPerKm = parsePaceMinutes(normalized);
  const distanceKm = parseDistanceKm(normalized) || (
    Number.isFinite(durationMinutes) && Number.isFinite(paceMinPerKm) && paceMinPerKm > 0
      ? durationMinutes / paceMinPerKm
      : Number.NaN
  );
  const weightKg = toFiniteNumber(access.context.userRow?.weight_kg, 0);
  const resolvedActivityName = directCalories != null ? "V\u1eadn \u0111\u1ed9ng th\u1ee7 c\u00f4ng" : activityName;
  const calories = directCalories ?? estimateExerciseCalories(
    activityName as string,
    weightKg,
    Number.isFinite(durationMinutes) ? durationMinutes : 0,
    Number.isFinite(distanceKm) ? distanceKm : 0,
    Number.isFinite(paceMinPerKm) ? paceMinPerKm : 0,
  );

  const dateLocal = getSaigonDateKey(new Date());
  await insertExerciseLog(admin, {
    userId: Number(access.context.userRow.id),
    activityName: resolvedActivityName,
    caloriesBurned: calories,
    dateLocal,
  });


  const normalizedReplyText = [
    "\u0110\u00e3 ghi v\u1eadn \u0111\u1ed9ng cho b\u1ea1n r\u1ed3i.",
    `- Ho\u1ea1t \u0111\u1ed9ng: ${resolvedActivityName}`,
    `- Calories \u0111\u1ed1t: ${formatIntVi(calories)} kcal`,
    directCalories == null && Number.isFinite(durationMinutes) ? `- Th\u1eddi l\u01b0\u1ee3ng: ${formatFloatVi(durationMinutes, durationMinutes % 1 === 0 ? 0 : 1)} ph\u00fat` : null,
    directCalories == null && Number.isFinite(paceMinPerKm) ? `- Pace: ${formatFloatVi(paceMinPerKm, 2)} min/km` : null,
    directCalories == null && Number.isFinite(distanceKm) ? `- Qu\u00e3ng \u0111\u01b0\u1eddng: ${formatFloatVi(distanceKm, 2)} km` : null,
    "",
    "Mu\u1ed1n xem l\u1ea1i dashboard h\u00f4m nay th\u00ec nh\u1eafn /stats.",
  ].filter(Boolean).join("\n");

  return {
    handled: true,
    replyText: normalizedReplyText,
  };
}

function normalizeModeGoal(
  normalizedText: string,
): { primaryGoal: PrimaryGoal; goalModeVariant: GoalModeVariant } | null {
  const modeMatch = normalizedText.match(/^\/mode\s+(.+)$/);
  if (!modeMatch) return null;
  const mode = modeMatch[1].trim().replace(/\s+/g, " ");
  const compactMode = mode.replace(/\s+/g, "");
  if (/(giucan|duytri|maintain)/.test(compactMode) || /(giu can|duy tri|maintain)/.test(mode)) {
    return { primaryGoal: "maintain", goalModeVariant: null };
  }
  if (/(giamcan|loseweight|lose)/.test(compactMode) || /(giam can|lose)/.test(mode)) {
    return { primaryGoal: "lose_weight", goalModeVariant: null };
  }
  if (/(tangcogiammo|recompmuscle|musclerecomp)/.test(compactMode) || /(tang co giam mo)/.test(mode)) {
    return { primaryGoal: "muscle_gain", goalModeVariant: "recomp_muscle_bias" };
  }
  if (/(giammotangco|recompfat|fatrecomp)/.test(compactMode) || /(giam mo tang co)/.test(mode)) {
    return { primaryGoal: "fat_loss", goalModeVariant: "recomp_fat_loss_bias" };
  }
  if (/(giammo|fatloss|cut|siet)/.test(compactMode) || /(giam mo|fat loss|cut|siet)/.test(mode)) {
    return { primaryGoal: "fat_loss", goalModeVariant: null };
  }
  if (/(tangco|musclegain|recomp)/.test(compactMode) || /(tang co|muscle gain|recomp)/.test(mode)) {
    return { primaryGoal: "muscle_gain", goalModeVariant: null };
  }
  if (/(tangcan|gainweight|bulk|gain)/.test(compactMode) || /(tang can|bulk|gain)/.test(mode)) {
    return { primaryGoal: "gain_weight", goalModeVariant: null };
  }
  return null;
}

export async function handleDirectGoalMode(admin: any, access: GatewayAccess, rawText: string) {
  const normalized = normalizeCommandText(rawText);
  const goalSelection = normalizeModeGoal(normalized);
  if (!normalized.startsWith("/mode")) return null;

  if (!access.linked || !access.context?.userRow?.id) {
    return { handled: true, replyText: await buildLinkRequiredTextClean(admin, access) };
  }

  if (!goalSelection) {
    return {
      handled: true,
      replyText: [
        "C\u00e1c mode hi\u1ec7n c\u00f3:",
        "- /mode giucan",
        "- /mode giamcan",
        "- /mode giammo",
        "- /mode tangco",
        "- /mode tangcan",
        "- /mode tangcogiammo",
        "- /mode giammotangco",
      ].join("\n"),
    };
    return {
      handled: true,
      replyTextLegacyDebug: [
        "C\u00e1c mode hi\u1ec7n c\u00f3:",
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
  const normalizedReplyText = [
    "\u0110\u00e3 c\u1eadp nh\u1eadt goal mode cho b\u1ea1n.",
    `- Goal mode: ${modeLabel}`,
    `- Daily macro: P ${formatFloatVi(macros.proteinG)} g | C ${formatFloatVi(macros.carbsG)} g | F ${formatFloatVi(macros.fatG)} g`,
    `- Daily goal: ${formatIntVi(dailyGoalKcal)} kcal/ng\u00e0y`,
    `- M\u1ee5c ti\u00eau tu\u1ea7n: ${formatIntVi(weeklyTargetKcal)} kcal | P ${formatFloatVi(macros.proteinG * 7)} g | C ${formatFloatVi(macros.carbsG * 7)} g | F ${formatFloatVi(macros.fatG * 7)} g`,
    weeklyRateKg > 0 ? `- T\u1ed1c \u0111\u1ed9 \u0111ang t\u00ednh: ${formatFloatVi(weeklyRateKg, 2)} kg/tu\u1ea7n` : null,
  ].filter(Boolean).join("\n");
  return {
    handled: true,
    replyText: normalizedReplyText,
    legacyReplyText: normalizedReplyText,
  };
}
