"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Scope } from "@/lib/scope";
import { insertNotifications, getScopeManagers } from "@/lib/actions/notifications";
import { checkBudgetAlerts } from "@/lib/actions/budgets";

const TransactionSchema = z.object({
  kind: z.enum(["income", "expense"]),
  account_id: z.string().uuid("Selecciona una cuenta"),
  category_id: z.string().uuid("Selecciona una categoría"),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  occurred_on: z.string().min(1, "La fecha es requerida"),
  description: z.string().optional(),
  is_planned: z.coerce.boolean().default(false),
  affects_balance: z.coerce.boolean().default(true),
});

const RecurringSchema = z.object({
  frequency: z.enum(["weekly", "biweekly", "monthly", "yearly"]),
  start_date: z.string().min(1),
});

export type TransactionRow = {
  id: string;
  scope: Scope;
  account_id: string;
  category_id: string;
  kind: "income" | "expense";
  amount: number;
  occurred_on: string;
  description: string | null;
  is_planned: boolean;
  is_confirmed: boolean;
  affects_balance: boolean;
  recurring_rule_id: string | null;
  transfer_id: string | null;
  receipt_url: string | null;
  created_at: string;
  account: { name: string; color: string | null } | null;
  category: { name: string; color: string | null; icon: string | null } | null;
};

// Revalidate all pages that depend on transaction data
function revalidateScope(scope: Scope) {
  revalidatePath(`/${scope}/transactions`);
  revalidatePath(`/${scope}/accounts`);
  revalidatePath(`/${scope}/dashboard`);
  revalidatePath(`/${scope}/budgets`);
  revalidatePath(`/${scope}/employee`);
  // Business income may land in personal cash accounts — keep personal pages fresh
  if (scope === "business") {
    revalidatePath("/personal/accounts");
    revalidatePath("/personal/dashboard");
  }
}

