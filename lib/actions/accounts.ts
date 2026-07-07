"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { Scope } from "@/lib/scope";

const AccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  type: z.enum(["checking", "savings", "cash", "credit_card", "other"]),
  opening_balance: z.coerce.number().default(0),
  credit_limit: z.coerce.number().nullable().optional(),
  color: z.string().nullable().optional(),
  is_tax_account: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
});

export type AccountRow = {
  id: string;
  scope: Scope;
  name: string;
  type: "checking" | "savings" | "cash" | "credit_card" | "other";
  color: string | null;
  icon: string | null;
  opening_balance: number;
  credit_limit: number | null;
  currency: string;
  is_tax_account: boolean;
  archived_at: string | null;
  created_at: string;
};

export async function getPersonalCashAccounts(): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("scope", "personal")
    .eq("type", "cash")
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AccountRow[];
}

export async function getAccounts(scope: Scope): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("scope", scope)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AccountRow[];
}

export async function createAccount(scope: Scope, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const type = formData.get("type") as string;
  const parsed = AccountSchema.safeParse({
    name: formData.get("name"),
    type,
    opening_balance: formData.get("opening_balance") || 0,
    credit_limit: type === "credit_card" ? (formData.get("credit_limit") || null) : null,
    color: formData.get("color") || null,
    is_tax_account: formData.get("is_tax_account"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("accounts")
    .insert({ ...parsed.data, scope });

  if (error) return { error: error.message };
  revalidatePath(`/${scope}/accounts`);
  return { success: true };
}

export async function updateAccount(
  id: string,
  scope: Scope,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const type = formData.get("type") as string;
  const parsed = AccountSchema.safeParse({
    name: formData.get("name"),
    type,
    opening_balance: formData.get("opening_balance") || 0,
    credit_limit: type === "credit_card" ? (formData.get("credit_limit") || null) : null,
    color: formData.get("color") || null,
    is_tax_account: formData.get("is_tax_account"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("accounts")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/${scope}/accounts`);
  return { success: true };
}

export async function archiveAccount(id: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/${scope}/accounts`);
  return { success: true };
}

export async function deleteAccount(id: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/${scope}/accounts`);
  return { success: true };
}

/**
 * Create a balance-adjustment transaction so the account matches the real
 * bank/cash balance.  For credit cards `realBalance` means the real *debt*
 * (amount owed), not available credit.
 */
export async function adjustAccountBalance(
  accountId: string,
  scope: Scope,
  realBalance: number,
  description: string,
): Promise<{ kind: "income" | "expense"; amount: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // 1. Fetch account
  const { data: account, error: accErr } = await supabase
    .from("accounts")
    .select("opening_balance, type")
    .eq("id", accountId)
    .eq("scope", scope)
    .single();
  if (accErr || !account) return { error: "Cuenta no encontrada" };

  // 2. Recompute current value from confirmed transactions
  const { data: txs } = await supabase
    .from("transactions")
    .select("amount, kind")
    .eq("account_id", accountId)
    .eq("is_confirmed", true)
    .eq("affects_balance", true);

  const isCreditCard = account.type === "credit_card";
  let currentValue: number;

  if (isCreditCard) {
    // "value" for a CC is the debt (used amount): Σ expenses − Σ incomes
    currentValue = Math.max(
      0,
      (txs ?? []).reduce(
        (s, tx) => s + (tx.kind === "expense" ? Number(tx.amount) : -Number(tx.amount)),
        0,
      ),
    );
  } else {
    currentValue =
      Number(account.opening_balance) +
      (txs ?? []).reduce(
        (s, tx) => s + (tx.kind === "income" ? Number(tx.amount) : -Number(tx.amount)),
        0,
      );
  }

  const delta = realBalance - currentValue;
  if (Math.abs(delta) < 0.01) return { error: "El saldo ya coincide con el real" };

  // For regular accounts: real > app → income; real < app → expense
  // For credit cards:    real > app → more debt → expense; real < app → less debt → income
  const kind: "income" | "expense" = isCreditCard
    ? delta > 0 ? "expense" : "income"
    : delta > 0 ? "income"  : "expense";

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

  const { error: txErr } = await supabase.from("transactions").insert({
    scope,
    account_id: accountId,
    kind,
    amount: Math.abs(delta),
    is_confirmed: true,
    affects_balance: true,
    category_id: null,
    occurred_on: today,
    description: description || "Ajuste de saldo",
    transfer_id: null,
    recurring_rule_id: null,
    is_planned: false,
  });

  if (txErr) return { error: txErr.message };

  revalidatePath(`/${scope}/accounts`);
  revalidatePath(`/${scope}/dashboard`);
  revalidatePath(`/${scope}/transactions`);
  return { kind, amount: Math.abs(delta) };
}
