import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const INTERNAL_KEY_HEADER = "x-calotrack-internal-key";
const INTERNAL_KEY =
  process.env.CHANNEL_CONTEXT_INTERNAL_KEY ||
  "ctctx_b5d53fa9965845bc9f279d405715b454";

type AnyRecord = Record<string, any>;

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req: any): Promise<AnyRecord> {
  if (req.body && typeof req.body === "object") {
    return req.body as AnyRecord;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeChannel(value: unknown): "telegram" | "zalo" | null {
  const text = safeString(value)?.toLowerCase();
  if (text === "telegram" || text === "zalo") return text;
  return null;
}

function extractTelegramLinkToken(messageText: string | null): string | null {
  if (!messageText) return null;
  const match = messageText.match(/^\/start\s+([A-Za-z0-9]+)\b/i);
  return match?.[1] || null;
}

function computeIsPremium(plan: string | null | undefined, premiumUntil: string | null | undefined): boolean {
  const normalized = safeString(plan)?.toLowerCase();
  if (normalized === "lifetime") return true;
  if (normalized !== "pro") return false;

  const until = safeString(premiumUntil);
  if (!until) return true;
  const timestamp = Date.parse(until);
  return Number.isFinite(timestamp) ? timestamp > Date.now() : true;
}

function preferString() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = safeString(arguments[index]);
    if (value) return value;
  }
  return null;
}

async function maybeSingle<T>(promise: Promise<{ data: T[] | T | null; error: any }>): Promise<T | null> {
  const { data, error } = await promise;
  if (error) throw error;
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as T) || null;
  return data as T;
}

function buildCompatUserPayload(params: {
  channel: "telegram" | "zalo";
  platformUserId: string;
  platformChatId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  customerId: number | null;
}) {
  const payload: AnyRecord = {
    platform: params.channel,
    platform_id: params.platformUserId,
    chat_id: params.platformChatId,
    username: params.username || "",
    first_name: params.firstName || "",
    last_name: params.lastName || "",
    onboarding_complete: false,
    onboarding_step: 0,
    pending_intent: null,
    daily_calorie_goal: null,
    bmr: null,
    tdee: null,
    is_active: true,
  };

  if (params.customerId) {
    payload.customer_id = params.customerId;
  }

  if (params.languageCode) {
    payload.language = params.languageCode;
  }

  return payload;
}

