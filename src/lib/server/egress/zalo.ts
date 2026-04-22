import { sendZaloBrokerPayload } from "../handlers/zalo-oa-send-cs.js";
import { validateOutboundEnvelope, renderTextForChannel, renderZaloQuickReplies } from "./common.js";
import type { OutboundEnvelope } from "../gateway/envelope.js";

export function renderZaloOutboundPayload(envelope: OutboundEnvelope) {
  const outbound = validateOutboundEnvelope(envelope);
  const payload: Record<string, unknown> = {
    recipient: {
      user_id: outbound.recipient.channel_user_id,
    },
    message: {
      text: renderTextForChannel("zalo", outbound.reply.text),
    },
  };

  const quickReplies = renderZaloQuickReplies(outbound.reply.quick_actions);
  if (quickReplies && quickReplies.length) {
    (payload.message as Record<string, unknown>).quick_replies = quickReplies;
  }
  return payload;
}

export async function sendZaloOutboundEnvelope(admin: any, envelope: OutboundEnvelope) {
  const outbound = validateOutboundEnvelope(envelope);
  const payload = renderZaloOutboundPayload(outbound);
  return sendZaloBrokerPayload(admin, {
    payload,
    receipt: {
      source_message_id: outbound.trace.route === "dispatch"
        ? `dispatch:${Date.now()}`
        : `${outbound.trace.route}:${Date.now()}`,
      route: outbound.trace.route,
      action: "envelope_egress",
      customer_id: outbound.recipient.customer_id ? Number(outbound.recipient.customer_id) : null,
      user_id: null,
      trace_id: null,
    },
  });
}
