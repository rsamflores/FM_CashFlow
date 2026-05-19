"use client";

import { useState } from "react";
import { TransactionDialog } from "@/components/forms/TransactionDialog";
import { ReimbursementRequestDialog } from "@/components/forms/ReimbursementRequestDialog";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import type { BudgetRow } from "@/lib/actions/budgets";
import type { TransactionRow } from "@/lib/actions/transactions";
import type { ReimbursementRow } from "@/lib/actions/reimbursements";
import { formatCurrency, formatDay, formatMonth } from "@/lib/format";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  userId: string;
  assignedCategoryIds: string[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
  transactions: TransactionRow[];
  accounts: AccountRow[];
  reimbursements: ReimbursementRow[];
  currentMonth: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending:  "Pendiente",
  approved: "Aprobado",
  paid:     "Pagado",
  rejected: "Rechazado",
};

const STATUS_COLOR: Record<string, string> = {
  pending:  "var(--color-primary)",
  approved: "var(--color-secondary-fixed)",
  paid:     "var(--color-tertiary)",
  rejected: "var(--color-error)",
};

export function EmployeeClient({
  scope,
  userId,
  assignedCategoryIds,
  categories,
  budgets,
  transactions,
  accounts,
  reimbursements,
  currentMonth,
}: Props) {
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [reimbDialogOpen, setReimbDialogOpen] = useState(false);

  // Compute spent per category (confirmed + pending expenses)
  const spentByCategory: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.kind === "expense" && tx.category_id) {
      spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  // Only expense categories that are assigned
  const assignedCategories = categories.filter(
    (c) => c.kind === "expense" && assignedCategoryIds.includes(c.id),
  );

  const monthLabel = formatMonth(currentMonth);

  return (
    <div>
      {/* Welcome card */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-lg mb-xl flex items-center gap-md">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "var(--color-tertiary)20" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: "var(--color-tertiary)" }}>
            person
          </span>
        </div>
        <div className="flex-1">
          <p className="text-body-sm font-bold text-on-surface">Panel de Empleado</p>
          <p className="text-label-md text-on-surface-variant">
            Registra tus gastos y solicita reembolsos — {monthLabel}
          </p>
        </div>
        <div className="flex gap-sm">
          <button
            type="button"
            onClick={() => setReimbDialogOpen(true)}
            className="flex items-center gap-xs h-10 px-lg rounded-full font-bold text-body-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--color-secondary-container)", color: "var(--color-on-secondary-container)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>payments</span>
            Reembolso
          </button>
          <button
            type="button"
            onClick={() => setTxDialogOpen(true)}
            className="flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold text-body-sm hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Gasto
          </button>
        </div>
      </div>

      {/* Budget bars for assigned categories */}
      {assignedCategories.length > 0 && (
        <section className="mb-xl">
          <h3 className="text-title-md font-bold text-on-surface mb-md">Presupuesto del mes</h3>
          <div className="flex flex-col gap-sm">
            {assignedCategories.map((cat) => {
              const budget = budgets.find((b) => b.category_id === cat.id);
              const spent = spentByCategory[cat.id] ?? 0;
              const expected = Number(budget?.expected_amount ?? 0);
              const pct = expected > 0 ? Math.min((spent / expected) * 100, 100) : 0;
              const isOver = expected > 0 && spent > expected;
              const isWarn = !isOver && pct >= 80;
              const barColor = isOver
                ? "var(--color-error)"
                : isWarn
                ? "#ffd93d"
                : "var(--color-secondary-fixed)";
              const catColor = cat.color ?? "var(--color-primary)";

              return (
                <div
                  key={cat.id}
                  className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg"
                >
                  <div className="flex items-center gap-sm mb-md">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: catColor + "20" }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: catColor }}>
                        {cat.icon ?? "category"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-bold text-on-surface">{cat.name}</p>
                      {budget ? (
                        <p className="text-label-md text-on-surface-variant">
                          Presupuesto: {formatCurrency(expected)}
                        </p>
                      ) : (
                        <p className="text-label-md text-on-surface-variant">Sin presupuesto asignado</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-body-sm font-bold text-error">{formatCurrency(spent)}</p>
                      <p className="text-label-md text-on-surface-variant">gastado</p>
                    </div>
                  </div>

                  {expected > 0 && (
                    <>
                      <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden mb-xs">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-label-md text-on-surface-variant">{pct.toFixed(0)}%</span>
                        <span className="text-label-md font-bold" style={{ color: barColor }}>
                          {isOver
                            ? `+${formatCurrency(spent - expected)} excedido`
                            : `${formatCurrency(expected - spent)} restante`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {assignedCategories.length === 0 && (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg mb-xl flex items-center gap-md">
          <span className="material-symbols-outlined text-on-surface-variant/40" style={{ fontSize: 32 }}>category</span>
          <div>
            <p className="text-body-sm font-bold text-on-surface">Sin categorías asignadas</p>
            <p className="text-label-md text-on-surface-variant">
              El administrador aún no ha asignado categorías a tu cuenta.
            </p>
          </div>
        </div>
      )}

      {/* Recent expenses this month */}
      {transactions.length > 0 && (
        <section className="mb-xl">
          <h3 className="text-title-md font-bold text-on-surface mb-md">Gastos del mes</h3>
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
            {transactions.map((tx, i) => {
              const catColor = tx.category?.color ?? "var(--color-primary)";
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-sm px-lg py-md"
                  style={{ borderTop: i > 0 ? "1px solid var(--color-outline-variant)10" : undefined }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: catColor + "20" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: catColor }}>
                      {tx.category?.icon ?? "receipt"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-bold text-on-surface truncate">
                      {tx.description || tx.category?.name || "Gasto"}
                    </p>
                    <p className="text-label-md text-on-surface-variant">{formatDay(tx.occurred_on)}</p>
                  </div>
                  {!tx.is_confirmed && (
                    <span className="shrink-0 text-label-md font-bold px-xs py-[2px] rounded-full"
                      style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>
                      Pendiente
                    </span>
                  )}
                  <span className="text-body-sm font-bold shrink-0" style={{ color: tx.is_confirmed ? "var(--color-error)" : "var(--color-on-surface-variant)" }}>
                    -{formatCurrency(Number(tx.amount))}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Reimbursement requests */}
      <section>
        <h3 className="text-title-md font-bold text-on-surface mb-md">Mis Solicitudes</h3>

        {reimbursements.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg flex flex-col items-center justify-center text-center py-xl gap-sm">
            <span className="material-symbols-outlined text-on-surface-variant/30" style={{ fontSize: 48 }}>payments</span>
            <p className="text-body-sm text-on-surface">Sin solicitudes aún</p>
            <p className="text-label-md text-on-surface-variant">
              Cuando registres gastos y solicites reembolsos, aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-sm">
            {reimbursements.map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg"
              >
                <div className="flex items-start justify-between mb-sm">
                  <div>
                    <div className="flex items-center gap-sm mb-xs">
                      <p className="text-body-sm font-bold text-on-surface">
                        {formatCurrency(Number(req.total_amount))}
                      </p>
                      {req.code && (
                        <span className="text-label-md font-bold px-xs py-[2px] rounded-full"
                          style={{ background: "var(--color-tertiary)20", color: "var(--color-tertiary)" }}>
                          {req.code}
                        </span>
                      )}
                    </div>
                    <p className="text-label-md text-on-surface-variant">{formatDay(req.created_at)}</p>
                  </div>
                  <StatusChip status={req.status} />
                </div>

                <div className="text-label-md text-on-surface-variant mb-sm">
                  {req.bank_name} · {req.account_type === "checking" ? "Corriente" : "Ahorros"} · {req.account_number}
                </div>

                {req.reject_reason && (
                  <div
                    className="rounded-lg px-sm py-xs text-label-md mb-sm"
                    style={{ background: "var(--color-error)10", color: "var(--color-error)" }}
                  >
                    Motivo de rechazo: {req.reject_reason}
                  </div>
                )}

                {req.items.length > 0 && (
                  <div className="border-t border-outline-variant/10 pt-sm mt-sm flex flex-col gap-xs">
                    <p className="text-label-md text-on-surface-variant">{req.items.length} gasto{req.items.length !== 1 ? "s" : ""} incluido{req.items.length !== 1 ? "s" : ""}</p>
                    {req.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-label-md">
                        <span className="text-on-surface-variant truncate max-w-[200px]">
                          {item.transaction?.description || item.transaction?.category?.name || "Gasto"}
                        </span>
                        <span className="text-error font-bold shrink-0 ml-sm">
                          {item.transaction ? formatCurrency(Number(item.transaction.amount)) : "—"}
                        </span>
                      </div>
                    ))}
                    {req.items.length > 3 && (
                      <p className="text-label-md text-on-surface-variant">
                        +{req.items.length - 3} más…
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transaction Dialog — force employee mode */}
      <TransactionDialog
        scope={scope}
        open={txDialogOpen}
        onClose={() => setTxDialogOpen(false)}
        accounts={accounts}
        categories={categories}
        forceConfirmed
        forceAffectsBalance
        filteredCategoryIds={assignedCategoryIds}
        lockedAccountId={accounts[0]?.id}
        lockedKind="expense"
      />

      {/* Reimbursement Dialog */}
      <ReimbursementRequestDialog
        open={reimbDialogOpen}
        onClose={() => setReimbDialogOpen(false)}
        scope={scope}
      />
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "var(--color-outline)";
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className="text-label-md font-bold px-sm py-xs rounded-full"
      style={{ background: color + "20", color }}
    >
      {label}
    </span>
  );
}
