import {
  maybeSingle,
  readBody,
  requireAdminAccess,
  safeString,
  sendJson,
  writeAdminAuditLog,
} from "./adminServer.js";

function roleToPersistence(role: string) {
  if (role === "owner") {
    return { is_owner: true, is_admin: true, member_roles: [] as string[] };
  }
  if (role === "admin") {
    return { is_owner: false, is_admin: true, member_roles: ["admin"] as string[] };
  }
  return { is_owner: false, is_admin: false, member_roles: [] as string[] };
}

function normalizeRole(value: unknown): "owner" | "admin" | "user" {
  const role = safeString(value)?.toLowerCase();
  if (role === "owner" || role === "admin") return role;
  return "user";
}

async function listMembers(admin: any) {
  const { data: members, error: memberError } = await admin
    .from("admin_members")
    .select("*")
    .order("is_owner", { ascending: false })
    .order("created_at", { ascending: true });
  if (memberError) throw memberError;

  const memberIds = (members ?? []).map((row: any) => Number(row.id)).filter((value: number) => Number.isFinite(value));
  const linkedUserIds = (members ?? [])
    .map((row: any) => Number(row.linked_user_id))
    .filter((value: number) => Number.isFinite(value));
  const authUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (authUsers.error) throw authUsers.error;

  const { data: roleRows, error: roleError } = memberIds.length
    ? await admin
        .from("admin_member_roles")
        .select("*")
        .in("member_id", memberIds)
    : { data: [], error: null as any };
  if (roleError) throw roleError;

  const { data: compatUsers, error: compatError } = linkedUserIds.length
    ? await admin
        .from("users")
        .select("id,email,username,is_admin")
        .in("id", linkedUserIds)
    : { data: [], error: null as any };
  if (compatError) throw compatError;

  const compatById = new Map<number, Record<string, any>>();
  for (const row of compatUsers ?? []) {
    compatById.set(Number((row as any).id), row as Record<string, any>);
  }

  const authById = new Map<string, Record<string, any>>();
  for (const row of authUsers.data?.users ?? []) {
    authById.set(String((row as any).id), row as Record<string, any>);
  }

  const roleByMemberId = new Map<number, string[]>();
  for (const row of roleRows ?? []) {
    const memberId = Number((row as any).member_id);
    if (!roleByMemberId.has(memberId)) {
      roleByMemberId.set(memberId, []);
    }
    const next = roleByMemberId.get(memberId)!;
    const role = safeString((row as any).role);
    if (role && !next.includes(role)) {
      next.push(role);
    }
  }

  const mappedMembers = (members ?? []).map((member: any) => {
    const compatUser = compatById.get(Number(member.linked_user_id)) ?? null;
    const authUser = safeString(member.auth_user_id)
      ? authById.get(String(member.auth_user_id)) ?? null
      : null;
    const roles =
      member.is_owner === true
        ? ["owner"]
        : roleByMemberId.get(Number(member.id))?.length
          ? roleByMemberId.get(Number(member.id))!
          : compatUser?.is_admin === true
            ? ["admin"]
            : ["user"];

    return {
      id: Number(member.id),
      auth_user_id: safeString(member.auth_user_id),
      linked_user_id: member.linked_user_id == null ? null : Number(member.linked_user_id),
      display_name:
        safeString(member.display_name) ||
        safeString(compatUser?.username) ||
        safeString(authUser?.email) ||
        null,
      email: safeString(compatUser?.email) || safeString(authUser?.email),
      username: safeString(compatUser?.username),
      is_owner: member.is_owner === true,
      is_active: member.is_active !== false,
      roles,
      created_at: safeString(member.created_at),
      updated_at: safeString(member.updated_at),
    };
  });

  const { data: auditRows, error: auditError } = await admin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (auditError) throw auditError;

  const memberById = new Map<number, Record<string, any>>();
  for (const row of mappedMembers) {
    memberById.set(Number(row.id), row);
  }

  const mappedAudit = (auditRows ?? []).map((row: any) => ({
    id: Number(row.id),
    action: String(row.action ?? ""),
    target_type: safeString(row.target_type),
    target_id: row.target_id == null ? null : String(row.target_id),
    actor_display_name:
      safeString(memberById.get(Number(row.actor_member_id))?.display_name) ||
      safeString(compatById.get(Number(row.actor_user_id))?.username) ||
      "Admin",
    role_snapshot: Array.isArray(row.role_snapshot) ? row.role_snapshot.map(String) : [],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    created_at: safeString(row.created_at) || new Date().toISOString(),
  }));

  return {
    members: mappedMembers,
    audit_logs: mappedAudit,
  };
}

