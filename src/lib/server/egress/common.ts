import { OutboundEnvelopeSchema, type OutboundEnvelope } from "../gateway/envelope.js";
import type { Channel, QuickAction } from "../gateway/types.js";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function validateOutboundEnvelope(value: unknown): OutboundEnvelope {
  return OutboundEnvelopeSchema.parse(value);
}

export function renderTextForChannel(channel: Channel, text: string | null) {
  const normalized = safeString(text).trim();
  if (!normalized) return "";
  if (channel === "telegram") {
    return normalized;
  }
  return normalized;
}

export function renderTelegramInlineKeyboard(actions: QuickAction[] | null) {
  if (!actions || !actions.length) return undefined;
  return {
    inline_keyboard: actions.map((action) => [
      {
        text: action.label,
        callback_data: action.payload,
      },
    ]),
  };
}

export function renderZaloQuickReplies(actions: QuickAction[] | null) {
  if (!actions || !actions.length) return undefined;
  return actions.map((action) => ({
    content: action.label,
    payload: action.payload,
  }));
}
