import { supabase } from "@/lib/supabase";
import {
  BILLING_SKU_OPTIONS,
  type BillingSku,
  formatTierLabel,
  getFreeDailyLimit,
} from "@/lib/billing";

type MaybeError =
  | {
      code?: string;
      message?: string;
      details?: string | null;
      hint?: string | null;
    }
  | null
  | undefined;

export type AdminUser = {
  id: number;
  username: string | null;
  first_name: string | null;
  platform: string | null;
  platform_id: string | null;
  chat_id: number | null;
  is_active: boolean;
  is_banned: boolean;
  plan: "free" | "pro" | "lifetime";
  premium_until: string | null;
  daily_ai_usage_count: number;
  last_usage_reset_date: string | null;
  created_at: string | null;
  last_active: string | null;
};

export type PaymentRow = {
  id: string;
  user_id: number;
  amount: number;
  payment_method: string;
  status: string;
  transaction_code: string | null;
  description: string | null;
  days_added: number;
  plan_granted: string | null;
  billing_sku: string | null;
  created_at: string;
  completed_at?: string | null;
};

export type SubscriptionEvent = {
  id: string;
  event_type: string;
  plan_from: string | null;
  plan_to: string | null;
  amount: number;
  source: string;
  notes: string | null;
  billing_sku: string | null;
  created_at: string;
};

export type SystemStats = {
  totalUsers: number;
  premiumUsers: number;
  lifetimeUsers: number;
  todayAICalls: number;
  monthRevenue: number;
  totalRevenue: number;
  expiringIn7Days: number;
};

export type SchemaReadiness = {
  ready: boolean;
  missing: string[];
  checkedAt: string;
};

export type AdminAccessState = {
  isAuthenticated: boolean;
  linkedUserId: number | null;
  isAdmin: boolean;
  email: string | null;
  checkedAt: string;
  reason: string | null;
};

function describeError(error: MaybeError): string {
  return String(error?.message || error?.details || error?.hint || error?.code || "Unknown error");
}

function isMissingFunctionError(error: MaybeError): boolean {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "42883" ||
    message.includes("Could not find the function") ||
    message.includes("function") && message.includes("does not exist")
  );
}

async function callRpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) {
    throw new Error(describeError(error));
  }
  return data as T;
}

function toAdminUser(row: Record<string, unknown>): AdminUser {
  return {
    id: Number(row.id),
    username: (row.username as string | null) ?? null,
    first_name: (row.first_name as string | null) ?? null,
    platform: (row.platform as string | null) ?? null,
    platform_id: (row.platform_id as string | null) ?? null,
    chat_id: row.chat_id == null ? null : Number(row.chat_id),
    is_active: row.is_active !== false,
    is_banned: row.is_banned === true,
    plan: ((row.plan as string | null) ?? "free") as AdminUser["plan"],
    premium_until: (row.premium_until as string | null) ?? null,
    daily_ai_usage_count: Number(row.daily_ai_usage_count ?? 0),
    last_usage_reset_date: (row.last_usage_reset_date as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    last_active: (row.last_active as string | null) ?? null,
  };
}

function toPaymentRow(row: Record<string, unknown>): PaymentRow {
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    amount: Number(row.amount ?? 0),
    payment_method: String(row.payment_method ?? "admin"),
    status: String(row.status ?? "pending"),
    transaction_code: (row.transaction_code as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    days_added: Number(row.days_added ?? 0),
    plan_granted: (row.plan_granted as string | null) ?? null,
    billing_sku: (row.billing_sku as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

function toSubscriptionEvent(row: Record<string, unknown>): SubscriptionEvent {
  return {
    id: String(row.id),
    event_type: String(row.event_type ?? ""),
    plan_from: (row.plan_from as string | null) ?? null,
    plan_to: (row.plan_to as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    source: String(row.source ?? "admin"),
    notes: (row.notes as string | null) ?? null,
    billing_sku: (row.billing_sku as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function toSystemStats(row: Record<string, unknown>): SystemStats {
  return {
    totalUsers: Number(row.total_users ?? 0),
    premiumUsers: Number(row.premium_users ?? 0),
    lifetimeUsers: Number(row.lifetime_users ?? 0),
    todayAICalls: Number(row.today_ai_calls ?? 0),
    monthRevenue: Number(row.month_revenue ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    expiringIn7Days: Number(row.expiring_in_7_days ?? 0),
  };
}

export async function getAdminAccessState(): Promise<AdminAccessState> {
  try {
    const data = await callRpc<Record<string, unknown>>("admin_get_access_state");
    return {
      isAuthenticated: data.is_authenticated === true,
      linkedUserId: data.linked_user_id == null ? null : Number(data.linked_user_id),
      isAdmin: data.is_admin === true,
      email: (data.email as string | null) ?? null,
      checkedAt: String(data.checked_at ?? new Date().toISOString()),
      reason: (data.reason as string | null) ?? null,
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      linkedUserId: null,
      isAdmin: false,
      email: null,
      checkedAt: new Date().toISOString(),
      reason: String((error as Error)?.message || error || "admin_access_check_failed"),
    };
  }
}

export async function getSaasSchemaReadiness(): Promise<SchemaReadiness> {
  try {
    const data = await callRpc<Record<string, unknown>>("admin_schema_readiness");
    return {
      ready: data.ready === true,
      missing: Array.isArray(data.missing) ? data.missing.map(String) : [],
      checkedAt: String(data.checked_at ?? new Date().toISOString()),
    };
  } catch (error) {
    const message = (error as Error)?.message || "";
    return {
      ready: false,
      missing: [
        isMissingFunctionError({ message })
          ? "saas_upgrade_v4_website_first.sql"
          : message || "schema_readiness_check_failed",
      ],
      checkedAt: new Date().toISOString(),
    };
  }
}

async function assertSaasSchemaReady(): Promise<void> {
  const readiness = await getSaasSchemaReadiness();
  if (!readiness.ready) {
    throw new Error(`SaaS schema chua san sang: ${readiness.missing.join(", ")}`);
  }
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await callRpc<Record<string, unknown>[]>("admin_list_users");
  return (data ?? []).map(toAdminUser);
}

export async function fetchPayments(): Promise<PaymentRow[]> {
  const data = await callRpc<Record<string, unknown>[]>("admin_list_payments");
  return (data ?? []).map(toPaymentRow);
}

export async function addDaysToUser(
  userId: number,
  days: number,
  billingSku: BillingSku = "monthly",
  amount = 0,
  txCode = "",
  note = "",
): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_add_days", {
    p_user_id: userId,
    p_days: days,
    p_billing_sku: billingSku,
    p_amount: amount,
    p_tx_code: txCode || null,
    p_note: note || null,
  });
}

export async function removeDaysFromUser(userId: number, days: number): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_remove_days", {
    p_user_id: userId,
    p_days: days,
  });
}

export async function toggleUserBan(userId: number, ban: boolean): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_toggle_ban", {
    p_user_id: userId,
    p_ban: ban,
  });
}

