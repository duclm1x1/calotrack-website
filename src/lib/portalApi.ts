import { LIFETIME_SENTINEL_ISO, getFreeDailyLimit, type PlanTier } from "@/lib/billing";
import { SITE_CONFIG } from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

export type PortalPaymentSummary = {
  id: string;
  amount: number;
  status: string;
  paymentMethod: string | null;
  billingSku: string | null;
  createdAt: string | null;
  transactionCode: string | null;
};

export type PortalChannelLink = {
  id: string;
  channel: string;
  displayName: string | null;
  linkStatus: string;
  platformUserId: string | null;
};

export type PortalSnapshot = {
  customerId: number | null;
  linkedUserId: number | null;
  email: string | null;
  phoneE164: string | null;
  phoneDisplay: string | null;
  fullName: string | null;
  plan: PlanTier;
  premiumUntil: string | null;
  dailyAiUsageCount: number;
  entitlementSource: string | null;
  entitlementLabel: string;
  quotaLabel: string;
  source: "customer_linked" | "linked_user" | "email_match" | "auth_only";
  payments: PortalPaymentSummary[];
  linkedChannels: PortalChannelLink[];
  lastSyncAt: string;
};

type PortalUserRow = {
  id: number;
  email: string | null;
  plan: string | null;
  premium_until: string | null;
  daily_ai_usage_count: number | null;
  customer_id?: number | null;
};

function isMissingFunctionError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || "");
  return message.includes("Could not find the function") || message.includes("does not exist");
}

async function findLinkedUser(authUserId: string, email: string | null | undefined) {
  const byAuth = await supabase
    .from("users")
    .select("id,email,plan,premium_until,daily_ai_usage_count,customer_id")
    .eq("auth_user_id", authUserId)
    .limit(1)
    .maybeSingle<PortalUserRow>();

  if (!byAuth.error && byAuth.data) {
    return { row: byAuth.data, source: "linked_user" as const };
  }

  if (!email) {
    return { row: null, source: "auth_only" as const };
  }

  const byEmail = await supabase
    .from("users")
    .select("id,email,plan,premium_until,daily_ai_usage_count,customer_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle<PortalUserRow>();

  if (!byEmail.error && byEmail.data) {
    return { row: byEmail.data, source: "email_match" as const };
  }

  return { row: null, source: "auth_only" as const };
}

function normalizePlan(raw: string | null | undefined): PlanTier {
  if (raw === "lifetime") return "lifetime";
  if (raw === "pro") return "pro";
  return "free";
}

function buildEntitlementLabel(plan: PlanTier, premiumUntil: string | null, entitlementSource?: string | null): string {
  if (plan === "lifetime" || premiumUntil === LIFETIME_SENTINEL_ISO) {
    return "Lifetime entitlement";
  }
  if (plan === "pro" && premiumUntil) {
    return `Pro toi ${new Date(premiumUntil).toLocaleDateString("vi-VN")}`;
  }
  if (entitlementSource) {
    return `Free tier · ${entitlementSource}`;
  }
  return "Free tier";
}

function buildQuotaLabel(plan: PlanTier, usage: number): string {
  if (plan === "free") {
    return `${usage}/${getFreeDailyLimit()} luot AI hom nay`;
  }
  if (plan === "lifetime") {
    return "Quota dung chung cho customer Lifetime";
  }
  return "Quota dung chung cho customer Pro";
}

function mapPortalPayments(items: unknown[]): PortalPaymentSummary[] {
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      amount: Number(row.amount ?? 0),
      status: String(row.status ?? "unknown"),
      paymentMethod: (row.payment_method as string | null) ?? null,
      billingSku: (row.billing_sku as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
      transactionCode: (row.transaction_code as string | null) ?? null,
    };
  });
}

function mapPortalChannels(items: unknown[]): PortalChannelLink[] {
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      channel: String(row.channel ?? "telegram"),
      displayName: (row.display_name as string | null) ?? null,
      linkStatus: String(row.link_status ?? "unlinked"),
      platformUserId: (row.platform_user_id as string | null) ?? null,
    };
  });
}

