"use server";

import { createClient } from "@/lib/supabase/server";

export type EmployeeBankAccount = {
  id: string;
  user_id: string;
  label: string;
  bank_name: string;
  account_number: string;
  account_type: "checking" | "savings";
  account_holder: string;
  is_default: boolean;
  created_at: string;
};

export async function getMyBankAccounts(): Promise<EmployeeBankAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_bank_accounts")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as EmployeeBankAccount[];
}

export async function saveBankAccount(
  formData: FormData,
): Promise<{ success: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const label = (formData.get("label") as string)?.trim();
  const bank_name = (formData.get("bank_name") as string)?.trim();
  const account_number = (formData.get("account_number") as string)?.trim();
  const account_type = formData.get("account_type") as "checking" | "savings";
  const account_holder = (formData.get("account_holder") as string)?.trim();
  const is_default = formData.get("is_default") === "true";

  if (!label) return { error: "El alias es requerido" };
  if (!bank_name) return { error: "El banco es requerido" };
  if (!account_number) return { error: "El número de cuenta es requerido" };
  if (!account_holder) return { error: "El titular es requerido" };

  if (is_default) {
    await supabase
      .from("employee_bank_accounts")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const { data, error } = await supabase
    .from("employee_bank_accounts")
    .insert({ user_id: user.id, label, bank_name, account_number, account_type, account_holder, is_default })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { success: true, id: data.id };
}

export async function deleteBankAccount(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_bank_accounts")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function setDefaultBankAccount(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  await supabase
    .from("employee_bank_accounts")
    .update({ is_default: false })
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("employee_bank_accounts")
    .update({ is_default: true })
    .eq("id", id);

  if (error) return { error: error.message };
  return { success: true };
}
