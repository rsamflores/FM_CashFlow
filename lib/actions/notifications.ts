"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "@/lib/scope";

export type NotificationRow = {
  id: string;
  scope: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getMyNotifications(): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("id, scope, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (data ?? []) as NotificationRow[];
}

export async function getMyUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return count ?? 0;
}

export async function markAllRead() {
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
}

// ── Internal helpers (not server-action callable directly) ──

export async function insertNotifications(
  userIds: string[],
  payload: Pick<NotificationRow, "scope" | "type" | "title" | "body" | "link">,
) {
  if (userIds.length === 0) return;
  const admin = createAdminClient();
  await admin.from("notifications").insert(
    userIds.map((user_id) => ({ user_id, ...payload })),
  );
}

export async function getScopeManagers(scope: Scope): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("memberships")
    .select("user_id")
    .eq("scope", scope)
    .in("role", ["owner", "editor"]);
  return (data ?? []).map((m: { user_id: string }) => m.user_id);
}
