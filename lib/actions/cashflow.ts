"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "@/lib/scope";

export type CashFlowPoint = {
  date: string;       // "YYYY-MM-DD"
  label: string;      // formatted for chart axis
  balance: number;
  events: string[];   // descriptions of what happens this day
};

export type CashFlowProjection = {
  series: CashFlowPoint[];
  currentBalance: number;
  minBalance: number;
  minDate: string | null;
  dangerDays: number; // days where balance < 0
  // When the current month has no budgets, we fall back to a previous month
  // and use those as a template. These fields surface that fact to the UI.
  budgetsRolledFromMonth: string | null; // e.g. "2026-05-01" or null
};

function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T12:00:00");
  switch (frequency) {
    case "weekly":   d.setDate(d.getDate() + 7);      break;
    case "biweekly": d.setDate(d.getDate() + 14);     break;
    case "monthly":  d.setMonth(d.getMonth() + 1);    break;
    case "yearly":   d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toLocaleDateString("en-CA");
}

function formatLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-SV", { day: "numeric", month: "short" });
}

export async function getCashFlowProjection(
  scope: Scope,
  days: 30 | 60 | 90,
): Promise<CashFlowProjection> {
  const admin = createAdminClient();
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);
  const endDateStr = endDate.toLocaleDateString("en-CA");

  // ── 1. Current balance ─────────────────────────────────────────────────────
  const [accountsRes, confirmedTxsRes] = await Promise.all([
    admin.from("accounts").select("id, type, opening_balance").eq("scope", scope).is("archived_at", null),
    admin.from("transactions").select("account_id, kind, amount, affects_balance")
      .eq("scope", scope).eq("is_confirmed", true).eq("affects_balance", true),
  ]);

  const accounts = accountsRes.data ?? [];
  const nonCreditIds = new Set(accounts.filter((a) => a.type !== "credit_card").map((a) => a.id));

  const balanceByAccount: Record<string, number> = {};
  for (const a of accounts) {
    balanceByAccount[a.id] = Number(a.opening_balance ?? 0);
  }
  for (const tx of confirmedTxsRes.data ?? []) {
    const amt = Number(tx.amount);
    balanceByAccount[tx.account_id] = (balanceByAccount[tx.account_id] ?? 0)
      + (tx.kind === "income" ? amt : -amt);
  }

  const currentBalance = accounts
    .filter((a) => nonCreditIds.has(a.id))
    .reduce((s, a) => s + (balanceByAccount[a.id] ?? 0), 0);

  // ── 2. Recurring rules ─────────────────────────────────────────────────────
  const { data: allRules } = await admin
    .from("recurring_rules")
    .select("id, kind, amount, frequency, next_run, end_date, to_account_id, category_id, category:categories(name)")
    .eq("scope", scope)
    .eq("is_active", true);

  // ── 3. Remaining budget this month ─────────────────────────────────────────
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthEnd = nextMonthDate.toLocaleDateString("en-CA");

  const [budgetsCurrentRes, thisMonthExpRes] = await Promise.all([
    admin.from("planned_budgets")
      .select("category_id, expected_amount, category:categories(name)")
      .eq("scope", scope)
      .eq("period_month", monthStart),
    admin.from("transactions")
      .select("category_id, amount")
      .eq("scope", scope)
      .eq("kind", "expense")
      .or(`is_confirmed.eq.true,affects_balance.eq.false`)
      .gte("occurred_on", monthStart)
      .lt("occurred_on", monthEnd),
  ]);

  // Auto-roll: if the user hasn't created budgets for the current month yet,
  // fall back to the most recent month that does have budgets. This keeps the
  // projection meaningful right after a month rollover.
  let budgetsRes = budgetsCurrentRes;
  let budgetsAreRolledFromPrior = false;
  let rolledFromMonth: string | null = null;
  if (!budgetsCurrentRes.data || budgetsCurrentRes.data.length === 0) {
    const { data: priorPeriodRow } = await admin
      .from("planned_budgets")
      .select("period_month")
      .eq("scope", scope)
      .lt("period_month", monthStart)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorPeriodRow?.period_month) {
      const priorMonth = priorPeriodRow.period_month as string;
      const priorRes = await admin
        .from("planned_budgets")
        .select("category_id, expected_amount, category:categories(name)")
        .eq("scope", scope)
        .eq("period_month", priorMonth);
      if (priorRes.data && priorRes.data.length > 0) {
        budgetsRes = priorRes;
        budgetsAreRolledFromPrior = true;
        rolledFromMonth = priorMonth;
      }
    }
  }

  const spentByCategory: Record<string, number> = {};
  for (const tx of thisMonthExpRes.data ?? []) {
    if (tx.category_id) {
      spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  // Categories with a defined budget — recurring rules of these categories are
  // skipped in the simulation to avoid double-counting (budget wins).
  const budgetedCategoryIds = new Set<string>(
    (budgetsRes.data ?? []).map((b) => b.category_id),
  );

  // ── 4. Build day-by-day event map ──────────────────────────────────────────
  const eventDeltas: Map<string, { delta: number; labels: string[] }> = new Map();

  function addEvent(date: string, delta: number, label: string) {
    if (!eventDeltas.has(date)) eventDeltas.set(date, { delta: 0, labels: [] });
    const e = eventDeltas.get(date)!;
    e.delta += delta;
    e.labels.push(label);
  }

  // Recurring rules
  for (const rule of allRules ?? []) {
    if (!rule.next_run) continue;
    // Skip internal transfers (both legs cancel out)
    if (rule.to_account_id && rule.kind === "expense") continue;
    // Budget wins: skip recurring rules whose category is already budgeted
    if (rule.category_id && budgetedCategoryIds.has(rule.category_id)) continue;

    let current = rule.next_run;
    while (current <= endDateStr) {
      if (!rule.end_date || current <= rule.end_date) {
        const amt = Number(rule.amount);
        const delta = rule.kind === "income" ? amt : -amt;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (rule.category as any)?.name ?? (rule.kind === "income" ? "Ingreso recurrente" : "Egreso recurrente");
        const sign = delta > 0 ? "+" : "";
        addEvent(current, delta, `${name}: ${sign}$${amt.toFixed(2)}`);
      }
      current = advanceDate(current, rule.frequency);
    }
  }

  // Budgets → applied at the last day of every month within the projection window.
  // Current month: only the remaining (expected - already spent).
  // Future months: full expected amount (budgets repeat every month).
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  const safetyMax = 24; // bounded loop — at most 24 months even for 90-day window
  let iter = 0;
  while (iter++ < safetyMax) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const lastDay = new Date(y, m + 1, 0).toLocaleDateString("en-CA");
    if (lastDay > endDateStr) break;

    const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
    for (const b of budgetsRes.data ?? []) {
      const expected = Number(b.expected_amount);
      const debit = isCurrentMonth
        ? Math.max(0, expected - (spentByCategory[b.category_id] ?? 0))
        : expected;
      if (debit <= 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catName = (b.category as any)?.name ?? "Presupuesto";
      addEvent(lastDay, -debit, `${catName}: -$${debit.toFixed(2)}`);
    }
    cursor = new Date(y, m + 1, 1);
  }

  // ── 5. Build series ────────────────────────────────────────────────────────
  const series: CashFlowPoint[] = [{
    date: todayStr,
    label: "Hoy",
    balance: Math.round(currentBalance * 100) / 100,
    events: [`Saldo actual: $${currentBalance.toFixed(2)}`],
  }];

  let balance = currentBalance;
  let minBalance = currentBalance;
  let minDate: string | null = null;
  let dangerDays = 0;

  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString("en-CA");

    const ev = eventDeltas.get(dateStr);
    if (ev) balance += ev.delta;
    balance = Math.round(balance * 100) / 100;

    if (balance < minBalance) {
      minBalance = balance;
      minDate = dateStr;
    }
    if (balance < 0) dangerDays++;

    series.push({
      date: dateStr,
      label: formatLabel(dateStr),
      balance,
      events: ev?.labels ?? [],
    });
  }

  // Thin out the series for chart readability (keep ~40 points max)
  const thinned: CashFlowPoint[] = [series[0]];
  const step = Math.max(1, Math.floor(series.length / 40));
  for (let i = step; i < series.length; i += step) {
    thinned.push(series[i]);
  }
  if (thinned[thinned.length - 1] !== series[series.length - 1]) {
    thinned.push(series[series.length - 1]);
  }

  return {
    series: thinned,
    currentBalance,
    minBalance,
    minDate,
    dangerDays,
    budgetsRolledFromMonth: budgetsAreRolledFromPrior ? rolledFromMonth : null,
  };
}