async function fallbackPortalSnapshot(authUser: { id: string; email?: string | null }): Promise<PortalSnapshot> {
  const linked = await findLinkedUser(authUser.id, authUser.email ?? null);
  const row = linked.row;
  const plan = normalizePlan(row?.plan);
  let payments: PortalPaymentSummary[] = [];

  if (row?.id) {
    const paymentQuery = await supabase
      .from("transaction_history")
      .select("id,amount,status,payment_method,billing_sku,created_at,transaction_code")
      .eq("user_id", row.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!paymentQuery.error && Array.isArray(paymentQuery.data)) {
      payments = paymentQuery.data.map((item) => ({
        id: String(item.id),
        amount: Number(item.amount ?? 0),
        status: String(item.status ?? "unknown"),
        paymentMethod: (item.payment_method as string | null) ?? null,
        billingSku: (item.billing_sku as string | null) ?? null,
        createdAt: (item.created_at as string | null) ?? null,
        transactionCode: (item.transaction_code as string | null) ?? null,
      }));
    }
  }

  const linkedChannels: PortalChannelLink[] = [
    {
      id: row?.id ? String(row.id) : "telegram-fallback",
      channel: row?.customer_id ? "telegram" : SITE_CONFIG.primaryChannelLabel.toLowerCase(),
      displayName: authUser.email ?? null,
      linkStatus: row ? "linked" : "unlinked",
      platformUserId: row?.id ? String(row.id) : null,
    },
  ];

  return {
    customerId: row?.customer_id ?? null,
    linkedUserId: row?.id ?? null,
    email: row?.email ?? authUser.email ?? null,
    phoneE164: null,
    phoneDisplay: null,
    fullName: null,
    plan,
    premiumUntil: row?.premium_until ?? null,
    dailyAiUsageCount: Number(row?.daily_ai_usage_count ?? 0),
    entitlementSource: linked.source === "linked_user" ? "compat_user" : linked.source,
    entitlementLabel: buildEntitlementLabel(plan, row?.premium_until ?? null, linked.source),
    quotaLabel: buildQuotaLabel(plan, Number(row?.daily_ai_usage_count ?? 0)),
    source: linked.source,
    payments,
    linkedChannels,
    lastSyncAt: new Date().toISOString(),
  };
}

export async function fetchPortalSnapshot(authUser: { id: string; email?: string | null }): Promise<PortalSnapshot> {
  try {
    const { data, error } = await supabase.rpc("portal_get_customer_snapshot");
    if (error) {
      throw error;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const plan = normalizePlan((row.plan as string | null) ?? null);
    return {
      customerId: row.customer_id == null ? null : Number(row.customer_id),
      linkedUserId: null,
      email: (row.email as string | null) ?? authUser.email ?? null,
      phoneE164: (row.phone_e164 as string | null) ?? null,
      phoneDisplay: (row.phone_display as string | null) ?? null,
      fullName: (row.full_name as string | null) ?? null,
      plan,
      premiumUntil: (row.premium_until as string | null) ?? null,
      dailyAiUsageCount: Number(row.quota_used_today ?? 0),
      entitlementSource: (row.entitlement_source as string | null) ?? null,
      entitlementLabel: buildEntitlementLabel(plan, (row.premium_until as string | null) ?? null, (row.entitlement_source as string | null) ?? null),
      quotaLabel: (row.quota_label as string | null) ?? buildQuotaLabel(plan, Number(row.quota_used_today ?? 0)),
      source: ((row.source as PortalSnapshot["source"]) ?? "customer_linked"),
      payments: Array.isArray(row.payments) ? mapPortalPayments(row.payments as unknown[]) : [],
      linkedChannels: Array.isArray(row.linked_channels) ? mapPortalChannels(row.linked_channels as unknown[]) : [],
      lastSyncAt: String(row.last_sync_at ?? new Date().toISOString()),
    };
  } catch (error) {
    if (isMissingFunctionError(error)) {
      return fallbackPortalSnapshot(authUser);
    }
    throw error;
  }
}

export async function linkPortalCustomerByPhone(phoneInput: string): Promise<void> {
  const { error } = await supabase.rpc("portal_link_customer_by_phone", {
    p_phone_input: phoneInput,
  });
  if (error) {
    throw new Error(String(error.message || "portal_phone_link_failed"));
  }
}

export function getPortalChannelCards(snapshot?: PortalSnapshot | null) {
  const linkedChannels = new Set((snapshot?.linkedChannels ?? []).map((item) => item.channel));
  return [
    {
      key: "telegram",
      label: SITE_CONFIG.primaryChannelLabel,
      status: linkedChannels.has("telegram") ? "Da linked" : "Dang live",
      helper: linkedChannels.has("telegram")
        ? "Customer nay da co identity Telegram trong he thong"
        : "Kenh tracking manh nhat hien tai",
      tone: "primary" as const,
    },
    {
      key: "zalo",
      label: SITE_CONFIG.secondaryChannelLabel,
      status: linkedChannels.has("zalo") ? "Da linked" : SITE_CONFIG.secondaryChannelStatus,
      helper: linkedChannels.has("zalo")
        ? "Customer nay da co identity Zalo linked"
        : "Frontend va data model da san sang de noi workflow rieng",
      tone: "accent" as const,
    },
    {
      key: "web",
      label: SITE_CONFIG.webPortalLabel,
      status: linkedChannels.has("web") ? "Portal linked" : SITE_CONFIG.webPortalStatus,
      helper: "Account, billing, dashboard va admin",
      tone: "neutral" as const,
    },
  ];
}