export async function handleAdminMembersRequest(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const access = await requireAdminAccess(req);
    const { admin, adminMember, compatUser, roles } = access;

    if (req.method === "GET") {
      const data = await listMembers(admin);
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    const body = await readBody(req);
    const action = safeString(body.action);

    if (action === "upsert_member") {
      const linkedUserId = Number(body.linked_user_id ?? 0) || null;
      const authUserId = safeString(body.auth_user_id);
      const displayName = safeString(body.display_name);
      const isOwner = body.is_owner === true;

      let member: Record<string, any> | null = null;
      if (authUserId) {
        member =
          (await maybeSingle<Record<string, any>>(
            admin.from("admin_members").select("*").eq("auth_user_id", authUserId).limit(1),
          )) || null;
      }
      if (!member && linkedUserId) {
        member =
          (await maybeSingle<Record<string, any>>(
            admin.from("admin_members").select("*").eq("linked_user_id", linkedUserId).limit(1),
          )) || null;
      }

      if (!member) {
        const { data, error } = await admin
          .from("admin_members")
          .insert({
            auth_user_id: authUserId,
            linked_user_id: linkedUserId,
            display_name: displayName,
            is_owner: isOwner,
            is_active: true,
          })
          .select("*")
          .limit(1)
          .single();
        if (error) throw error;
        member = data as Record<string, any>;
      } else {
        const { data, error } = await admin
          .from("admin_members")
          .update({
            auth_user_id: authUserId ?? member.auth_user_id,
            linked_user_id: linkedUserId ?? member.linked_user_id,
            display_name: displayName ?? member.display_name,
            is_owner: isOwner || member.is_owner === true,
          })
          .eq("id", member.id)
          .select("*")
          .limit(1)
          .single();
        if (error) throw error;
        member = data as Record<string, any>;
      }

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.upsert_member",
        targetType: "admin_member",
        targetId: String(member.id),
        roleSnapshot: roles,
        metadata: {
          linked_user_id: member.linked_user_id,
          auth_user_id: member.auth_user_id,
        },
      });

      sendJson(res, 200, { ok: true, data: { id: Number(member.id) } });
      return;
    }

    if (action === "set_member_access") {
      const memberId = Number(body.member_id ?? 0);
      const role = normalizeRole(body.role);
      const isActive = body.is_active == null ? null : body.is_active === true;

      const member =
        (await maybeSingle<Record<string, any>>(
          admin.from("admin_members").select("*").eq("id", memberId).limit(1),
        )) || null;
      if (!member) {
        sendJson(res, 404, { ok: false, error: "member_not_found" });
        return;
      }

      const nextIsOwner = role === "owner";
      const nextIsActive = isActive == null ? member.is_active !== false : isActive;

      if (member.is_owner === true && (!nextIsOwner || nextIsActive === false)) {
        const { count, error } = await admin
          .from("admin_members")
          .select("id", { head: true, count: "exact" })
          .eq("is_owner", true)
          .eq("is_active", true);
        if (error) throw error;
        if ((count ?? 0) <= 1) {
          sendJson(res, 400, { ok: false, error: "last_owner_guard" });
          return;
        }
      }

      const persistence = roleToPersistence(role);
      const { data: updatedMember, error: memberError } = await admin
        .from("admin_members")
        .update({
          is_owner: persistence.is_owner,
          is_active: nextIsActive,
        })
        .eq("id", memberId)
        .select("*")
        .limit(1)
        .single();
      if (memberError) throw memberError;

      await admin.from("admin_member_roles").delete().eq("member_id", memberId);
      if (persistence.member_roles.length) {
        const inserts = persistence.member_roles.map((entry) => ({
          member_id: memberId,
          role: entry,
        }));
        const { error: roleError } = await admin.from("admin_member_roles").insert(inserts);
        if (roleError) throw roleError;
      }

      if (updatedMember?.linked_user_id != null) {
        const { error: compatError } = await admin
          .from("users")
          .update({ is_admin: persistence.is_admin })
          .eq("id", updatedMember.linked_user_id);
        if (compatError) throw compatError;
      }

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.set_member_access",
        targetType: "admin_member",
        targetId: String(memberId),
        roleSnapshot: roles,
        metadata: {
          role,
          is_active: nextIsActive,
        },
      });

      sendJson(res, 200, { ok: true, data: { id: memberId, role, is_active: nextIsActive } });
      return;
    }

    if (action === "toggle_member_active") {
      const memberId = Number(body.member_id ?? 0);
      const isActive = body.is_active === true;

      const member =
        (await maybeSingle<Record<string, any>>(
          admin.from("admin_members").select("*").eq("id", memberId).limit(1),
        )) || null;
      if (!member) {
        sendJson(res, 404, { ok: false, error: "member_not_found" });
        return;
      }

      if (member.is_owner === true && !isActive) {
        const { count, error } = await admin
          .from("admin_members")
          .select("id", { head: true, count: "exact" })
          .eq("is_owner", true)
          .eq("is_active", true);
        if (error) throw error;
        if ((count ?? 0) <= 1) {
          sendJson(res, 400, { ok: false, error: "last_owner_guard" });
          return;
        }
      }

      const { error } = await admin
        .from("admin_members")
        .update({ is_active: isActive })
        .eq("id", memberId);
      if (error) throw error;

      await writeAdminAuditLog({
        admin,
        actorMemberId: adminMember?.id ?? null,
        actorUserId: compatUser?.id ?? null,
        action: "admin.toggle_member_active",
        targetType: "admin_member",
        targetId: String(memberId),
        roleSnapshot: roles,
        metadata: {
          is_active: isActive,
        },
      });

      sendJson(res, 200, { ok: true, data: { id: memberId, is_active: isActive } });
      return;
    }

    sendJson(res, 400, { ok: false, error: "unsupported_action" });
  } catch (error) {
    const message = String((error as Error)?.message || error || "admin_members_failed");
    sendJson(res, message === "auth_required" ? 401 : message === "admin_required" ? 403 : 500, {
      ok: false,
      error: message,
      message,
    });
  }
}
