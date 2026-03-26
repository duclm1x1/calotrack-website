export const DEFAULT_TELEGRAM_BOT_URL = "https://t.me/CaloTrack_bot";
export const DEFAULT_ZALO_OA_URL = "https://zalo.me/your-oa-id";
export const DEFAULT_SITE_URL = "https://calotrack-website.vercel.app";
export const DEFAULT_BANK_NAME = "Techcombank";
export const DEFAULT_BANK_CODE = "TCB";
export const DEFAULT_BANK_ACCOUNT_NUMBER = "19034065720011";

function readEnv(value: string | undefined): string {
  return value?.trim() || "";
}

export const SITE_CONFIG = {
  siteUrl: readEnv(import.meta.env.VITE_SITE_URL),
  telegramBotUrl: readEnv(import.meta.env.VITE_TELEGRAM_BOT_URL) || DEFAULT_TELEGRAM_BOT_URL,
  zaloOaUrl: readEnv(import.meta.env.VITE_ZALO_OA_URL) || DEFAULT_ZALO_OA_URL,
  supportEmail: readEnv(import.meta.env.VITE_SUPPORT_EMAIL) || "support@calotrack.vn",
  bankName: readEnv(import.meta.env.VITE_BANK_NAME) || DEFAULT_BANK_NAME,
  bankCode: readEnv(import.meta.env.VITE_BANK_CODE) || DEFAULT_BANK_CODE,
  bankAccountNumber:
    readEnv(import.meta.env.VITE_BANK_ACCOUNT_NUMBER) || DEFAULT_BANK_ACCOUNT_NUMBER,
  bankAccountName: readEnv(import.meta.env.VITE_BANK_ACCOUNT_NAME),
  momoCreateOrderWebhookUrl:
    readEnv(import.meta.env.VITE_MOMO_CREATE_ORDER_WEBHOOK_URL),
  pricingAnchor: "#pricing",
  productName: "CaloTrack",
  primaryChannelLabel: "Telegram",
  secondaryChannelLabel: "Zalo OA",
  secondaryChannelStatus: "Sẵn sàng nối workflow riêng bằng n8n",
  webPortalLabel: "Portal web",
  webPortalStatus: "Account, billing, activation và admin",
  productStageLabel: "Telegram-first • Zalo-ready",
  freeDailyLimit: 5,
  loginPath: "/login",
  adminLoginPath: "/admin-login",
  checkoutPath: "/checkout",
  activatePath: "/activate",
  dashboardPath: "/dashboard",
  adminPath: "/admin",
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
  return SITE_CONFIG.telegramBotUrl;
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