export async function logPayment(
  userId: number,
  amount: number,
  billingSku: BillingSku,
  txCode: string,
  note: string,
): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_log_manual_payment", {
    p_user_id: userId,
    p_amount: amount,
    p_billing_sku: billingSku,
    p_tx_code: txCode || null,
    p_note: note || null,
  });
}

export async function getSubscriptionEvents(userId: number): Promise<SubscriptionEvent[]> {
  const data = await callRpc<Record<string, unknown>[]>("admin_get_subscription_timeline", {
    p_user_id: userId,
  });
  return (data ?? []).map(toSubscriptionEvent);
}

export async function getSystemStats(): Promise<SystemStats> {
  const data = await callRpc<Record<string, unknown>>("admin_get_overview");
  return toSystemStats(data ?? {});
}

export function exportUsersCSV(users: Record<string, unknown>[]): void {
  const headers = [
    "id",
    "username",
    "first_name",
    "platform",
    "platform_id",
    "chat_id",
    "plan",
    "premium_until",
    "daily_ai_usage_count",
    "is_active",
    "is_banned",
    "created_at",
    "last_active",
  ];
  const rows = users.map((user) =>
    headers.map((header) => `"${String(user[header] ?? "").replace(/"/g, '""')}"`).join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `calotrack_users_${new Date().toISOString().split("T")[0]}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function describeSchemaReadiness(readiness: SchemaReadiness | null): string {
  if (!readiness) return "Dang kiem tra schema SaaS...";
  if (readiness.ready) return "Schema SaaS da san sang.";
  return `Schema SaaS chua san sang: ${readiness.missing.join(", ")}`;
}

export function getAdminSkuOptions() {
  return BILLING_SKU_OPTIONS.map((offer) => ({
    value: offer.sku,
    label: `${offer.shortLabel} - ${offer.days ?? "vinh vien"} ${offer.days ? "ngay" : ""}`.trim(),
    priceVnd: offer.priceVnd,
    tier: formatTierLabel(offer.tier),
  }));
}

export function getQuotaThresholdNotice(usageCount: number): string | null {
  const threshold = getFreeDailyLimit();
  if (usageCount < threshold) return null;
  return `Da cham nguong free ${usageCount}/${threshold}`;
}

export function getQuotaProgressPercent(usageCount: number): number {
  const threshold = getFreeDailyLimit();
  if (threshold <= 0) return 0;
  return Math.min((usageCount / threshold) * 100, 100);
}
