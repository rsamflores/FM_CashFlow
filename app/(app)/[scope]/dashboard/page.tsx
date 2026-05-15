import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { formatMonth } from "@/lib/format";
import { getAccounts } from "@/lib/actions/accounts";
import { getTransactionsFrom } from "@/lib/actions/transactions";
import { getBudgets } from "@/lib/actions/budgets";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const currentMonthStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // 6 months back (for bar chart)
  const sixMonthsAgo = new Date(year, month - 5, 1);
  const fromStr = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;

  const [accounts, transactions, budgets] = await Promise.all([
    getAccounts(scope),
    getTransactionsFrom(scope, fromStr),
    getBudgets(scope, currentMonthStr),
  ]);

  const confirmed = transactions.filter((tx) => tx.is_confirmed && !tx.transfer_id);
  const confirmedAll = transactions.filter((tx) => tx.is_confirmed); // includes transfers for balance
  const pending = transactions.filter((tx) => !tx.is_confirmed);

  // Net per account — confirmed transactions including transfers
  const netByAccount: Record<string, number> = {};
  const usedByAccount: Record<string, number> = {};
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]));

  for (const tx of confirmedAll) {
    if (!tx.affects_balance) continue;
    const amt = Number(tx.amount);
    netByAccount[tx.account_id] = (netByAccount[tx.account_id] ?? 0) + (tx.kind === "income" ? amt : -amt);
    if (tx.kind === "expense") {
      usedByAccount[tx.account_id] = (usedByAccount[tx.account_id] ?? 0) + amt;
    } else if (accountTypeMap.get(tx.account_id) === "credit_card") {
      // Payment received on card reduces used balance
      usedByAccount[tx.account_id] = (usedByAccount[tx.account_id] ?? 0) - amt;
    }
  }
  for (const id in usedByAccount) {
    if (usedByAccount[id] < 0) usedByAccount[id] = 0;
  }

  const creditCardAccounts = accounts.filter((a) => a.type === "credit_card");
  const nonCreditAccounts = accounts.filter((a) => a.type !== "credit_card");

  const totalBalance = nonCreditAccounts
    .reduce((s, a) => s + Number(a.opening_balance) + (netByAccount[a.id] ?? 0), 0);

  // Current month confirmed transactions
  const thisMonthConfirmed = confirmed.filter((tx) => tx.occurred_on >= currentMonthStr);
  const monthIncome = thisMonthConfirmed
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  // monthExpense for KPI display (all expenses including external/informational)
  const monthExpense = thisMonthConfirmed
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  // monthExpenseReal for projection: only expenses that actually debit an account
  const monthExpenseReal = thisMonthConfirmed
    .filter((t) => t.kind === "expense" && t.affects_balance)
    .reduce((s, t) => s + Number(t.amount), 0);

  // ── MONTHLY PROJECTION ────────────────────────────────────────────────────
  // Pending income = unconfirmed income due within the current month only
  const nextMonthDate = new Date(year, month + 1, 1);
  const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  const pendingIncomeByAccount: Record<string, number> = {};
  for (const tx of pending.filter((t) =>
    t.kind === "income" &&
    !t.transfer_id && // exclude transfer income legs (handled via the expense side)
    t.occurred_on >= currentMonthStr &&
    t.occurred_on < nextMonthStr
  )) {
    const amt = Number(tx.amount);
    pendingIncomeByAccount[tx.account_id] = (pendingIncomeByAccount[tx.account_id] ?? 0) + amt;
  }
  const totalPendingIncome = Object.values(pendingIncomeByAccount).reduce((s, v) => s + v, 0);

  // Pending transfer expenses: leaves the source account when confirmed (e.g. IVA → tax account)
  const pendingTransferOutByAccount: Record<string, number> = {};
  for (const tx of pending.filter((t) =>
    t.kind === "expense" &&
    !!t.transfer_id &&
    t.affects_balance !== false &&
    t.occurred_on >= currentMonthStr &&
    t.occurred_on < nextMonthStr
  )) {
    const amt = Number(tx.amount);
    pendingTransferOutByAccount[tx.account_id] = (pendingTransferOutByAccount[tx.account_id] ?? 0) + amt;
  }

  // Pending transfer income: arrives at the destination account when confirmed (e.g. tax account receives IVA)
  const pendingTransferInByAccount: Record<string, number> = {};
  for (const tx of pending.filter((t) =>
    t.kind === "income" &&
    !!t.transfer_id &&
    t.occurred_on >= currentMonthStr &&
    t.occurred_on < nextMonthStr
  )) {
    const amt = Number(tx.amount);
    pendingTransferInByAccount[tx.account_id] = (pendingTransferInByAccount[tx.account_id] ?? 0) + amt;
  }

  // Per-category real spend (affects_balance only) — needed for projections
  const spentByCategoryReal: Record<string, number> = {};
  for (const tx of thisMonthConfirmed.filter((t) => t.kind === "expense" && t.affects_balance)) {
    spentByCategoryReal[tx.category_id] = (spentByCategoryReal[tx.category_id] ?? 0) + Number(tx.amount);
  }

  // Total budgeted: single-payment executed budgets count actual spend, not expected
  const totalBudgeted = budgets.reduce((s, b) => {
    const spentReal = spentByCategoryReal[b.category_id] ?? 0;
    return s + (b.is_single_payment && spentReal > 0 ? spentReal : Number(b.expected_amount));
  }, 0);
  // Remaining budget per-budget: single-payment executed → 0 remaining
  const remainingBudget = budgets.reduce((s, b) => {
    const spentReal = spentByCategoryReal[b.category_id] ?? 0;
    if (b.is_single_payment && spentReal > 0) return s;
    return s + Math.max(Number(b.expected_amount) - spentReal, 0);
  }, 0);

  // Projected available = current balance + all pending income
  const projectedTotal = totalBalance + totalPendingIncome;
  // Projected remainder after executing remaining budget
  const projectedRemainder = projectedTotal - remainingBudget;

  // ──────────────────────────────────────────────────────────────────────────

  // 6-month bar chart data
  const monthlyBars = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-SV", { month: "short" });
    const monthTxs = confirmed.filter((tx) => tx.occurred_on.startsWith(key));
    return {
      month: label.charAt(0).toUpperCase() + label.slice(1),
      income: monthTxs.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0),
      expense: monthTxs.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0),
    };
  });

  // Current-month weekly breakdown (4 weeks)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeklyBars = [
    { start: 1, end: 7, label: "Sem 1" },
    { start: 8, end: 14, label: "Sem 2" },
    { start: 15, end: 21, label: "Sem 3" },
    { start: 22, end: daysInMonth, label: "Sem 4" },
  ].map(({ start, end, label }) => {
    const weekTxs = thisMonthConfirmed.filter((tx) => {
      const day = parseInt(tx.occurred_on.slice(8, 10), 10);
      return day >= start && day <= end;
    });
    return {
      month: label,
      income: weekTxs.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0),
      expense: weekTxs.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0),
    };
  });

  // Top 5 expense categories this month
  const categoryTotals: Record<string, { name: string; color: string; icon: string; amount: number }> = {};
  for (const tx of thisMonthConfirmed.filter((t) => t.kind === "expense")) {
    const id = tx.category_id;
    if (!categoryTotals[id]) {
      categoryTotals[id] = {
        name: tx.category?.name ?? "Sin categoría",
        color: tx.category?.color ?? "var(--color-error)",
        icon: tx.category?.icon ?? "shopping_cart",
        amount: 0,
      };
    }
    categoryTotals[id].amount += Number(tx.amount);
  }
  const topCategories = Object.values(categoryTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Budget spent per category this month (all expenses — for budget progress bars)
  const spentByCategory: Record<string, number> = {};
  for (const tx of thisMonthConfirmed.filter((t) => t.kind === "expense")) {
    spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
  }
  // Budget remaining per account (needs spentByCategoryReal for accurate projection)
  const remainingBudgetByAccount: Record<string, number> = {};
  for (const b of budgets) {
    if (!b.account_id) continue;
    const spent = spentByCategoryReal[b.category_id] ?? 0;
    // Single-payment executed: no remaining expected from this account
    if (b.is_single_payment && spent > 0) continue;
    const remaining = Math.max(Number(b.expected_amount) - spent, 0);
    remainingBudgetByAccount[b.account_id] = (remainingBudgetByAccount[b.account_id] ?? 0) + remaining;
  }

  // Per-account projection
  const accountProjections = nonCreditAccounts.map((a) => {
    const current = Number(a.opening_balance) + (netByAccount[a.id] ?? 0);
    const pendingIncome = pendingIncomeByAccount[a.id] ?? 0;
    const pendingTransferOut = pendingTransferOutByAccount[a.id] ?? 0;
    const pendingTransferIn = pendingTransferInByAccount[a.id] ?? 0;
    const budgetDebit = remainingBudgetByAccount[a.id] ?? 0;
    return {
      id: a.id,
      name: a.name,
      color: a.color ?? "#c0c1ff",
      currentBalance: current,
      pendingIncome,
      pendingTransferIn,
      pendingTransferOut,
      budgetDebit,
      projected: current + pendingIncome + pendingTransferIn - pendingTransferOut - budgetDebit,
    };
  });

  // Recent 8 confirmed transactions
  const recentTransactions = confirmed.slice(0, 8);

  const monthLabel = formatMonth(currentMonthStr);

  return (
    <>
      <Topbar title="Dashboard" subtitle={`${SCOPE_LABEL[scope]} · ${monthLabel}`} />
      <header className="mb-xl">
        <h2 className="text-headline-lg text-on-surface capitalize">Resumen — {monthLabel}</h2>
        <p className="text-body-sm text-on-surface-variant">{SCOPE_LABEL[scope]}</p>
      </header>
      <DashboardClient
        scope={scope}
        totalBalance={totalBalance}
        monthIncome={monthIncome}
        monthExpense={monthExpense}
        pendingCount={pending.length}
        monthlyBars={monthlyBars}
        weeklyBars={weeklyBars}
        topCategories={topCategories}
        recentTransactions={recentTransactions}
        budgets={budgets}
        spentByCategory={spentByCategory}
        accounts={accounts}
        netByAccount={netByAccount}
        usedByAccount={usedByAccount}
        creditCardAccounts={creditCardAccounts}
        totalPendingIncome={totalPendingIncome}
        totalBudgeted={totalBudgeted}
        remainingBudget={remainingBudget}
        projectedTotal={projectedTotal}
        projectedRemainder={projectedRemainder}
        accountProjections={accountProjections}
      />
    </>
  );
}
