/**
 * CaloTrack Monitoring — Sentry wrapper (optional dependency)
 *
 * Initialize error tracking and performance monitoring.
 * Gracefully no-ops if @sentry/react is not installed yet.
 *
 * Usage:
 *   import { initMonitoring, captureError } from '@/lib/monitoring';
 *   initMonitoring(); // Call once in main.tsx
 *
 * Setup:
 *   npm install @sentry/react
 *
 * Environment variables:
 *   VITE_SENTRY_DSN   — your Sentry DSN (leave empty to disable)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
let initialized = false;

async function loadSentry() {
  if (Sentry) return Sentry;
  try {
    // @ts-ignore — @sentry/react is an optional dependency (npm install @sentry/react)
    Sentry = await import("@sentry/react");
    return Sentry;
  } catch {
    // @sentry/react not installed — monitoring disabled
    return null;
  }
}

/**
 * Initialize Sentry. Call once, early in application startup (main.tsx).
 */
export async function initMonitoring(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info("[monitoring] VITE_SENTRY_DSN not set – Sentry disabled");
    }
    return;
  }

  const s = await loadSentry();
  if (!s) {
    console.warn("[monitoring] @sentry/react not installed – run: npm install @sentry/react");
    return;
  }

  s.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION ?? "unknown",
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  });
}

/**
 * Capture an error with optional extra context.
 */
export async function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const s = await loadSentry();
  if (!s) return;
  s.withScope((scope: { setExtras: (extras: Record<string, unknown>) => void }) => {
    if (context) scope.setExtras(context);
    s.captureException(error);
  });
}

/**
 * Set the current authenticated user for Sentry context.
 */
export async function setMonitoringUser(userId: string, email?: string): Promise<void> {
  const s = await loadSentry();
  if (!s) return;
  s.setUser({ id: userId, email });
}

/**
 * Clear the Sentry user (on logout).
 */
export async function clearMonitoringUser(): Promise<void> {
  const s = await loadSentry();
  if (!s) return;
  s.setUser(null);
}
