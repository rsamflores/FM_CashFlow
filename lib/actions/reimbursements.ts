"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "@/lib/scope";
import type { TransactionRow } from "@/lib/actions/transactions";
import { insertNotifications, getScopeManagers } from "@/lib/actions/notifications";

export type ReimbursementItemRow = {
  id: string;
  reimbursement_id: string;
  transaction_id: string;
  transaction: TransactionRow | null;
};

export type ReimbursementRow = {
  id: string;
  scope: Scope;
  employee_id: string;
  employee_name: string | null;
  status: "pending" | "approved" | "paid" | "rejected";
  total_amount: number;
  bank_name: string;
  account_number: string;
  account_type: "checking" | "savings";
  account_holder: string;
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
  transaction_id: string | null;
  items: ReimbursementItemRow[];
};

export async function getMyReimbursements(scope: Scope): Promise<ReimbursementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reimbursement_requests")
    .select(`
      *,
      items:reimbursement_items(
        id, reimbursement_id, transaction_id,
        transaction:transactions(*, account:accounts(name,color), category:categories(name,color,icon))
      )
    `)
    .eq("scope", scope)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    ...r,
    employee_name: null,
    items: r.items ?? [],
  })) as ReimbursementRow[];
}

export async function getMyExpensesForReimbursement(scope: Scope): Promise<TransactionRow[]> {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get transaction_ids already linked to a reimbursement
  const { data: linked } = await admin
    .from("reimbursement_items")
    .select("transaction_id")
    .in(
      "reimbursement_id",
      (
        await admin
          .from("reimbursement_requests")
          .select("id")
          .eq("employee_id", user.id)
          .eq("scope", scope)
      ).data?.map((r) => r.id) ?? [],
    );

  const linkedIds = (linked ?? []).map((l) => l.transaction_id);

  // Get employee's own confirmed expenses in this scope not yet in a reimbursement
  let query = admin
    .from("transactions")
    .select("*, account:accounts(name,color), category:categories(name,color,icon)")
    .eq("scope", scope)
    .eq("kind", "expense")
    .eq("is_confirmed", true)
    .eq("affects_balance", false)
    .eq("created_by", user.id)
    .order("occurred_on", { ascending: false });

  if (linkedIds.length > 0) {
    query = query.not("id", "in", `(${linkedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

export async function createReimbursementRequest(
  scope: Scope,
  formData: FormData,
): Promise<{ success: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const bank_name = (formData.get("bank_name") as string)?.trim();
  const account_number = (formData.get("account_number") as string)?.trim();
  const account_type = formData.get("account_type") as "checking" | "savings";
  const account_holder = (formData.get("account_holder") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;
  const transaction_ids = formData.getAll("transaction_ids") as string[];

  if (!bank_name) return { error: "El banco es requerido" };
  if (!account_number) return { error: "El número de cuenta es requerido" };
  if (!account_type) return { error: "El tipo de cuenta es requerido" };
  if (!account_holder) return { error: "El titular es requerido" };
  if (!transaction_ids.length) return { error: "Selecciona al menos un gasto" };

  // Fetch the transactions to compute total
  const { data: txs, error: txErr } = await admin
    .from("transactions")
    .select("id, amount")
    .in("id", transaction_ids);

  if (txErr) return { error: txErr.message };
  if (!txs?.length) return { error: "No se encontraron los gastos seleccionados" };

  const total_amount = txs.reduce((s, t) => s + Number(t.amount), 0);

  // Insert reimbursement request
  const { data: req, error: reqErr } = await admin
    .from("reimbursement_requests")
    .insert({
      scope,
      employee_id: user.id,
      status: "pending",
      total_amount,
      bank_name,
      account_number,
      account_type,
      account_holder,
      notes,
    })
    .select("id")
    .single();

  if (reqErr) return { error: reqErr.message };

  // Insert items
  const { error: itemsErr } = await admin
    .from("reimbursement_items")
    .insert(transaction_ids.map((tid) => ({ reimbursement_id: req.id, transaction_id: tid })));

  if (itemsErr) return { error: itemsErr.message };

  // Notify scope owners/editors of new reimbursement request
  const managers = await getScopeManagers(scope);
  const profile = await (async () => {
    const { data } = await createAdminClient().from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (data?.full_name) return data.full_name;
    const { data: ud } = await createAdminClient().auth.admin.getUserById(user.id);
    return ud.user?.email?.split("@")[0] ?? "Un empleado";
  })();
  await insertNotifications(managers.filter((id) => id !== user.id), {
    scope,
    type: "reimbursement_submitted",
    title: "Nueva solicitud de reembolso",
    body: `${profile} solicitó $${total_amount.toFixed(2)}`,
    link: `/${scope}/reimbursements`,
  });

  revalidatePath(`/${scope}/employee`);
  revalidatePath(`/${scope}/reimbursements`);
  return { success: true, id: req.id };
}

export async function getReimbursementRequests(scope: Scope): Promise<ReimbursementRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("reimbursement_requests")
    .select(`
      *,
      items:reimbursement_items(
        id, reimbursement_id, transaction_id,
        transaction:transactions(*, account:accounts(name,color), category:categories(name,color,icon))
      )
    `)
    .eq("scope", scope)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Fetch profiles for employee names
  const employeeIds = [...new Set((data ?? []).map((r) => r.employee_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", employeeIds);
  const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) ?? []);

  // Also get emails as fallback
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(users.map((u) => [u.id, u.email ?? null]));

  return (data ?? []).map((r) => ({
    ...r,
    employee_name: profileMap.get(r.employee_id) ?? emailMap.get(r.employee_id) ?? null,
    items: r.items ?? [],
  })) as ReimbursementRow[];
}

export async function payReimbursement(
  id: string,
  scope: Scope,
  accountId: string,
): Promise<{ success: true } | { error: string }> {
  const admin = createAdminClient();

  // Fetch the request
  const { data: req, error: reqErr } = await admin
    .from("reimbursement_requests")
    .select("*, employee_id, total_amount")
    .eq("id", id)
    .single();

  if (reqErr || !req) return { error: reqErr?.message ?? "No encontrado" };
  if (req.status !== "pending") return { error: "La solicitud no está pendiente" };

  // Fetch employee name
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", req.employee_id)
    .maybeSingle();

  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1 });
  // Get just the employee user
  let employeeName = profile?.full_name ?? null;
  if (!employeeName) {
    const { data: userData } = await admin.auth.admin.getUserById(req.employee_id);
    employeeName = userData.user?.email ?? "Empleado";
  }

  // Create expense transaction for the reimbursement payment
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .insert({
      scope,
      account_id: accountId,
      category_id: null,
      kind: "expense",
      amount: req.total_amount,
      occurred_on: today,
      description: `Reembolso — ${employeeName}`,
      is_confirmed: true,
      affects_balance: true,
      is_planned: false,
    })
    .select("id")
    .single();

  if (txErr) return { error: txErr.message };

  // Update the request
  const { error: updErr } = await admin
    .from("reimbursement_requests")
    .update({
      status: "paid",
      reviewed_at: new Date().toISOString(),
      transaction_id: tx.id,
    })
    .eq("id", id);

  if (updErr) return { error: updErr.message };

  // Notify the employee that their reimbursement was paid
  await insertNotifications([req.employee_id], {
    scope,
    type: "reimbursement_paid",
    title: "Reembolso pagado",
    body: `Tu solicitud de $${Number(req.total_amount).toFixed(2)} fue procesada`,
    link: `/${scope}/reimbursements`,
  });

  revalidatePath(`/${scope}/reimbursements`);
  revalidatePath(`/${scope}/employee`);
  revalidatePath(`/${scope}/transactions`);
  revalidatePath(`/${scope}/accounts`);
  revalidatePath(`/${scope}/dashboard`);
  return { success: true };
}

export async function rejectReimbursement(
  id: string,
  scope: Scope,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("reimbursement_requests")
    .select("employee_id, total_amount")
    .eq("id", id)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "No encontrado" };

  const { error } = await admin
    .from("reimbursement_requests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reject_reason: reason || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Notify the employee that their reimbursement was rejected
  await insertNotifications([req.employee_id], {
    scope,
    type: "reimbursement_rejected",
    title: "Solicitud de reembolso rechazada",
    body: reason || `Tu solicitud de $${Number(req.total_amount).toFixed(2)} fue revisada`,
    link: `/${scope}/reimbursements`,
  });

  revalidatePath(`/${scope}/reimbursements`);
  revalidatePath(`/${scope}/employee`);
  return { success: true };
}
