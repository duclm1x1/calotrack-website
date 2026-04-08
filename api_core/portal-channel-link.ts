import { randomBytes } from "node:crypto";

import {
  maybeSingle,
  readBody,
  requireAuthenticatedUser,
  safeString,
  sendJson,
} from "../src/lib/server/adminServer.js";

const DEFAULT_TELEGRAM_BOT_URL = safeString(process.env.VITE_TELEGRAM_BOT_URL) || "https://t.me/CaloTrack_bot";
const DEFAULT_ZALO_OA_URL = safeString(process.env.VITE_ZALO_OA_URL) || "https://zalo.me/4423588403113387176";
const TOKEN_TTL_MINUTES = 30;

type ChannelKey = "telegram" | "zalo";
type AnyRecord = Record<string, any>;

function normalizeChannel(value: unknown): ChannelKey | null {
  const text = safeString(value)?.toLowerCase();
  if (text === "telegram" || text === "zalo") {
    return text;
  }
  return null;
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function getTelegramLinkHref(linkToken?: string | null): string {
  if (!linkToken) {
    return DEFAULT_TELEGRAM_BOT_URL;
  }

  return DEFAULT_TELEGRAM_BOT_URL.includes("?")
    ? `${DEFAULT_TELEGRAM_BOT_URL}&start=${encodeURIComponent(linkToken)}`
    : `${DEFAULT_TELEGRAM_BOT_URL}?start=${encodeURIComponent(linkToken)}`;
}

function buildHelperText(channel: ChannelKey, status: "ready" | "already_linked", linkCode?: string | null) {
  if (channel === "telegram") {
    return status === "already_linked"
      ? "Telegram n\u00e0y \u0111\u00e3 li\u00ean k\u1ebft v\u00e0o account c\u1ee7a b\u1ea1n. B\u1ea1n c\u00f3 th\u1ec3 m\u1edf bot v\u00e0 chat ti\u1ebfp ngay."
      : "M\u1edf Telegram bot, bot s\u1ebd t\u1ef1 nh\u1eadn token v\u00e0 n\u1ed1i v\u00e0o account c\u1ee7a b\u1ea1n.";
  }

  return status === "already_linked"
    ? "Zalo n\u00e0y \u0111\u00e3 li\u00ean k\u1ebft v\u00e0o account c\u1ee7a b\u1ea1n. B\u1ea1n c\u00f3 th\u1ec3 m\u1edf OA v\u00e0 chat ti\u1ebfp ngay."
    : `M\u1edf OA Calo Track v\u00e0 g\u1eedi m\u00e3 ${linkCode || "li\u00ean k\u1ebft"} m\u1ed9t l\u1ea7n \u0111\u1ec3 n\u1ed1i Zalo v\u00e0o account c\u1ee7a b\u1ea1n.`;
}

async function resolvePortalCustomerForAuthUser(admin: any, authUserId: string) {
  const authLink =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_auth_links")
        .select("customer_id, link_status")
        .eq("auth_user_id", authUserId)
        .in("link_status", ["linked", "active"])
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  const customerId = Number(authLink?.customer_id ?? 0) || null;
  if (!customerId) {
    throw new Error("phone_verification_required");
  }

  const customer =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customers")
        .select("id, access_state, phone_verified_at")
        .eq("id", customerId)
        .limit(1),
    )) || null;

  if (!customer || safeString(customer.access_state) === "pending_verification" || !safeString(customer.phone_verified_at)) {
    throw new Error("phone_verification_required");
  }

  return customerId;
}

async function getActiveLinkToken(admin: any, customerId: number, channel: ChannelKey) {
  const rows =
    (
      await admin
        .from("channel_link_tokens")
        .select("id, customer_id, channel, link_token, status, expires_at, created_at")
        .eq("customer_id", customerId)
        .eq("channel", channel)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10)
    ).data ?? [];

  const now = Date.now();
  return (
    rows.find((row: AnyRecord) => {
      const expiresAt = safeString(row.expires_at);
      if (!expiresAt) return true;
      const timestamp = Date.parse(expiresAt);
      return Number.isFinite(timestamp) && timestamp > now;
    }) || null
  );
}

async function ensureLinkToken(admin: any, customerId: number, channel: ChannelKey) {
  const existing = await getActiveLinkToken(admin, customerId, channel);
  if (existing) {
    return {
      token: existing,
      reused: true,
    };
  }

  const linkToken = randomBytes(18).toString("hex");
  const expiresAt = addMinutes(TOKEN_TTL_MINUTES);
  const { data, error } = await admin
    .from("channel_link_tokens")
    .insert({
      customer_id: customerId,
      channel,
      link_token: linkToken,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id, customer_id, channel, link_token, status, expires_at, created_at")
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  return {
    token: data as AnyRecord,
    reused: false,
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

  try {
    const body = await readBody(req);
    const channel = normalizeChannel(body.channel);
    if (!channel) {
      sendJson(res, 400, { ok: false, error: "invalid_channel" });
      return;
    }

    const { admin, authUser } = await requireAuthenticatedUser(req);
    const customerId = await resolvePortalCustomerForAuthUser(admin, authUser.id);

    const linkedChannel =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customer_channel_accounts")
          .select("id, channel, platform_user_id, platform_chat_id, display_name, link_status")
          .eq("customer_id", customerId)
          .eq("channel", channel)
          .eq("link_status", "linked")
          .order("updated_at", { ascending: false })
          .limit(1),
      )) || null;

    if (linkedChannel) {
      const helperText = buildHelperText(channel, "already_linked");
      sendJson(res, 200, {
        ok: true,
        data: {
          channel,
          status: "already_linked",
          link_token: null,
          link_code: null,
          expires_at: null,
          helper_text: helperText,
          reused: true,
          url: channel === "telegram" ? getTelegramLinkHref(null) : DEFAULT_ZALO_OA_URL,
        },
      });
      return;
    }

    const { token, reused } = await ensureLinkToken(admin, customerId, channel);
    const linkToken = safeString(token.link_token);
    const linkCode = channel === "zalo" && linkToken ? linkToken.slice(0, 8).toUpperCase() : null;
    const helperText = buildHelperText(channel, "ready", linkCode);

    sendJson(res, 200, {
      ok: true,
      data: {
        channel,
        status: "ready",
        link_token: linkToken,
        link_code: linkCode,
        expires_at: safeString(token.expires_at),
        helper_text: helperText,
        reused,
        url: channel === "telegram" ? getTelegramLinkHref(linkToken) : DEFAULT_ZALO_OA_URL,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_channel_link_failed");
    sendJson(res, message === "auth_required" ? 401 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
