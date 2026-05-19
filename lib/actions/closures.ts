"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "@/lib/scope";
import { formatMonth } from "@/lib/format";

export type ClosureCategoryRow = {
  name: string;
  color: string;
  icon: string;
  amount: number;
  pct: number;     // share of the kind total (0–100)
};

export type ClosureBudgetRow = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  expected: number;
  spent: number;
  pct: number;     // execution % (can exceed 100)
  status: "under" | "near" | "over" | "executed";
  isSinglePayment: boolean;
  remaining: number;
};

export type MonthClosure = {
  scope: Scope;
  yearMonth: string;          // "YYYY-MM"
  label: string;              // "Mayo 2026"
  income: { total: number; byCategory: ClosureCategoryRow[]; txCount: number };
  expense: { total: number; byCategory: ClosureCategoryRow[]; txCount: number };
  net: number;
  budgets: ClosureBudgetRow[];
  budgetSummary: {
    totalBudgeted: number;
    totalSpent: number;
    pct: number;
    overCount: number;
    onTrackCount: number;
  };
  prevMonth: {
    yearMonth: string;
    income: number;
    expense: number;
    net: number;
    incomeDeltaPct: number | null;  // null when prev has no data
    expenseDeltaPct: number | null;
  } | null;
  hasData: boolean;           // true if any tx or budget exists for this month
};

function monthBoundsFromYM(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(y, m, 1); // next month, day 1
  const end = endDate.toLocaleDateString("en-CA");
  return { start, end };
}

function prevYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  // m is 1-indexed; previous month = y, m-1 (Date month is 0-indexed → m-2)
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

export async function getMonthClosure(
  scope: Scope,
  yearMonth: string,
): Promise<MonthClosure> {
  const admin = createAdminClient();
  const { start, end } = monthBoundsFromYM(yearMonth);
  const prevYM = prevYearMonth(yearMonth);
  const prevBounds = monthBoundsFromYM(prevYM);

  // Single round-trip: fetch both months' transactions
  const { data: txs } = await admin
    .from("transactions")
    .select(
      "kind, amount, occurred_on, transfer_id, category_id, is_confirmed, affects_balance, category:categories(name,color,icon)",
    )
    .eq("scope", scope)
    .gte("occurred_on", prevBounds.start)
    .lt("occurred_on", end);

  const all = txs ?? [];
  const thisMonth = all.filter((t) => t.occurred_on >= start && t.occurred_on < end);
  const prevMonthTxs = all.filter(
    (t) => t.occurred_on >= prevBounds.start && t.occurred_on < prevBounds.end,
  );

  // Income/expense totals (confirmed, non-transfer)
  const confirmedNT = thisMonth.filter((t) => t.is_confirmed && !t.transfer_id);
  const incomeTotal = confirmedNT
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenseTotal = confirmedNT
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  function groupByCategory(kind: "income" | "expense"): ClosureCategoryRow[] {
    const map: Record<string, ClosureCategoryRow> = {};
    const total = kind === "income" ? incomeTotal : expenseTotal;
    for (const tx of confirmedNT.filter((t) => t.kind === kind)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = tx.category as any;
      const key = tx.category_id ?? "uncategorized";
      if (!map[key]) {
        map[key] = {
          name: cat?.name ?? "Sin categoría",
          color:
            cat?.color ??
            (kind === "income" ? "var(--color-secondary-fixed)" : "var(--color-error)"),
          icon: cat?.icon ?? (kind === "income" ? "trending_up" : "shopping_cart"),
          amount: 0,
          pct: 0,
        };
      }
      map[key].amount += Number(tx.amount);
    }
    const rows = Object.values(map).sort((a, b) => b.amount - a.amount);
    for (const r of rows) {
      r.pct = total > 0 ? (r.amount / total) * 100 : 0;
    }
    return rows;
  }

  const incomeByCategory = groupByCategory("income");
  const expenseByCategory = groupByCategory("expense");

  // Previous month totals
  const prevConfirmed = prevMonthTxs.filter((t) => t.is_confirmed && !t.transfer_id);
  const prevIncome = prevConfirmed
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const prevExpense = prevConfirmed
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  // Budget execution — read directly (no auto-roll side effect for historical months)
  const { data: budgetsRaw } = await admin
    .from("planned_budgets")
    .select(
      "category_id, expected_amount, is_single_payment, category:categories(name,color,icon)",
    )
    .eq("scope", scope)
    .eq("period_month", start);
  const budgets = (budgetsRaw ?? []) as unknown as Array<{
    category_id: string;
    expected_amount: number;
    is_single_payment: boolean;
    category: { name: string; color: string | null; icon: string | null } | null;
  }>;
  const spentByCategory: Record<string, number> = {};
  for (const tx of thisMonth) {
    if (tx.kind === "expense" && tx.category_id && (tx.is_confirmed || !tx.affects_balance)) {
      spentByCategory[tx.category_id] =
        (spentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  const budgetRows: ClosureBudgetRow[] = budgets
    .map((b) => {
      const expected = Number(b.expected_amount);
      const spent = spentByCategory[b.category_id] ?? 0;
      const isSingle = b.is_single_payment;
      const isExecuted = isSingle && spent > 0;
      const pct = isExecuted ? 100 : expected > 0 ? (spent / expected) * 100 : 0;
      let status: ClosureBudgetRow["status"];
      if (isExecuted) status = "executed";
      else if (spent > expected) status = "over";
      else if (pct >= 80) status = "near";
      else status = "under";
      return {
        categoryId: b.category_id,
        categoryName: b.category?.name ?? "Sin categoría",
        categoryColor: b.category?.color ?? "var(--color-primary)",
        categoryIcon: b.category?.icon ?? "category",
        expected,
        spent,
        pct,
        status,
        isSinglePayment: isSingle,
        remaining: Math.max(0, expected - spent),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  const totalBudgeted = budgetRows.reduce((s, b) => s + b.expected, 0);
  const totalSpent = budgetRows.reduce((s, b) => s + b.spent, 0);
  const overCount = budgetRows.filter((b) => b.status === "over").length;
  const onTrackCount = budgetRows.filter(
    (b) => b.status === "under" || b.status === "executed",
  ).length;

  return {
    scope,
    yearMonth,
    label: formatMonth(start),
    income: {
      total: incomeTotal,
      byCategory: incomeByCategory,
      txCount: confirmedNT.filter((t) => t.kind === "income").length,
    },
    expense: {
      total: expenseTotal,
      byCategory: expenseByCategory,
      txCount: confirmedNT.filter((t) => t.kind === "expense").length,
    },
    net: incomeTotal - expenseTotal,
    budgets: budgetRows,
    budgetSummary: {
      totalBudgeted,
      totalSpent,
      pct: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
      overCount,
      onTrackCount,
    },
    prevMonth:
      prevConfirmed.length > 0
        ? {
            yearMonth: prevYM,
            income: prevIncome,
            expense: prevExpense,
            net: prevIncome - prevExpense,
            incomeDeltaPct: pctDelta(incomeTotal, prevIncome),
            expenseDeltaPct: pctDelta(expenseTotal, prevExpense),
          }
        : null,
    hasData: confirmedNT.length > 0 || budgets.length > 0,
  };
}
