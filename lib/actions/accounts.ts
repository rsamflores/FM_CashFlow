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

  if (!parsed.success) return { error: parsed.error.errors[0].message };

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

  if (!parsed.success) return { error: parsed.error.errors[0].message };

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