function nextRunDate(startDate: string, frequency: string): string {
  const d = new Date(startDate + "T12:00:00");
  switch (frequency) {
    case "weekly":   d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly":  d.setMonth(d.getMonth() + 1); break;
    case "yearly":   d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toLocaleDateString("en-CA");
}

export async function getTransactionsByAccountIds(accountIds: string[]): Promise<TransactionRow[]> {
  if (accountIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*, account:accounts(name,color), category:categories(name,color,icon)")
    .in("account_id", accountIds)
    .order("occurred_on", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

export async function getTransactions(scope: Scope): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*, account:accounts(name,color), category:categories(name,color,icon)")
    .eq("scope", scope)
    .order("occurred_on", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

export async function getTransactionsFrom(scope: Scope, from: string): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*, account:accounts(name,color), category:categories(name,color,icon)")
    .eq("scope", scope)
    .gte("occurred_on", from)
    .order("occurred_on", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

export async function getTransactionsForMonth(scope: Scope, yearMonth: string): Promise<TransactionRow[]> {
  const [y, m] = yearMonth.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const toYear = m === 12 ? y + 1 : y;
  const toMonth = m === 12 ? 1 : m + 1;
  const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;

  // Use admin client so employee-created transactions (affects_balance=false) are visible
  // to the admin without RLS blocking cross-user visibility.
  const admin = createAdminClient();

  // Fetch confirmed transactions for the selected month AND all pending transactions
  // regardless of date — pending items must always be visible until the user confirms them.
  const [confirmedRes, pendingRes] = await Promise.all([
    admin
      .from("transactions")
      .select("*, account:accounts(name,color), category:categories(name,color,icon)")
      .eq("scope", scope)
      .eq("is_confirmed", true)
      .gte("occurred_on", from)
      .lt("occurred_on", to)
      .order("occurred_on", { ascending: false }),
    admin
      .from("transactions")
      .select("*, account:accounts(name,color), category:categories(name,color,icon)")
      .eq("scope", scope)
      .eq("is_confirmed", false)
      .order("occurred_on", { ascending: true }),
  ]);

  if (confirmedRes.error) throw confirmedRes.error;
  if (pendingRes.error) throw pendingRes.error;

  return [...(pendingRes.data ?? []), ...(confirmedRes.data ?? [])] as TransactionRow[];
}

export async function createTransaction(scope: Scope, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = TransactionSchema.safeParse({
    kind: formData.get("kind"),
    account_id: formData.get("account_id"),
    category_id: formData.get("category_id"),
    amount: formData.get("amount"),
    occurred_on: formData.get("occurred_on"),
    description: formData.get("description") || undefined,
    is_planned: formData.get("is_planned") === "true",
    affects_balance: formData.get("affects_balance") !== "false",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const isRecurring = formData.get("is_recurring") === "true";
  const forceConfirmed = formData.get("force_confirmed") === "true";
  const kind = parsed.data.kind;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  const isFutureTx = parsed.data.occurred_on !== today;

  // Expenses always start as pending — the user must confirm when they actually pay.
  // Recurring incomes always start as pending.
  // Non-recurring incomes with today's date are auto-confirmed (already received).
  // Recorder registering today with force_confirmed=true → always confirmed.
  const isConfirmed = (forceConfirmed && !isFutureTx) ? true
    : kind === "expense" ? false
    : isRecurring ? false
    : !isFutureTx;

  let recurringRuleId: string | null = null;

  if (isRecurring) {
    const recParsed = RecurringSchema.safeParse({
      frequency: formData.get("frequency"),
      start_date: parsed.data.occurred_on,
    });
    if (!recParsed.success) return { error: "Frecuencia inválida" };

    const { data: rule, error: ruleErr } = await supabase
      .from("recurring_rules")
      .insert({
        scope,
        account_id: parsed.data.account_id,
        category_id: parsed.data.category_id,
        kind,
        amount: parsed.data.amount,
        description: parsed.data.description ?? null,
        frequency: recParsed.data.frequency,
        start_date: recParsed.data.start_date,
        next_run: nextRunDate(recParsed.data.start_date, recParsed.data.frequency),
        is_active: true,
      })
      .select("id")
      .single();

    if (ruleErr) return { error: ruleErr.message };
    recurringRuleId = rule.id;
  }

  // IVA: for business income, auto-find the tax account and compute amounts.
  // The form only needs to signal opt-out (is_tax_exempt); account lookup is server-side.
  const isTaxExemptForm = formData.get("is_tax_exempt") === "true";
  const shouldApplyIva = scope === "business" && kind === "income" && !isTaxExemptForm;

  const adminClient = createAdminClient();

  // Find the tax account automatically (admin client bypasses RLS across scopes)
  let resolvedIvaAccountId: string | null = null;
  let ivaAccountScope: string | null = null;
  if (shouldApplyIva) {
    // Prefer the account_id passed from the form, fall back to first is_tax_account in DB
    const formIvaId = (formData.get("iva_account_id") as string) || null;
    if (formIvaId) {
      const { data: acc } = await adminClient
        .from("accounts")
        .select("id, scope")
        .eq("id", formIvaId)
        .single();
      if (acc) { resolvedIvaAccountId = acc.id; ivaAccountScope = acc.scope; }
    }
    if (!resolvedIvaAccountId) {
      const { data: acc } = await adminClient
        .from("accounts")
        .select("id, scope")
        .eq("is_tax_account", true)
        .limit(1)
        .maybeSingle();
      if (acc) { resolvedIvaAccountId = acc.id; ivaAccountScope = acc.scope; }
    }
  }

  const applyIva = shouldApplyIva && !!resolvedIvaAccountId;
  const netAmount = parsed.data.amount;
  const ivaAmount = applyIva ? Math.round(netAmount * 1.11112 * 0.13 * 100) / 100 : 0;
  const incomeAmount = applyIva ? Math.round((netAmount + ivaAmount) * 100) / 100 : netAmount;

  // Get the income account's scope for the IVA expense leg
  let incomeAccountScope = scope as string;
  if (applyIva) {
    const { data: incAcc } = await adminClient
      .from("accounts")
      .select("scope")
      .eq("id", parsed.data.account_id)
      .single();
    if (incAcc) incomeAccountScope = incAcc.scope;
  }

  // Upload receipt if provided
  let receiptUrl: string | null = null;
  const receiptFile = formData.get("receipt") as File | null;
  if (receiptFile && receiptFile.size > 0) {
    // Ensure bucket exists (idempotent — ignores "already exists" error)
    await adminClient.storage.createBucket("receipts", { public: true });

    const ext = receiptFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const fileName = `${scope}/${user.id}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await receiptFile.arrayBuffer());
    const { error: uploadErr } = await adminClient.storage
      .from("receipts")
      .upload(fileName, buffer, { contentType: receiptFile.type, upsert: false });
    if (uploadErr) return { error: "Error al subir el comprobante: " + uploadErr.message };
    const { data: { publicUrl } } = adminClient.storage.from("receipts").getPublicUrl(fileName);
    receiptUrl = publicUrl;
  }

  const { error } = await supabase.from("transactions").insert({
    ...parsed.data,
    amount: incomeAmount,
    scope,
    created_by: user.id,
    is_confirmed: isConfirmed,
    recurring_rule_id: recurringRuleId,
    receipt_url: receiptUrl,
  });

  if (error) return { error: error.message };

  // Auto-create IVA transfer (pending) immediately after saving the income
  if (applyIva && resolvedIvaAccountId) {
    const transferId = crypto.randomUUID();
    let ivaLabel = parsed.data.description?.trim() || "";
    if (!ivaLabel && parsed.data.category_id) {
      const { data: cat } = await supabase
        .from("categories")
        .select("name")
        .eq("id", parsed.data.category_id)
        .single();
      ivaLabel = cat?.name || "";
    }
    const ivaDesc = `IVA — ${ivaLabel || "Ingreso"}`;

    const { error: ivaErr } = await supabase.from("transactions").insert([
      {
        scope: incomeAccountScope,
        account_id: parsed.data.account_id,
        category_id: null,
        kind: "expense",
        amount: ivaAmount,
        occurred_on: parsed.data.occurred_on,
        description: ivaDesc,
        is_planned: false,
        is_confirmed: false,
        affects_balance: true,
        transfer_id: transferId,
        created_by: user.id,
      },
      {
        scope: ivaAccountScope,
        account_id: resolvedIvaAccountId,
        category_id: null,
        kind: "income",
        amount: ivaAmount,
        occurred_on: parsed.data.occurred_on,
        description: ivaDesc,
        is_planned: false,
        is_confirmed: false,
        affects_balance: true,
        transfer_id: transferId,
        created_by: user.id,
      },
    ]);
    if (ivaErr) {
      const hint = ivaErr.message.includes("category_id")
        ? " — ejecuta en Supabase: ALTER TABLE transactions ALTER COLUMN category_id DROP NOT NULL"
        : "";
      return { error: `Ingreso guardado pero falló la transferencia de IVA: ${ivaErr.message}${hint}` };
    }
  }

  revalidateScope(scope);
  // Fire budget alerts if this is an employee expense (affects_balance=false)
  if (parsed.data.kind === "expense" && !parsed.data.affects_balance) {
    checkBudgetAlerts(scope, parsed.data.category_id).catch(() => {});
  }
  return { success: true };
}

export async function confirmTransaction(id: string, scope: Scope) {
  const supabase = await createClient();
  const { data: { user: confirmer } } = await supabase.auth.getUser();

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .select("*, recurring_rule:recurring_rules(*)")
    .eq("id", id)
    .single();

  if (txErr) return { error: txErr.message };

  // If it's a transfer, confirm both legs and handle recurrence
  if (tx.transfer_id) {
    const { error } = await supabase
      .from("transactions")
      .update({ is_confirmed: true })
      .eq("transfer_id", tx.transfer_id);
    if (error) return { error: error.message };

    // Check for recurring rule on this leg
    if (tx.recurring_rule_id) {
      const { data: rule } = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("id", tx.recurring_rule_id)
        .single();

      if (rule?.is_active) {
        // Fetch both legs to get FROM and TO accounts
        const { data: legs } = await supabase
          .from("transactions")
          .select("id, kind, account_id, scope")
          .eq("transfer_id", tx.transfer_id);

        const fromLeg = legs?.find((l: { kind: string }) => l.kind === "expense");
        const toLeg   = legs?.find((l: { kind: string }) => l.kind === "income");

        if (fromLeg && toLeg) {
          const nextTransferId = crypto.randomUUID();
          const nextDate = nextRunDate(rule.next_run, rule.frequency);

          await supabase.from("transactions").insert([
            {
              scope: fromLeg.scope,
              account_id: fromLeg.account_id,
              kind: "expense",
              amount: rule.amount,
              occurred_on: rule.next_run,
              description: rule.description,
              is_planned: false,
              is_confirmed: false,
              affects_balance: true,
              transfer_id: nextTransferId,
              recurring_rule_id: rule.id,
              created_by: tx.created_by,
            },
            {
              scope: toLeg.scope,
              account_id: toLeg.account_id,
              kind: "income",
              amount: rule.amount,
              occurred_on: rule.next_run,
              description: rule.description,
              is_planned: false,
              is_confirmed: false,
              affects_balance: true,
              transfer_id: nextTransferId,
              recurring_rule_id: rule.id,
              created_by: tx.created_by,
            },
          ]);

          await supabase
            .from("recurring_rules")
            .update({ next_run: nextDate })
            .eq("id", rule.id);
        }
      }
    }

    revalidatePath("/personal/accounts");
    revalidatePath("/personal/dashboard");
    revalidatePath("/personal/transactions");
    revalidatePath("/business/accounts");
    revalidatePath("/business/dashboard");
    revalidatePath("/business/transactions");
    return { success: true };
  }

  const { error } = await supabase
    .from("transactions")
    .update({ is_confirmed: true })
    .eq("id", id);
  if (error) return { error: error.message };

  const rule = tx.recurring_rule as {
    id: string; frequency: string; next_run: string;
    account_id: string; category_id: string; kind: string;
    amount: number; description: string | null; is_active: boolean;
  } | null;

  if (rule && rule.is_active) {
    const nextDate = nextRunDate(rule.next_run, rule.frequency);

    const { error: insertErr } = await supabase.from("transactions").insert({
      scope,
      account_id: rule.account_id,
      category_id: rule.category_id,
      kind: rule.kind,
      amount: rule.amount,
      occurred_on: rule.next_run,
      description: rule.description,
      is_planned: false,
      is_confirmed: false,
      recurring_rule_id: rule.id,
      created_by: tx.created_by,
    });

    if (!insertErr) {
      await supabase
        .from("recurring_rules")
        .update({ next_run: nextDate })
        .eq("id", rule.id);
    }
  }

  // Auto-confirm the IVA transfer linked to this business income
  if (tx.kind === "income" && tx.scope === "business") {
    const { data: ivaExpense } = await supabase
      .from("transactions")
      .select("*, recurring_rule:recurring_rules(*)")
      .eq("account_id", tx.account_id)
      .eq("occurred_on", tx.occurred_on)
      .eq("kind", "expense")
      .is("category_id", null)
      .not("transfer_id", "is", null)
      .eq("is_confirmed", false)
      .limit(1)
      .maybeSingle();

    if (ivaExpense?.transfer_id) {
      // If the income was saved as net (old records), update it to gross (net + IVA)
      // so the account correctly receives the full amount before IVA is transferred out.
      // Detection: net/IVA ≈ 6.92, gross/IVA ≈ 7.92 — threshold 7.5 reliably separates them.
      const ivaAmt = Number(ivaExpense.amount);
      const incomeAmt = Number(tx.amount);
      if (ivaAmt > 0 && incomeAmt / ivaAmt < 7.5) {
        await supabase
          .from("transactions")
          .update({ amount: Math.round((incomeAmt + ivaAmt) * 100) / 100 })
          .eq("id", id);
      }

      await supabase
        .from("transactions")
        .update({ is_confirmed: true })
        .eq("transfer_id", ivaExpense.transfer_id);

      const ivaRule = ivaExpense.recurring_rule as {
        id: string; frequency: string; next_run: string;
        account_id: string; category_id: string | null; kind: string;
        amount: number; description: string | null; is_active: boolean;
        to_account_id: string | null;
      } | null;

      if (ivaRule?.is_active) {
        const { data: ivaLegs } = await supabase
          .from("transactions")
          .select("id, kind, account_id, scope")
          .eq("transfer_id", ivaExpense.transfer_id);

        const ivaFrom = ivaLegs?.find((l: { kind: string }) => l.kind === "expense");
        const ivaTo   = ivaLegs?.find((l: { kind: string }) => l.kind === "income");

        if (ivaFrom && ivaTo) {
          const nextTransferId = crypto.randomUUID();
          const nextDate = nextRunDate(ivaRule.next_run, ivaRule.frequency);

          await supabase.from("transactions").insert([
            {
              scope: ivaFrom.scope,
              account_id: ivaFrom.account_id,
              category_id: null,
              kind: "expense",
              amount: ivaRule.amount,
              occurred_on: ivaRule.next_run,
              description: ivaRule.description,
              is_planned: false,
              is_confirmed: false,
              affects_balance: true,
              transfer_id: nextTransferId,
              recurring_rule_id: ivaRule.id,
              created_by: tx.created_by,
            },
            {
              scope: ivaTo.scope,
              account_id: ivaTo.account_id,
              category_id: null,
              kind: "income",
              amount: ivaRule.amount,
              occurred_on: ivaRule.next_run,
              description: ivaRule.description,
              is_planned: false,
              is_confirmed: false,
              affects_balance: true,
              transfer_id: nextTransferId,
              recurring_rule_id: ivaRule.id,
              created_by: tx.created_by,
            },
          ]);

          await supabase
            .from("recurring_rules")
            .update({ next_run: nextDate })
            .eq("id", ivaRule.id);
        }
      }
    }
  }

  // Notify the transaction creator if someone else confirmed it
  const createdBy = (tx as unknown as { created_by?: string }).created_by;
  if (createdBy && confirmer && createdBy !== confirmer.id) {
    const kindLabel = tx.kind === "income" ? "ingreso" : "egreso";
    const amountStr = `$${Number(tx.amount).toFixed(2)}`;
    await insertNotifications([createdBy], {
      scope,
      type: "transaction_confirmed",
      title: "Transacción confirmada",
      body: `${tx.description ? `"${tx.description}" — ` : ""}${amountStr} (${kindLabel})`,
      link: `/${scope}/transactions`,
    });
  } else if (confirmer) {
    // Notify all other scope managers about the confirmation
    const managers = await getScopeManagers(scope);
    const others = managers.filter((uid) => uid !== confirmer.id);
    if (others.length > 0) {
      const kindLabel = tx.kind === "income" ? "ingreso" : "egreso";
      const amountStr = `$${Number(tx.amount).toFixed(2)}`;
      await insertNotifications(others, {
        scope,
        type: "transaction_confirmed",
        title: "Transacción confirmada",
        body: `${tx.description ? `"${tx.description}" — ` : ""}${amountStr} (${kindLabel})`,
        link: `/${scope}/transactions`,
      });
    }
  }

  revalidateScope(scope);
  // Fire budget alert check after confirming any expense
  if (tx.kind === "expense" && tx.category_id) {
    checkBudgetAlerts(scope, tx.category_id).catch(() => {});
  }
  return { success: true };
}

export async function updateTransaction(id: string, scope: Scope, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = TransactionSchema.safeParse({
    kind: formData.get("kind"),
    account_id: formData.get("account_id"),
    category_id: formData.get("category_id"),
    amount: formData.get("amount"),
    occurred_on: formData.get("occurred_on"),
    description: formData.get("description") || undefined,
    is_planned: formData.get("is_planned") === "true",
    affects_balance: formData.get("affects_balance") !== "false",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("transactions")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidateScope(scope);
  return { success: true };
}

export async function updateTransfer(transferId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const fromAccountId = formData.get("from_account_id") as string;
  const toAccountId = formData.get("to_account_id") as string;
  const amount = Number(formData.get("amount"));
  const occurredOn = formData.get("occurred_on") as string;
  const description = (formData.get("description") as string) || null;

  if (!fromAccountId || !toAccountId) return { error: "Selecciona las cuentas" };
  if (fromAccountId === toAccountId) return { error: "Las cuentas deben ser diferentes" };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (!occurredOn) return { error: "La fecha es requerida" };

  const { data: legs, error: legsErr } = await supabase
    .from("transactions")
    .select("id, kind")
    .eq("transfer_id", transferId);

  if (legsErr || !legs || legs.length < 2) return { error: "Transferencia no encontrada" };

  const expenseLeg = legs.find((l: { kind: string }) => l.kind === "expense");
  const incomeLeg = legs.find((l: { kind: string }) => l.kind === "income");
  if (!expenseLeg || !incomeLeg) return { error: "Transferencia incompleta" };

  const { data: accs } = await supabase
    .from("accounts")
    .select("id, scope")
    .in("id", [fromAccountId, toAccountId]);

  const fromAcc = accs?.find((a: { id: string }) => a.id === fromAccountId);
  const toAcc = accs?.find((a: { id: string }) => a.id === toAccountId);
  if (!fromAcc || !toAcc) return { error: "Cuentas no encontradas" };

  await supabase.from("transactions")
    .update({ account_id: fromAccountId, scope: fromAcc.scope, amount, occurred_on: occurredOn, description })
    .eq("id", expenseLeg.id);

  await supabase.from("transactions")
    .update({ account_id: toAccountId, scope: toAcc.scope, amount, occurred_on: occurredOn, description })
    .eq("id", incomeLeg.id);

  revalidatePath("/personal/accounts");
  revalidatePath("/personal/dashboard");
  revalidatePath("/personal/transactions");
  revalidatePath("/business/accounts");
  revalidatePath("/business/dashboard");
  revalidatePath("/business/transactions");
  return { success: true };
}

export async function deleteTransaction(id: string, scope: Scope) {
  const supabase = await createClient();

  const { data: tx } = await supabase
    .from("transactions")
    .select("transfer_id, recurring_rule_id, is_confirmed")
    .eq("id", id)
    .single();

  if (!tx) return { error: "Transacción no encontrada" };

  let ruleIdToDelete: string | null = null;

  if (tx.transfer_id) {
    // For unconfirmed transfers, collect the recurring rule from any leg before deleting
    if (!tx.is_confirmed) {
      const { data: legs } = await supabase
        .from("transactions")
        .select("recurring_rule_id")
        .eq("transfer_id", tx.transfer_id)
        .not("recurring_rule_id", "is", null)
        .limit(1);
      ruleIdToDelete = legs?.[0]?.recurring_rule_id ?? null;
    }
    await supabase.from("transactions").delete().eq("transfer_id", tx.transfer_id);
  } else {
    // For unconfirmed regular transactions, mark rule for deletion
    if (!tx.is_confirmed && tx.recurring_rule_id) {
      ruleIdToDelete = tx.recurring_rule_id;
    }
    await supabase.from("transactions").delete().eq("id", id);
  }

  // Delete orphaned recurring rule (only when transaction was pending)
  if (ruleIdToDelete) {
    await supabase.from("recurring_rules").delete().eq("id", ruleIdToDelete);
  }

  revalidateScope(scope);
  revalidatePath("/personal/accounts");
  revalidatePath("/personal/dashboard");
  revalidatePath("/business/accounts");
  revalidatePath("/business/dashboard");
  revalidatePath(`/${scope}/recurring`);
  revalidatePath(`/${scope === "personal" ? "business" : "personal"}/recurring`);
  return { success: true };
}

export async function createTransfer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const fromAccountId = formData.get("from_account_id") as string;
  const toAccountId = formData.get("to_account_id") as string;
  const amount = Number(formData.get("amount"));
  const occurredOn = formData.get("occurred_on") as string;
  const description = (formData.get("description") as string) || null;

  if (!fromAccountId || !toAccountId) return { error: "Selecciona las cuentas" };
  if (fromAccountId === toAccountId) return { error: "Las cuentas deben ser diferentes" };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (!occurredOn) return { error: "La fecha es requerida" };

  // Fetch both accounts to get their scopes
  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("id, scope")
    .in("id", [fromAccountId, toAccountId]);

  if (accErr || !accounts || accounts.length < 2) return { error: "Cuentas no encontradas" };

  const fromAcc = accounts.find((a) => a.id === fromAccountId)!;
  const toAcc = accounts.find((a) => a.id === toAccountId)!;
  const transferId = crypto.randomUUID();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  const isConfirmed = occurredOn === today;

  // Recurring transfer rule
  const isRecurring = formData.get("is_recurring") === "true";
  const frequency = formData.get("frequency") as string;
  let recurringRuleId: string | null = null;

  if (isRecurring && frequency) {
    const { data: rule, error: ruleErr } = await supabase
      .from("recurring_rules")
      .insert({
        scope: fromAcc.scope,
        account_id: fromAccountId,
        to_account_id: toAccountId,
        kind: "expense",
        amount,
        description,
        frequency,
        start_date: occurredOn,
        next_run: nextRunDate(occurredOn, frequency),
        is_active: true,
      })
      .select("id")
      .single();

    if (ruleErr) return { error: ruleErr.message };
    recurringRuleId = rule.id;
  }

  const { error } = await supabase.from("transactions").insert([
    {
      scope: fromAcc.scope,
      account_id: fromAccountId,
      kind: "expense",
      amount,
      occurred_on: occurredOn,
      description,
      is_planned: false,
      is_confirmed: isConfirmed,
      affects_balance: true,
      transfer_id: transferId,
      recurring_rule_id: recurringRuleId,
      created_by: user.id,
    },
    {
      scope: toAcc.scope,
      account_id: toAccountId,
      kind: "income",
      amount,
      occurred_on: occurredOn,
      description,
      is_planned: false,
      is_confirmed: isConfirmed,
      affects_balance: true,
      transfer_id: transferId,
      recurring_rule_id: recurringRuleId,
      created_by: user.id,
    },
  ]);

  if (error) return { error: error.message };

  revalidatePath("/personal/accounts");
  revalidatePath("/personal/dashboard");
  revalidatePath("/personal/transactions");
  revalidatePath("/business/accounts");
  revalidatePath("/business/dashboard");
  revalidatePath("/business/transactions");
  return { success: true };
}

/**
 * One-time retroactive action: generates IVA transfers for all existing
 * business income transactions that don't already have one.
 * Idempotent — safe to run multiple times.
 */
export async function generateRetroactiveIvaTransfers() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Find the tax account
  const { data: taxAccount } = await supabase
    .from("accounts")
    .select("id, scope")
    .eq("is_tax_account", true)
    .limit(1)
    .single();

  if (!taxAccount) {
    return { error: "No hay ninguna cuenta marcada como 'Cuenta de impuestos'. Márcala primero en Cuentas." };
  }

  // Fetch all confirmed and pending business income (non-transfer)
  const { data: incomes, error: incErr } = await supabase
    .from("transactions")
    .select("id, account_id, amount, occurred_on, description, is_confirmed, recurring_rule_id, category:categories(name), recurring_rule:recurring_rules(frequency, next_run)")
    .eq("scope", "business")
    .eq("kind", "income")
    .is("transfer_id", null);

  if (incErr || !incomes) return { error: incErr?.message ?? "Error al obtener ingresos" };

  // Fetch all existing IVA transfers to avoid duplicates
  // An IVA transfer expense is identified by: kind=expense, category_id=null, transfer_id IS NOT NULL
  const { data: existingIvaExpenses } = await supabase
    .from("transactions")
    .select("account_id, occurred_on")
    .eq("kind", "expense")
    .is("category_id", null)
    .not("transfer_id", "is", null);

  // Build a set of "account_id|occurred_on" keys for fast lookup
  const existingIvaKeys = new Set(
    (existingIvaExpenses ?? []).map((t: { account_id: string; occurred_on: string }) => `${t.account_id}|${t.occurred_on}`)
  );

  // Build set of account_ids needed for scope lookup
  const accountIds = [...new Set(incomes.map((i: { account_id: string }) => i.account_id))];
  const { data: accountsData } = await supabase
    .from("accounts")
    .select("id, scope")
    .in("id", accountIds);

  const accountScopeMap: Record<string, string> = {};
  for (const a of accountsData ?? []) accountScopeMap[a.id] = a.scope;

  let created = 0;

  for (const income of incomes) {
    // Skip if an IVA transfer already exists for this income (prevent duplicates)
    if (existingIvaKeys.has(`${income.account_id}|${income.occurred_on}`)) continue;

    const net = Number(income.amount);
    const ivaAmount = Math.round(net * 1.11112 * 0.13 * 100) / 100;
    const transferId = crypto.randomUUID();
    const fromScope = accountScopeMap[income.account_id] ?? "business";

    const catRaw = income.category;
    const cat = (Array.isArray(catRaw) ? catRaw[0] : catRaw) as { name: string } | null;
    const label = income.description || cat?.name || "Ingreso";
    const ivaDesc = `IVA — ${label}`;

    // Create recurring rule for this IVA transfer (monthly on same day as income)
    const ruleRaw = income.recurring_rule;
    const rule = (Array.isArray(ruleRaw) ? ruleRaw[0] : ruleRaw) as { frequency: string; next_run: string } | null;
    const frequency = rule?.frequency ?? "monthly";
    const nextRun = nextRunDate(income.occurred_on, frequency);

    const { data: newRule } = await supabase
      .from("recurring_rules")
      .insert({
        scope: "business",
        account_id: income.account_id,
        to_account_id: taxAccount.id,
        kind: "expense",
        amount: ivaAmount,
        description: ivaDesc,
        frequency,
        start_date: income.occurred_on,
        next_run: nextRun,
        is_active: true,
      })
      .select("id")
      .single();

    const recurringRuleId = newRule?.id ?? null;

    const { error: insertErr } = await supabase.from("transactions").insert([
      {
        scope: fromScope,
        account_id: income.account_id,
        category_id: null,
        kind: "expense",
        amount: ivaAmount,
        occurred_on: income.occurred_on,
        description: ivaDesc,
        is_planned: false,
        is_confirmed: false,
        affects_balance: true,
        transfer_id: transferId,
        recurring_rule_id: recurringRuleId,
        created_by: user.id,
      },
      {
        scope: taxAccount.scope,
        account_id: taxAccount.id,
        category_id: null,
        kind: "income",
        amount: ivaAmount,
        occurred_on: income.occurred_on,
        description: ivaDesc,
        is_planned: false,
        is_confirmed: false,
        affects_balance: true,
        transfer_id: transferId,
        recurring_rule_id: recurringRuleId,
        created_by: user.id,
      },
    ]);

    if (!insertErr) created++;
  }

  revalidatePath("/business/transactions");
  revalidatePath("/business/accounts");
  revalidatePath("/business/dashboard");
  revalidatePath("/personal/accounts");
  revalidatePath("/personal/dashboard");

  return { success: true, created };
}
