import { supabase } from "@/lib/supabase";
import {
  BILLING_OFFERS,
  BILLING_SKU_OPTIONS,
  type BillingSku,
  formatBillingPriceVnd,
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

export type AdminRole =
  | "super_admin"
  | "billing_admin"
  | "support_admin"
  | "content_admin"
  | "analyst";
export type AdminSection =
  | "overview"
  | "users"
  | "subscriptions"
  | "entitlements"
  | "usage"
  | "nutrition-data"
  | "support"
  | "analytics"
  | "system"
  | "security";

export type AdminUser = {
  id: number;
  username: string | null;
  first_name: string | null;
  platform: string | null;
  platform_id: string | null;
  chat_id: number | null;
  email: string | null;
  auth_user_id: string | null;
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
  user_name?: string | null;
  channel?: string | null;
  customer_id?: number | null;
  customer_phone?: string | null;
  amount: number;
  payment_method: string;
  status: string;
  transaction_code: string | null;
  description: string | null;
  days_added: number;
  plan_granted: string | null;
  billing_sku: string | null;
  provider_event_id?: string | null;
  entitlement_result?: string | null;
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
  isOwner: boolean;
  roles: AdminRole[];
  email: string | null;
  checkedAt: string;
  reason: string | null;
};

export type AdminCustomer = {
  id: number;
  phone_e164: string | null;
  phone_display: string | null;
  full_name: string | null;
  plan: "free" | "pro" | "lifetime";
  premium_until: string | null;
  entitlement_source: string | null;
  status: string;
  quota_used_today: number;
  channel_count: number;
  linked_portal_count: number;
  last_activity: string | null;
  total_spend: number;
};

export type AdminChannelAccount = {
  id: number;
  customer_id: number | null;
  channel: string;
  platform_user_id: string;
  platform_chat_id: string | null;
  display_name: string | null;
  phone_claimed: string | null;
  link_status: string;
  linked_user_id: number | null;
  customer_phone: string | null;
  customer_plan: string | null;
  auth_email: string | null;
  last_activity: string | null;
};

export type AdminLinkReview = {
  id: number;
  customer_id: number | null;
  channel_account_id: number;
  channel: string;
  platform_user_id: string;
  display_name: string | null;
  suggested_phone: string | null;
  reason: string;
  status: string;
  reviewed_at: string | null;
  created_at: string;
};

export type CustomerSupportNote = {
  id: number;
  customer_id: number;
  note: string;
  actor_display_name: string | null;
  created_at: string;
};

export type AdminCustomer360 = {
  customer: AdminCustomer | null;
  channels: AdminChannelAccount[];
  recentPayments: PaymentRow[];
  supportNotes: CustomerSupportNote[];
  linkedAuths: {
    auth_user_id: string | null;
    email: string | null;
    link_status: string | null;
  }[];
  conversationState: Record<string, unknown> | null;
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

export type AdminMember = {
  id: number;
  auth_user_id: string | null;
  linked_user_id: number | null;
  display_name: string | null;
  email: string | null;
  username: string | null;
  is_owner: boolean;
  is_active: boolean;
  roles: AdminRole[];
  created_at: string | null;
  updated_at: string | null;
};

export type AdminAuditLogRow = {
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  actor_display_name: string | null;
  role_snapshot: AdminRole[];
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AdminSystemHealth = {
  schemaReady: boolean;
  schemaMissing: string[];
  pendingPayments: number;
  duplicateLikePayments: number;
  failedPaymentEvents: number;
  catalogCandidatesPending: number;
  aiCallsToday: number;
  adminMembers: number;
  lastWebhookAt: string | null;
  checkedAt: string;
};

export type SupportNote = {
  id: number;
  user_id: number;
  note: string;
  actor_display_name: string | null;
  created_at: string;
};

export type AdminUser360 = {
  user: AdminUser | null;
  recentPayments: PaymentRow[];
  subscriptionEvents: SubscriptionEvent[];
  supportNotes: SupportNote[];
  conversationState: Record<string, unknown> | null;
  linkedAuthState: {
    auth_user_id: string | null;
    email: string | null;
    pending_intent: string | null;
  } | null;
};

const ADMIN_ROLES: AdminRole[] = [
  "super_admin",
  "billing_admin",
  "support_admin",
  "content_admin",
  "analyst",
];

function describeError(error: MaybeError): string {
  return String(error?.message || error?.details || error?.hint || error?.code || "Unknown error");
}

function isMissingFunctionError(error: MaybeError): boolean {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "42883" ||
    message.includes("Could not find the function") ||
    (message.includes("function") && message.includes("does not exist"))
  );
}

async function callRpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) {
    throw new Error(describeError(error));
  }
  return data as T;
}

