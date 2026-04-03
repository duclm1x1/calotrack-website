export const DEFAULT_TELEGRAM_BOT_URL = "https://t.me/CaloTrack_bot";
export const DEFAULT_ZALO_OA_URL = "https://zalo.me/4423588403113387176";
export const DEFAULT_SITE_URL = "https://calotrack-website.vercel.app";
export const DEFAULT_ZALO_APP_ID = "1450975846052622442";
export const DEFAULT_BANK_NAME = "VietinBank";
export const DEFAULT_BANK_CODE = "vietinbank";
export const DEFAULT_BANK_ACCOUNT_NUMBER = "109884289129";

function readEnv(value: string | undefined): string {
  return value?.trim() || "";
}

export const SITE_CONFIG = {
  siteUrl: readEnv(import.meta.env.VITE_SITE_URL),
  telegramBotUrl: readEnv(import.meta.env.VITE_TELEGRAM_BOT_URL) || DEFAULT_TELEGRAM_BOT_URL,
  zaloOaUrl: readEnv(import.meta.env.VITE_ZALO_OA_URL) || DEFAULT_ZALO_OA_URL,
  zaloAppId: readEnv(import.meta.env.VITE_ZALO_APP_ID) || DEFAULT_ZALO_APP_ID,
  zaloPhoneOtpEnabled: readEnv(import.meta.env.VITE_ENABLE_ZALO_PHONE_OTP).toLowerCase() === "true",
  emailDevBypassEnabled:
    readEnv(import.meta.env.VITE_PORTAL_EMAIL_DEV_BYPASS || "true").toLowerCase() !== "false",
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
  secondaryChannelStatus: "Chat tracking và activation đã sẵn sàng",
  webPortalLabel: "Portal web",
  webPortalStatus: "Email-first portal cho billing, linked channels và backoffice",
  productStageLabel: "Email-first dev phase • Zalo & Telegram",
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
  return `${value.toLocaleString("vi-VN")}đ`;
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
  return `Mở ${SITE_CONFIG.primaryChannelLabel}`;
}

export function getSecondaryChannelCta(): string {
  return hasConfiguredZaloOa()
    ? `Mở ${SITE_CONFIG.secondaryChannelLabel}`
    : `${SITE_CONFIG.secondaryChannelLabel} sắp mở`;
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

  const params = new URLSearchParams();
  if (amount > 0) {
    params.set("amount", String(amount));
  }
  if (transferNote) {
    params.set("addInfo", transferNote);
  }
  if (SITE_CONFIG.bankAccountName) {
    params.set("accountName", SITE_CONFIG.bankAccountName);
  }

  return `https://img.vietqr.io/image/${encodeURIComponent(
    SITE_CONFIG.bankCode,
  )}-${encodeURIComponent(trimLeadingPlus(SITE_CONFIG.bankAccountNumber))}-compact2.png?${params.toString()}`;
}
