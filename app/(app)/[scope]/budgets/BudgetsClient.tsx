"use client";

import { useState } from "react";
import { BudgetDialog } from "@/components/forms/BudgetDialog";
import { deleteBudget, type BudgetRow } from "@/lib/actions/budgets";
import type { CategoryRow } from "@/lib/actions/categories";
import type { TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import { formatCurrency, formatMonth } from "@/lib/format";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  budgets: BudgetRow[];
  categories: CategoryRow[];
  transactions: TransactionRow[];
  accounts: AccountRow[];
  currentMonth: string;
};

export function BudgetsClient({ scope, budgets, categories, transactions, accounts, currentMonth }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetRow | undefined>();

  // Compute spent per category this month (confirmed only)
  const spentByCategory: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.kind === "expense" && tx.is_confirmed) {
      spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.expected_amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + (spentByCategory[b.category_id] ?? 0), 0);

  function openEdit(b: BudgetRow) {
    setEditBudget(b);
    setDialogOpen(true);
  }

  async function handleDelete(b: BudgetRow) {
    if (!confirm(`¿Eliminar el presupuesto de "${b.category?.name}"?`)) return;
    await deleteBudget(b.id, scope);
  }

  const monthLabel = formatMonth(currentMonth);

  return (
    <>
      <header className="mb-xl flex items-end justify-between">
        <div>
          <h2 className="text-headline-lg text-on-surface capitalize">
            Presupuesto — {monthLabel}
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            {formatCurrency(totalSpent)} gastado de {formatCurrency(totalBudgeted)} presupuestado
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditBudget(undefined); setDialogOpen(true); }}
          className="flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity text-body-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Nuevo presupuesto
        </button>
      </header>

      {/* Global progress bar */}
      {budgets.length > 0 && (
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg mb-lg">
          <div className="flex justify-between mb-sm">
            <span className="text-body-sm text-on-surface-variant">Total del mes</span>
            <span className="text-body-sm font-bold text-on-surface">
              {totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(0) : 0}% utilizado
            </span>
          </div>
          <div className="h-3 rounded-full bg-surface-container-highest overflow-hidden mb-sm">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((totalSpent / totalBudgeted) * 100, 100)}%`,
                background: totalSpent > totalBudgeted
                  ? "var(--color-error)"
                  : totalSpent / totalBudgeted > 0.8
                  ? "#ffd93d"
                  : "var(--color-secondary-fixed)",
              }}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-label-md text-error font-bold">{formatCurrency(totalSpent)} gastado</span>
            <span className="text-label-md text-on-surface-variant">{formatCurrency(totalBudgeted - totalSpent)} restante</span>
          </div>
        </div>
      )}

      {budgets.length === 0 ? (
        <EmptyBudgets onAdd={() => { setEditBudget(undefined); setDialogOpen(true); }} />
      ) : (
        <div className="flex flex-col gap-sm">
          {budgets.map((b) => (
            <BudgetRow
              key={b.id}
              budget={b}
              spent={spentByCategory[b.category_id] ?? 0}
              onEdit={() => openEdit(b)}
              onDelete={() => handleDelete(b)}
            />
          ))}
        </div>
      )}

      <BudgetDialog
        scope={scope}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        categories={categories}
        accounts={accounts}
        currentMonth={currentMonth}
        editBudget={editBudget}
      />
    </>
  );
}

function BudgetRow({
  budget,
  spent,
  onEdit,
  onDelete,
}: {
  budget: BudgetRow;
  spent: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const expected = Number(budget.expected_amount);
  const realPct = expected > 0 ? (spent / expected) * 100 : 0;
  const pct = Math.min(realPct, 100);
  const isOver = spent > expected;
  const isWarn = !isOver && pct >= 80;
  const barColor = isOver ? "var(--color-error)" : isWarn ? "#ffd93d" : "var(--color-secondary-fixed)";
  const catColor = budget.category?.color ?? "var(--color-primary)";

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg group hover:border-outline-variant/30 transition-colors">
      <div className="flex items-start justify-between mb-md">
        <div className="flex items-center gap-sm">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: catColor + "20" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: catColor }}>
              {budget.category?.icon ?? "category"}
            </span>
          </div>
          <div>
            <p className="text-body-sm font-bold text-on-surface">{budget.category?.name ?? "—"}</p>
            <div className="flex items-center gap-xs flex-wrap">
              {budget.account && (
                <span className="flex items-center gap-xs text-label-md text-on-surface-variant">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ background: budget.account.color ?? "var(--color-outline)" }}
                  />
                  {budget.account.name}
                </span>
              )}
              {budget.note && (
                <span className="text-label-md text-on-surface-variant">{budget.account ? "· " : ""}{budget.note}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-xs opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          </button>
        </div>
      </div>

      <div className="flex justify-between mb-sm">
        <span className="text-label-md text-on-surface-variant">
          {formatCurrency(spent)} gastado
        </span>
        <span className="text-label-md font-bold" style={{ color: barColor }}>
          {isOver
            ? `+${formatCurrency(spent - expected)} excedido`
            : `${formatCurrency(expected - spent)} restante`}
        </span>
      </div>

      <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden mb-xs">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>

      <div className="flex justify-between">
        <span className="text-label-md text-on-surface-variant">{realPct.toFixed(0)}% de {formatCurrency(expected)}</span>
        {isOver && (
          <span className="text-label-md font-bold text-error flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>flag</span>
            {realPct.toFixed(0)}% — excedido
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyBudgets({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-xl mx-auto" style={{ maxWidth: 480 }}>
      <div className="w-48 h-48 bg-surface-container-low rounded-full flex items-center justify-center mb-lg relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
        <span className="material-symbols-outlined text-outline/30" style={{ fontSize: 96 }}>savings</span>
      </div>
      <h3 className="text-headline-lg-mobile text-on-surface mb-sm">Sin presupuestos este mes</h3>
      <p className="text-body-sm text-on-surface-variant mb-lg" style={{ maxWidth: 360 }}>
        Define cuánto quieres gastar por categoría y monitorea en tiempo real si vas bien o te estás excediendo.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        Nuevo presupuesto
      </button>
    </section>
  );
}
