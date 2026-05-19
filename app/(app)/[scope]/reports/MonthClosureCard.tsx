"use client";

import { useState } from "react";
import type { MonthClosure } from "@/lib/actions/closures";
import { formatCurrency } from "@/lib/format";

type Props = { closure: MonthClosure };

export function MonthClosureCard({ closure }: Props) {
  const [expanded, setExpanded] = useState(true);
  const { label, income, expense, net, budgets, budgetSummary, prevMonth, hasData } = closure;

  if (!hasData) {
    return (
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg mb-lg">
        <div className="flex items-center gap-sm">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: "var(--color-on-surface-variant)" }}
          >
            description
          </span>
          <div>
            <h3 className="text-body-sm font-bold text-on-surface capitalize">
              Cierre de {label}
            </h3>
            <p className="text-label-md text-on-surface-variant">
              Sin transacciones ni presupuestos en este periodo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const netColor =
    net >= 0 ? "var(--color-secondary-fixed)" : "var(--color-error)";

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden mb-lg">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-sm px-lg py-md border-b border-outline-variant/10 hover:bg-surface-container transition-colors"
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22, color: "var(--color-primary)" }}
        >
          assessment
        </span>
        <div className="flex-1 text-left">
          <h3 className="text-body-sm font-bold text-on-surface capitalize">
            Reporte de cierre — {label}
          </h3>
          <p className="text-label-md text-on-surface-variant">
            Resumen automático del mes anterior
          </p>
        </div>
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform"
          style={{ fontSize: 18, transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>

      {expanded && (
        <div className="p-lg flex flex-col gap-lg">
          {/* KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
            <KpiTile
              label="Ingresos"
              total={income.total}
              accent="var(--color-secondary-fixed)"
              icon="trending_up"
              meta={`${income.txCount} mov.`}
              deltaPct={prevMonth?.incomeDeltaPct ?? null}
              deltaPositiveIsGood
            />
            <KpiTile
              label="Egresos"
              total={expense.total}
              accent="var(--color-error)"
              icon="trending_down"
              meta={`${expense.txCount} mov.`}
              deltaPct={prevMonth?.expenseDeltaPct ?? null}
              deltaPositiveIsGood={false}
            />
            <KpiTile
              label="Neto"
              total={net}
              accent={netColor}
              icon={net >= 0 ? "check_circle" : "warning"}
              meta={prevMonth ? `vs ${formatCurrency(prevMonth.net)} mes anterior` : ""}
              deltaPct={null}
              showSign
            />
          </div>

          {/* Category breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <CategoryBreakdown
              title="Ingresos por categoría"
              rows={income.byCategory}
              total={income.total}
              accent="var(--color-secondary-fixed)"
              emptyLabel="Sin ingresos"
            />
            <CategoryBreakdown
              title="Egresos por categoría"
              rows={expense.byCategory}
              total={expense.total}
              accent="var(--color-error)"
              emptyLabel="Sin egresos"
            />
          </div>

          {/* Budget execution */}
          <div className="rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className="px-md py-sm border-b border-outline-variant/10 bg-surface-container flex items-center gap-sm flex-wrap">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: "var(--color-primary)" }}
              >
                shopping_bag
              </span>
              <h4 className="text-body-sm font-bold text-on-surface flex-1">
                Ejecución presupuestaria
              </h4>
              {budgets.length > 0 && (
                <span className="text-label-md text-on-surface-variant">
                  {formatCurrency(budgetSummary.totalSpent)} de{" "}
                  {formatCurrency(budgetSummary.totalBudgeted)} (
                  {budgetSummary.pct.toFixed(0)}%)
                </span>
              )}
            </div>

            {budgets.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant px-md py-md">
                Sin presupuestos definidos para este mes.
              </p>
            ) : (
              <>
                {/* Global progress bar */}
                <div className="px-md py-sm border-b border-outline-variant/10">
                  <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(budgetSummary.pct, 100)}%`,
                        background:
                          budgetSummary.pct > 100
                            ? "var(--color-error)"
                            : budgetSummary.pct >= 80
                              ? "#ffd93d"
                              : "var(--color-secondary-fixed)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-xs">
                    <span className="text-label-md text-on-surface-variant">
                      {budgetSummary.onTrackCount} dentro · {budgetSummary.overCount}{" "}
                      excedido{budgetSummary.overCount !== 1 ? "s" : ""}
                    </span>
                    <span
                      className="text-label-md font-bold"
                      style={{
                        color:
                          budgetSummary.pct > 100
                            ? "var(--color-error)"
                            : "var(--color-on-surface)",
                      }}
                    >
                      {formatCurrency(
                        Math.max(0, budgetSummary.totalBudgeted - budgetSummary.totalSpent),
                      )}{" "}
                      restante
                    </span>
                  </div>
                </div>

                {/* Per-budget rows */}
                <div className="divide-y divide-outline-variant/10">
                  {budgets.map((b) => (
                    <BudgetRow key={b.categoryId} row={b} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  total,
  accent,
  icon,
  meta,
  deltaPct,
  deltaPositiveIsGood = true,
  showSign = false,
}: {
  label: string;
  total: number;
  accent: string;
  icon: string;
  meta: string;
  deltaPct: number | null;
  deltaPositiveIsGood?: boolean;
  showSign?: boolean;
}) {
  let deltaColor = "var(--color-on-surface-variant)";
  let deltaIcon = "";
  if (deltaPct !== null) {
    const isUp = deltaPct >= 0;
    const isGood = deltaPositiveIsGood ? isUp : !isUp;
    deltaColor = isGood ? "var(--color-secondary-fixed)" : "var(--color-error)";
    deltaIcon = isUp ? "arrow_upward" : "arrow_downward";
  }

  return (
    <div
      className="rounded-2xl border border-outline-variant/10 p-md"
      style={{ background: accent + "08" }}
    >
      <div className="flex items-center gap-xs mb-xs">
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: accent }}
        >
          {icon}
        </span>
        <span className="text-label-md text-on-surface-variant">{label}</span>
      </div>
      <p className="text-title-md font-bold" style={{ color: accent }}>
        {showSign && total > 0 ? "+" : ""}
        {formatCurrency(total)}
      </p>
      <div className="flex items-center gap-sm mt-xs flex-wrap">
        {meta && (
          <span className="text-label-md text-on-surface-variant">{meta}</span>
        )}
        {deltaPct !== null && (
          <span
            className="text-label-md font-bold flex items-center gap-xs"
            style={{ color: deltaColor }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
              {deltaIcon}
            </span>
            {Math.abs(deltaPct).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function CategoryBreakdown({
  title,
  rows,
  total,
  accent,
  emptyLabel,
}: {
  title: string;
  rows: { name: string; color: string; icon: string; amount: number; pct: number }[];
  total: number;
  accent: string;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-md py-sm bg-surface-container border-b border-outline-variant/10 flex items-center justify-between">
        <h4 className="text-body-sm font-bold text-on-surface">{title}</h4>
        <span className="text-label-md font-bold" style={{ color: accent }}>
          {formatCurrency(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant px-md py-md">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-sm px-md py-sm">
          {rows.map((r) => (
            <div key={r.name} className="flex flex-col gap-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-xs min-w-0">
                  <span
                    className="material-symbols-outlined shrink-0"
                    style={{ fontSize: 14, color: r.color }}
                  >
                    {r.icon}
                  </span>
                  <span className="text-label-md text-on-surface truncate">{r.name}</span>
                </div>
                <div className="flex items-center gap-sm shrink-0">
                  <span className="text-label-md text-on-surface-variant">
                    {r.pct.toFixed(0)}%
                  </span>
                  <span
                    className="text-label-md font-bold"
                    style={{ color: r.color }}
                  >
                    {formatCurrency(r.amount)}
                  </span>
                </div>
              </div>
              <div className="h-1 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${r.pct}%`, background: r.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetRow({
  row,
}: {
  row: {
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
    expected: number;
    spent: number;
    pct: number;
    status: "under" | "near" | "over" | "executed";
    isSinglePayment: boolean;
    remaining: number;
  };
}) {
  const barColor =
    row.status === "executed"
      ? "var(--color-secondary-fixed)"
      : row.status === "over"
        ? "var(--color-error)"
        : row.status === "near"
          ? "#ffd93d"
          : "var(--color-secondary-fixed)";

  const statusLabel =
    row.status === "executed"
      ? "Ejecutado"
      : row.status === "over"
        ? `+${formatCurrency(row.spent - row.expected)} excedido`
        : `${formatCurrency(row.remaining)} restante`;

  const statusColor =
    row.status === "over" ? "var(--color-error)" : "var(--color-secondary-fixed)";

  return (
    <div className="px-md py-sm">
      <div className="flex items-center justify-between mb-xs gap-sm">
        <div className="flex items-center gap-xs min-w-0">
          <span
            className="material-symbols-outlined shrink-0"
            style={{ fontSize: 14, color: row.categoryColor }}
          >
            {row.categoryIcon}
          </span>
          <span className="text-body-sm text-on-surface truncate">
            {row.categoryName}
          </span>
          {row.isSinglePayment && (
            <span
              className="text-label-md px-xs rounded-full shrink-0"
              style={{
                background: "var(--color-primary)15",
                color: "var(--color-primary)",
                fontSize: 10,
              }}
            >
              único
            </span>
          )}
        </div>
        <div className="flex items-center gap-sm shrink-0">
          <span
            className="text-label-md font-bold"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(row.pct, 100)}%`, background: barColor }}
        />
      </div>
      <div className="flex justify-between mt-xs">
        <span className="text-label-md text-on-surface-variant">
          {formatCurrency(row.spent)} de {formatCurrency(row.expected)}
        </span>
        <span
          className="text-label-md font-bold"
          style={{ color: row.pct > 100 ? "var(--color-error)" : "var(--color-on-surface-variant)" }}
        >
          {row.pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
