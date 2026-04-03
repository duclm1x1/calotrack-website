import { createClient } from "@supabase/supabase-js";

type AnyRecord = Record<string, any>;

const DEFAULT_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const DEV_TRIAL_DAYS = 7;

function cleanEnv(value: string | undefined) {
  return String(value || "")
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim();
}

export function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

export function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function getBearerToken(req: any): string | null {
  const rawHeader = safeString(req.headers?.authorization);
  if (!rawHeader) return null;
  const match = rawHeader.match(/^Bearer\s+(.+)$/i);
  return safeString(match?.[1]);
}

export async function readBody(req: any): Promise<AnyRecord> {
  if (req.body && typeof req.body === "object") {
    return req.body as AnyRecord;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function maybeSingle<T>(
  query: PromiseLike<{ data: T[] | T | null; error: any }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw error;
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as T) || null;
  return data as T;
}

export function createServiceRoleClient() {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_runtime_config_missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildDisplayNameFromAuthUser(authUser: AnyRecord) {
  const metadata = (authUser.user_metadata as AnyRecord | undefined) || {};
  const fullName = safeString(metadata.full_name || metadata.name || metadata.display_name);
  if (fullName) return fullName;

  const email = safeString(authUser.email);
  if (!email) return "CaloTrack user";
  return email.split("@")[0] || email;
}

function buildCompatWebPlatformId(email: string | null, authUserId: string) {
  return email ? `web:${email}` : `web:${authUserId}`;
}

function addDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function computeRoles(member: AnyRecord | null, compatUser: AnyRecord | null, roleRows: AnyRecord[]) {
  if (member?.is_owner === true) {
    return ["owner"];
  }

  const roleSet = new Set<string>();
  for (const row of roleRows) {
    const role = safeString(row.role);
    if (role) roleSet.add(role);
  }

  if (compatUser?.is_admin === true) {
    roleSet.add("admin");
  }

  return roleSet.size ? Array.from(roleSet) : ["user"];
}

export async function requireAuthenticatedUser(req: any) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    throw new Error("auth_required");
  }

  const admin = createServiceRoleClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error("auth_required");
  }

  return {
    admin,
    authUser: user as AnyRecord,
    accessToken,
  };
}

export async function requireAdminAccess(req: any) {
  const { admin, authUser } = await requireAuthenticatedUser(req);
  const email = safeString(authUser.email);

  const member =
    (await maybeSingle<AnyRecord>(
      admin
        .from("admin_members")
        .select("*")
        .eq("auth_user_id", authUser.id)
        .order("id", { ascending: true })
        .limit(1),
    )) || null;

  let compatUser: AnyRecord | null = null;
  compatUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("id,email,username,is_admin,auth_user_id")
        .eq("platform", "web")
        .eq("auth_user_id", authUser.id)
        .limit(1),
    )) || null;

  if (!compatUser && email) {
    compatUser =
      (await maybeSingle<AnyRecord>(
        admin
          .from("users")
          .select("id,email,username,is_admin,auth_user_id")
          .eq("platform", "web")
          .eq("email", email)
          .limit(1),
      )) || null;
  }

  const roleRows =
    member?.id != null
      ? (
          await admin
            .from("admin_member_roles")
            .select("role")
            .eq("member_id", member.id)
        ).data ?? []
      : [];

  const roles = computeRoles(member, compatUser, roleRows);
  const isOwner = member?.is_owner === true;
  const isAdmin =
    member?.is_active !== false &&
    (isOwner || roles.includes("admin") || compatUser?.is_admin === true);

  if (!isAdmin) {
    throw new Error("admin_required");
  }

  return {
    admin,
    authUser,
    adminMember: member,
    compatUser,
    roles,
    isOwner,
    isAdmin,
  };
}

