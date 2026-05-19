"use client";

import { useState } from "react";
import { BudgetDialog } from "@/components/forms/BudgetDialog";
import { deleteBudget, type BudgetRow } from "@/lib/actions/budgets";
import type { CategoryRow } from "@/lib/actions/categories";
import type { TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import { formatCurrency, formatMonth, formatDay } from "@/lib/format";
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

  // Compute spent per category this month (confirmed + pending)
  const spentByCategory: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.kind === "expense" && tx.category_id) {
      spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  // Single-payment budgets count their actual spend (not expected_amount) once executed
  const totalBudgeted = budgets.reduce((s, b) => {
    const spent = spentByCategory[b.category_id] ?? 0;
    return s + (b.is_single_payment && spent > 0 ? spent : Number(b.expected_amount));
  }, 0);
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
              transactions={transactions.filter((tx) => tx.category_id === b.category_id)}
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
  transactions,
  onEdit,
  onDelete,
}: {
  budget: BudgetRow;
  spent: number;
  transactions: TransactionRow[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const expected = Number(budget.expected_amount);
  const isSingle = budget.is_single_payment;
  const isExecuted = isSingle && spent > 0;
  const available = isExecuted ? 0 : Math.max(expected - spent, 0);

  const realPct = isExecuted ? 100 : (expected > 0 ? (spent / expected) * 100 : 0);
  const pct = Math.min(realPct, 100);
  const isOver = !isSingle && spent > expected;
  const isWarn = !isOver && !isExecuted && pct >= 80;
  const barColor = isExecuted
    ? "var(--color-secondary-fixed)"
    : isOver ? "var(--color-error)"
    : isWarn ? "#ffd93d"
    : "var(--color-secondary-fixed)";
  const catColor = budget.category?.color ?? "var(--color-primary)";

  const sortedTxs = [...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden group">
      {/* Clickable header area */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-lg hover:bg-surface-container/40 transition-colors"
      >
        <div className="flex items-start justify-between mb-md">
          <div className="flex items-center gap-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: catColor + "20" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: catColor }}>
                {budget.category?.icon ?? "category"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-xs flex-wrap">
                <p className="text-body-sm font-bold text-on-surface">{budget.category?.name ?? "—"}</p>
                {isSingle && (
                  <span className="text-label-md font-bold px-xs py-[2px] rounded-full"
                    style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>
                    pago único
                  </span>
                )}
              </div>
              <div className="flex items-center gap-xs flex-wrap">
                {budget.account && (
                  <span className="flex items-center gap-xs text-label-md text-on-surface-variant">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: budget.account.color ?? "var(--color-outline)" }} />
                    {budget.account.name}
                  </span>
                )}
                {budget.note && (
                  <span className="text-label-md text-on-surface-variant">{budget.account ? "· " : ""}{budget.note}</span>
                )}
              </div>
            </div>
          </div>

          {/* Available + expand icon */}
          <div className="flex items-center gap-sm">
            <div className="text-right">
              {isExecuted ? (
                <p className="text-body-sm font-bold flex items-center gap-xs justify-end" style={{ color: "var(--color-secondary-fixed)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                  Ejecutado
                </p>
              ) : isOver ? (
                <p className="text-body-sm font-bold text-error">+{formatCurrency(spent - expected)}</p>
              ) : (
                <p className="text-body-sm font-bold" style={{ color: "var(--color-secondary-fixed)" }}>
                  {formatCurrency(available)}
                </p>
              )}
              <p className="text-label-md text-on-surface-variant">
                {isExecuted ? formatCurrency(spent) + " pagado" : isOver ? "excedido" : "disponible"}
              </p>
            </div>
            <span
              className="material-symbols-outlined text-on-surface-variant transition-transform"
              style={{ fontSize: 18, transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              expand_more
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex justify-between mb-xs">
          <span className="text-label-md text-on-surface-variant">{formatCurrency(spent)} gastado</span>
          <span className="text-label-md text-on-surface-variant">{realPct.toFixed(0)}% de {formatCurrency(expected)}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      </button>

      {/* Action buttons — outside the expand button */}
      <div className="px-lg pb-xs flex gap-xs justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity -mt-xs">
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      </div>

      {/* Expandable transactions */}
      {expanded && (
        <div className="border-t border-outline-variant/10">
          {sortedTxs.length === 0 ? (
            <p className="text-label-md text-on-surface-variant text-center py-md">Sin transacciones este mes</p>
          ) : (
            <div className="divide-y divide-outline-variant/10">
              {sortedTxs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-lg py-sm">
                  <div className="flex items-center gap-sm min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tx.is_confirmed ? "" : "opacity-40"}`}
                      style={{ background: catColor }} />
                    <div className="min-w-0">
                      <p className={`text-body-sm truncate ${tx.is_confirmed ? "text-on-surface" : "text-on-surface-variant"}`}>
                        {tx.description || budget.category?.name || "—"}
                      </p>
                      <p className="text-label-md text-on-surface-variant">
                        {formatDay(tx.occurred_on)}{!tx.is_confirmed ? " · pendiente" : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`text-body-sm font-bold shrink-0 ml-sm ${tx.is_confirmed ? "text-error" : "text-on-surface-variant"}`}>
                    −{formatCurrency(Number(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
