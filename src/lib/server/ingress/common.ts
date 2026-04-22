import { normalizeCommandText } from "../zaloGatewayChatServer.js";
import type { AttachmentRecord, EnvelopeMessageKind } from "../gateway/types.js";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeEnvelopeText(value: unknown) {
  const raw = safeString(value);
  return raw ? normalizeCommandText(raw) : null;
}

export function normalizeAttachment(input: Record<string, unknown>): AttachmentRecord {
  return {
    kind: String(input.kind || "file") as AttachmentRecord["kind"],
    storage_url: safeString(input.storage_url || input.url) || null,
    original_url: safeString(input.original_url || input.url) || null,
    platform_file_id: safeString(input.platform_file_id || input.file_id) || null,
    mime_type: safeString(input.mime_type) || null,
    size_bytes: Number.isFinite(Number(input.size_bytes)) ? Number(input.size_bytes) : null,
    width: Number.isFinite(Number(input.width)) ? Number(input.width) : null,
    height: Number.isFinite(Number(input.height)) ? Number(input.height) : null,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...(input.metadata as Record<string, unknown>) } : null,
  };
}

export function inferMessageKind(params: {
  textRaw?: string | null;
  attachments?: AttachmentRecord[];
  buttonPayload?: string | null;
}): EnvelopeMessageKind {
  if (params.buttonPayload) return "button";
  if ((params.attachments || []).some((attachment) => attachment.kind === "image")) return "image";
  if ((params.attachments || []).some((attachment) => attachment.kind === "audio")) return "audio";
  if ((params.attachments || []).length > 0) return "file";
  return params.textRaw ? "text" : "file";
}

export function buildTrace(requestId?: string | null, startedAtMs?: number | null) {
  const traceId = safeString(requestId) || `ct-envelope-${Date.now()}`;
  const startedAt = Number.isFinite(Number(startedAtMs)) ? Number(startedAtMs) : Date.now();
  return {
    request_id: traceId,
    ingress_latency_ms: Math.max(0, Date.now() - startedAt),
  };
}
