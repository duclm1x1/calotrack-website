import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const INTERNAL_KEY_HEADER = "x-calotrack-internal-key";
const INTERNAL_KEY =
  process.env.CHANNEL_CONTEXT_INTERNAL_KEY ||
  "ctctx_b5d53fa9965845bc9f279d405715b454";
const PORTAL_EMAIL_DEV_BYPASS =
  String(process.env.PORTAL_EMAIL_DEV_BYPASS || "true").toLowerCase() !== "false";

type AnyRecord = Record<string, any>;

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload, jsonReplacer));
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

function extractZaloLinkToken(messageText: string | null): string | null {
  if (!messageText) return null;
  const text = messageText.trim();
  if (!text) return null;

  const directMatch = text.match(/^([A-Za-z0-9]{8}|[A-Za-z0-9]{24,64})$/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const prefixedMatch = text.match(/^\/?link\s+([A-Za-z0-9]{8}|[A-Za-z0-9]{24,64})$/i);
  return prefixedMatch?.[1] || null;
}

function isMissingRpcError(error: AnyRecord | null | undefined, functionName: string) {
  const code = safeString(error?.code)?.toUpperCase();
  const haystack = [safeString(error?.message), safeString(error?.details), safeString(error?.hint)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return code === "PGRST202" && haystack.includes(functionName.toLowerCase());
}

function normalizeRpcError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack || null,
    };
  }

  if (error && typeof error === "object") {
    const record = error as AnyRecord;
    const message =
      safeString(record.message) ||
      safeString(record.details) ||
      safeString(record.hint) ||
      safeString(record.error_description) ||
      null;

    return {
      message: message || JSON.stringify(record, jsonReplacer),
      name: safeString(record.name) || "UnknownObjectError",
      stack: null,
      code: safeString(record.code),
      details: safeString(record.details),
      hint: safeString(record.hint),
    };
  }

  return {
    message: safeString(error) || "Unknown resolver error",
    name: "UnknownThrownValue",
    stack: null,
  };
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

function normalizeAccessState(value: unknown): string {
  return safeString(value)?.toLowerCase() || "pending_verification";
}

function canUseChatFeatures(accessState: string, isPremium: boolean): boolean {
  if (isPremium) return true;
  return accessState === "trialing" || accessState === "free_limited" || accessState === "active_paid";
}

function hasActiveTrialWindow(value: unknown): boolean {
  const iso = safeString(value);
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp > Date.now() : false;
}

function deriveEffectiveAccessState(params: {
  accessState: string;
  entitlementSource: string | null;
  trialEndsAt: string | null;
  isPremium: boolean;
  emailDevBypassEligible: boolean;
}) {
  if (params.isPremium || params.accessState === "active_paid" || params.accessState === "blocked") {
    return params.isPremium && params.accessState === "pending_verification" ? "active_paid" : params.accessState;
  }

  if (!params.emailDevBypassEligible) {
    return params.accessState;
  }

  if (safeString(params.entitlementSource)?.toLowerCase() !== "email_dev_trial") {
    return params.accessState;
  }

  return hasActiveTrialWindow(params.trialEndsAt) ? "trialing" : "free_limited";
}

function preferString(...values: unknown[]): string | null {
  for (let index = 0; index < values.length; index += 1) {
    const value = safeString(values[index]);
    if (value) return value;
  }
  return null;
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

function buildChannelDisplayName(params: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  fallback?: string | null;
}) {
  const fullName = [params.firstName, params.lastName].filter(Boolean).join(" ").trim();
  return preferString(fullName, params.username, params.fallback) || null;
}

