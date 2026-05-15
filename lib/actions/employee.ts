"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "@/lib/scope";

export async function getEmployeeAssignments(userId: string, scope: Scope): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_assignments")
    .select("category_id")
    .eq("user_id", userId)
    .eq("scope", scope);

  if (error) throw error;
  return (data ?? []).map((r) => r.category_id);
}

export async function setEmployeeAssignments(
  userId: string,
  scope: Scope,
  categoryIds: string[],
): Promise<{ success: true } | { error: string }> {
  const admin = createAdminClient();

  // Delete all existing assignments for this user+scope
  const { error: delError } = await admin
    .from("employee_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope);

  if (delError) return { error: delError.message };

  // Insert new ones (if any)
  if (categoryIds.length > 0) {
    const { error: insError } = await admin
      .from("employee_assignments")
      .insert(
        categoryIds.map((category_id) => ({
          user_id: userId,
          scope,
          category_id,
        })),
      );

    if (insError) return { error: insError.message };
  }

  revalidatePath("/business/employee");
  revalidatePath("/settings/team");
  return { success: true };
}
