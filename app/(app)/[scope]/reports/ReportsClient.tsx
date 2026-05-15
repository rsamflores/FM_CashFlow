"use client";

import { useState } from "react";
import type { TransactionRow } from "@/lib/actions/transactions";
import { formatCurrency, formatDay, formatMonth } from "@/lib/format";

type MonthSummary = {
  yearMonth: string; // "YYYY-MM"
  label: string;
  income: number;
  expense: number;
  transactions: TransactionRow[];
};

type Props = {
  months: MonthSummary[];
};

export function ReportsClient({ months }: Props) {
  const [expanded, setExpanded] = useState<string | null>(months[0]?.yearMonth ?? null);

  if (months.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center text-center py-xl mx-auto" style={{ maxWidth: 480 }}>
        <div className="w-40 h-40 bg-surface-container-low rounded-full flex items-center justify-center mb-lg relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
          <span className="material-symbols-outlined text-outline/30" style={{ fontSize: 80 }}>analytics</span>
        </div>
        <h3 className="text-headline-lg-mobile text-on-surface mb-sm">Sin historial aún</h3>
        <p className="text-body-sm text-on-surface-variant" style={{ maxWidth: 360 }}>
          Aquí aparecerá el historial mensual una vez que pase el primer mes con transacciones registradas.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      {months.map((m) => {
        const net = m.income - m.expense;
        const isOpen = expanded === m.yearMonth;
        const nonTransfer = m.transactions.filter((t) => t.is_confirmed && !t.transfer_id);

        return (
          <div
            key={m.yearMonth}
            className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden"
          >
            {/* Month header — clickable */}
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : m.yearMonth)}
              className="w-full flex items-center gap-md px-lg py-md hover:bg-surface-container transition-colors"
            >
              <div className="flex-1 flex items-center gap-md min-w-0">
                <span className="text-body-sm font-bold text-on-surface capitalize" style={{ minWidth: 120, textAlign: "left" }}>
                  {m.label}
                </span>
                <div className="flex items-center gap-md flex-wrap">
                  <span className="text-label-md font-bold" style={{ color: "var(--color-secondary-fixed)" }}>
                    +{formatCurrency(m.income)}
                  </span>
                  <span className="text-label-md font-bold text-error">
                    -{formatCurrency(m.expense)}
                  </span>
                  <span className={`text-label-md font-bold ${net >= 0 ? "text-on-surface" : "text-error"}`}>
                    Neto {formatCurrency(net)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-sm shrink-0">
                <span className="text-label-md text-on-surface-variant">
                  {m.transactions.filter(t => t.is_confirmed).length} mov.
                </span>
                <span
                  className="material-symbols-outlined text-on-surface-variant transition-transform"
                  style={{ fontSize: 18, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  expand_more
                </span>
              </div>
            </button>

            {/* Transaction list */}
            {isOpen && (
              <div className="border-t border-outline-variant/10">
                {/* Sub-header */}
                <div className="grid px-lg py-sm bg-surface-container border-b border-outline-variant/10"
                  style={{ gridTemplateColumns: "1fr 130px 100px 72px" }}>
                  <span className="text-label-md text-on-surface-variant">Descripción / Categoría</span>
                  <span className="text-label-md text-on-surface-variant">Cuenta</span>
                  <span className="text-label-md text-on-surface-variant">Fecha</span>
                  <span className="text-label-md text-on-surface-variant text-right">Monto</span>
                </div>

                {nonTransfer.length === 0 ? (
                  <p className="px-lg py-md text-body-sm text-on-surface-variant">Sin transacciones confirmadas este mes.</p>
                ) : (
                  nonTransfer.map((tx) => {
                    const isIncome = tx.kind === "income";
                    const accent = isIncome ? "var(--color-secondary-fixed)" : "var(--color-error)";
                    const catColor = tx.category?.color ?? accent;
                    return (
                      <div
                        key={tx.id}
                        className="grid px-lg py-sm items-center border-t border-outline-variant/10 hover:bg-surface-container transition-colors"
                        style={{ gridTemplateColumns: "1fr 130px 100px 72px" }}
                      >
                        <div className="flex items-center gap-sm min-w-0">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: catColor + "20" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: catColor }}>
                              {tx.category?.icon ?? (isIncome ? "trending_up" : "shopping_cart")}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-body-sm text-on-surface truncate">
                              {tx.description || tx.category?.name || "—"}
                            </p>
                            <p className="text-label-md text-on-surface-variant truncate">{tx.category?.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-xs min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: tx.account?.color ?? "var(--color-outline)" }} />
                          <span className="text-body-sm text-on-surface-variant truncate">{tx.account?.name ?? "—"}</span>
                        </div>
                        <span className="text-body-sm text-on-surface-variant">{formatDay(tx.occurred_on)}</span>
                        <span className="text-body-sm font-bold text-right" style={{ color: accent }}>
                          {isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
                        </span>
                      </div>
                    );
                  })
                )}

                {/* Month footer totals */}
                <div className="flex items-center justify-end gap-lg px-lg py-sm border-t border-outline-variant/10 bg-surface-container">
                  <span className="text-label-md font-bold" style={{ color: "var(--color-secondary-fixed)" }}>
                    +{formatCurrency(m.income)}
                  </span>
                  <span className="text-label-md font-bold text-error">-{formatCurrency(m.expense)}</span>
                  <span className={`text-label-md font-bold ${net >= 0 ? "text-on-surface" : "text-error"}`}>
                    Neto {formatCurrency(net)}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