async function consumeZaloLinkTokenFallback(params: {
  supabase: any;
  linkToken: string;
  platformUserId: string;
  platformChatId: string | null;
  compatUserId: number | null;
  displayName: string | null;
  phoneClaimed: string | null;
}) {
  const lookup = safeString(params.linkToken)?.toUpperCase();
  if (!lookup) {
    return { status: "token_missing" };
  }

  const { data: tokenRows, error: tokenError } = await params.supabase
    .from("channel_link_tokens")
    .select("id, customer_id, channel, link_token, status, expires_at, used_at, created_at")
    .eq("channel", "zalo")
    .order("created_at", { ascending: false })
    .limit(200);

  if (tokenError) throw tokenError;

  const token =
    (tokenRows || []).find((row: AnyRecord) => {
      const tokenValue = safeString(row.link_token);
      if (!tokenValue) return false;
      return tokenValue.toLowerCase() === lookup.toLowerCase() || tokenValue.slice(0, 8).toUpperCase() === lookup;
    }) || null;

  if (!token) {
    return { status: "token_not_found" };
  }

  if (safeString(token.status) !== "active") {
    return { status: "token_not_active" };
  }

  const expiresAt = safeString(token.expires_at);
  if (expiresAt) {
    const expiresTimestamp = Date.parse(expiresAt);
    if (Number.isFinite(expiresTimestamp) && expiresTimestamp <= Date.now()) {
      await params.supabase
        .from("channel_link_tokens")
        .update({ status: "expired" })
        .eq("id", token.id);

      return { status: "token_expired" };
    }
  }

  const customer = await maybeSingle<AnyRecord>(
    params.supabase
      .from("customers")
      .select("*")
      .eq("id", token.customer_id)
      .limit(1),
  );

  if (!customer?.id) {
    return { status: "customer_missing" };
  }

  const existingChannel =
    (await maybeSingle<AnyRecord>(
      params.supabase
        .from("customer_channel_accounts")
        .select("id, customer_id, linked_user_id, channel, platform_user_id, platform_chat_id, display_name, link_status")
        .eq("channel", "zalo")
        .eq("platform_user_id", params.platformUserId)
        .limit(1),
    )) || null;

  if (
    existingChannel?.id &&
    existingChannel.customer_id != null &&
    Number(existingChannel.customer_id) !== Number(customer.id)
  ) {
    return {
      status: "needs_support",
      reason: "zalo_already_linked",
      customer_id: existingChannel.customer_id,
    };
  }

  const nextDisplayName = safeString(params.displayName);
  const phoneClaimed = safeString(params.phoneClaimed);

  if (params.compatUserId) {
    const { error } = await params.supabase
      .from("users")
      .update({
        first_name: nextDisplayName,
        plan: customer.plan || "free",
        premium_until: customer.premium_until || null,
        is_active: true,
        is_banned: false,
        customer_id: customer.id,
      })
      .eq("id", params.compatUserId);

    if (error) throw error;
  }

  const { error: upsertChannelError } = await params.supabase
    .from("customer_channel_accounts")
    .upsert(
      {
        customer_id: customer.id,
        channel: "zalo",
        platform_user_id: params.platformUserId,
        platform_chat_id: params.platformChatId,
        linked_user_id: params.compatUserId,
        display_name: nextDisplayName,
        phone_claimed: phoneClaimed,
        phone_claimed_e164: null,
        link_status: "linked",
      },
      {
        onConflict: "channel,platform_user_id",
      },
    );

  if (upsertChannelError) throw upsertChannelError;

  const { error: tokenUpdateError } = await params.supabase
    .from("channel_link_tokens")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
    })
    .eq("id", token.id);

  if (tokenUpdateError) throw tokenUpdateError;

  const { error: syncError } = await params.supabase.rpc("sync_customer_to_compat_users", {
    p_customer_id: customer.id,
  });

  if (syncError) throw syncError;

  return {
    status: "linked",
    customer_id: customer.id,
    linked_user_id: params.compatUserId,
    link_code: safeString(token.link_token)?.slice(0, 8).toUpperCase() || null,
    helper_text: "Da lien ket Zalo vao account thanh cong.",
  };
}

