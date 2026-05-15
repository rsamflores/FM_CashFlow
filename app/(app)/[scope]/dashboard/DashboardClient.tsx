"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatDay } from "@/lib/format";
import type { TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import type { BudgetRow } from "@/lib/actions/budgets";

type MonthlyBar = { month: string; income: number; expense: number };
type CategorySlice = { name: string; color: string; amount: number; icon: string };

type Period = "week" | "3m" | "6m";

type AccountProjection = {
  id: string;
  name: string;
  color: string;
  currentBalance: number;
  pendingIncome: number;
  pendingTransferIn: number;
  pendingTransferOut: number;
  budgetDebit: number;
  projected: number;
  isCashTransfer: boolean;
};

type Props = {
  scope: string;
  totalBalance: number;
  monthIncome: number;
  monthExpense: number;
  pendingCount: number;
  monthlyBars: MonthlyBar[];
  weeklyBars: MonthlyBar[];
  topCategories: CategorySlice[];
  recentTransactions: TransactionRow[];
  budgets: BudgetRow[];
  spentByCategory: Record<string, number>;
  accounts: AccountRow[];
  netByAccount: Record<string, number>;
  usedByAccount: Record<string, number>;
  creditCardAccounts: AccountRow[];
  totalPendingIncome: number;
  totalBudgeted: number;
  remainingBudget: number;
  projectedTotal: number;
  projectedRemainder: number;
  accountProjections: AccountProjection[];
};

export function DashboardClient({
  scope,
  totalBalance,
  monthIncome,
  monthExpense,
  pendingCount,
  monthlyBars,
  weeklyBars,
  topCategories,
  recentTransactions,
  budgets,
  spentByCategory,
  accounts,
  netByAccount,
  usedByAccount,
  creditCardAccounts,
  totalPendingIncome,
  totalBudgeted,
  remainingBudget,
  projectedTotal,
  projectedRemainder,
  accountProjections,
}: Props) {
  const net = monthIncome - monthExpense;
  const [period, setPeriod] = useState<Period>("6m");

  const chartData =
    period === "week" ? weeklyBars :
    period === "3m"   ? monthlyBars.slice(-3) :
                        monthlyBars;

  return (
    <div className="flex flex-col gap-xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-md md:gap-lg">
        <KpiCard
          label="Ingresos del mes"
          value={formatCurrency(monthIncome)}
          icon="trending_up"
          color="var(--color-secondary-fixed)"
        />
        <KpiCard
          label="Egresos del mes"
          value={formatCurrency(monthExpense)}
          icon="trending_down"
          color="var(--color-error)"
        />
        <KpiCard
          label="Neto del mes"
          value={formatCurrency(net)}
          icon={net >= 0 ? "check_circle" : "warning"}
          color={net >= 0 ? "var(--color-secondary-fixed)" : "var(--color-error)"}
        />
        <KpiCard
          label="Saldo en cuentas"
          value={formatCurrency(totalBalance)}
          icon="account_balance_wallet"
          color="var(--color-primary)"
        />
        {pendingCount > 0 && (
          <KpiCard
            label="Pendientes de confirmar"
            value={`${pendingCount} ingreso${pendingCount !== 1 ? "s" : ""}`}
            icon="schedule"
            color="var(--color-tertiary)"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-lg">
        {/* Bar chart with period toggle */}
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg">
          <div className="flex items-center justify-between mb-lg">
            <h3 className="text-body-sm font-bold text-on-surface">Ingresos vs Egresos</h3>
            <div className="flex gap-xs bg-surface-container-high rounded-full p-xs">
              {([ ["week", "Este mes"], ["3m", "3 meses"], ["6m", "6 meses"] ] as [Period, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className="h-7 px-sm rounded-full text-label-md font-bold transition-colors"
                  style={
                    period === key
                      ? { background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }
                      : { color: "var(--color-on-surface-variant)" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4} barCategoryGap="30%">
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-on-surface-variant)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
              />
              <Tooltip
                formatter={(val, name) => [formatCurrency(Number(val)), name === "income" ? "Ingresos" : "Egresos"]}
                contentStyle={{
                  background: "var(--color-surface-container-high)",
                  border: "1px solid var(--color-outline-variant)",
                  borderRadius: 12,
                  color: "var(--color-on-surface)",
                  fontSize: 13,
                }}
                cursor={{ fill: "var(--color-surface-container-highest)", opacity: 0.4 }}
              />
              <Bar dataKey="income" name="income" fill="var(--color-secondary-fixed)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="expense" fill="var(--color-error)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top expense categories */}
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg flex flex-col gap-sm">
          <h3 className="text-body-sm font-bold text-on-surface mb-xs">Top categorías de egreso</h3>
          {topCategories.length === 0 ? (
            <p className="text-label-md text-on-surface-variant">Sin egresos este mes</p>
          ) : (
            topCategories.map((cat) => {
              const maxAmount = topCategories[0].amount;
              const pct = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
              return (
                <div key={cat.name} className="flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-xs">
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: cat.color }}>{cat.icon}</span>
                      <span className="text-label-md text-on-surface">{cat.name}</span>
                    </div>
                    <span className="text-label-md font-bold text-on-surface">{formatCurrency(cat.amount)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat.color }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Monthly Projection Panel — per account */}
      {accountProjections.length > 0 && (
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="px-lg py-md border-b border-outline-variant/10 flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 20 }}>auto_graph</span>
            <h3 className="text-body-sm font-bold text-on-surface">Proyección al cierre del mes</h3>
            <span className="text-label-md text-on-surface-variant ml-auto">por cuenta</span>
          </div>
          <div className="p-lg grid grid-cols-1 md:grid-cols-2 gap-lg">
            {accountProjections.map((a) => {
              const projectedAvailable = a.currentBalance + a.pendingIncome + a.pendingTransferIn - a.pendingTransferOut;
              const remainder = a.projected; // currentBalance + pendingIncome - budgetDebit
              const remainderColor = remainder >= 0 ? "var(--color-secondary-fixed)" : "var(--color-error)";
              return (
                <div
                  key={a.id}
                  className="rounded-2xl border border-outline-variant/10 overflow-hidden"
                  style={{ background: a.color + "08" }}
                >
                  {/* Account header */}
                  <div
                    className="flex items-center gap-sm px-md py-sm border-b border-outline-variant/10"
                    style={{ background: a.color + "18" }}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                    <p className="text-body-sm font-bold text-on-surface flex-1 truncate">{a.name}</p>
                    {a.isCashTransfer && (
                      <span className="text-label-md px-xs rounded-full" style={{ background: "var(--color-tertiary-container)", color: "var(--color-on-tertiary-container)" }}>
                        por depositar
                      </span>
                    )}
                  </div>

                  {/* Projection rows */}
                  <div className="px-md py-sm flex flex-col gap-xs">
                    {!a.isCashTransfer && (
                      <div className="flex items-center justify-between">
                        <span className="text-label-md text-on-surface-variant flex items-center gap-xs">
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>account_balance_wallet</span>
                          Saldo actual
                        </span>
                        <span className="text-body-sm text-on-surface">{formatCurrency(a.currentBalance)}</span>
                      </div>
                    )}

                    {a.pendingIncome > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-label-md text-on-surface-variant flex items-center gap-xs">
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                          + Ingresos pendientes
                        </span>
                        <span className="text-body-sm font-bold" style={{ color: "var(--color-tertiary)" }}>
                          +{formatCurrency(a.pendingIncome)}
                        </span>
                      </div>
                    )}

                    {a.pendingTransferIn > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-label-md text-on-surface-variant flex items-center gap-xs">
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>swap_horiz</span>
                          + Transferencias entrantes
                        </span>
                        <span className="text-body-sm font-bold" style={{ color: "var(--color-tertiary)" }}>
                          +{formatCurrency(a.pendingTransferIn)}
                        </span>
                      </div>
                    )}

                    {a.pendingTransferOut > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-label-md text-on-surface-variant flex items-center gap-xs">
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>swap_horiz</span>
                          − Transferencias pendientes
                        </span>
                        <span className="text-body-sm font-bold" style={{ color: "var(--color-error)" }}>
                          −{formatCurrency(a.pendingTransferOut)}
                        </span>
                      </div>
                    )}

                    <div className="h-px my-xs" style={{ background: a.color + "30" }} />

                    <div className="flex items-center justify-between">
                      <span className="text-label-md text-on-surface-variant flex items-center gap-xs">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>savings</span>
                        = Proyectado disponible
                      </span>
                      <span className="text-body-sm font-bold text-on-surface">{formatCurrency(projectedAvailable)}</span>
                    </div>

                    {a.budgetDebit > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-label-md text-on-surface-variant flex items-center gap-xs">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>shopping_bag</span>
                            − Presupuesto por ejecutar
                          </span>
                          <span className="text-body-sm font-bold" style={{ color: "var(--color-error)" }}>
                            −{formatCurrency(a.budgetDebit)}
                          </span>
                        </div>
                        <div className="h-px my-xs" style={{ background: a.color + "30" }} />
                      </>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-label-md font-bold flex items-center gap-xs" style={{ color: remainderColor }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                          {remainder >= 0 ? "check_circle" : "warning"}
                        </span>
                        = Remanente al cierre
                      </span>
                      <span className="text-body-sm font-bold" style={{ color: remainderColor }}>
                        {formatCurrency(remainder)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`grid gap-lg ${budgets.length > 0 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {/* Recent transactions */}
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="px-lg py-md border-b border-outline-variant/10">
            <h3 className="text-body-sm font-bold text-on-surface">Últimas transacciones</h3>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-label-md text-on-surface-variant px-lg py-md">Sin transacciones confirmadas</p>
          ) : (
            recentTransactions.map((tx) => {
              const isIncome = tx.kind === "income";
              const accent = isIncome ? "var(--color-secondary-fixed)" : "var(--color-error)";
              const catColor = tx.category?.color ?? accent;
              return (
                <div key={tx.id} className="flex items-center gap-sm px-lg py-sm border-t border-outline-variant/10 hover:bg-surface-container transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: catColor + "20" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: catColor }}>
                      {tx.category?.icon ?? (isIncome ? "trending_up" : "shopping_cart")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-on-surface truncate">{tx.description || tx.category?.name || "—"}</p>
                    <p className="text-label-md text-on-surface-variant">{formatDay(tx.occurred_on)} · {tx.account?.name}</p>
                  </div>
                  <span className="text-body-sm font-bold shrink-0" style={{ color: accent }}>
                    {isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Budget overview */}
        {budgets.length > 0 && (
          <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className="px-lg py-md border-b border-outline-variant/10">
              <h3 className="text-body-sm font-bold text-on-surface">Presupuestos del mes</h3>
            </div>
            <div className="flex flex-col">
              {budgets.map((b) => {
                const expected = Number(b.expected_amount);
                const spent = spentByCategory[b.category_id] ?? 0;
                const realPct = expected > 0 ? (spent / expected) * 100 : 0;
                const pct = Math.min(realPct, 100);
                const isOver = spent > expected;
                const barColor = isOver ? "var(--color-error)" : pct >= 80 ? "#ffd93d" : "var(--color-secondary-fixed)";
                const catColor = b.category?.color ?? "var(--color-primary)";
                return (
                  <div key={b.id} className="px-lg py-sm border-t border-outline-variant/10">
                    <div className="flex items-center justify-between mb-xs">
                      <div className="flex items-center gap-xs">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: catColor }}>
                          {b.category?.icon ?? "category"}
                        </span>
                        <span className="text-body-sm text-on-surface">{b.category?.name}</span>
                      </div>
                      <span className="text-label-md font-bold flex items-center gap-xs" style={{ color: barColor }}>
                        {isOver && <span className="material-symbols-outlined" style={{ fontSize: 12 }}>flag</span>}
                        {realPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <div className="flex justify-between mt-xs">
                      <span className="text-label-md text-on-surface-variant">{formatCurrency(spent)} gastado</span>
                      <span className="text-label-md text-on-surface-variant">de {formatCurrency(expected)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Account balances */}
      {accounts.filter(a => a.type !== "credit_card").length > 0 && (
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg">
          <h3 className="text-body-sm font-bold text-on-surface mb-md">Saldo por cuenta</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
            {accounts.filter(a => a.type !== "credit_card").map((a) => {
              const balance = Number(a.opening_balance) + (netByAccount[a.id] ?? 0);
              const color = a.color ?? "var(--color-primary)";
              return (
                <div key={a.id} className="rounded-xl p-md border border-outline-variant/10" style={{ background: color + "10" }}>
                  <p className="text-label-md text-on-surface-variant truncate">{a.name}</p>
                  <p className="text-body-lg font-bold mt-xs" style={{ color }}>{formatCurrency(balance)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Credit card status — personal scope only */}
      {scope === "personal" && creditCardAccounts.length > 0 && (
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="flex items-center gap-sm px-lg py-md border-b border-outline-variant/10"
            style={{ background: "var(--color-error)08" }}>
            <span className="material-symbols-outlined text-error" style={{ fontSize: 20 }}>credit_card</span>
            <h3 className="text-body-sm font-bold text-on-surface flex-1">Tarjetas de crédito</h3>
            <span className="text-label-md text-on-surface-variant">
              {creditCardAccounts.length} tarjeta{creditCardAccounts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid gap-0 divide-y divide-outline-variant/10">
            {creditCardAccounts.map((card) => {
              const limit = card.credit_limit ?? 0;
              const used = Math.max(usedByAccount[card.id] ?? 0, 0);
              const available = Math.max(limit - used, 0);
              const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
              const barColor = pct >= 90 ? "var(--color-error)" : pct >= 70 ? "#ffd93d" : "var(--color-secondary-fixed)";
              const accentColor = card.color ?? "var(--color-error)";
              return (
                <div key={card.id} className="px-lg py-md hover:bg-surface-container transition-colors">
                  <div className="flex items-center gap-sm mb-sm">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: accentColor + "25" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: accentColor }}>credit_card</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-bold text-on-surface truncate">{card.name}</p>
                      <p className="text-label-md text-on-surface-variant">
                        Límite {formatCurrency(limit)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-body-sm font-bold" style={{ color: barColor }}>
                        {formatCurrency(available)}
                      </p>
                      <p className="text-label-md text-on-surface-variant">disponible</p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="flex justify-between mt-xs">
                    <span className="text-label-md" style={{ color: barColor }}>
                      {formatCurrency(used)} usado ({pct.toFixed(0)}%)
                    </span>
                    <span className="text-label-md text-on-surface-variant">
                      {formatCurrency(available)} libre
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-lg flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <p className="text-label-md text-on-surface-variant">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + "20" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color }}>{icon}</span>
        </div>
      </div>
      <p className="text-title-md font-bold text-on-surface">{value}</p>
    </div>
  );
}

function ProjectionRow({
  label, value, icon, color, prefix, bold,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  prefix?: "+" | "-";
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-md">
      <div className="flex items-center gap-xs min-w-0">
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 15, color }}>{icon}</span>
        <span className={`text-body-sm text-on-surface-variant truncate ${bold ? "font-bold text-on-surface" : ""}`}>
          {label}
        </span>
      </div>
      <span
        className={`text-body-sm shrink-0 ${bold ? "font-bold" : ""}`}
        style={{ color: bold ? color : "var(--color-on-surface)" }}
      >
        {prefix}{formatCurrency(value)}
      </span>
    </div>
  );
}
