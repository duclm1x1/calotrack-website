import { InboundEnvelopeSchema, type InboundEnvelope } from "../gateway/envelope.js";
import { buildTrace, inferMessageKind, normalizeAttachment, normalizeEnvelopeText } from "./common.js";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function decodeBase64Text(value: unknown) {
  const encoded = safeString(value);
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

function getMessageText(body: Record<string, unknown>) {
  return (
    safeString((body.message as Record<string, unknown> | undefined)?.text) ||
    safeString(body.text) ||
    decodeBase64Text((body.message as Record<string, unknown> | undefined)?.text_b64) ||
    decodeBase64Text(body.message_text_b64)
  );
}

export function buildZaloInboundEnvelope(
  body: Record<string, unknown>,
  options: {
    requestId?: string | null;
    startedAtMs?: number | null;
    customerId?: string | null;
    displayName?: string | null;
    locale?: "vi" | "en" | null;
    pendingIntent?: Record<string, unknown> | null;
    conversationState?: Record<string, unknown> | null;
    lastAssistantMessageAt?: string | null;
  } = {},
): InboundEnvelope {
  const sender = (body.sender as Record<string, unknown> | undefined) || {};
  const message = (body.message as Record<string, unknown> | undefined) || {};
  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Record<string, unknown>[]).map((item) => normalizeAttachment(item))
    : [];
  const textRaw = getMessageText(body) || null;
  const buttonPayload =
    safeString(message.payload) ||
    safeString((message.buttons as Record<string, unknown> | undefined)?.payload) ||
    null;
  const senderId =
    safeString(body.user_id_by_app) ||
    safeString(sender.id) ||
    safeString((message.from as Record<string, unknown> | undefined)?.id) ||
    "unknown-zalo-user";

  return InboundEnvelopeSchema.parse({
    channel: "zalo",
    channel_message_id: safeString(message.msg_id) || safeString(body.msg_id) || safeString(body.message_id) || options.requestId || `zalo-${Date.now()}`,
    received_at: new Date().toISOString(),
    sender: {
      channel_user_id: senderId,
      customer_id: options.customerId || null,
      display_name: options.displayName || safeString(sender.display_name) || safeString(sender.name) || null,
      locale: options.locale || "vi",
    },
    message: {
      kind: inferMessageKind({
        textRaw,
        attachments,
        buttonPayload,
      }),
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
