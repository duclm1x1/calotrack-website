import {
  maybeSingle,
  readBody,
  requireAdminAccess,
  safeString,
  sendJson,
  writeAdminAuditLog,
} from "../src/lib/server/adminServer.js";

function normalizeAdminProBillingSku(value: unknown): "monthly" | "semiannual" | "yearly" | null {
  const normalized = safeString(value)?.toLowerCase();
  if (normalized === "monthly" || normalized === "semiannual" || normalized === "yearly") {
    return normalized;
  }
  return null;
}

function computePremiumUntilFromSku(sku: "monthly" | "semiannual" | "yearly") {
  const days = sku === "monthly" ? 30 : sku === "semiannual" ? 183 : 365;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function refreshCustomerTruth(admin: any, customerId: number) {
  const rpcCalls = [
    admin.rpc("refresh_customer_access_state", { p_customer_id: customerId }),
    admin.rpc("sync_customer_to_compat_users", { p_customer_id: customerId }),
  ];

  for (const call of rpcCalls) {
    try {
      await call;
    } catch {
      // Best-effort sync only. Table updates remain the primary source of truth.
    }
  }
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

    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    const body = await readBody(req);
    const action = safeString(body.action);

    if (action === "set_customer_access_state") {
      const customerId = Number(body.customer_id ?? 0);
      const targetState = safeString(body.target_state)?.toLowerCase();
      const billingSku = normalizeAdminProBillingSku(body.billing_sku);
      const note = safeString(body.note);

      if (!Number.isFinite(customerId) || customerId <= 0) {
        sendJson(res, 400, { ok: false, error: "customer_id_required" });
        return;
      }

      if (!["free", "pro", "banned"].includes(String(targetState))) {
        sendJson(res, 400, { ok: false, error: "target_state_invalid" });
        return;
      }

      if (targetState === "pro" && !billingSku) {
        sendJson(res, 400, { ok: false, error: "billing_sku_required" });
        return;
      }

      const customer =
        (await maybeSingle<Record<string, any>>(
          admin.from("customers").select("*").eq("id", customerId).limit(1),
        )) || null;
      if (!customer) {
        sendJson(res, 404, { ok: false, error: "customer_not_found" });
        return;
      }

      const nextCustomerPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      let premiumUntil: string | null = customer.premium_until ? String(customer.premium_until) : null;

      if (targetState === "free") {
        premiumUntil = null;
        Object.assign(nextCustomerPatch, {
          plan: "free",
          premium_until: null,
          entitlement_source: "admin",
          is_banned: false,
          ban_until: null,
          status: "active",
          trial_ends_at: new Date().toISOString(),
          access_state: "free_limited",
        });
      } else if (targetState === "pro") {
        premiumUntil = computePremiumUntilFromSku(billingSku!);
        Object.assign(nextCustomerPatch, {
          plan: "pro",
          premium_until: premiumUntil,
          entitlement_source: "manual_grant",
          is_banned: false,
          ban_until: null,
          status: "active",
          access_state: "active_paid",
        });
      } else {
        Object.assign(nextCustomerPatch, {
          is_banned: true,
          ban_until: null,
          status: "blocked",
          access_state: "blocked",
        });
      }

      const { error: customerUpdateError } = await admin
        .from("customers")
        .update(nextCustomerPatch)
        .eq("id", customerId);
      if (customerUpdateError) throw customerUpdateError;

      const linkedUserIds = [
        ...new Set(
          (
            (
              await admin
                .from("customer_channel_accounts")
                .select("linked_user_id")
                .eq("customer_id", customerId)
            ).data ?? []
          )
            .map((row: any) => Number(row.linked_user_id))
            .filter((value: number) => Number.isFinite(value) && value > 0),
        ),
      ];

      if (linkedUserIds.length) {
        const compatPatch: Record<string, unknown> = {
          plan: targetState === "pro" ? "pro" : "free",
          premium_until: targetState === "pro" ? premiumUntil : null,
          access_state:
            targetState === "banned"
              ? "blocked"
              : targetState === "pro"
                ? "active_paid"
                : "free_limited",
          trial_ends_at: targetState === "free" ? new Date().toISOString() : undefined,
          is_banned: targetState === "banned",
        };
        if (targetState !== "free") {
          delete compatPatch.trial_ends_at;
        }

        const { error: compatError } = await admin
          .from("users")
          .update(compatPatch)
          .in("id", linkedUserIds);
        if (compatError) throw compatError;
      }

      await refreshCustomerTruth(admin, customerId);

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.set_customer_access_state",
        targetType: "customer",
        targetId: String(customerId),
        roleSnapshot: roles,
        metadata: {
          target_state: targetState,
          billing_sku: billingSku,
          previous_plan: customer.plan ?? null,
          previous_status: customer.status ?? null,
          premium_until: premiumUntil,
          note,
        },
      });

      sendJson(res, 200, {
        ok: true,
        data: {
          customer_id: customerId,
          target_state: targetState,
          billing_sku: billingSku,
          premium_until: premiumUntil,
        },
      });
      return;
    }

    if (action === "soft_delete_customer") {
      const customerId = Number(body.customer_id ?? 0);
      const note = safeString(body.note);

      if (!Number.isFinite(customerId) || customerId <= 0) {
        sendJson(res, 400, { ok: false, error: "customer_id_required" });
        return;
      }

      const customer =
        (await maybeSingle<Record<string, any>>(
          admin.from("customers").select("*").eq("id", customerId).limit(1),
        )) || null;
      if (!customer) {
        sendJson(res, 404, { ok: false, error: "customer_not_found" });
        return;
      }

      const { data: linkedRows, error: linkedRowsError } = await admin
        .from("customer_channel_accounts")
        .select("id,linked_user_id")
        .eq("customer_id", customerId);
      if (linkedRowsError) throw linkedRowsError;

      const linkedUserIds = [
        ...new Set(
          (linkedRows ?? [])
            .map((row: any) => Number(row.linked_user_id))
            .filter((value: number) => Number.isFinite(value) && value > 0),
        ),
      ];

      const { error: authDeleteError } = await admin
        .from("customer_auth_links")
        .delete()
        .eq("customer_id", customerId);
      if (authDeleteError) throw authDeleteError;

      const { error: channelUnlinkError } = await admin
        .from("customer_channel_accounts")
        .update({
          customer_id: null,
          linked_user_id: null,
          link_status: "unlinked",
          updated_at: new Date().toISOString(),
        })
        .eq("customer_id", customerId);
      if (channelUnlinkError) throw channelUnlinkError;

      if (linkedUserIds.length) {
        const { error: compatResetError } = await admin
          .from("users")
          .update({
            customer_id: null,
            customer_phone_e164: null,
            plan: "free",
            premium_until: null,
            trial_ends_at: null,
            access_state: "pending_verification",
            is_banned: false,
          })
          .in("id", linkedUserIds);
        if (compatResetError) throw compatResetError;
      }

      const { error: customerDeletePatchError } = await admin
        .from("customers")
        .update({
          plan: "free",
          premium_until: null,
          entitlement_source: "soft_deleted",
          is_banned: true,
          ban_until: null,
          status: "blocked",
          access_state: "blocked",
          trial_started_at: null,
          trial_ends_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);
      if (customerDeletePatchError) throw customerDeletePatchError;

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.soft_delete_customer",
        targetType: "customer",
        targetId: String(customerId),
        roleSnapshot: roles,
        metadata: {
          previous_plan: customer.plan ?? null,
          previous_status: customer.status ?? null,
          linked_user_ids: linkedUserIds,
          note,
        },
      });

      sendJson(res, 200, {
        ok: true,
        data: {
          customer_id: customerId,
          status: "soft_deleted",
        },
      });
      return;
    }

    sendJson(res, 400, { ok: false, error: "unsupported_action" });
  } catch (error) {
    const message = String((error as Error)?.message || error || "admin_customers_failed");
    sendJson(res, message === "auth_required" ? 401 : message === "admin_required" ? 403 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