export async function listAllAuthUsers(admin: ReturnType<typeof createServiceRoleClient>) {
  const users: AnyRecord[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

export async function ensureEmailDevCustomerForAuthUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  authUser: AnyRecord,
) {
  const email = safeString(authUser.email);
  if (!email) {
    throw new Error("email_required");
  }

  const emailConfirmedAt = safeString(authUser.email_confirmed_at || authUser.confirmed_at);
  if (!emailConfirmedAt) {
    throw new Error("email_not_verified");
  }

  let authLink =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_auth_links")
        .select("*")
        .eq("auth_user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(1),
    )) || null;

  let compatUser =
    (await maybeSingle<AnyRecord>(
      admin
        .from("users")
        .select("*")
        .eq("platform", "web")
        .eq("auth_user_id", authUser.id)
        .limit(1),
    )) || null;

  if (!compatUser) {
    compatUser =
      (await maybeSingle<AnyRecord>(
        admin
          .from("users")
          .select("*")
          .eq("platform", "web")
          .eq("email", email)
          .limit(1),
      )) || null;
  }

  let webChannel =
    (await maybeSingle<AnyRecord>(
      admin
        .from("customer_channel_accounts")
        .select("*")
        .eq("channel", "web")
        .eq("platform_user_id", authUser.id)
        .limit(1),
    )) || null;

  if (!webChannel && compatUser?.id != null) {
    webChannel =
      (await maybeSingle<AnyRecord>(
        admin
          .from("customer_channel_accounts")
          .select("*")
          .eq("channel", "web")
          .eq("linked_user_id", compatUser.id)
          .limit(1),
      )) || null;
  }

  const seededCustomerId =
    Number(authLink?.customer_id ?? webChannel?.customer_id ?? compatUser?.customer_id ?? 0) || null;

  let customer =
    seededCustomerId == null
      ? null
      : await maybeSingle<AnyRecord>(
          admin
            .from("customers")
            .select("*")
            .eq("id", seededCustomerId)
            .limit(1),
        );

  const displayName = buildDisplayNameFromAuthUser(authUser);
  const trialEndsAt = addDays(DEV_TRIAL_DAYS);

  if (!customer) {
    const { data, error } = await admin
      .from("customers")
      .insert({
        phone_e164: null,
        phone_display: null,
        full_name: displayName,
        plan: "free",
        premium_until: null,
        entitlement_source: "email_dev_trial",
        status: "active",
        access_state: "trialing",
        onboarding_status: "pending_profile",
        phone_verified_at: null,
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEndsAt,
      })
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    customer = data as AnyRecord;
  } else {
    const patch: AnyRecord = {};
    if (!safeString(customer.full_name) && displayName) {
      patch.full_name = displayName;
    }

    const currentAccessState = safeString(customer.access_state) || "pending_verification";
    const hasPaidPlan =
      safeString(customer.plan) === "pro" || safeString(customer.plan) === "lifetime" || safeString(customer.premium_until);

    if (!customer.is_banned && !hasPaidPlan) {
      if (currentAccessState === "pending_verification" || !safeString(customer.trial_started_at)) {
        patch.access_state = "trialing";
        patch.trial_started_at = safeString(customer.trial_started_at) || new Date().toISOString();
        patch.trial_ends_at = safeString(customer.trial_ends_at) || trialEndsAt;
        patch.entitlement_source = safeString(customer.entitlement_source) || "email_dev_trial";
      }
    }

    if (Object.keys(patch).length) {
      const { data, error } = await admin
        .from("customers")
        .update(patch)
        .eq("id", customer.id)
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      customer = data as AnyRecord;
    }
  }

  if (!authLink) {
    const { data, error } = await admin
      .from("customer_auth_links")
      .insert({
        customer_id: customer.id,
        auth_user_id: authUser.id,
        email,
        link_status: "linked",
      })
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    authLink = data as AnyRecord;
  } else if (
    authLink.customer_id !== customer.id ||
    authLink.link_status !== "linked" ||
    safeString(authLink.email) !== email
  ) {
    const { data, error } = await admin
      .from("customer_auth_links")
      .update({
        customer_id: customer.id,
        email,
        link_status: "linked",
      })
      .eq("auth_user_id", authUser.id)
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    authLink = data as AnyRecord;
  }

  const nextCompatPayload: AnyRecord = {
    platform: "web",
    platform_id: buildCompatWebPlatformId(email, authUser.id),
    email,
    auth_user_id: authUser.id,
    username: safeString(compatUser?.username) || email.split("@")[0] || email,
    first_name: safeString(compatUser?.first_name) || displayName,
    is_active: compatUser?.is_active !== false,
    customer_id: customer.id,
    customer_phone_e164: safeString(customer.phone_e164),
    plan: safeString(customer.plan) || "free",
    premium_until: safeString(customer.premium_until),
    trial_ends_at: safeString(customer.trial_ends_at),
    access_state: safeString(customer.access_state) || "trialing",
  };

  if (!compatUser) {
    const { data, error } = await admin
      .from("users")
      .insert(nextCompatPayload)
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    compatUser = data as AnyRecord;
  } else {
    const { data, error } = await admin
      .from("users")
      .update(nextCompatPayload)
      .eq("id", compatUser.id)
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    compatUser = data as AnyRecord;
  }

  const nextWebChannelPayload: AnyRecord = {
    customer_id: customer.id,
    channel: "web",
    platform_user_id: authUser.id,
    platform_chat_id: null,
    linked_user_id: compatUser.id,
    display_name: displayName,
    phone_claimed: null,
    phone_claimed_e164: null,
    link_status: "linked",
  };

  if (!webChannel) {
    const { data, error } = await admin
      .from("customer_channel_accounts")
      .insert(nextWebChannelPayload)
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    webChannel = data as AnyRecord;
  } else {
    const { data, error } = await admin
      .from("customer_channel_accounts")
      .update(nextWebChannelPayload)
      .eq("id", webChannel.id)
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    webChannel = data as AnyRecord;
  }

  try {
    await admin.rpc("sync_customer_to_compat_users", {
      p_customer_id: customer.id,
    });
  } catch {
    // Keep the flow resilient even when the helper RPC is unavailable.
  }

  return {
    customer,
    authLink,
    compatUser,
    webChannel,
  };
}

export async function writeAdminAuditLog(params: {
  admin: ReturnType<typeof createServiceRoleClient>;
  actorMemberId?: number | null;
  actorUserId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  roleSnapshot?: string[];
  metadata?: Record<string, unknown>;
}) {
  const { admin, actorMemberId, actorUserId, action, targetType, targetId, roleSnapshot, metadata } = params;
  await admin.from("admin_audit_log").insert({
    actor_member_id: actorMemberId ?? null,
    actor_user_id: actorUserId ?? null,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    role_snapshot: roleSnapshot ?? [],
    metadata: metadata ?? {},
  });
}
