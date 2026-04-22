import { normalizePendingIntentState } from "../zaloGatewayChatServer.js";
import type { InboundEnvelope } from "./envelope.js";
import type { PendingIntentState } from "./types.js";

export const CONFIRM_CANDIDATE_TTL_MS = 10 * 60 * 1000;

export function readPendingIntentState(value: unknown): PendingIntentState {
  return normalizePendingIntentState(value) as PendingIntentState;
}

export function readEnvelopePendingIntent(envelope: InboundEnvelope): PendingIntentState {
  return readPendingIntentState(envelope.context.pending_intent);
}

export function readConfirmCandidate(pendingIntent: PendingIntentState | null | undefined) {
  const candidate = pendingIntent?.confirm_candidate;
  return candidate && typeof candidate === "object" ? { ...candidate } : null;
}

export function isConfirmCandidateFresh(
  pendingIntent: PendingIntentState | null | undefined,
  nowMs = Date.now(),
  ttlMs = CONFIRM_CANDIDATE_TTL_MS,
) {
  const candidate = readConfirmCandidate(pendingIntent);
  if (!candidate) return false;
  const createdAtRaw = candidate.created_at;
  const createdAtMs = Date.parse(String(createdAtRaw || ""));
  if (!Number.isFinite(createdAtMs)) return false;
  return nowMs - createdAtMs <= ttlMs;
}

export function clearConfirmCandidate(pendingIntent: PendingIntentState | null | undefined): PendingIntentState {
  const next = { ...(pendingIntent || {}) } as PendingIntentState;
  delete next.confirm_candidate;
  return next;
}
