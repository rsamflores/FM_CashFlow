"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { svToday, formatMonth } from "@/lib/format";
import type { Scope } from "@/lib/scope";

export type MonthProjectionPoint = {
  month: string;          // "2026-06"
  label: string;          // "junio 2026"
  isCurrentMonth: boolean;
  closingBalance: number;
  incomeAmount: number;
  expenseAmount: number;  // budgets + egresos recurrentes sin presupuesto
  events: string[];       // líneas para tooltip
};

export type MonthlyCashFlowProjection = {
  today: { balance: number };
  months: MonthProjectionPoint[];   // siempre 3 elementos
  dangerMonths: number;
  minBalance: number;
  budgetsRolledFromMonth: string | null;
};

// Add n days to a YYYY-MM-DD string using local noon to avoid TZ/DST drift.
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

// Advance a YYYY-MM-DD date by one recurrence cycle.
function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T12:00:00");
  switch (frequency) {
    case "weekly":   d.setDate(d.getDate() + 7);         break;
    case "biweekly": d.setDate(d.getDate() + 14);        break;
    case "monthly":  d.setMonth(d.getMonth() + 1);       break;
    case "yearly":   d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toLocaleDateString("en-CA");
}

function lastDayOfMonthStr(year: number, month0: number): string {
  const d = new Date(year, month0 + 1, 0); // day 0 of next month = last day of this
  return d.toLocaleDateString("en-CA");
}

function firstDayOfMonthStr(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
}

// Count how many times a rule fires within [rangeStart, rangeEnd] (both inclusive).
function countRuleFires(
  nextRun: string,
  frequency: string,
  endDate: string | null | undefined,
  rangeStart: string,
  rangeEnd: string,
): number {
  let current = nextRun;
  let fires = 0;
  let guard = 0;
  while (current <= rangeEnd && guard++ < 500) {
    const withinEndDate = !endDate || current <= endDate;
    if (withinEndDate && current >= rangeStart) fires++;
    current = advanceDate(current, frequency);
  }
  return fires;
}