function mergeRuntimeContext(params: {
  channel: "telegram" | "zalo";
  user: AnyRecord | null;
  customer: AnyRecord | null;
  channelAccount: AnyRecord | null;
  linkResult: AnyRecord | null;
  hasWebAuthLink: boolean;
  emailDevBypassEligible: boolean;
  accessState: string;
  phoneVerified: boolean;
  phoneVerifiedEffective: boolean;
  allowFeatureAccess: boolean;
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
    phone_verified_at: customer?.phone_verified_at || null,
    trial_ends_at: customer?.trial_ends_at ?? user.trial_ends_at ?? null,
    access_state: params.accessState,
    phone_verified: params.phoneVerified,
    phone_verified_effective: params.phoneVerifiedEffective,
    needs_onboarding: user?.onboarding_complete === false,
    fallback_reason: safeString(params.linkResult?.reason) || null,
    context_degraded: false,
    entitlement_source: customer?.entitlement_source || user.entitlement_source || null,
    has_web_auth_link: params.hasWebAuthLink,
    email_dev_bypass_eligible: params.emailDevBypassEligible,
    allow_feature_access: params.allowFeatureAccess,
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
    const telegramLinkToken = channel === "telegram" ? extractTelegramLinkToken(messageText) : null;
    const zaloLinkToken = channel === "zalo" ? extractZaloLinkToken(messageText) : null;

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

    if (telegramLinkToken) {
      const { data, error } = await supabase.rpc("consume_telegram_link_token", {
          p_link_token: telegramLinkToken,
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

    if (zaloLinkToken) {
      const displayName = buildChannelDisplayName({
        firstName,
        lastName,
        username,
        fallback: channelAccount?.display_name || null,
      });

      const { data, error } = await supabase.rpc("consume_zalo_link_token", {
        p_link_token: zaloLinkToken,
        p_platform_user_id: platformUserId,
        p_compat_user_id: user.id,
        p_display_name: displayName,
        p_phone_claimed: null,
      });

      if (error) {
        if (!isMissingRpcError(error, "consume_zalo_link_token")) {
          throw error;
        }

        linkResult = await consumeZaloLinkTokenFallback({
          supabase,
          linkToken: zaloLinkToken,
          platformUserId,
          platformChatId,
          compatUserId: Number(user.id) || null,
          displayName,
          phoneClaimed: null,
        });
      } else {
        linkResult = (data as AnyRecord) || null;
      }

      channelAccount =
        (await maybeSingle<AnyRecord>(
          supabase
            .from("customer_channel_accounts")
            .select("id,customer_id,linked_user_id,channel,platform_user_id,platform_chat_id,display_name,link_status,phone_claimed,phone_claimed_e164")
            .eq("channel", channel)
            .eq("platform_user_id", platformUserId)
            .limit(1),
        )) || channelAccount;

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

    const derivedCustomerId =
      (typeof channelAccount?.customer_id === "number" ? channelAccount.customer_id : null) ||
      (typeof user.customer_id === "number" ? user.customer_id : null) ||
      (Number.parseInt(String(channelAccount?.customer_id || user.customer_id || ""), 10) || null);

    const nextDisplayName = buildChannelDisplayName({
      firstName,
      lastName,
      username,
      fallback: channelAccount?.display_name || null,
    });

    if (!channelAccount) {
      const { data, error } = await supabase
        .from("customer_channel_accounts")
        .upsert(
          {
            customer_id: derivedCustomerId,
            channel,
            platform_user_id: platformUserId,
            platform_chat_id: platformChatId,
            linked_user_id: user.id,
            display_name: nextDisplayName,
            link_status: derivedCustomerId ? "linked" : "pending_review",
          },
          {
            onConflict: "channel,platform_user_id",
          },
        )
        .select(
          "id,customer_id,linked_user_id,channel,platform_user_id,platform_chat_id,display_name,link_status,phone_claimed,phone_claimed_e164",
        )
        .limit(1)
        .single();

      if (error) throw error;
      channelAccount = data as AnyRecord;
    } else {
      const nextChatId = preferString(platformChatId, channelAccount.platform_chat_id);
      const shouldRefreshChannelAccount =
        channelAccount.linked_user_id !== user.id ||
        channelAccount.platform_chat_id !== nextChatId ||
        channelAccount.display_name !== nextDisplayName;

      if (shouldRefreshChannelAccount) {
        const { data, error } = await supabase
          .from("customer_channel_accounts")
          .update({
            linked_user_id: user.id,
            platform_chat_id: nextChatId,
            display_name: nextDisplayName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", channelAccount.id)
          .select(
            "id,customer_id,linked_user_id,channel,platform_user_id,platform_chat_id,display_name,link_status,phone_claimed,phone_claimed_e164",
          )
          .limit(1)
          .single();

        if (!error && data) {
          channelAccount = data as AnyRecord;
        }
      }
    }

    if (channelAccount?.id && channelAccount?.linked_user_id !== user.id) {
      const { error } = await supabase
        .from("customer_channel_accounts")
        .update({
          linked_user_id: user.id,
          display_name: nextDisplayName,
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
          .select("id,phone_e164,phone_display,full_name,plan,premium_until,entitlement_source,status,access_state,phone_verified_at,trial_ends_at")
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

    let hasWebAuthLink = false;
    if (customerId) {
      const { count, error } = await supabase
        .from("customer_auth_links")
        .select("auth_user_id", { head: true, count: "exact" })
        .eq("customer_id", customerId)
        .eq("link_status", "linked");
      if (error) throw error;
      hasWebAuthLink = (count ?? 0) > 0;
    }

    const emailDevBypassEligible = Boolean(customerId && hasWebAuthLink && PORTAL_EMAIL_DEV_BYPASS);
    const rawAccessState = normalizeAccessState(customer?.access_state ?? user.access_state);
    const phoneVerified = Boolean(safeString(customer?.phone_verified_at));
    const canonicalPlan = customer?.plan || user.plan || "free";
    const canonicalPremiumUntil = customer?.premium_until ?? user.premium_until ?? null;
    const runtimeIsPremium = computeIsPremium(canonicalPlan, canonicalPremiumUntil);
    const accessState = deriveEffectiveAccessState({
      accessState: rawAccessState,
      entitlementSource: safeString(customer?.entitlement_source ?? user.entitlement_source),
      trialEndsAt: safeString(customer?.trial_ends_at ?? user.trial_ends_at),
      isPremium: runtimeIsPremium,
      emailDevBypassEligible,
    });
    const phoneVerifiedEffective = phoneVerified || emailDevBypassEligible;
    const allowFeatureAccess = Boolean(
      customerId &&
        phoneVerifiedEffective &&
        canUseChatFeatures(accessState, runtimeIsPremium),
    );

    const payload = mergeRuntimeContext({
      channel,
      user,
      customer,
      channelAccount,
      linkResult,
      hasWebAuthLink,
      emailDevBypassEligible,
      accessState,
      phoneVerified,
      phoneVerifiedEffective,
      allowFeatureAccess,
      platformUserId,
      platformChatId,
      username,
      firstName,
      lastName,
      languageCode,
    });

    sendJson(res, 200, payload);
  } catch (error) {
    const normalized = normalizeRpcError(error);
    sendJson(res, 500, {
      ok: false,
      error: "resolve_channel_context_failed",
      message: normalized.message,
      details: normalized,
    });
  }
}
