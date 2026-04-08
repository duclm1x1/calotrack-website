import { maybeSingle, safeString } from "./adminServer.js";

export const PORTAL_SITE_CONFIG_AUDIT_ACTION = "portal.site_config.updated";
export const PORTAL_SITE_CONFIG_TARGET_TYPE = "portal_runtime_settings";
export const PORTAL_SITE_CONFIG_TARGET_ID = "public_portal";

export type PublicPortalSiteSettings = {
  siteUrl: string;
  telegramBotUrl: string;
  zaloOaUrl: string;
  supportEmail: string;
  productStageLabel: string;
  bankName: string;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
};

export const PUBLIC_PORTAL_SITE_SETTING_KEYS = [
  "siteUrl",
  "telegramBotUrl",
  "zaloOaUrl",
  "supportEmail",
  "productStageLabel",
  "bankName",
  "bankCode",
  "bankAccountNumber",
  "bankAccountName",
] as const satisfies ReadonlyArray<keyof PublicPortalSiteSettings>;

function cleanEnv(value: string | undefined) {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

export function getPortalSiteConfigDefaults(): PublicPortalSiteSettings {
  return {
    siteUrl: cleanEnv(process.env.VITE_SITE_URL) || "https://calotrack-website.vercel.app",
    telegramBotUrl: cleanEnv(process.env.VITE_TELEGRAM_BOT_URL) || "https://t.me/CaloTrack_bot",
    zaloOaUrl: cleanEnv(process.env.VITE_ZALO_OA_URL) || "https://zalo.me/4423588403113387176",
    supportEmail: cleanEnv(process.env.VITE_SUPPORT_EMAIL) || "support@calotrack.vn",
    productStageLabel:
      cleanEnv(process.env.VITE_PRODUCT_STAGE_LABEL) || "Phone-first portal • Zalo & Telegram",
    bankName: cleanEnv(process.env.VITE_BANK_NAME) || "VietinBank",
    bankCode: cleanEnv(process.env.VITE_BANK_CODE) || "vietinbank",
    bankAccountNumber: cleanEnv(process.env.VITE_BANK_ACCOUNT_NUMBER) || "109884289129",
    bankAccountName: cleanEnv(process.env.VITE_BANK_ACCOUNT_NAME) || "LAI MINH DUC",
  };
}

export function normalizePortalSiteSettings(raw: Record<string, unknown> | null | undefined) {
  const defaults = getPortalSiteConfigDefaults();
  const source = raw && typeof raw === "object" ? raw : {};

  const normalized = { ...defaults };
  for (const key of PUBLIC_PORTAL_SITE_SETTING_KEYS) {
    const value = safeString(source[key]);
    if (value) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export async function readLatestPortalSiteSettings(admin: any) {
  const latest =
    (await maybeSingle<Record<string, unknown>>(
      admin
        .from("admin_audit_log")
        .select("metadata, created_at")
        .eq("action", PORTAL_SITE_CONFIG_AUDIT_ACTION)
        .eq("target_type", PORTAL_SITE_CONFIG_TARGET_TYPE)
        .eq("target_id", PORTAL_SITE_CONFIG_TARGET_ID)
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  const metadata =
    latest?.metadata && typeof latest.metadata === "object"
      ? (latest.metadata as Record<string, unknown>)
      : {};
  const rawSettings =
    metadata.settings && typeof metadata.settings === "object"
      ? (metadata.settings as Record<string, unknown>)
      : {};

  return {
    settings: normalizePortalSiteSettings(rawSettings),
    updatedAt: safeString(latest?.created_at),
  };
}
