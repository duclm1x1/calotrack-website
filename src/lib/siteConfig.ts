export const SITE_CONFIG = {
  telegramBotUrl: import.meta.env.VITE_TELEGRAM_BOT_URL || "https://t.me/your_telegram_bot",
  zaloOaUrl: import.meta.env.VITE_ZALO_OA_URL || "https://zalo.me/your-oa-id",
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || "support@calotrack.vn",
  pricingAnchor: "#pricing",
  productName: "CaloTrack",
  primaryChannelLabel: "Telegram",
  secondaryChannelLabel: "Zalo OA",
  secondaryChannelStatus: "Phase sau",
  freeDailyLimit: 5,
};

export function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}
