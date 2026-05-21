"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { MonthlyCashFlowProjection } from "@/lib/actions/cashflow";
import { formatCurrency } from "@/lib/format";

type Props = {
  projection: MonthlyCashFlowProjection;
};

type ChartPoint = { label: string; balance: number; events: string[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: ChartPoint = payload[0]?.payload;
  const balance: number = payload[0]?.value;
  const isNegative = balance < 0;

  return (
    <div
      className="rounded-xl border p-sm text-body-sm max-w-xs"
      style={{
        background: "var(--color-surface-container-high)",
        border: "1px solid var(--color-outline-variant)",
        color: "var(--color-on-surface)",
        fontSize: 13,
      }}
    >
      <p className="font-bold mb-xs" style={{ color: isNegative ? "var(--color-error)" : "var(--color-secondary-fixed)" }}>
        {point?.label} — {formatCurrency(balance)}
      </p>
      {point?.events?.length > 0 && (
        <ul className="flex flex-col gap-xs mt-xs">
          {point.events.map((e, i) => (
            <li key={i} className="text-on-surface-variant" style={{ fontSize: 12 }}>
              • {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortMonthName(label: string) {
  // "junio 2026" → "Junio"
  return capitalize(label.split(" ")[0]);
}

export function CashFlowChart({ projection }: Props) {
  const { today, months, dangerMonths, minBalance, budgetsRolledFromMonth } = projection;

  // Default: show all 3 months
  const [selectedIdx, setSelectedIdx] = useState(2);

  const rolledFromLabel = budgetsRolledFromMonth
    ? new Date(budgetsRolledFromMonth + "T12:00:00").toLocaleDateString("es-SV", {
        month: "long",
        year: "numeric",
      })
    : null;

  const hasNegative = dangerMonths > 0;
  const areaColor = hasNegative ? "var(--color-error)" : "var(--color-primary)";
  const gradientId = "cashflow-monthly-grad";

  // Series: "Hoy" anchor + projected months up to selected tab
  const series: ChartPoint[] = [
    { label: "Hoy", balance: today.balance, events: [] },
    ...months.slice(0, selectedIdx + 1).map((m) => ({
      label: shortMonthName(m.label),
      balance: m.closingBalance,
      events: m.events,
    })),
  ];

  const selectedMonth = months[selectedIdx];
  const minBalanceNegative = minBalance < 0;

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
      {/* Header */}
      <div className="px-lg py-md border-b border-outline-variant/10 flex items-center gap-sm flex-wrap">
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: "var(--color-tertiary)" }}
        >
          waterfall_chart
        </span>
        <h3 className="text-body-sm font-bold text-on-surface flex-1">
          Proyección de caja
        </h3>

        {/* Month tabs */}
        <div className="flex gap-xs bg-surface-container-high rounded-full p-xs">
          {months.map((m, idx) => (
            <button
              key={m.month}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className="h-7 px-sm rounded-full text-label-md font-bold transition-colors"
              style={
                selectedIdx === idx
                  ? {
                      background: "var(--color-primary-container)",
                      color: "var(--color-on-primary-container)",
                    }
                  : { color: "var(--color-on-surface-variant)" }
              }
            >
              {shortMonthName(m.label)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 divide-x divide-outline-variant/10 border-b border-outline-variant/10">
        <div className="px-md py-sm">
          <p className="text-label-md text-on-surface-variant">Saldo actual</p>
          <p className="text-body-sm font-bold text-on-surface">{formatCurrency(today.balance)}</p>
        </div>
        <div className="px-md py-sm">
          <p className="text-label-md text-on-surface-variant">
            Cierre {shortMonthName(selectedMonth?.label ?? "")}
          </p>
          <p
            className="text-body-sm font-bold"
            style={{
              color: selectedMonth?.closingBalance < 0
                ? "var(--color-error)"
                : "var(--color-secondary-fixed)",
            }}
          >
            {formatCurrency(selectedMonth?.closingBalance ?? 0)}
          </p>
        </div>
        <div className="px-md py-sm">
          <p className="text-label-md text-on-surface-variant">Meses en riesgo</p>
          <p
            className="text-body-sm font-bold"
            style={{ color: dangerMonths > 0 ? "var(--color-error)" : "var(--color-secondary-fixed)" }}
          >
            {dangerMonths === 0 ? "Ninguno" : `${dangerMonths} mes${dangerMonths !== 1 ? "es" : ""}`}
          </p>
        </div>
      </div>

      {/* Alert banner */}
      {hasNegative && (
        <div
          className="flex items-center gap-sm px-lg py-sm text-body-sm border-b border-outline-variant/10"
          style={{ background: "var(--color-error)15", color: "var(--color-error)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
          <span>
            El saldo proyectado cae bajo $0 en {dangerMonths} mes{dangerMonths !== 1 ? "es" : ""}.
            {minBalanceNegative && ` Saldo mínimo proyectado: ${formatCurrency(minBalance)}.`}
          </span>
        </div>
      )}

      {/* Rolled-budgets banner */}
      {rolledFromLabel && (
        <div
          className="flex items-center gap-sm px-lg py-sm text-body-sm border-b border-outline-variant/10"
          style={{ background: "var(--color-tertiary)12", color: "var(--color-tertiary)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>info</span>
          <span>
            Proyección usando los presupuestos de <strong>{rolledFromLabel}</strong> como plantilla.
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="p-lg">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={areaColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={areaColor} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-outline-variant)"
              strokeOpacity={0.2}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`
              }
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={0}
              stroke="var(--color-error)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={areaColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 4, fill: areaColor, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: areaColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer note */}
      <p className="px-lg pb-md text-label-md text-on-surface-variant">
        Proyección mensual: saldo actual + ingresos recurrentes − presupuestos y egresos sin presupuestar. Valores estimados.
      </p>
    </div>
  );
}