function mergeRuntimeContext(params: {
  channel: "telegram" | "zalo";
  user: AnyRecord | null;
  customer: AnyRecord | null;
  channelAccount: AnyRecord | null;
  linkResult: AnyRecord | null;
  platformUserId: string;
  platformChatId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
}) {
  const user = params.user || {};
  const customer = params.customer || null;
  const channelAccount = params.channelAccount || null;
  const canonicalPlan = customer?.plan || user.plan || "free";
  const canonicalPremiumUntil = customer?.premium_until ?? user.premium_until ?? null;
  const runtimeIsPremium = computeIsPremium(canonicalPlan, canonicalPremiumUntil);

  return {
    ...user,
    platform: params.channel,
    platform_id: preferString(user.platform_id, params.platformUserId),
    chat_id: preferString(user.chat_id, params.platformChatId),
    username: preferString(user.username, params.username) || "",
    first_name: preferString(user.first_name, params.firstName) || "",
    last_name: preferString(user.last_name, params.lastName) || "",
    language: preferString(user.language, params.languageCode),
    language_code: preferString(user.language_code, params.languageCode),
    customer_id: customer?.id ?? user.customer_id ?? channelAccount?.customer_id ?? null,
    channel_account_id: channelAccount?.id ?? null,
    link_status: channelAccount?.link_status || null,
    customer_phone_e164: customer?.phone_e164 || null,
    customer_phone_display: customer?.phone_display || null,
    customer_plan: customer?.plan || null,
    customer_status: customer?.status || null,
    entitlement_source: customer?.entitlement_source || user.entitlement_source || null,
    plan: canonicalPlan,
    premium_until: canonicalPremiumUntil,
    is_premium: runtimeIsPremium,
    entitlement_active: canonicalPlan === "free" ? true : runtimeIsPremium,
    source_of_truth: customer ? "customer" : user?.id ? "legacy_user" : "guest",
    link_result: params.linkResult || {},
  };
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

  if (safeString(req.headers?.[INTERNAL_KEY_HEADER]) !== INTERNAL_KEY) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, {
      ok: false,
      error: "supabase_runtime_config_missing",
    });
    return;
  }

  try {
    const body = await readBody(req);
    const channel = normalizeChannel(body.channel);
    const platformUserId = safeString(body.platform_user_id || body.platformUserId || body.user_id);
    const platformChatId = preferString(body.platform_chat_id, body.platformChatId, body.chat_id);
    const username = safeString(body.username);
    const firstName = safeString(body.first_name || body.firstName);
    const lastName = safeString(body.last_name || body.lastName);
    const languageCode = safeString(body.language_code || body.languageCode || body.language);
    const messageText = safeString(body.message_text || body.messageText || body.text);

    if (!channel || !platformUserId) {
      sendJson(res, 400, {
        ok: false,
        error: "invalid_request",
        details: "channel and platform_user_id are required",
      });
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let linkResult: AnyRecord | null = null;

    if (channel === "telegram") {
      const linkToken = extractTelegramLinkToken(messageText);
      if (linkToken) {
        const { data, error } = await supabase.rpc("consume_telegram_link_token", {
          p_token: linkToken,
          p_platform_user_id: platformUserId,
          p_chat_id: platformChatId,
          p_username: username,
          p_first_name: firstName,
          p_last_name: lastName,
          p_language_code: languageCode,
        });
        if (error) throw error;
        linkResult = (data as AnyRecord) || null;
      }
    }

    let user = await maybeSingle<AnyRecord>(
      supabase
        .from("users")
        .select("*")
        .eq("platform", channel)
        .eq("platform_id", platformUserId)
        .limit(1),
    );

    if (!user && platformChatId) {
      user = await maybeSingle<AnyRecord>(
        supabase
          .from("users")
          .select("*")
          .eq("platform", channel)
          .eq("chat_id", platformChatId)
          .limit(1),
      );
    }

    let channelAccount =
      (await maybeSingle<AnyRecord>(
        supabase
          .from("customer_channel_accounts")
          .select("id,customer_id,linked_user_id,channel,platform_user_id,platform_chat_id,display_name,link_status,phone_claimed,phone_claimed_e164")
          .eq("channel", channel)
          .eq("platform_user_id", platformUserId)
          .limit(1),
      )) || null;

    if (!channelAccount && platformChatId) {
      channelAccount =
        (await maybeSingle<AnyRecord>(
          supabase
            .from("customer_channel_accounts")
            .select("id,customer_id,linked_user_id,channel,platform_user_id,platform_chat_id,display_name,link_status,phone_claimed,phone_claimed_e164")
            .eq("channel", channel)
            .eq("platform_chat_id", platformChatId)
            .limit(1),
        )) || null;
    }

    if (!user) {
      const customerId =
        typeof channelAccount?.customer_id === "number"
          ? channelAccount.customer_id
          : Number.parseInt(String(channelAccount?.customer_id || ""), 10) || null;

      const { data, error } = await supabase
        .from("users")
        .insert(buildCompatUserPayload({
          channel,
          platformUserId,
          platformChatId,
          username,
          firstName,
          lastName,
          languageCode,
          customerId,
        }))
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;
      user = data as AnyRecord;
    }

    if (channelAccount?.linked_user_id !== user.id) {
      const { error } = await supabase
        .from("customer_channel_accounts")
        .update({
          linked_user_id: user.id,
          display_name:
            channelAccount?.display_name ||
            [firstName, lastName].filter(Boolean).join(" ").trim() ||
            username ||
            channelAccount?.display_name ||
            null,
        })
        .eq("id", channelAccount.id);
      if (!error) {
        channelAccount = {
          ...channelAccount,
          linked_user_id: user.id,
        };
      }
    }

    if (channelAccount?.customer_id && user.customer_id !== channelAccount.customer_id) {
      const { error } = await supabase
        .from("users")
        .update({ customer_id: channelAccount.customer_id })
        .eq("id", user.id);
      if (error) throw error;
      user = {
        ...user,
        customer_id: channelAccount.customer_id,
      };
    }

    const customerId =
      (typeof channelAccount?.customer_id === "number" ? channelAccount.customer_id : null) ||
      (typeof user.customer_id === "number" ? user.customer_id : null) ||
      (Number.parseInt(String(channelAccount?.customer_id || user.customer_id || ""), 10) || null);

    let customer: AnyRecord | null = null;
    if (customerId) {
      customer = await maybeSingle<AnyRecord>(
        supabase
          .from("customers")
          .select("id,phone_e164,phone_display,full_name,plan,premium_until,entitlement_source,status")
          .eq("id", customerId)
          .limit(1),
      );

      const { error } = await supabase.rpc("sync_customer_to_compat_users", {
        p_customer_id: customerId,
      });
      if (error) throw error;

      const refreshedUser = await maybeSingle<AnyRecord>(
        supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .limit(1),
      );
      if (refreshedUser) {
        user = refreshedUser;
      }
    }

    const payload = mergeRuntimeContext({
      channel,
      user,
      customer,
      channelAccount,
      linkResult,
      platformUserId,
      platformChatId,
      username,
      firstName,
      lastName,
      languageCode,
    });

    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: "resolve_channel_context_failed",
      message: error instanceof Error ? error.message : "Unknown resolver error",
    });
  }
}
