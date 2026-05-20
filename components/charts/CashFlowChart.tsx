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
import type { CashFlowProjection, CashFlowPoint } from "@/lib/actions/cashflow";
import { formatCurrency } from "@/lib/format";

type Days = 30 | 60 | 90;

type Props = {
  projections: Record<Days, CashFlowProjection>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: CashFlowPoint = payload[0]?.payload;
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
        {label} — {formatCurrency(balance)}
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

export function CashFlowChart({ projections }: Props) {
  const [days, setDays] = useState<Days>(30);
  const projection = projections[days];
  const { series, currentBalance, minBalance, minDate, dangerDays, budgetsRolledFromMonth } = projection;

  const rolledFromLabel = budgetsRolledFromMonth
    ? new Date(budgetsRolledFromMonth + "T12:00:00").toLocaleDateString("es-SV", {
        month: "long",
        year: "numeric",
      })
    : null;

  const hasNegative = dangerDays > 0;
  const minBalanceNegative = minBalance < 0;

  // Color the area based on whether we ever go negative
  const areaColor = hasNegative ? "var(--color-error)" : "var(--color-primary)";
  const gradientId = `cashflow-grad-${days}`;

  // Format minDate for display
  const minDateLabel = minDate
    ? new Date(minDate + "T12:00:00").toLocaleDateString("es-SV", { day: "numeric", month: "short" })
    : null;

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

        {/* Day tabs */}
        <div className="flex gap-xs bg-surface-container-high rounded-full p-xs">
          {([30, 60, 90] as Days[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className="h-7 px-sm rounded-full text-label-md font-bold transition-colors"
              style={
                days === d
                  ? {
                      background: "var(--color-primary-container)",
                      color: "var(--color-on-primary-container)",
                    }
                  : { color: "var(--color-on-surface-variant)" }
              }
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 divide-x divide-outline-variant/10 border-b border-outline-variant/10">
        <div className="px-md py-sm">
          <p className="text-label-md text-on-surface-variant">Saldo actual</p>
          <p className="text-body-sm font-bold text-on-surface">{formatCurrency(currentBalance)}</p>
        </div>
        <div className="px-md py-sm">
          <p className="text-label-md text-on-surface-variant">Saldo mín. proyectado</p>
          <p
            className="text-body-sm font-bold"
            style={{ color: minBalanceNegative ? "var(--color-error)" : "var(--color-secondary-fixed)" }}
          >
            {formatCurrency(minBalance)}
            {minDateLabel && (
              <span className="text-label-md font-normal text-on-surface-variant ml-xs">
                el {minDateLabel}
              </span>
            )}
          </p>
        </div>
        <div className="px-md py-sm">
          <p className="text-label-md text-on-surface-variant">Días en riesgo</p>
          <p
            className="text-body-sm font-bold"
            style={{ color: dangerDays > 0 ? "var(--color-error)" : "var(--color-secondary-fixed)" }}
          >
            {dangerDays === 0 ? "Ninguno" : `${dangerDays} día${dangerDays !== 1 ? "s" : ""}`}
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
            El saldo proyectado cae bajo $0 durante {dangerDays} día{dangerDays !== 1 ? "s" : ""}.
            {minDateLabel && ` El punto más bajo es el ${minDateLabel} con ${formatCurrency(minBalance)}.`}
          </span>
        </div>
      )}

      {/* Rolled-budgets banner (defense-in-depth — debería rara vez aparecer) */}
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
              interval="preserveStartEnd"
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
            {/* Zero line */}
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
              dot={false}
              activeDot={{ r: 4, fill: areaColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer note */}
      <p className="px-lg pb-md text-label-md text-on-surface-variant">
        Incluye transacciones pendientes, reglas recurrentes activas y presupuestos mensuales replicados a cada cierre de mes. Los valores son estimados.
      </p>
    </div>
  );
}
