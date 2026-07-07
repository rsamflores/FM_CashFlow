"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Scope } from "@/lib/scope";
import { insertNotifications, getScopeManagers } from "@/lib/actions/notifications";
import { svToday } from "@/lib/format";

const BudgetSchema = z.object({
  category_id: z.string().uuid("Selecciona una categoría"),
  account_id: z.string().uuid("Selecciona una cuenta").nullable().optional(),
  expected_amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  period_month: z.string().min(1, "El mes es requerido"),
  note: z.string().optional(),
  is_single_payment: z.boolean().optional().default(false),
});

export type BudgetRow = {
  id: string;
  scope: Scope;
  category_id: string;
  account_id: string | null;
  period_month: string;
  expected_amount: number;
  note: string | null;
  is_single_payment: boolean;
  created_at: string;
  category: { name: string; color: string | null; icon: string | null } | null;
  account: { name: string; color: string | null } | null;
};

export async function getBudgets(scope: Scope, periodMonth: string): Promise<BudgetRow[]> {
  const supabase = await createClient();

  // Auto-roll: if the user hasn't created budgets for this month yet, copy the
  // most recent prior month's budgets (preserving amounts, accounts, notes,
  // single-payment flag). Progress bars naturally reset because the spent
  // tally is filtered by current-month transactions.
  const { count } = await supabase
    .from("planned_budgets")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .eq("period_month", periodMonth);

  if ((count ?? 0) === 0) {
    await materializeBudgetsFromPriorMonth(scope, periodMonth);
  }

  const { data, error } = await supabase
    .from("planned_budgets")
    .select("*, category:categories(name,color,icon), account:accounts(name,color)")
    .eq("scope", scope)
    .eq("period_month", periodMonth)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BudgetRow[];
}

// Internal: rolls the most recent prior month's budgets into the given month.
// Uses the admin client to insert under the existing RLS policies.
async function materializeBudgetsFromPriorMonth(scope: Scope, periodMonth: string): Promise<void> {
  const admin = createAdminClient();

  const { data: prior } = await admin
    .from("planned_budgets")
    .select("period_month")
    .eq("scope", scope)
    .lt("period_month", periodMonth)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prior?.period_month) return;

  const { data: priorBudgets } = await admin
    .from("planned_budgets")
    .select("category_id, account_id, expected_amount, note, is_single_payment")
    .eq("scope", scope)
    .eq("period_month", prior.period_month);

  if (!priorBudgets || priorBudgets.length === 0) return;

  const rows = priorBudgets.map((b) => ({
    scope,
    category_id: b.category_id,
    account_id: b.account_id,
    expected_amount: b.expected_amount,
    note: b.note,
    is_single_payment: b.is_single_payment,
    period_month: periodMonth,
  }));

  await admin
    .from("planned_budgets")
    .upsert(rows, { onConflict: "scope,category_id,period_month" });
}

export async function upsertBudget(scope: Scope, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const rawAccount = formData.get("account_id");
  const parsed = BudgetSchema.safeParse({
    category_id: formData.get("category_id"),
    account_id: rawAccount && rawAccount !== "" ? rawAccount : null,
    expected_amount: formData.get("expected_amount"),
    period_month: formData.get("period_month"),
    note: formData.get("note") || undefined,
    is_single_payment: formData.get("is_single_payment") === "true",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from("planned_budgets").upsert(
    { ...parsed.data, scope },
    { onConflict: "scope,category_id,period_month" },
  );

  if (error) return { error: error.message };
  revalidatePath(`/${scope}/budgets`);
  return { success: true };
}

export async function resetBudgetsFromPriorMonth(
  scope: Scope,
  periodMonth: string,
): Promise<{ replaced: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const admin = createAdminClient();

  // Find most recent prior month that has budgets
  const { data: prior } = await admin
    .from("planned_budgets")
    .select("period_month")
    .eq("scope", scope)
    .lt("period_month", periodMonth)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prior?.period_month) return { error: "No hay presupuestos de meses anteriores para copiar" };

  const { data: priorBudgets } = await admin
    .from("planned_budgets")
    .select("category_id, account_id, expected_amount, note, is_single_payment")
    .eq("scope", scope)
    .eq("period_month", prior.period_month);

  if (!priorBudgets || priorBudgets.length === 0) return { error: "El mes anterior no tiene presupuestos" };

  // Delete current month's entries then re-insert from prior month
  await admin.from("planned_budgets").delete().eq("scope", scope).eq("period_month", periodMonth);

  const rows = priorBudgets.map((b) => ({
    scope,
    category_id: b.category_id,
    account_id: b.account_id,
    expected_amount: b.expected_amount,
    note: b.note,
    is_single_payment: b.is_single_payment,
    period_month: periodMonth,
  }));

  const { error } = await admin.from("planned_budgets").insert(rows);
  if (error) return { error: error.message };

  revalidatePath(`/${scope}/budgets`);
  return { replaced: rows.length };
}

export async function deleteBudget(id: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_budgets").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/${scope}/budgets`);
  return { success: true };
}

// ── Budget alert checks ────────────────────────────────────────────────────

/**
 * After any transaction is created/confirmed, call this to fire 80%/100% alerts.
 * Uses an idempotent `budget_alerts_sent` table — each threshold fires at most once per budget period.
 */
export async function checkBudgetAlerts(scope: Scope, categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return;
  const admin = createAdminClient();
  const { year, month } = svToday();
  const periodMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(year, month + 1, 1).toLocaleDateString("en-CA");

  // Fetch budget for this category
  const { data: budget } = await admin
    .from("planned_budgets")
    .select("id, expected_amount, category:categories(name)")
    .eq("scope", scope)
    .eq("category_id", categoryId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (!budget || Number(budget.expected_amount) <= 0) return;

  // Fetch total spent (confirmed + employee pending)
  const { data: txs } = await admin
    .from("transactions")
    .select("amount")
    .eq("scope", scope)
    .eq("kind", "expense")
    .eq("category_id", categoryId)
    .or("is_confirmed.eq.true,affects_balance.eq.false")
    .gte("occurred_on", periodMonth)
    .lt("occurred_on", nextMonth);

  const spent = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const pct = (spent / Number(budget.expected_amount)) * 100;

  // Fetch already-sent alerts for this budget
  const { data: sent } = await admin
    .from("budget_alerts_sent")
    .select("threshold")
    .eq("budget_id", budget.id);

  const sentSet = new Set((sent ?? []).map((r) => r.threshold));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catName = (budget.category as any)?.name ?? "Presupuesto";
  const managers = await getScopeManagers(scope);

  const thresholds: [number, string, string][] = [
    [80, `⚠️ Presupuesto al 80%`, `"${catName}" ha alcanzado el 80% del presupuesto mensual`],
    [100, `🚨 Presupuesto agotado`, `"${catName}" ha superado el 100% del presupuesto mensual`],
  ];

  for (const [threshold, title, body] of thresholds) {
    if (pct >= threshold && !sentSet.has(threshold)) {
      // Insert alert record first (idempotent guard)
      const { error: insertErr } = await admin
        .from("budget_alerts_sent")
        .insert({ budget_id: budget.id, threshold })
        .select();
      if (insertErr) continue; // already inserted by concurrent request

      await insertNotifications(managers, {
        scope,
        type: "budget_alert",
        title,
        body,
        link: `/${scope}/budgets`,
      });
    }
  }
}
