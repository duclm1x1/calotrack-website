import {
  ensureEmailDevCustomerForAuthUser,
  listAllAuthUsers,
  maybeSingle,
  readBody,
  requireAdminAccess,
  safeString,
  sendJson,
  writeAdminAuditLog,
} from "../src/lib/server/adminServer.js";

function buildAuthIdentityRow(params: {
  authUser: Record<string, any>;
  authLink: Record<string, any> | null;
  customer: Record<string, any> | null;
  webChannel: Record<string, any> | null;
}) {
  const { authUser, authLink, customer, webChannel } = params;
  const metadata = (authUser.user_metadata as Record<string, any> | undefined) || {};

  return {
    auth_user_id: authUser.id,
    email: safeString(authUser.email),
    email_confirmed_at: safeString(authUser.email_confirmed_at || authUser.confirmed_at),
    created_at: safeString(authUser.created_at),
    last_sign_in_at: safeString(authUser.last_sign_in_at),
    pending_phone_e164: safeString(metadata.pending_phone_e164),
    customer_id: authLink?.customer_id ?? customer?.id ?? null,
    link_status: safeString(authLink?.link_status),
    web_channel_id: webChannel?.id ?? null,
    access_state: safeString(customer?.access_state),
    trial_ends_at: safeString(customer?.trial_ends_at),
  };
}

