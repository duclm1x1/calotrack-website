export const CHANNELS = ["zalo", "telegram", "whatsapp", "messenger", "line", "web"] as const;
export type Channel = (typeof CHANNELS)[number];

export const MESSAGE_KINDS = ["text", "image", "audio", "sticker", "button", "location", "file"] as const;
export type EnvelopeMessageKind = (typeof MESSAGE_KINDS)[number];

export const REPLY_KINDS = ["text", "image", "template", "quickreply", "noop"] as const;
export type EnvelopeReplyKind = (typeof REPLY_KINDS)[number];

export const GATEWAY_ROUTES = ["direct", "dispatch", "llm"] as const;
export type GatewayRoute = (typeof GATEWAY_ROUTES)[number];

export type PendingIntentState = Record<string, unknown> & {
  schema_version?: number;
  active_surface?: string | null;
  confirm_candidate?: Record<string, unknown> | null;
  active_image_review_id?: string | null;
};

export type ConversationStateRecord = Record<string, unknown>;

export type EnvelopeStatePatch = {
  pending_intent?: PendingIntentState | null;
  conversation_state?: ConversationStateRecord | null;
} & Record<string, unknown>;

export type AttachmentRecord = {
  kind: "image" | "audio" | "file" | "video";
  storage_url: string | null;
  original_url: string | null;
  platform_file_id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown> | null;
};

export type RichBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      url: string;
      alt?: string | null;
    }
  | {
      type: "buttons";
      items: QuickAction[];
    };

export type QuickAction = {
  id: string;
  label: string;
  payload: string;
  style?: "primary" | "secondary";
};
