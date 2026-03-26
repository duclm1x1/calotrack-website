export const DEFAULT_TELEGRAM_BOT_URL = "https://t.me/your_telegram_bot";
export const DEFAULT_ZALO_OA_URL = "https://zalo.me/your-oa-id";

export const SITE_CONFIG = {
  telegramBotUrl: import.meta.env.VITE_TELEGRAM_BOT_URL || DEFAULT_TELEGRAM_BOT_URL,
  zaloOaUrl: import.meta.env.VITE_ZALO_OA_URL || DEFAULT_ZALO_OA_URL,
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || "support@calotrack.vn",
  pricingAnchor: "#pricing",
  productName: "CaloTrack",
  primaryChannelLabel: "Telegram",
  secondaryChannelLabel: "Zalo OA",
  secondaryChannelStatus: "Sẵn sàng nối workflow riêng",
  webPortalLabel: "Portal web",
  webPortalStatus: "Beta an toàn cho account, billing và admin",
  productStageLabel: "Telegram-first • Zalo-ready",
  freeDailyLimit: 5,
};

export function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function hasConfiguredZaloOa(): boolean {
  return Boolean(SITE_CONFIG.zaloOaUrl) && SITE_CONFIG.zaloOaUrl !== DEFAULT_ZALO_OA_URL;
}

export function getPrimaryChannelHref(): string {
  return SITE_CONFIG.telegramBotUrl;
}

export function getPrimaryChannelCta(): string {
  return `Mở ${SITE_CONFIG.primaryChannelLabel} bot`;
}

export function getSecondaryChannelCta(): string {
  return hasConfiguredZaloOa() ? `Mở ${SITE_CONFIG.secondaryChannelLabel}` : `${SITE_CONFIG.secondaryChannelLabel} sắp mở`;
}
