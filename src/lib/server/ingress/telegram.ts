import { InboundEnvelopeSchema, type InboundEnvelope } from "../gateway/envelope.js";
import { buildTrace, inferMessageKind, normalizeAttachment, normalizeEnvelopeText } from "./common.js";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function buildTelegramInboundEnvelope(
  update: Record<string, unknown>,
  options: {
    requestId?: string | null;
    startedAtMs?: number | null;
    customerId?: string | null;
    locale?: "vi" | "en" | null;
    pendingIntent?: Record<string, unknown> | null;
    conversationState?: Record<string, unknown> | null;
    lastAssistantMessageAt?: string | null;
  } = {},
): InboundEnvelope {
  const message = ((update.message || update.callback_query) as Record<string, unknown> | undefined) || {};
  const from = (message.from as Record<string, unknown> | undefined) || {};
  const callbackQuery = (update.callback_query as Record<string, unknown> | undefined) || {};
  const photoList = Array.isArray(message.photo) ? (message.photo as Record<string, unknown>[]) : [];
  const topPhoto = photoList[photoList.length - 1] || null;
  const attachments = topPhoto
    ? [normalizeAttachment({ kind: "image", file_id: topPhoto.file_id, metadata: { telegram_sizes: photoList } })]
    : [];
  const textRaw = safeString(message.text) || safeString(callbackQuery.data) || null;
  const senderId = safeString(from.id) || safeString((message.chat as Record<string, unknown> | undefined)?.id) || "unknown-telegram-user";
  const displayName =
    safeString([safeString(from.first_name), safeString(from.last_name)].filter(Boolean).join(" ")) ||
    safeString(from.username) ||
    null;
  const buttonPayload = safeString(callbackQuery.data) || null;

  return InboundEnvelopeSchema.parse({
    channel: "telegram",
    channel_message_id: safeString(message.message_id) || safeString(callbackQuery.id) || options.requestId || `telegram-${Date.now()}`,
    received_at: new Date().toISOString(),
    sender: {
      channel_user_id: senderId,
      customer_id: options.customerId || null,
      display_name: displayName,
      locale: options.locale || null,
    },
    message: {
      kind: inferMessageKind({ textRaw, attachments, buttonPayload }),
      text: normalizeEnvelopeText(textRaw),
      text_raw: textRaw,
      attachments,
      button_payload: buttonPayload,
    },
    context: {
      conversation_state: options.conversationState || null,
      pending_intent: options.pendingIntent || null,
      last_assistant_message_at: options.lastAssistantMessageAt || null,
    },
    trace: buildTrace(options.requestId, options.startedAtMs),
  });
}
