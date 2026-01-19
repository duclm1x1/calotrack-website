/**
 * Webhook Process Tracker for Idempotency
 * Prevents duplicate processing of Stripe events
 * 
 * For production: Use Redis or database table
 */

interface ProcessedEvent {
  processedAt: number;
  eventType: string;
}

const processedEvents = new Map<string, ProcessedEvent>();

// Keep events for 24 hours (Stripe retries for up to 72 hours)
const EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Check if an event has already been processed
 * @param eventId - Stripe event ID
 * @returns true if already processed
 */
export function isEventProcessed(eventId: string): boolean {
  const event = processedEvents.get(eventId);
  
  if (!event) {
    return false;
  }

  // Check if still within retention window
  if (Date.now() - event.processedAt > EVENT_RETENTION_MS) {
    processedEvents.delete(eventId);
    return false;
  }

  return true;
}

/**
 * Mark an event as processed
 * @param eventId - Stripe event ID
 * @param eventType - Type of event for logging
 */
export function markEventProcessed(eventId: string, eventType: string): void {
  // Clean up old events periodically
  if (processedEvents.size > 10000) {
    const now = Date.now();
    for (const [id, event] of processedEvents.entries()) {
      if (now - event.processedAt > EVENT_RETENTION_MS) {
        processedEvents.delete(id);
      }
    }
  }

  processedEvents.set(eventId, {
    processedAt: Date.now(),
    eventType,
  });
}

/**
 * Get count of tracked events (for monitoring)
 */
export function getProcessedEventCount(): number {
  return processedEvents.size;
}
