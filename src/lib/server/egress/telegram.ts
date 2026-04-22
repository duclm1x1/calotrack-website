import { validateOutboundEnvelope, renderTelegramInlineKeyboard, renderTextForChannel } from "./common.js";
import type { OutboundEnvelope } from "../gateway/envelope.js";

export function renderTelegramOutboundPayload(envelope: OutboundEnvelope) {
  const outbound = validateOutboundEnvelope(envelope);
  const payload: Record<string, unknown> = {
    chat_id: outbound.recipient.channel_user_id,
    text: renderTextForChannel("telegram", outbound.reply.text),
  };
  const replyMarkup = renderTelegramInlineKeyboard(outbound.reply.quick_actions);
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  return payload;
}

export async function sendTelegramOutboundEnvelope(envelope: OutboundEnvelope) {
  const outbound = validateOutboundEnvelope(envelope);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const payload = renderTelegramOutboundPayload(outbound);
  if (!token) {
    return {
      accepted: false,
      reason: "telegram_not_configured",
      render_only: true,
      payload,
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return {
    accepted: response.ok,
    http_status: response.status,
    reason: response.ok ? "sent" : "telegram_send_failed",
    response: json,
    payload,
  };
}
