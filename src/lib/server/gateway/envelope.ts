import { z } from "zod";

import {
  CHANNELS,
  GATEWAY_ROUTES,
  MESSAGE_KINDS,
  REPLY_KINDS,
  type AttachmentRecord,
  type QuickAction,
  type RichBlock,
} from "./types.js";

const JsonRecordSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const AttachmentSchema: z.ZodType<AttachmentRecord> = z.object({
  kind: z.enum(["image", "audio", "file", "video"]),
  storage_url: z.string().nullable(),
  original_url: z.string().nullable(),
  platform_file_id: z.string().nullable(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  metadata: JsonRecordSchema.nullable(),
});

export const QuickActionSchema: z.ZodType<QuickAction> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  payload: z.string().min(1),
  style: z.enum(["primary", "secondary"]).optional(),
});

export const RichBlockSchema: z.ZodType<RichBlock> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string().min(1),
    alt: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("buttons"),
    items: z.array(QuickActionSchema),
  }),
]);

export const InboundEnvelopeSchema = z.object({
  channel: z.enum(CHANNELS),
  channel_message_id: z.string().min(1),
  received_at: z.string().min(1),
  sender: z.object({
    channel_user_id: z.string().min(1),
    customer_id: z.string().nullable(),
    display_name: z.string().nullable(),
    locale: z.enum(["vi", "en"]).nullable(),
  }),
  message: z.object({
    kind: z.enum(MESSAGE_KINDS),
    text: z.string().nullable(),
    text_raw: z.string().nullable(),
    attachments: z.array(AttachmentSchema),
    button_payload: z.string().nullable(),
  }),
  context: z.object({
    conversation_state: JsonRecordSchema.nullable(),
    pending_intent: JsonRecordSchema.nullable(),
    last_assistant_message_at: z.string().nullable(),
  }),
  trace: z.object({
    request_id: z.string().min(1),
    ingress_latency_ms: z.number().min(0),
  }),
});

export const OutboundEnvelopeSchema = z.object({
  channel: z.enum(CHANNELS),
  recipient: z.object({
    channel_user_id: z.string().min(1),
    customer_id: z.string().nullable(),
  }),
  reply: z.object({
    kind: z.enum(REPLY_KINDS),
    text: z.string().nullable(),
    rich: z.array(RichBlockSchema).nullable(),
    quick_actions: z.array(QuickActionSchema).nullable(),
    formatting_hints: z.object({
      bold_ranges: z.array(z.tuple([z.number(), z.number()])).optional(),
      italic_ranges: z.array(z.tuple([z.number(), z.number()])).optional(),
      bullets: z.boolean().optional(),
    }).nullable(),
  }),
  state_patch: JsonRecordSchema,
  trace: z.object({
    route: z.enum(GATEWAY_ROUTES),
    total_latency_ms: z.number().min(0),
  }),
});

export type InboundEnvelope = z.infer<typeof InboundEnvelopeSchema>;
export type OutboundEnvelope = z.infer<typeof OutboundEnvelopeSchema>;