function normalizeVietnamPhoneInput(value: unknown): string {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+84")) return `+84${digits.slice(3).replace(/\D/g, "")}`;
  if (digits.startsWith("84")) return `+84${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) return `+84${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function resetPhoneOnboardingFixture(admin: any, phoneInput: unknown) {
  const phoneE164 = normalizeVietnamPhoneInput(phoneInput);
  if (!phoneE164) {
    throw new Error("phone_required");
  }

  const phoneIdentity =
    (await maybeSingle<Record<string, any>>(
      admin
        .from("auth_phone_identities")
        .select("*")
        .eq("phone_e164", phoneE164)
        .limit(1),
    )) || null;

  const authUserId = safeString(phoneIdentity?.auth_user_id);
  const syntheticEmail = safeString(phoneIdentity?.synthetic_email);

  const customer =
    (await maybeSingle<Record<string, any>>(
      admin
        .from("customers")
        .select("id, phone_e164, phone_display, plan, premium_until, access_state, trial_ends_at")
        .eq("phone_e164", phoneE164)
        .limit(1),
    )) || null;

  const customerId = Number(customer?.id ?? 0) || null;

  await admin.from("auth_phone_challenges").delete().eq("phone_e164", phoneE164);
  await admin.from("auth_phone_identities").delete().eq("phone_e164", phoneE164);

  if (authUserId) {
    await admin.from("customer_auth_links").delete().eq("auth_user_id", authUserId);
    await admin
      .from("customer_channel_accounts")
      .delete()
      .eq("channel", "web")
      .eq("platform_user_id", authUserId);

    await admin
      .from("users")
      .update({
        auth_user_id: null,
        customer_id: null,
        customer_phone_e164: null,
        plan: "free",
        premium_until: null,
        trial_ends_at: null,
        access_state: "pending_verification",
      })
      .eq("auth_user_id", authUserId);

    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      // Best-effort cleanup: auth user may already be gone or require manual review.
    }
  }

  if (customerId) {
    await admin
      .from("customer_channel_accounts")
      .delete()
      .eq("customer_id", customerId)
      .eq("channel", "web");

    await admin
      .from("users")
      .update({
        customer_id: null,
        customer_phone_e164: null,
        plan: "free",
        premium_until: null,
        trial_ends_at: null,
        access_state: "pending_verification",
      })
      .eq("customer_id", customerId)
      .eq("platform", "web");

    await admin
      .from("orders")
      .update({
        status: "cancelled",
      })
      .eq("customer_id", customerId)
      .in("status", ["pending", "pending_confirmation", "processing", "awaiting_payment", "needs_review"]);

    await admin
      .from("customers")
      .update({
        plan: "free",
        premium_until: null,
        entitlement_source: "free",
        access_state: "pending_verification",
        phone_verified_at: null,
        trial_started_at: null,
        trial_ends_at: null,
        onboarding_status: "pending_profile",
      })
      .eq("id", customerId);
  }

  return {
    phone_e164: phoneE164,
    auth_user_id: authUserId,
    synthetic_email: syntheticEmail,
    customer_id: customerId,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const access = await requireAdminAccess(req);
    const { admin, adminMember, compatUser, roles } = access;

    if (req.method === "GET") {
      const authUsers = await listAllAuthUsers(admin);
      const authUserIds = authUsers.map((user) => user.id);

      const { data: authLinks, error: authLinkError } = authUserIds.length
        ? await admin
            .from("customer_auth_links")
            .select("*")
            .in("auth_user_id", authUserIds)
        : { data: [], error: null as any };
      if (authLinkError) throw authLinkError;

      const customerIds = Array.from(
        new Set((authLinks ?? []).map((row) => Number((row as any).customer_id)).filter((value) => Number.isFinite(value))),
      );

      const { data: customers, error: customerError } = customerIds.length
        ? await admin
            .from("customers")
            .select("id,access_state,trial_ends_at")
            .in("id", customerIds)
        : { data: [], error: null as any };
      if (customerError) throw customerError;

      const { data: webChannels, error: webChannelError } = authUserIds.length
        ? await admin
            .from("customer_channel_accounts")
            .select("id,customer_id,platform_user_id,linked_user_id,display_name,link_status")
            .eq("channel", "web")
            .in("platform_user_id", authUserIds)
        : { data: [], error: null as any };
      if (webChannelError) throw webChannelError;

      const authLinkByUserId = new Map<string, Record<string, any>>();
      for (const row of authLinks ?? []) {
        authLinkByUserId.set(String((row as any).auth_user_id), row as Record<string, any>);
      }

      const customerById = new Map<number, Record<string, any>>();
      for (const row of customers ?? []) {
        customerById.set(Number((row as any).id), row as Record<string, any>);
      }

      const webChannelByUserId = new Map<string, Record<string, any>>();
      for (const row of webChannels ?? []) {
        webChannelByUserId.set(String((row as any).platform_user_id), row as Record<string, any>);
      }

      const authIdentities = authUsers.map((authUser) => {
        const authLink = authLinkByUserId.get(String(authUser.id)) ?? null;
        const customer = authLink?.customer_id ? customerById.get(Number(authLink.customer_id)) ?? null : null;
        const webChannel = webChannelByUserId.get(String(authUser.id)) ?? null;
        return buildAuthIdentityRow({ authUser, authLink, customer, webChannel });
      });

      const { data: compatOrphans, error: compatError } = await admin
        .from("users")
        .select("id,platform,platform_id,chat_id,username,email,auth_user_id,customer_id,created_at")
        .is("deleted_at", null)
        .is("customer_id", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (compatError) throw compatError;

      const { data: channelOrphans, error: channelError } = await admin
        .from("customer_channel_accounts")
        .select("id,customer_id,channel,platform_user_id,platform_chat_id,display_name,phone_claimed,link_status,linked_user_id,created_at")
        .or("customer_id.is.null,link_status.neq.linked")
        .order("created_at", { ascending: false })
        .limit(200);
      if (channelError) throw channelError;

      const compatLookupIds = Array.from(
        new Set((channelOrphans ?? []).map((row) => Number((row as any).linked_user_id)).filter((value) => Number.isFinite(value))),
      );
      const { data: linkedCompatUsers, error: linkedCompatError } = compatLookupIds.length
        ? await admin
            .from("users")
            .select("id,customer_id,email,auth_user_id")
            .in("id", compatLookupIds)
        : { data: [], error: null as any };
      if (linkedCompatError) throw linkedCompatError;
      const compatById = new Map<number, Record<string, any>>();
      for (const row of linkedCompatUsers ?? []) {
        compatById.set(Number((row as any).id), row as Record<string, any>);
      }

      const identityInbox: Record<string, any>[] = [];

      for (const row of authIdentities) {
        if (!row.customer_id) {
          identityInbox.push({
            source_type: "auth_only",
            auth_user_id: row.auth_user_id,
            email: row.email,
            compat_user_id: null,
            channel_account_id: row.web_channel_id,
            customer_id: null,
            channel: "web",
            platform_user_id: row.auth_user_id,
            platform_chat_id: null,
            display_name: row.email,
            phone_claimed: row.pending_phone_e164,
            link_status: row.link_status ?? "missing",
            detail: "Email đã verify nhưng chưa có customer truth canonical.",
            created_at: row.created_at,
          });
        }
      }

      for (const row of compatOrphans ?? []) {
        identityInbox.push({
          source_type: "compat_orphan",
          auth_user_id: safeString((row as any).auth_user_id),
          email: safeString((row as any).email),
          compat_user_id: Number((row as any).id),
          channel_account_id: null,
          customer_id: null,
          channel: safeString((row as any).platform),
          platform_user_id: safeString((row as any).platform_id),
          platform_chat_id: safeString((row as any).chat_id),
          display_name: safeString((row as any).username),
          phone_claimed: null,
          link_status: "missing",
          detail: "Compat runtime user chưa có customer_id.",
          created_at: safeString((row as any).created_at),
        });
      }

      for (const row of channelOrphans ?? []) {
        const linkedCompat = compatById.get(Number((row as any).linked_user_id)) ?? null;
        identityInbox.push({
          source_type: "channel_orphan",
          auth_user_id: safeString(linkedCompat?.auth_user_id),
          email: safeString(linkedCompat?.email),
          compat_user_id: Number((row as any).linked_user_id) || null,
          channel_account_id: Number((row as any).id),
          customer_id: (row as any).customer_id == null ? null : Number((row as any).customer_id),
          channel: safeString((row as any).channel),
          platform_user_id: safeString((row as any).platform_user_id),
          platform_chat_id: safeString((row as any).platform_chat_id),
          display_name: safeString((row as any).display_name),
          phone_claimed: safeString((row as any).phone_claimed),
          link_status: safeString((row as any).link_status),
          detail:
            (row as any).customer_id == null
              ? "Channel identity đã xuất hiện nhưng chưa nối vào customer."
              : "Channel row đang ở trạng thái cần review.",
          created_at: safeString((row as any).created_at),
        });
      }

      const dedupedInbox = Array.from(
        new Map(
          identityInbox.map((row) => [
            [
              row.source_type,
              row.auth_user_id,
              row.compat_user_id,
              row.channel_account_id,
              row.platform_user_id,
            ].join(":"),
            row,
          ]),
        ).values(),
      ).sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));

      sendJson(res, 200, {
        ok: true,
        data: {
          auth_identities: authIdentities,
          identity_inbox: dedupedInbox,
        },
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    const body = await readBody(req);
    const action = safeString(body.action);

    if (action === "provision_customer_from_auth_user") {
      const authUserId = safeString(body.auth_user_id);
      if (!authUserId) {
        sendJson(res, 400, { ok: false, error: "auth_user_id_required" });
        return;
      }

      const authLookup = await admin.auth.admin.getUserById(authUserId);
      if (authLookup.error || !authLookup.data?.user) {
        sendJson(res, 404, { ok: false, error: "auth_user_not_found" });
        return;
      }

      const ensured = await ensureEmailDevCustomerForAuthUser(admin, authLookup.data.user as Record<string, any>);
      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.provision_customer_from_auth_user",
        targetType: "auth_user",
        targetId: authUserId,
        roleSnapshot: roles,
        metadata: {
          customer_id: ensured.customer.id,
          web_channel_id: ensured.webChannel.id,
          compat_user_id: ensured.compatUser.id,
        },
      });

      sendJson(res, 200, {
        ok: true,
        data: {
          customer_id: ensured.customer.id,
          web_channel_id: ensured.webChannel.id,
          compat_user_id: ensured.compatUser.id,
        },
      });
      return;
    }

    if (action === "sync_compat_user_to_customer") {
      const linkedUserId = Number(body.linked_user_id ?? 0);
      const customerId = Number(body.customer_id ?? 0);
      if (!Number.isFinite(linkedUserId) || linkedUserId <= 0 || !Number.isFinite(customerId) || customerId <= 0) {
        sendJson(res, 400, { ok: false, error: "linked_user_id_and_customer_id_required" });
        return;
      }

      const compatUser =
        (await maybeSingle<Record<string, any>>(
          admin
            .from("users")
            .select("*")
            .eq("id", linkedUserId)
            .limit(1),
        )) || null;
      const customer =
        (await maybeSingle<Record<string, any>>(
          admin
            .from("customers")
            .select("*")
            .eq("id", customerId)
            .limit(1),
        )) || null;

      if (!compatUser || !customer) {
        sendJson(res, 404, { ok: false, error: "target_not_found" });
        return;
      }

      const { error: compatUpdateError } = await admin
        .from("users")
        .update({
          customer_id: customer.id,
          customer_phone_e164: safeString(customer.phone_e164),
          plan: safeString(customer.plan) || "free",
          premium_until: safeString(customer.premium_until),
          trial_ends_at: safeString(customer.trial_ends_at),
          access_state: safeString(customer.access_state) || "trialing",
        })
        .eq("id", compatUser.id);
      if (compatUpdateError) throw compatUpdateError;

      await admin
        .from("customer_channel_accounts")
        .update({
          customer_id: customer.id,
          link_status: "linked",
        })
        .eq("linked_user_id", compatUser.id);

      if (safeString(compatUser.auth_user_id)) {
        const existingAuthLink =
          (await maybeSingle<Record<string, any>>(
            admin
              .from("customer_auth_links")
              .select("*")
              .eq("auth_user_id", compatUser.auth_user_id)
              .limit(1),
          )) || null;

        if (!existingAuthLink) {
          await admin.from("customer_auth_links").insert({
            customer_id: customer.id,
            auth_user_id: compatUser.auth_user_id,
            email: safeString(compatUser.email),
            link_status: "linked",
          });
        } else {
          await admin
            .from("customer_auth_links")
            .update({
              customer_id: customer.id,
              email: safeString(compatUser.email),
              link_status: "linked",
            })
            .eq("auth_user_id", compatUser.auth_user_id);
        }
      }

      try {
        await admin.rpc("sync_customer_to_compat_users", { p_customer_id: customer.id });
      } catch {
        // Ignore helper RPC issues here because the direct writes above already completed.
      }

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.sync_compat_user_to_customer",
        targetType: "compat_user",
        targetId: String(linkedUserId),
        roleSnapshot: roles,
        metadata: {
          customer_id: customerId,
        },
      });

      sendJson(res, 200, {
        ok: true,
        data: {
          linked_user_id: linkedUserId,
          customer_id: customerId,
        },
      });
      return;
    }

    if (action === "reset_phone_onboarding_fixture") {
      const result = await resetPhoneOnboardingFixture(admin, body.phone_input);

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.reset_phone_onboarding_fixture",
        targetType: "phone_fixture",
        targetId: result.phone_e164,
        roleSnapshot: roles,
        metadata: result,
      });

      sendJson(res, 200, {
        ok: true,
        data: result,
      });
      return;
    }

    sendJson(res, 400, { ok: false, error: "unsupported_action" });
  } catch (error) {
    const message = String((error as Error)?.message || error || "admin_identities_failed");
    sendJson(res, message === "auth_required" ? 401 : message === "admin_required" ? 403 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
