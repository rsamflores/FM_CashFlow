"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { Scope } from "@/lib/scope";

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
  const { data, error } = await supabase
    .from("planned_budgets")
    .select("*, category:categories(name,color,icon), account:accounts(name,color)")
    .eq("scope", scope)
    .eq("period_month", periodMonth)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BudgetRow[];
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

export async function deleteBudget(id: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_budgets").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/${scope}/budgets`);
  return { success: true };
}
