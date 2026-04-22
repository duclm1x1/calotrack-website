export const DEFAULT_TELEGRAM_BOT_URL = "https://t.me/CaloTrack_bot";
export const DEFAULT_ZALO_OA_URL = "https://zalo.me/4423588403113387176";
export const DEFAULT_SITE_URL = "https://calotrack-website.vercel.app";
export const DEFAULT_ZALO_APP_ID = "1450975846052622442";
export const DEFAULT_BANK_NAME = "VietinBank";
export const DEFAULT_BANK_CODE = "vietinbank";
export const DEFAULT_BANK_ACCOUNT_NUMBER = "109884289129";

function readEnv(value: string | undefined): string {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

const BASE_SITE_CONFIG = {
  siteUrl: readEnv(import.meta.env.VITE_SITE_URL),
  telegramBotUrl: readEnv(import.meta.env.VITE_TELEGRAM_BOT_URL) || DEFAULT_TELEGRAM_BOT_URL,
  zaloOaUrl: readEnv(import.meta.env.VITE_ZALO_OA_URL) || DEFAULT_ZALO_OA_URL,
  zaloAppId: readEnv(import.meta.env.VITE_ZALO_APP_ID) || DEFAULT_ZALO_APP_ID,
  zaloPhoneOtpEnabled:
    readEnv(import.meta.env.VITE_ENABLE_ZALO_PHONE_OTP || "true").toLowerCase() !== "false",
  emailDevBypassEnabled:
    readEnv(
      import.meta.env.VITE_PUBLIC_EMAIL_DEV_BYPASS ||
        import.meta.env.VITE_PUBLIC_EMAIL_DEV_PORTAL ||
        "false",
    ).toLowerCase() === "true",
  publicEmailDevPortalEnabled:
    readEnv(import.meta.env.VITE_PUBLIC_EMAIL_DEV_PORTAL || "false").toLowerCase() === "true",
  supportEmail: readEnv(import.meta.env.VITE_SUPPORT_EMAIL) || "support@calotrack.vn",
  bankName: readEnv(import.meta.env.VITE_BANK_NAME) || DEFAULT_BANK_NAME,
  bankCode: readEnv(import.meta.env.VITE_BANK_CODE) || DEFAULT_BANK_CODE,
  bankAccountNumber:
    readEnv(import.meta.env.VITE_BANK_ACCOUNT_NUMBER) || DEFAULT_BANK_ACCOUNT_NUMBER,
  bankAccountName: readEnv(import.meta.env.VITE_BANK_ACCOUNT_NAME) || "LAI MINH DUC",
  momoCreateOrderWebhookUrl:
    readEnv(import.meta.env.VITE_MOMO_CREATE_ORDER_WEBHOOK_URL) || "",
  pricingAnchor: "#pricing",
  productName: "CaloTrack",
  primaryChannelLabel: "Zalo",
  secondaryChannelLabel: "Telegram",
  secondaryChannelStatus: "Chat tracking vÃ  activation Ä‘Ã£ sáºµn sÃ ng",
  webPortalLabel: "Portal web",
  webPortalStatus: "Trung tÃ¢m quáº£n lÃ½ táº­p luyá»‡n vÃ  thanh toÃ¡n chuyÃªn nghiá»‡p.",
  productStageLabel: "Há»‡ thá»‘ng huáº¥n luyá»‡n AI Ä‘a ná»n táº£ng",
  freeDailyLimit: 5,
  freeImageDailyLimit: 2,
  loginPath: "/login",
  adminLoginPath: "/admin-login",
  checkoutPath: "/checkout",
  activatePath: "/activate",
  dashboardPath: "/dashboard",
  adminPath: "/admin",
  zaloAuthCallbackPath: "/zalo-auth-callback",
  zaloOauthStartPath: "/api/zalo-oa-oauth/start",
  zaloOauthCallbackApiPath: "/api/zalo-oa-oauth/callback",
};

export const SITE_CONFIG = { ...BASE_SITE_CONFIG };

export type PortalSiteConfigOverrides = Partial<
  Pick<
    typeof SITE_CONFIG,
    | "siteUrl"
    | "telegramBotUrl"
    | "zaloOaUrl"
    | "supportEmail"
    | "productStageLabel"
    | "bankName"
    | "bankCode"
    | "bankAccountNumber"
    | "bankAccountName"
  >
>;

const PORTAL_SITE_OVERRIDE_KEYS = [
  "siteUrl",
  "telegramBotUrl",
  "zaloOaUrl",
  "supportEmail",
  "productStageLabel",
  "bankName",
  "bankCode",
  "bankAccountNumber",
  "bankAccountName",
] as const satisfies ReadonlyArray<keyof PortalSiteConfigOverrides>;

function cleanOverrideValue(value: unknown): string {
  return String(value ?? "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

export function applyPortalSiteConfigOverrides(overrides?: PortalSiteConfigOverrides | null) {
  if (!overrides || typeof overrides !== "object") {
    return;
  }

  for (const key of PORTAL_SITE_OVERRIDE_KEYS) {
    const value = cleanOverrideValue(overrides[key]);
    const fallback = cleanOverrideValue(BASE_SITE_CONFIG[key] as string | undefined);
    SITE_CONFIG[key] = (value || fallback) as (typeof SITE_CONFIG)[typeof key];
  }
}

export function getPortalSiteConfigSnapshot() {
  return { ...SITE_CONFIG };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function trimLeadingPlus(value: string): string {
  return value.replace(/^\+/, "");
}

export function getCanonicalSiteOrigin(): string {
  if (SITE_CONFIG.siteUrl) {
    return trimTrailingSlash(SITE_CONFIG.siteUrl);
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return DEFAULT_SITE_URL;
}

export function buildSiteUrl(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getCanonicalSiteOrigin()}${normalizedPath}`;
}

export function buildZaloAuthCallbackUrl(): string {
  return buildSiteUrl(SITE_CONFIG.zaloAuthCallbackPath);
}

export function buildZaloOauthStartUrl(): string {
  return buildSiteUrl(SITE_CONFIG.zaloOauthStartPath);
}

export function buildZaloOauthCallbackApiUrl(): string {
  return buildSiteUrl(SITE_CONFIG.zaloOauthCallbackApiPath);
}

export function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}Ä‘`;
}

export function hasConfiguredZaloOa(): boolean {
  return Boolean(SITE_CONFIG.zaloOaUrl) && SITE_CONFIG.zaloOaUrl !== DEFAULT_ZALO_OA_URL;
}

export function hasConfiguredMomoCheckout(): boolean {
  return Boolean(SITE_CONFIG.momoCreateOrderWebhookUrl);
}

export function hasConfiguredBankTransfer(): boolean {
  return Boolean(SITE_CONFIG.bankAccountNumber);
}

export function getPrimaryChannelHref(): string {
  return SITE_CONFIG.zaloOaUrl || DEFAULT_ZALO_OA_URL;
}

export function getPrimaryChannelCta(): string {
  return `Má»Ÿ ${SITE_CONFIG.primaryChannelLabel}`;
}

export function getSecondaryChannelCta(): string {
  return hasConfiguredZaloOa()
    ? `Má»Ÿ ${SITE_CONFIG.secondaryChannelLabel}`
    : `${SITE_CONFIG.secondaryChannelLabel} sáº¯p má»Ÿ`;
}

export function getTelegramLinkHref(linkToken?: string | null): string {
  if (!linkToken) {
    return SITE_CONFIG.telegramBotUrl;
  }
  return SITE_CONFIG.telegramBotUrl.includes("?")
    ? `${SITE_CONFIG.telegramBotUrl}&start=${encodeURIComponent(linkToken)}`
    : `${SITE_CONFIG.telegramBotUrl}?start=${encodeURIComponent(linkToken)}`;
}

export function buildVietQrImageUrl(amount: number, transferNote: string): string | null {
  if (!hasConfiguredBankTransfer()) {
    return null;
  }

  let normalizedNote = transferNote.trim();
  if (normalizedNote && !normalizedNote.toUpperCase().startsWith("SEVQR")) {
    normalizedNote = `SEVQR ${normalizedNote}`;
  }

  const params = new URLSearchParams();
  if (amount > 0) {
    params.set("amount", String(amount));
  }
  if (normalizedNote) {
    params.set("addInfo", normalizedNote);
  }
  if (SITE_CONFIG.bankAccountName) {
    params.set("accountName", SITE_CONFIG.bankAccountName);
  }

  return `https://img.vietqr.io/image/${encodeURIComponent(
    SITE_CONFIG.bankCode,
  )}-${encodeURIComponent(trimLeadingPlus(SITE_CONFIG.bankAccountNumber))}-qr_only.png?${params.toString()}`;
}
