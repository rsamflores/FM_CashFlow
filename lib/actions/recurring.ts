"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/scope";

export type RecurringRuleRow = {
  id: string;
  scope: Scope;
  kind: "income" | "expense";
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  amount: number;
  description: string | null;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  start_date: string;
  next_run: string;
  is_active: boolean;
  account: { name: string; color: string | null } | null;
  to_account: { name: string; color: string | null } | null;
  category: { name: string; color: string | null; icon: string | null } | null;
};

export async function getRecurringRules(scope: Scope): Promise<RecurringRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*, account:accounts!account_id(name,color), to_account:accounts!to_account_id(name,color), category:categories(name,color,icon)")
    .eq("scope", scope)
    .order("next_run", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RecurringRuleRow[];
}

export async function toggleRecurringRule(id: string, isActive: boolean, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_rules")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/${scope}/recurring`);
  return { success: true };
}

export async function deleteRecurringRule(id: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_rules")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/${scope}/recurring`);
  return { success: true };
}
