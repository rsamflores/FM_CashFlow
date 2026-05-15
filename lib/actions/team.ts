"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "@/lib/scope";

export type MemberRow = {
  user_id: string;
  scope: Scope;
  role: "owner" | "editor" | "viewer" | "recorder";
  invited_email: string | null;
  full_name: string | null;
  email: string | null;
  invited_at: string;
  accepted_at: string | null;
};

export async function getTeamMembers(): Promise<MemberRow[]> {
  const admin = createAdminClient();

  // Read all memberships (bypasses RLS via service role)
  const { data: memberships, error } = await admin
    .from("memberships")
    .select("user_id, scope, role, invited_email, invited_at, accepted_at")
    .order("invited_at", { ascending: true });

  if (error) throw error;
  if (!memberships?.length) return [];

  // Fetch auth users in bulk to get emails
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Fetch profiles for full names
  const ids = [...new Set(memberships.map((m) => m.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  return memberships.map((m) => ({
    user_id: m.user_id,
    scope: m.scope as Scope,
    role: m.role as MemberRow["role"],
    invited_email: m.invited_email ?? null,
    full_name: profileMap.get(m.user_id)?.full_name ?? null,
    email: userMap.get(m.user_id)?.email ?? m.invited_email ?? null,
    invited_at: m.invited_at,
    accepted_at: m.accepted_at ?? null,
  }));
}

export async function inviteMember(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = formData.get("role") as "editor" | "viewer" | "recorder";
  const scopes = formData.getAll("scope") as Scope[];

  if (!email) return { error: "El correo es requerido" };
  if (!role) return { error: "El rol es requerido" };
  if (!scopes.length) return { error: "Selecciona al menos un ámbito" };

  const admin = createAdminClient();

  // Verify current user is owner of at least one of the requested scopes
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Invite or look up user
  let targetUserId: string;
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = existingUsers.users.find((u) => u.email === email);

  if (existing) {
    targetUserId = existing.id;
  } else {
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (invErr) return { error: invErr.message };
    targetUserId = invited.user.id;
  }

  // Upsert memberships for each scope
  for (const scope of scopes) {
    const { error } = await admin.from("memberships").upsert(
      { user_id: targetUserId, scope, role, invited_email: email, invited_at: new Date().toISOString() },
      { onConflict: "user_id,scope" },
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/settings/team");
  return { success: true };
}

export async function updateMemberRole(userId: string, scope: Scope, role: "editor" | "viewer" | "recorder") {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("user_id", userId)
    .eq("scope", scope);
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { success: true };
}

export async function resetMemberPassword(userId: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres" };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateMemberPermissions(
  userId: string,
  role: "editor" | "viewer" | "recorder",
  scopes: Scope[],
) {
  if (!scopes.length) return { error: "Selecciona al menos un ámbito" };
  const admin = createAdminClient();
  const allScopes: Scope[] = ["personal", "business"];

  for (const scope of allScopes) {
    if (scopes.includes(scope)) {
      const { error } = await admin
        .from("memberships")
        .upsert({ user_id: userId, scope, role }, { onConflict: "user_id,scope" });
      if (error) return { error: error.message };
    } else {
      await admin.from("memberships").delete().eq("user_id", userId).eq("scope", scope);
    }
  }

  revalidatePath("/settings/team");
  return { success: true };
}

export async function removeMember(userId: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope);
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { success: true };
}