export async function getMonthlyCashFlowProjection(
  scope: Scope,
): Promise<MonthlyCashFlowProjection> {
  const admin = createAdminClient();

  // ── 0. Anchor all dates in El Salvador timezone ──────────────────────────
  const { year, month, dateStr: todayStr } = svToday();
  const tomorrowStr = addDays(todayStr, 1);

  const monthStart = firstDayOfMonthStr(year, month);
  const monthEnd = lastDayOfMonthStr(year, month);

  // ── 1. Accounts + confirmed balance ──────────────────────────────────────
  const [accountsRes, confirmedTxsRes] = await Promise.all([
    admin.from("accounts")
      .select("id, type, opening_balance")
      .eq("scope", scope)
      .is("archived_at", null),
    admin.from("transactions")
      .select("account_id, kind, amount")
      .eq("scope", scope)
      .eq("is_confirmed", true)
      .eq("affects_balance", true),
  ]);

  const accounts = accountsRes.data ?? [];
  const nonCreditIds = new Set(
    accounts.filter((a) => a.type !== "credit_card").map((a) => a.id),
  );

  const balanceByAccount: Record<string, number> = {};
  for (const a of accounts) balanceByAccount[a.id] = Number(a.opening_balance ?? 0);
  for (const tx of confirmedTxsRes.data ?? []) {
    const amt = Number(tx.amount);
    balanceByAccount[tx.account_id] = (balanceByAccount[tx.account_id] ?? 0)
      + (tx.kind === "income" ? amt : -amt);
  }
  const currentBalance = accounts
    .filter((a) => nonCreditIds.has(a.id))
    .reduce((s, a) => s + (balanceByAccount[a.id] ?? 0), 0);

  // ── 2. Fetch recurring rules, budgets, confirmed admin spend ──────────────
  const [rulesRes, budgetsCurrentRes, confirmedAdminThisMonthRes] = await Promise.all([
    admin.from("recurring_rules")
      .select("id, kind, amount, frequency, next_run, end_date, to_account_id, account_id, category_id, category:categories(name)")
      .eq("scope", scope)
      .eq("is_active", true),
    admin.from("planned_budgets")
      .select("category_id, expected_amount, category:categories(name)")
      .eq("scope", scope)
      .eq("period_month", monthStart),
    // Confirmed admin spend this month — for budget remainder calculation
    admin.from("transactions")
      .select("category_id, amount")
      .eq("scope", scope)
      .eq("kind", "expense")
      .eq("is_confirmed", true)
      .eq("affects_balance", true)
      .gte("occurred_on", monthStart)
      .lte("occurred_on", monthEnd),
  ]);

  const allRules = rulesRes.data ?? [];

  // ── 3. Budgets with auto-roll fallback ────────────────────────────────────
  let budgetsRes = budgetsCurrentRes;
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
        rolledFromMonth = priorMonth;
      }
    }
  }
  const budgets = budgetsRes.data ?? [];
  const budgetedCategoryIds = new Set<string>(budgets.map((b) => b.category_id));

  const confirmedAdminSpentByCategory: Record<string, number> = {};
  for (const tx of confirmedAdminThisMonthRes.data ?? []) {
    if (tx.category_id) {
      confirmedAdminSpentByCategory[tx.category_id] =
        (confirmedAdminSpentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  // ── 4. Project 3 months ───────────────────────────────────────────────────
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const projectedMonths: MonthProjectionPoint[] = [];
  let prevBalance = round2(currentBalance);

  for (let i = 0; i < 3; i++) {
    // Compute actual year/month for this offset (handles year rollover)
    const d = new Date(year, month + i, 1);
    const y = d.getFullYear();
    const m0 = d.getMonth(); // 0-indexed

    const isCurrentMonth = i === 0;
    const rangeStart = isCurrentMonth ? tomorrowStr : firstDayOfMonthStr(y, m0);
    const rangeEnd = lastDayOfMonthStr(y, m0);

    let incomeTotal = 0;
    let expenseTotal = 0;
    const events: string[] = [];

    // Income rules
    for (const rule of allRules) {
      if (rule.kind !== "income") continue;
      if (!rule.next_run) continue;
      if (!nonCreditIds.has(rule.account_id)) continue;

      const fires = countRuleFires(
        rule.next_run as string,
        rule.frequency as string,
        rule.end_date as string | null,
        rangeStart,
        rangeEnd,
      );
      if (fires === 0) continue;

      const total = round2(Number(rule.amount) * fires);
      incomeTotal += total;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (rule.category as any)?.name ?? "Ingreso recurrente";
      events.push(fires > 1
        ? `${name}: +$${total.toFixed(2)} (×${fires})`
        : `${name}: +$${total.toFixed(2)}`);
    }

    // Non-budgeted expense rules
    for (const rule of allRules) {
      if (rule.kind !== "expense") continue;
      if (!rule.next_run) continue;
      if (!nonCreditIds.has(rule.account_id)) continue;
      if (rule.to_account_id) continue; // internal transfer, legs cancel
      if (rule.category_id && budgetedCategoryIds.has(rule.category_id)) continue;

      const fires = countRuleFires(
        rule.next_run as string,
        rule.frequency as string,
        rule.end_date as string | null,
        rangeStart,
        rangeEnd,
      );
      if (fires === 0) continue;

      const total = round2(Number(rule.amount) * fires);
      expenseTotal += total;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (rule.category as any)?.name ?? "Egreso recurrente";
      events.push(fires > 1
        ? `${name}: −$${total.toFixed(2)} (×${fires})`
        : `${name}: −$${total.toFixed(2)}`);
    }

    // Budget debit
    let budgetDebit = 0;
    for (const b of budgets) {
      const expected = Number(b.expected_amount);
      const debit = isCurrentMonth
        ? Math.max(0, expected - (confirmedAdminSpentByCategory[b.category_id] ?? 0))
        : expected;
      if (debit <= 0) continue;
      budgetDebit = round2(budgetDebit + debit);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catName = (b.category as any)?.name ?? "Presupuesto";
      events.push(`${catName} (presupuesto): −$${debit.toFixed(2)}`);
    }

    expenseTotal = round2(expenseTotal + budgetDebit);
    const closingBalance = round2(prevBalance + incomeTotal - expenseTotal);

    projectedMonths.push({
      month: `${y}-${String(m0 + 1).padStart(2, "0")}`,
      label: formatMonth(firstDayOfMonthStr(y, m0)),
      isCurrentMonth,
      closingBalance,
      incomeAmount: round2(incomeTotal),
      expenseAmount: round2(expenseTotal),
      events,
    });

    prevBalance = closingBalance;
  }

  const dangerMonths = projectedMonths.filter((m) => m.closingBalance < 0).length;
  const minBalance = Math.min(
    round2(currentBalance),
    ...projectedMonths.map((m) => m.closingBalance),
  );

  return {
    today: { balance: round2(currentBalance) },
    months: projectedMonths,
    dangerMonths,
    minBalance,
    budgetsRolledFromMonth: rolledFromMonth,
  };
}
