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

// ── Duplicate detection ────────────────────────────────────────────────────────

export type DuplicateGroup = {
  key: string;            // "income|224.00|biweekly"
  kind: "income" | "expense";
  amount: number;
  frequency: string;
  confidence: "high" | "medium"; // high = same next_run date
  rules: RecurringRuleRow[];
};

export async function getDuplicateCandidates(scope: Scope): Promise<DuplicateGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*, account:accounts!account_id(name,color), to_account:accounts!to_account_id(name,color), category:categories(name,color,icon)")
    .eq("scope", scope)
    .eq("is_active", true)
    .order("next_run", { ascending: true });

  if (error) throw error;
  const rules = (data ?? []) as RecurringRuleRow[];

  // Group by (kind, amount_rounded_to_cents, frequency)
  const byKey = new Map<string, RecurringRuleRow[]>();
  for (const rule of rules) {
    // Skip internal transfers (both legs cancel out — not true duplicates)
    if (rule.to_account_id) continue;
    const key = `${rule.kind}|${Number(rule.amount).toFixed(2)}|${rule.frequency}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(rule);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, groupRules] of byKey.entries()) {
    if (groupRules.length < 2) continue;

    // High confidence: 2+ rules that also share the same next_run date
    const byDate = new Map<string, RecurringRuleRow[]>();
    for (const r of groupRules) {
      if (!byDate.has(r.next_run)) byDate.set(r.next_run, []);
      byDate.get(r.next_run)!.push(r);
    }
    const hasExactDateCollision = [...byDate.values()].some((g) => g.length >= 2);

    const [kind, amountStr, frequency] = key.split("|");
    groups.push({
      key,
      kind: kind as "income" | "expense",
      amount: parseFloat(amountStr),
      frequency,
      confidence: hasExactDateCollision ? "high" : "medium",
      rules: groupRules,
    });
  }

  // Sort high-confidence first, then by amount desc
  return groups.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    return b.amount - a.amount;
  });
}
