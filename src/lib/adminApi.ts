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

export type FoodCatalogRow = {
  id: number;
  name: string;
  category: string | null;
  food_type: string | null;
  brand_name: string | null;
  is_active: boolean;
  default_serving_grams: number | null;
  default_portion_label: string | null;
  primary_source_type: string | null;
  primary_source_confidence: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  alias_count: number;
  updated_at: string | null;
};

export type FoodCandidateRow = {
  id: number;
  raw_name: string;
  normalized_name: string | null;
  raw_portion: string | null;
  candidate_type: string | null;
  status: string | null;
  promotion_status: string | null;
  usage_count: number;
  match_food_id: number | null;
  match_confidence: number | null;
  suggested_food_name: string | null;
  suggested_serving_label: string | null;
  created_at: string | null;
  last_seen_at: string | null;
};

export type FoodDraft = {
  id?: number | null;
  name: string;
  category?: string | null;
  foodType?: string | null;
  brandName?: string | null;
  defaultServingGrams?: number | null;
  defaultPortionLabel?: string | null;
  primarySourceType?: string | null;
  primarySourceConfidence?: number | null;
  editorNotes?: string | null;
  isActive?: boolean;
};

export type FoodAliasDraft = {
  foodId: number;
  alias: string;
  aliasType?: string | null;
  isPrimary?: boolean;
  sourceType?: string | null;
  confidence?: number | null;
};

export type FoodNutritionDraft = {
  foodId: number;
  servingLabel?: string | null;
  servingGrams?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  confidence?: number | null;
  isPrimary?: boolean;
};

export type FoodPortionDraft = {
  foodId: number;
  label: string;
  grams: number;
  quantityValue?: number | null;
  quantityUnit?: string | null;
  portionType?: string | null;
  sourceType?: string | null;
  confidence?: number | null;
  isDefault?: boolean;
};

export type PromoteFoodCandidateDraft = {
  candidateId: number;
  name?: string | null;
  category?: string | null;
  foodType?: string | null;
  brandName?: string | null;
  servingLabel?: string | null;
  servingGrams?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  aliases?: string[];
};

export type FoodCsvRow = {
  food_name: string;
  alias_list?: string;
  brand_name?: string;
  category?: string;
  serving_label?: string;
  serving_grams?: number | string;
  calories?: number | string;
  protein?: number | string;
  carbs?: number | string;
  fat?: number | string;
  source_type?: string;
  confidence?: number | string;
};

export type FoodCsvDryRunResult = {
  totalRows: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  newCount: number;
  preview: Record<string, unknown>[];
};