async function callRpcWithFallback<T>(
  fn: string,
  fallback: () => Promise<T> | T,
  params?: Record<string, unknown>,
): Promise<T> {
  try {
    return await callRpc<T>(fn, params);
  } catch (error) {
    if (isMissingFunctionError(error as Error)) {
      return await fallback();
    }
    throw error;
  }
}

function normalizeAdminRole(value: unknown): AdminRole | null {
  if (value === "super_admin" || value === "billing_admin" || value === "support_admin" || value === "content_admin" || value === "analyst") {
    return value;
  }
  if (value === "finance") {
    return "billing_admin";
  }
  if (value === "catalog") {
    return "content_admin";
  }
  if (value === "support") {
    return "support_admin";
  }
  if (value === "owner") {
    return "super_admin";
  }
  return null;
}

function ensureRoleArray(value: unknown, isAdminFallback = false): AdminRole[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeAdminRole(entry))
      .filter((entry): entry is AdminRole => Boolean(entry));
  }
  return isAdminFallback ? [...ADMIN_ROLES] : [];
}

function toAdminUser(row: Record<string, unknown>): AdminUser {
  return {
    id: Number(row.id),
    username: (row.username as string | null) ?? null,
    first_name: (row.first_name as string | null) ?? null,
    platform: (row.platform as string | null) ?? null,
    platform_id: (row.platform_id as string | null) ?? null,
    chat_id: row.chat_id == null ? null : Number(row.chat_id),
    email: (row.email as string | null) ?? null,
    auth_user_id: (row.auth_user_id as string | null) ?? null,
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
    user_name: (row.user_name as string | null) ?? null,
    channel: (row.channel as string | null) ?? null,
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    customer_phone: (row.customer_phone as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    payment_method: String(row.payment_method ?? "admin"),
    status: String(row.status ?? "pending"),
    transaction_code: (row.transaction_code as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    days_added: Number(row.days_added ?? 0),
    plan_granted: (row.plan_granted as string | null) ?? null,
    billing_sku: (row.billing_sku as string | null) ?? null,
    provider_event_id: (row.provider_event_id as string | null) ?? null,
    entitlement_result: (row.entitlement_result as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

function toSubscriptionEvent(row: Record<string, unknown>): SubscriptionEvent {
  return {
    id: String(row.id ?? ""),
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

function toAdminCustomer(row: Record<string, unknown>): AdminCustomer {
  return {
    id: Number(row.id),
    phone_e164: (row.phone_e164 as string | null) ?? null,
    phone_display: (row.phone_display as string | null) ?? null,
    full_name: (row.full_name as string | null) ?? null,
    plan: ((row.plan as string | null) ?? "free") as AdminCustomer["plan"],
    premium_until: (row.premium_until as string | null) ?? null,
    entitlement_source: (row.entitlement_source as string | null) ?? null,
    status: String(row.status ?? "active"),
    quota_used_today: Number(row.quota_used_today ?? 0),
    channel_count: Number(row.channel_count ?? 0),
    linked_portal_count: Number(row.linked_portal_count ?? 0),
    last_activity: (row.last_activity as string | null) ?? null,
    total_spend: Number(row.total_spend ?? 0),
  };
}

function toAdminChannelAccount(row: Record<string, unknown>): AdminChannelAccount {
  return {
    id: Number(row.id),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    channel: String(row.channel ?? "telegram"),
    platform_user_id: String(row.platform_user_id ?? ""),
    platform_chat_id: (row.platform_chat_id as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    phone_claimed: (row.phone_claimed as string | null) ?? null,
    link_status: String(row.link_status ?? "unlinked"),
    linked_user_id: row.linked_user_id == null ? null : Number(row.linked_user_id),
    customer_phone: (row.customer_phone as string | null) ?? null,
    customer_plan: (row.customer_plan as string | null) ?? null,
    auth_email: (row.auth_email as string | null) ?? null,
    last_activity: (row.last_activity as string | null) ?? null,
  };
}

function toAdminLinkReview(row: Record<string, unknown>): AdminLinkReview {
  return {
    id: Number(row.id),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    channel_account_id: Number(row.channel_account_id),
    channel: String(row.channel ?? "telegram"),
    platform_user_id: String(row.platform_user_id ?? ""),
    display_name: (row.display_name as string | null) ?? null,
    suggested_phone: (row.suggested_phone as string | null) ?? null,
    reason: String(row.reason ?? ""),
    status: String(row.status ?? "pending"),
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function toCustomerSupportNote(row: Record<string, unknown>): CustomerSupportNote {
  return {
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    note: String(row.note ?? ""),
    actor_display_name: (row.actor_display_name as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
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

function toAdminMember(row: Record<string, unknown>): AdminMember {
  return {
    id: Number(row.id),
    auth_user_id: (row.auth_user_id as string | null) ?? null,
    linked_user_id: row.linked_user_id == null ? null : Number(row.linked_user_id),
    display_name: (row.display_name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    is_owner: row.is_owner === true,
    is_active: row.is_active !== false,
    roles: ensureRoleArray(row.roles, row.is_owner === true),
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

function toAdminAuditLog(row: Record<string, unknown>): AdminAuditLogRow {
  return {
    id: Number(row.id),
    action: String(row.action ?? ""),
    target_type: (row.target_type as string | null) ?? null,
    target_id: row.target_id == null ? null : String(row.target_id),
    actor_display_name: (row.actor_display_name as string | null) ?? null,
    role_snapshot: ensureRoleArray(row.role_snapshot),
    metadata:
      row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function toSupportNote(row: Record<string, unknown>): SupportNote {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    note: String(row.note ?? ""),
    actor_display_name: (row.actor_display_name as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function emptyAccessState(reason: string | null): AdminAccessState {
  return {
    isAuthenticated: false,
    linkedUserId: null,
    isAdmin: false,
    isOwner: false,
    roles: [],
    email: null,
    checkedAt: new Date().toISOString(),
    reason,
  };
}

export async function getAdminAccessState(): Promise<AdminAccessState> {
  try {
    const data = await callRpc<Record<string, unknown>>("admin_get_access_state");
    const isAdmin = data.is_admin === true;
    return {
      isAuthenticated: data.is_authenticated === true,
      linkedUserId: data.linked_user_id == null ? null : Number(data.linked_user_id),
      isAdmin,
      isOwner: data.is_owner === true || (isAdmin && !Array.isArray(data.roles)),
      roles: ensureRoleArray(data.roles, isAdmin),
      email: (data.email as string | null) ?? null,
      checkedAt: String(data.checked_at ?? new Date().toISOString()),
      reason: (data.reason as string | null) ?? null,
    };
  } catch (error) {
    return emptyAccessState(String((error as Error)?.message || error || "admin_access_check_failed"));
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
    throw new Error(`Schema SaaS chưa sẵn sàng: ${readiness.missing.join(", ")}`);
  }
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await callRpc<Record<string, unknown>[]>("admin_list_users");
  return (data ?? []).map(toAdminUser);
}

export async function fetchAdminCustomers(): Promise<AdminCustomer[]> {
  const data = await callRpcWithFallback<Record<string, unknown>[]>(
    "admin_list_customers",
    async () => {
      const users = await fetchAdminUsers().catch(() => []);
      return users.map((user) => ({
        id: user.id,
        phone_e164: null,
        phone_display: null,
        full_name: user.first_name ?? user.username ?? null,
        plan: user.plan,
        premium_until: user.premium_until,
        entitlement_source: user.plan === "free" ? "compat_free" : "compat_user",
        status: user.is_banned ? "blocked" : "active",
        quota_used_today: user.daily_ai_usage_count,
        channel_count: 1,
        linked_portal_count: user.auth_user_id ? 1 : 0,
        last_activity: user.last_active ?? user.created_at,
        total_spend: 0,
      }));
    },
  );
  return (data ?? []).map(toAdminCustomer);
}

export async function fetchAdminChannelAccounts(): Promise<AdminChannelAccount[]> {
  const data = await callRpcWithFallback<Record<string, unknown>[]>(
    "admin_list_channel_accounts",
    async () => {
      const users = await fetchAdminUsers().catch(() => []);
      return users.map((user) => ({
        id: user.id,
        customer_id: user.id,
        channel: user.platform ?? "telegram",
        platform_user_id: user.platform_id ?? String(user.id),
        platform_chat_id: user.chat_id == null ? null : String(user.chat_id),
        display_name: user.first_name ?? user.username ?? user.email,
        phone_claimed: null,
        link_status: user.auth_user_id || user.email ? "linked" : "unlinked",
        linked_user_id: user.id,
        customer_phone: null,
        customer_plan: user.plan,
        auth_email: user.email,
        last_activity: user.last_active ?? user.created_at,
      }));
    },
  );
  return (data ?? []).map(toAdminChannelAccount);
}

export async function fetchAdminLinkReviews(): Promise<AdminLinkReview[]> {
  const data = await callRpcWithFallback<Record<string, unknown>[]>("admin_list_link_reviews", () => []);
  return (data ?? []).map(toAdminLinkReview);
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

export async function fetchAdminSystemHealth(): Promise<AdminSystemHealth> {
  const data = await callRpcWithFallback<Record<string, unknown>>(
    "admin_get_system_health",
    async () => {
      const [schema, stats, payments, candidates, members] = await Promise.all([
        getSaasSchemaReadiness(),
        getSystemStats().catch(() => null),
        fetchPayments().catch(() => []),
        fetchFoodCandidates("pending").catch(() => []),
        fetchAdminMembers().catch(() => []),
      ]);
      const transactionCodeCounts = new Map<string, number>();
      payments.forEach((payment) => {
        if (payment.transaction_code) {
          transactionCodeCounts.set(
            payment.transaction_code,
            (transactionCodeCounts.get(payment.transaction_code) ?? 0) + 1,
          );
        }
      });
      return {
        schemaReady: schema.ready,
        schemaMissing: schema.missing,
        pendingPayments: payments.filter((payment) => payment.status === "pending").length,
        duplicateLikePayments: payments.filter(
          (payment) => payment.transaction_code && (transactionCodeCounts.get(payment.transaction_code) ?? 0) > 1,
        ).length,
        failedPaymentEvents: payments.filter((payment) => payment.status === "failed").length,
        catalogCandidatesPending: candidates.length,
        aiCallsToday: stats?.todayAICalls ?? 0,
        adminMembers: members.length,
        lastWebhookAt:
          payments
            .map((payment) => payment.completed_at || payment.created_at)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] ?? null,
        checkedAt: new Date().toISOString(),
      };
    },
  );

  return {
    schemaReady: data.schema_ready === true || data.schemaReady === true,
    schemaMissing: Array.isArray(data.schema_missing)
      ? data.schema_missing.map(String)
      : Array.isArray(data.schemaMissing)
        ? data.schemaMissing.map(String)
        : [],
    pendingPayments: Number(data.pending_payments ?? data.pendingPayments ?? 0),
    duplicateLikePayments: Number(data.duplicate_like_payments ?? data.duplicateLikePayments ?? 0),
    failedPaymentEvents: Number(data.failed_payment_events ?? data.failedPaymentEvents ?? 0),
    catalogCandidatesPending: Number(data.catalog_candidates_pending ?? data.catalogCandidatesPending ?? 0),
    aiCallsToday: Number(data.ai_calls_today ?? data.aiCallsToday ?? 0),
    adminMembers: Number(data.admin_members ?? data.adminMembers ?? 0),
    lastWebhookAt: (data.last_webhook_at as string | null) ?? (data.lastWebhookAt as string | null) ?? null,
    checkedAt: String(data.checked_at ?? data.checkedAt ?? new Date().toISOString()),
  };
}

export async function fetchAdminAuditLog(limit = 100): Promise<AdminAuditLogRow[]> {
  const data = await callRpcWithFallback<Record<string, unknown>[]>("admin_list_audit_log", () => [], {
    p_limit: limit,
  });
  return (data ?? []).map(toAdminAuditLog);
}

export async function fetchAdminMembers(): Promise<AdminMember[]> {
  const access = await getAdminAccessState();
  const data = await callRpcWithFallback<Record<string, unknown>[]>(
    "admin_list_members",
    () =>
      access.isAdmin
        ? [
            {
              id: 0,
              auth_user_id: null,
              linked_user_id: access.linkedUserId,
              display_name: access.email ?? "Bootstrap owner",
              email: access.email,
              username: null,
              is_owner: true,
              is_active: true,
              roles: access.roles.length ? access.roles : ADMIN_ROLES,
              created_at: access.checkedAt,
              updated_at: access.checkedAt,
            },
          ]
        : [],
  );
  return (data ?? []).map(toAdminMember);
}

export async function fetchAdminCustomer360(customerId: number): Promise<AdminCustomer360> {
  const fallback = async (): Promise<AdminCustomer360> => {
    const [customers, channels, payments] = await Promise.all([
      fetchAdminCustomers().catch(() => []),
      fetchAdminChannelAccounts().catch(() => []),
      fetchPayments().catch(() => []),
    ]);
    const customer = customers.find((row) => row.id === customerId) ?? null;
    return {
      customer,
      channels: channels.filter((row) => row.customer_id === customerId),
      recentPayments: payments.filter((row) => row.customer_id === customerId || row.user_id === customerId).slice(0, 10),
      supportNotes: [],
      linkedAuths:
        customer?.linked_portal_count && customer.linked_portal_count > 0
          ? [{ auth_user_id: null, email: null, link_status: "linked" }]
          : [],
      conversationState: null,
    };
  };

  const data = await callRpcWithFallback<Record<string, unknown>>("admin_get_customer_360", fallback, {
    p_customer_id: customerId,
  });

  if ("customer" in data || "channels" in data || "recent_payments" in data) {
    return {
      customer:
        data.customer && typeof data.customer === "object"
          ? toAdminCustomer(data.customer as Record<string, unknown>)
          : (data.customer as AdminCustomer | null) ?? null,
      channels: Array.isArray(data.channels)
        ? data.channels.map((row) => toAdminChannelAccount(row as Record<string, unknown>))
        : [],
      recentPayments: Array.isArray(data.recent_payments)
        ? data.recent_payments.map((row) => toPaymentRow(row as Record<string, unknown>))
        : Array.isArray(data.recentPayments)
          ? data.recentPayments.map((row) => toPaymentRow(row as Record<string, unknown>))
          : [],
      supportNotes: Array.isArray(data.support_notes)
        ? data.support_notes.map((row) => toCustomerSupportNote(row as Record<string, unknown>))
        : Array.isArray(data.supportNotes)
          ? data.supportNotes.map((row) => toCustomerSupportNote(row as Record<string, unknown>))
          : [],
      linkedAuths: Array.isArray(data.linked_auths)
        ? data.linked_auths.map((row) => ({
            auth_user_id: ((row as Record<string, unknown>).auth_user_id as string | null) ?? null,
            email: ((row as Record<string, unknown>).email as string | null) ?? null,
            link_status: ((row as Record<string, unknown>).link_status as string | null) ?? null,
          }))
        : [],
      conversationState:
        data.conversation_state && typeof data.conversation_state === "object"
          ? (data.conversation_state as Record<string, unknown>)
          : data.conversationState && typeof data.conversationState === "object"
            ? (data.conversationState as Record<string, unknown>)
            : null,
    };
  }

  return data as unknown as AdminCustomer360;
}

export async function upsertAdminMember(input: {
  linkedUserId: number | null;
  authUserId?: string | null;
  displayName?: string | null;
  isOwner?: boolean;
}): Promise<number> {
  const id = await callRpc<number>("admin_upsert_member", {
    p_linked_user_id: input.linkedUserId,
    p_auth_user_id: input.authUserId ?? null,
    p_display_name: input.displayName ?? null,
    p_is_owner: input.isOwner ?? false,
  });
  return Number(id);
}

export async function setAdminMemberRoles(memberId: number, roles: AdminRole[]): Promise<void> {
  await callRpc("admin_set_member_roles", {
    p_member_id: memberId,
    p_roles: roles,
  });
}

export async function toggleAdminMemberActive(memberId: number, isActive: boolean): Promise<void> {
  await callRpc("admin_toggle_member_active", {
    p_member_id: memberId,
    p_is_active: isActive,
  });
}

export async function fetchAdminUser360(userId: number): Promise<AdminUser360> {
  const fallback = async (): Promise<AdminUser360> => {
    const [users, payments, events] = await Promise.all([
      fetchAdminUsers().catch(() => []),
      fetchPayments().catch(() => []),
      getSubscriptionEvents(userId).catch(() => []),
    ]);
    return {
      user: users.find((row) => row.id === userId) ?? null,
      recentPayments: payments.filter((row) => row.user_id === userId).slice(0, 10),
      subscriptionEvents: events,
      supportNotes: [],
      conversationState: null,
      linkedAuthState: null,
    };
  };

  const data = await callRpcWithFallback<Record<string, unknown>>("admin_get_user_360", fallback, {
    p_user_id: userId,
  });

  if ("user" in data || "recent_payments" in data || "support_notes" in data) {
    return {
      user:
        data.user && typeof data.user === "object"
          ? toAdminUser(data.user as Record<string, unknown>)
          : (data.user as AdminUser | null) ?? null,
      recentPayments: Array.isArray(data.recent_payments)
        ? data.recent_payments.map((row) => toPaymentRow(row as Record<string, unknown>))
        : Array.isArray(data.recentPayments)
          ? data.recentPayments.map((row) => toPaymentRow(row as Record<string, unknown>))
          : [],
      subscriptionEvents: Array.isArray(data.subscription_events)
        ? data.subscription_events.map((row) => toSubscriptionEvent(row as Record<string, unknown>))
        : Array.isArray(data.subscriptionEvents)
          ? data.subscriptionEvents.map((row) => toSubscriptionEvent(row as Record<string, unknown>))
          : [],
      supportNotes: Array.isArray(data.support_notes)
        ? data.support_notes.map((row) => toSupportNote(row as Record<string, unknown>))
        : Array.isArray(data.supportNotes)
          ? data.supportNotes.map((row) => toSupportNote(row as Record<string, unknown>))
          : [],
      conversationState:
        data.conversation_state && typeof data.conversation_state === "object"
          ? (data.conversation_state as Record<string, unknown>)
          : data.conversationState && typeof data.conversationState === "object"
            ? (data.conversationState as Record<string, unknown>)
            : null,
      linkedAuthState:
        data.linked_auth_state && typeof data.linked_auth_state === "object"
          ? {
              auth_user_id: (data.linked_auth_state as Record<string, unknown>).auth_user_id as string | null,
              email: (data.linked_auth_state as Record<string, unknown>).email as string | null,
              pending_intent:
                ((data.linked_auth_state as Record<string, unknown>).pending_intent as string | null) ?? null,
            }
          : (data.linkedAuthState as AdminUser360["linkedAuthState"]) ?? null,
    };
  }

  return data as unknown as AdminUser360;
}

export async function resetDailyQuota(userId: number): Promise<void> {
  await callRpc("admin_reset_daily_quota", {
    p_user_id: userId,
  });
}

export async function linkUserAccount(userId: number, authUserId: string): Promise<void> {
  await callRpc("admin_link_user_account", {
    p_user_id: userId,
    p_auth_user_id: authUserId,
  });
}

export async function addSupportNote(userId: number, note: string): Promise<void> {
  await callRpc("admin_add_support_note", {
    p_user_id: userId,
    p_note: note,
  });
}

export async function setCustomerPhone(customerId: number, phoneInput: string, fullName?: string): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_set_customer_phone", {
    p_customer_id: customerId,
    p_phone_input: phoneInput,
    p_full_name: fullName ?? null,
  });
}

export async function linkChannelAccount(channelAccountId: number, customerId: number, note = ""): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_link_channel_account", {
    p_channel_account_id: channelAccountId,
    p_customer_id: customerId,
    p_note: note || null,
  });
}

export async function unlinkChannelAccount(channelAccountId: number, note = ""): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_unlink_channel_account", {
    p_channel_account_id: channelAccountId,
    p_note: note || null,
  });
}

export async function mergeCustomers(sourceCustomerId: number, targetCustomerId: number, note = ""): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_merge_customers", {
    p_source_customer_id: sourceCustomerId,
    p_target_customer_id: targetCustomerId,
    p_note: note || null,
  });
}

export async function setCustomerEntitlement(
  customerId: number,
  plan: "free" | "pro" | "lifetime",
  premiumUntil: string | null,
  entitlementSource = "admin",
  note = "",
): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_set_customer_entitlement", {
    p_customer_id: customerId,
    p_plan: plan,
    p_premium_until: premiumUntil,
    p_entitlement_source: entitlementSource,
    p_note: note || null,
  });
}

export async function resetCustomerQuota(customerId: number): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_reset_customer_quota", {
    p_customer_id: customerId,
  });
}

export async function addCustomerSupportNote(customerId: number, note: string): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_add_customer_support_note", {
    p_customer_id: customerId,
    p_note: note,
  });
}

