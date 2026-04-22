import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { maybeSingle, safeString } from "./adminServer.js";
import { readLatestPortalSiteSettings } from "./portalSiteConfigServer.js";

type AnyRecord = Record<string, unknown>;

type ZaloAuthBridgePayload = {
  v: 1;
  channel: "zalo";
  uid: string;
  cid: string | null;
  dn: string | null;
  exp: number;
  nonce: string;
};

const DEFAULT_BRIDGE_TTL_MINUTES = 30;
const DEFAULT_SITE_URL = "https://calotrack-website.vercel.app";
const DEFAULT_BRIDGE_SECRET = "ct_bridge_f0f49b954f73482fb8e61e3322d4900f";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildSiteOrigin(value: string | null) {
  return trimTrailingSlash(value || DEFAULT_SITE_URL);
}

function getBridgeSecret() {
  return (
    safeString(process.env.CHANNEL_CONTEXT_INTERNAL_KEY) ||
    safeString(process.env.ZALO_OA_INTERNAL_KEY) ||
    DEFAULT_BRIDGE_SECRET
  );
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function signBridgePayload(encodedPayload: string) {
  return toBase64Url(createHmac("sha256", getBridgeSecret()).update(encodedPayload).digest());
}

function encodeZaloAuthBridgeToken(payload: ZaloAuthBridgePayload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signBridgePayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readZaloAuthBridgeToken(token: string | null | undefined): ZaloAuthBridgePayload | null {
  const raw = safeString(token);
  if (!raw) return null;

  const [encodedPayload, encodedSignature] = raw.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = signBridgePayload(encodedPayload);
  const provided = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as Partial<ZaloAuthBridgePayload>;
    if (
      payload?.v !== 1 ||
      payload?.channel !== "zalo" ||
      !safeString(payload.uid) ||
      !Number.isFinite(Number(payload.exp))
    ) {
      return null;
    }

    return {
      v: 1,
      channel: "zalo",
      uid: safeString(payload.uid) || "",
      cid: safeString(payload.cid),
      dn: safeString(payload.dn),
      exp: Number(payload.exp),
      nonce: safeString(payload.nonce) || "",
    };
  } catch {
    return null;
  }
}

export async function createOrReuseZaloAuthBridge(
  _admin: any,
  params: {
    platformUserId: string;
    platformChatId?: string | null;
    displayName?: string | null;
    ttlMinutes?: number;
  },
) {
  const ttlMinutes =
    Number.isFinite(Number(params.ttlMinutes)) && Number(params.ttlMinutes) > 0
      ? Number(params.ttlMinutes)
      : DEFAULT_BRIDGE_TTL_MINUTES;
  const platformUserId = safeString(params.platformUserId);
  const platformChatId = safeString(params.platformChatId) || platformUserId;
  const displayName = safeString(params.displayName);

  if (!platformUserId) {
    throw new Error("platform_user_id_required");
  }

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const bridgeToken = encodeZaloAuthBridgeToken({
    v: 1,
    channel: "zalo",
    uid: platformUserId,
    cid: platformChatId,
    dn: displayName,
    exp: expiresAt.getTime(),
    nonce: randomBytes(8).toString("hex"),
  });

  return {
    bridgeToken,
    expiresAt: expiresAt.toISOString(),
    reused: false,
  };
}

export async function buildZaloPhoneAuthPortalUrl(
  admin: any,
  params: {
    bridgeToken: string;
    nextPath?: string | null;
  },
) {
  const bridgeToken = safeString(params.bridgeToken);
  if (!bridgeToken) {
    throw new Error("bridge_token_required");
  }

  let siteUrl = DEFAULT_SITE_URL;
  try {
    const portalConfig = await readLatestPortalSiteSettings(admin);
    siteUrl = safeString(portalConfig.settings?.siteUrl) || siteUrl;
  } catch {
    siteUrl = DEFAULT_SITE_URL;
  }

  const loginUrl = new URL(`${buildSiteOrigin(siteUrl)}/login`);
  loginUrl.searchParams.set("bridge", bridgeToken);
  loginUrl.searchParams.set("channel", "zalo");
  loginUrl.searchParams.set("next", safeString(params.nextPath) || "/dashboard");
  return loginUrl.toString();
}

export async function buildZaloPhoneAuthGateText(
  admin: any,
  params: {
    platformUserId: string;
    platformChatId?: string | null;
    displayName?: string | null;
    nextPath?: string | null;
  },
) {
  const bridge = await createOrReuseZaloAuthBridge(admin, params);
  const portalUrl = await buildZaloPhoneAuthPortalUrl(admin, {
    bridgeToken: bridge.bridgeToken || "",
    nextPath: params.nextPath,
  });

  return {
    bridgeToken: bridge.bridgeToken,
    expiresAt: bridge.expiresAt,
    reused: bridge.reused,
    portalUrl,
    replyText: [
      "Để bắt đầu dùng CaloTrack trên Zalo, bạn cần xác thực số điện thoại trước.",
      `Mở portal: ${portalUrl}`,
      "Xác thực OTP xong hệ thống sẽ tự nối chính chat này, mở trial 7 ngày và bạn có thể dùng ngay trên Zalo.",
    ].join("\n"),
  };
}

async function findCompatUsersForBridge(admin: any, platformUserId: string, platformChatId: string | null) {
  const canonicalUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("id, platform_id, chat_id, first_name, customer_id")
        .eq("platform", "zalo")
        .eq("platform_id", platformUserId)
        .limit(1),
    )) || null;

  if (!platformChatId || platformChatId === platformUserId) {
    return {
      canonicalUser,
      aliasUser: null,
    };
  }

  let aliasUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("id, platform_id, chat_id, first_name, customer_id")
        .eq("platform", "zalo")
        .eq("platform_id", platformChatId)
        .limit(1),
    )) || null;

  if (!aliasUser?.id) {
    aliasUser =
      (await maybeSingle<AnyRecord>(
        admin
          .from("users")
          .select("id, platform_id, chat_id, first_name, customer_id")
          .eq("platform", "zalo")
          .eq("chat_id", platformChatId)
          .limit(1),
      )) || null;
  }

  if (aliasUser?.id && canonicalUser?.id && Number(aliasUser.id) === Number(canonicalUser.id)) {
    aliasUser = null;
  }

  return {
    canonicalUser,
    aliasUser,
  };
}