export type FoodCsvCommitResult = {
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
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

function toFoodCatalogRow(row: Record<string, unknown>): FoodCatalogRow {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    category: (row.category as string | null) ?? null,
    food_type: (row.food_type as string | null) ?? null,
    brand_name: (row.brand_name as string | null) ?? null,
    is_active: row.is_active !== false,
    default_serving_grams: row.default_serving_grams == null ? null : Number(row.default_serving_grams),
    default_portion_label: (row.default_portion_label as string | null) ?? null,
    primary_source_type: (row.primary_source_type as string | null) ?? null,
    primary_source_confidence: row.primary_source_confidence == null ? null : Number(row.primary_source_confidence),
    calories: row.calories == null ? null : Number(row.calories),
    protein: row.protein == null ? null : Number(row.protein),
    carbs: row.carbs == null ? null : Number(row.carbs),
    fat: row.fat == null ? null : Number(row.fat),
    alias_count: Number(row.alias_count ?? 0),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

function toFoodCandidateRow(row: Record<string, unknown>): FoodCandidateRow {
  return {
    id: Number(row.id),
    raw_name: String(row.raw_name ?? ""),
    normalized_name: (row.normalized_name as string | null) ?? null,
    raw_portion: (row.raw_portion as string | null) ?? null,
    candidate_type: (row.candidate_type as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    promotion_status: (row.promotion_status as string | null) ?? null,
    usage_count: Number(row.usage_count ?? 0),
    match_food_id: row.match_food_id == null ? null : Number(row.match_food_id),
    match_confidence: row.match_confidence == null ? null : Number(row.match_confidence),
    suggested_food_name: (row.suggested_food_name as string | null) ?? null,
    suggested_serving_label: (row.suggested_serving_label as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    last_seen_at: (row.last_seen_at as string | null) ?? null,
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

export async function fetchFoodCatalog(search = ""): Promise<FoodCatalogRow[]> {
  await assertSaasSchemaReady();
  const data = await callRpc<Record<string, unknown>[]>("admin_food_list", {
    p_search: search || null,
  });
  return (data ?? []).map(toFoodCatalogRow);
}

export async function fetchFoodCandidates(status = ""): Promise<FoodCandidateRow[]> {
  await assertSaasSchemaReady();
  const data = await callRpc<Record<string, unknown>[]>("admin_food_candidates_list", {
    p_status: status || null,
  });
  return (data ?? []).map(toFoodCandidateRow);
}

export async function upsertFood(input: FoodDraft): Promise<number> {
  await assertSaasSchemaReady();
  const id = await callRpc<number>("admin_food_upsert", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_category: input.category ?? null,
    p_food_type: input.foodType ?? null,
    p_brand_name: input.brandName ?? null,
    p_default_serving_grams: input.defaultServingGrams ?? null,
    p_default_portion_label: input.defaultPortionLabel ?? null,
    p_primary_source_type: input.primarySourceType ?? "manual",
    p_primary_source_confidence: input.primarySourceConfidence ?? 1,
    p_editor_notes: input.editorNotes ?? null,
    p_is_active: input.isActive ?? true,
  });
  return Number(id);
}

export async function upsertFoodAlias(input: FoodAliasDraft): Promise<number> {
  await assertSaasSchemaReady();
  const id = await callRpc<number>("admin_food_alias_upsert", {
    p_food_id: input.foodId,
    p_alias: input.alias,
    p_alias_type: input.aliasType ?? "common_name",
    p_is_primary: input.isPrimary ?? false,
    p_source_type: input.sourceType ?? "manual",
    p_confidence: input.confidence ?? 1,
  });
  return Number(id);
}

export async function upsertFoodNutrition(input: FoodNutritionDraft): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_food_nutrition_upsert", {
    p_food_id: input.foodId,
    p_serving_label: input.servingLabel ?? "100g",
    p_serving_grams: input.servingGrams ?? 100,
    p_calories: input.calories ?? 0,
    p_protein: input.protein ?? 0,
    p_carbs: input.carbs ?? 0,
    p_fat: input.fat ?? 0,
    p_fiber: input.fiber ?? null,
    p_source_type: input.sourceType ?? "manual",
    p_source_ref: input.sourceRef ?? null,
    p_confidence: input.confidence ?? 1,
    p_is_primary: input.isPrimary ?? true,
  });
}

export async function upsertFoodPortion(input: FoodPortionDraft): Promise<number> {
  await assertSaasSchemaReady();
  const id = await callRpc<number>("admin_food_portion_upsert", {
    p_food_id: input.foodId,
    p_label: input.label,
    p_grams: input.grams,
    p_quantity_value: input.quantityValue ?? 1,
    p_quantity_unit: input.quantityUnit ?? null,
    p_portion_type: input.portionType ?? "serving",
    p_source_type: input.sourceType ?? "manual",
    p_confidence: input.confidence ?? 1,
    p_is_default: input.isDefault ?? false,
  });
  return Number(id);
}

export async function promoteFoodCandidate(input: PromoteFoodCandidateDraft): Promise<number> {
  await assertSaasSchemaReady();
  const id = await callRpc<number>("admin_food_candidate_promote", {
    p_candidate_id: input.candidateId,
    p_name: input.name ?? null,
    p_category: input.category ?? null,
    p_food_type: input.foodType ?? null,
    p_brand_name: input.brandName ?? null,
    p_serving_label: input.servingLabel ?? "100g",
    p_serving_grams: input.servingGrams ?? 100,
    p_calories: input.calories ?? 0,
    p_protein: input.protein ?? 0,
    p_carbs: input.carbs ?? 0,
    p_fat: input.fat ?? 0,
    p_aliases: input.aliases ?? [],
  });
  return Number(id);
}

export async function dryRunFoodCsvImport(rows: FoodCsvRow[]): Promise<FoodCsvDryRunResult> {
  await assertSaasSchemaReady();
  const data = await callRpc<Record<string, unknown>>("admin_food_csv_import_dry_run", {
    p_rows: rows,
  });
  return {
    totalRows: Number(data.total_rows ?? 0),
    validCount: Number(data.valid_count ?? 0),
    errorCount: Number(data.error_count ?? 0),
    duplicateCount: Number(data.duplicate_count ?? 0),
    newCount: Number(data.new_count ?? 0),
    preview: Array.isArray(data.preview) ? (data.preview as Record<string, unknown>[]) : [],
  };
}

export async function commitFoodCsvImport(rows: FoodCsvRow[]): Promise<FoodCsvCommitResult> {
  await assertSaasSchemaReady();
  const data = await callRpc<Record<string, unknown>>("admin_food_csv_import_commit", {
    p_rows: rows,
  });
  return {
    totalRows: Number(data.total_rows ?? 0),
    insertedCount: Number(data.inserted_count ?? 0),
    updatedCount: Number(data.updated_count ?? 0),
    skippedCount: Number(data.skipped_count ?? 0),
  };
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