export async function linkPortalAuth(customerId: number, authUserId: string, email = ""): Promise<void> {
  await assertSaasSchemaReady();
  await callRpc("admin_link_portal_auth", {
    p_customer_id: customerId,
    p_auth_user_id: authUserId,
    p_email: email || null,
  });
}

export function exportUsersCSV(users: Record<string, unknown>[]): void {
  const headers = [
    "id",
    "username",
    "first_name",
    "email",
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
  if (!readiness) return "Đang kiểm tra schema SaaS...";
  if (readiness.ready) return "Schema SaaS đã sẵn sàng.";
  return `Schema SaaS chưa sẵn sàng: ${readiness.missing.join(", ")}`;
}

export function getAdminSkuOptions() {
  return BILLING_SKU_OPTIONS.map((offer) => ({
    value: offer.sku,
    label: offer.label,
    priceVnd: offer.priceVnd,
    priceLabel: formatBillingPriceVnd(offer.priceVnd),
    helper: offer.days ? `${offer.days} ngày` : "Vĩnh viễn",
    tier: formatTierLabel(offer.tier),
  }));
}

export function formatAdminSkuLabel(value: string | null | undefined): string {
  if (!value) return "Chưa rõ gói";
  if (value in BILLING_OFFERS) {
    return BILLING_OFFERS[value as BillingSku].label;
  }
  if (value === "pro") return "Pro";
  if (value === "free") return "Free";
  if (value === "lifetime") return "Lifetime";
  return value.replace(/_/g, " ");
}

export function formatAdminPaymentMethod(value: string | null | undefined): string {
  if (!value) return "Chưa rõ nguồn";
  if (value === "payos") return "PayOS";
  if (value === "stripe") return "Stripe";
  if (value === "bank_transfer") return "Chuyển khoản";
  if (value === "manual_admin" || value === "admin") return "Admin thủ công";
  return value.replace(/_/g, " ");
}

export function formatAdminPaymentStatus(value: string | null | undefined): string {
  if (!value) return "Không rõ";
  if (value === "completed") return "Hoàn thành";
  if (value === "pending") return "Đang xử lý";
  if (value === "failed") return "Thất bại";
  if (value === "cancelled") return "Đã hủy";
  return value;
}

export function getQuotaThresholdNotice(usageCount: number): string | null {
  const threshold = getFreeDailyLimit();
  if (usageCount < threshold) return null;
  return `Đã chạm ngưỡng free ${usageCount}/${threshold}`;
}

export function getQuotaProgressPercent(usageCount: number): number {
  const threshold = getFreeDailyLimit();
  if (threshold <= 0) return 0;
  return Math.min((usageCount / threshold) * 100, 100);
}