export async function autoLinkZaloBridgeToCustomer(
  admin: any,
  bridgeToken: string | null | undefined,
  params: {
    customerId: number;
    phoneE164: string;
    phoneDisplay?: string | null;
    plan?: string | null;
    premiumUntil?: string | null;
  },
) {
  const payload = readZaloAuthBridgeToken(bridgeToken);
  if (!payload) {
    return {
      status: "invalid",
      customerId: params.customerId,
      linkedUserId: null,
      linkedChannelCount: 0,
      zaloLinkStatus: "unlinked",
    };
  }

  if (payload.exp <= Date.now()) {
    return {
      status: "expired",
      customerId: params.customerId,
      linkedUserId: null,
      linkedChannelCount: 0,
      zaloLinkStatus: "expired",
    };
  }

  const customer =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("id, plan, premium_until")
        .eq("id", params.customerId)
        .limit(1),
    )) || null;

  if (!customer?.id) {
    throw new Error("customer_not_found");
  }

  const platformUserId = payload.uid;
  const platformChatId = payload.cid || payload.uid;
  const displayName = payload.dn || null;

  const existingChannel =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_channel_accounts")
        .select("id, customer_id, linked_user_id, link_status")
        .eq("channel", "zalo")
        .eq("platform_user_id", platformUserId)
        .limit(1),
    )) || null;

  if (
    existingChannel?.id &&
    Number(existingChannel.customer_id ?? 0) > 0 &&
    Number(existingChannel.customer_id) !== params.customerId
  ) {
    return {
      status: "conflict",
      customerId: params.customerId,
      linkedUserId: Number(existingChannel.linked_user_id ?? 0) || null,
      linkedChannelCount: 0,
      zaloLinkStatus: safeString(existingChannel.link_status) || "needs_support",
    };
  }

  const existingAliasChannel =
    platformChatId && platformChatId !== platformUserId
      ? (
          (await maybeSingle<AnyRecord>(
            admin
              .from("customer_channel_accounts")
              .select("id, customer_id, linked_user_id, link_status")
              .eq("channel", "zalo")
              .eq("platform_user_id", platformChatId)
              .limit(1),
          )) || null
        )
      : null;

  if (
    existingAliasChannel?.id &&
    Number(existingAliasChannel.customer_id ?? 0) > 0 &&
    Number(existingAliasChannel.customer_id) !== params.customerId
  ) {
    return {
      status: "conflict",
      customerId: params.customerId,
      linkedUserId: Number(existingAliasChannel.linked_user_id ?? 0) || null,
      linkedChannelCount: 0,
      zaloLinkStatus: safeString(existingAliasChannel.link_status) || "needs_support",
    };
  }

  const { canonicalUser, aliasUser } = await findCompatUsersForBridge(admin, platformUserId, platformChatId);
  let compatUser = canonicalUser || aliasUser || null;
  const keepCanonicalChatId =
    Boolean(canonicalUser?.id && aliasUser?.id && Number(canonicalUser.id) !== Number(aliasUser.id));
  const canonicalChatId = safeString(canonicalUser?.chat_id) || safeString(canonicalUser?.platform_id) || platformUserId;

  if (!compatUser?.id) {
    const { data, error } = await admin
      .from("users")
      .insert({
        username: "",
        first_name: displayName || "",
        last_name: "",
        language: "vi",
        platform: "zalo",
        platform_id: platformUserId,
        chat_id: platformChatId,
        onboarding_complete: false,
        onboarding_step: 0,
        pending_intent: null,
        daily_calorie_goal: null,
        bmr: null,
        tdee: null,
        is_active: true,
        is_banned: false,
        plan: safeString(customer.plan) || safeString(params.plan) || "free",
        premium_until: safeString(customer.premium_until) || safeString(params.premiumUntil),
        customer_id: params.customerId,
      })
      .select("id, platform_id, chat_id, first_name, customer_id")
      .limit(1)
      .single();

    if (error) throw error;
    compatUser = data as AnyRecord;
  } else {
    const nextChatId =
      keepCanonicalChatId && canonicalUser?.id && Number(compatUser.id) === Number(canonicalUser.id)
        ? canonicalChatId
        : platformChatId;
    const compatUpdate: Record<string, unknown> = {
      first_name: safeString(compatUser.first_name) || displayName || "",
      is_active: true,
      is_banned: false,
      plan: safeString(customer.plan) || safeString(params.plan) || "free",
      premium_until: safeString(customer.premium_until) || safeString(params.premiumUntil),
      customer_id: params.customerId,
    };

    if (nextChatId && safeString(compatUser.chat_id) !== nextChatId) {
      compatUpdate.chat_id = nextChatId;
    }

    const { error } = await admin
      .from("users")
      .update(compatUpdate)
      .eq("id", compatUser.id);

    if (error) throw error;
  }

  if (aliasUser?.id && canonicalUser?.id && Number(aliasUser.id) !== Number(canonicalUser.id)) {
    const aliasUpdate: Record<string, unknown> = {
      first_name: safeString(aliasUser.first_name) || displayName || "",
      is_active: true,
      is_banned: false,
      plan: safeString(customer.plan) || safeString(params.plan) || "free",
      premium_until: safeString(customer.premium_until) || safeString(params.premiumUntil),
      customer_id: params.customerId,
    };

    if (!safeString(aliasUser.chat_id) && platformChatId) {
      aliasUpdate.chat_id = platformChatId;
    }

    const { error: aliasError } = await admin
      .from("users")
      .update(aliasUpdate)
      .eq("id", aliasUser.id);

    if (aliasError) throw aliasError;
  }

  const { error: channelError } = await admin
    .from("customer_channel_accounts")
    .upsert(
      {
        customer_id: params.customerId,
        channel: "zalo",
        platform_user_id: platformUserId,
        platform_chat_id: platformChatId,
        linked_user_id: Number(compatUser?.id ?? 0) || null,
        display_name: displayName,
        phone_claimed: safeString(params.phoneDisplay) || params.phoneE164,
        phone_claimed_e164: params.phoneE164,
        link_status: "linked",
      },
      {
        onConflict: "channel,platform_user_id",
      },
    );

  if (channelError) throw channelError;

  if (platformChatId && platformChatId !== platformUserId) {
    const { error: aliasChannelError } = await admin
      .from("customer_channel_accounts")
      .upsert(
        {
          customer_id: params.customerId,
          channel: "zalo",
          platform_user_id: platformChatId,
          platform_chat_id: platformChatId,
          linked_user_id: Number(aliasUser?.id ?? compatUser?.id ?? 0) || null,
          display_name: displayName,
          phone_claimed: safeString(params.phoneDisplay) || params.phoneE164,
          phone_claimed_e164: params.phoneE164,
          link_status: "linked",
        },
        {
          onConflict: "channel,platform_user_id",
        },
      );

    if (aliasChannelError) throw aliasChannelError;
  }

  const { error: syncError } = await admin.rpc("sync_customer_to_compat_users", {
    p_customer_id: params.customerId,
  });
  if (syncError) throw syncError;

  const { data: linkedChannels, error: countError } = await admin
    .from("customer_channel_accounts")
    .select("channel")
    .eq("customer_id", params.customerId)
    .eq("link_status", "linked");
  if (countError) throw countError;

  return {
    status: "linked",
    customerId: params.customerId,
    linkedUserId: Number(compatUser?.id ?? 0) || null,
    linkedChannelCount: new Set((linkedChannels || []).map((row: AnyRecord) => safeString(row.channel) || "")).size,
    zaloLinkStatus: "linked",
  };
}
