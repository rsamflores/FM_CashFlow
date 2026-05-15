"use client";

import { useTransition } from "react";
import { toggleRecurringRule, deleteRecurringRule, type RecurringRuleRow } from "@/lib/actions/recurring";
import { formatCurrency, formatDay } from "@/lib/format";
import type { Scope } from "@/lib/scope";

const FREQ_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  yearly: "Anual",
};

type Props = {
  scope: Scope;
  incomes: RecurringRuleRow[];
  expenses: RecurringRuleRow[];
  transfers: RecurringRuleRow[];
};

export function RecurringClient({ scope, incomes, expenses, transfers }: Props) {
  const total = incomes.length + expenses.length + transfers.length;

  if (total === 0) {
    return (
      <section className="flex flex-col items-center justify-center text-center py-xl mx-auto" style={{ maxWidth: 480 }}>
        <div className="w-40 h-40 bg-surface-container-low rounded-full flex items-center justify-center mb-lg relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
          <span className="material-symbols-outlined text-outline/30" style={{ fontSize: 80 }}>event_repeat</span>
        </div>
        <h3 className="text-headline-lg-mobile text-on-surface mb-sm">Sin reglas recurrentes</h3>
        <p className="text-body-sm text-on-surface-variant" style={{ maxWidth: 360 }}>
          Cuando crees ingresos, egresos o transferencias marcadas como recurrentes, aparecerán aquí.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-xl">
      {incomes.length > 0 && (
        <Section
          title="Ingresos recurrentes"
          icon="trending_up"
          count={incomes.length}
          accent="var(--color-secondary-fixed)"
          accentBg="var(--color-secondary-container)15"
          rules={incomes}
          scope={scope}
        />
      )}
      {expenses.length > 0 && (
        <Section
          title="Egresos recurrentes"
          icon="trending_down"
          count={expenses.length}
          accent="var(--color-error)"
          accentBg="var(--color-error-container)15"
          rules={expenses}
          scope={scope}
        />
      )}
      {transfers.length > 0 && (
        <Section
          title="Transferencias recurrentes"
          icon="swap_horiz"
          count={transfers.length}
          accent="var(--color-primary)"
          accentBg="var(--color-primary-container)15"
          rules={transfers}
          scope={scope}
        />
      )}
    </div>
  );
}

function isIvaRule(rule: RecurringRuleRow) {
  return !!rule.description?.startsWith("IVA —");
}

function Section({
  title, icon, count, accent, accentBg, rules, scope,
}: {
  title: string;
  icon: string;
  count: number;
  accent: string;
  accentBg: string;
  rules: RecurringRuleRow[];
  scope: Scope;
}) {
  const hasIva = rules.some(isIvaRule);

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
      <div className="flex items-center gap-sm px-lg py-md border-b border-outline-variant/10" style={{ background: accentBg }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: accent }}>{icon}</span>
        <h3 className="text-body-sm font-bold flex-1" style={{ color: accent }}>{title} ({count})</h3>
      </div>

      {/* IVA sync warning banner */}
      {hasIva && (
        <div className="flex items-start gap-sm px-lg py-sm border-b border-outline-variant/10"
          style={{ background: "var(--color-primary)10" }}>
          <span className="material-symbols-outlined shrink-0 mt-xs" style={{ fontSize: 16, color: "var(--color-primary)" }}>link</span>
          <p className="text-label-md" style={{ color: "var(--color-primary)" }}>
            Las transferencias marcadas con <strong>IVA</strong> están vinculadas a reglas de ingreso empresarial.
            Eliminar una sin eliminar la otra desincronizará el cálculo automático de impuestos.
          </p>
        </div>
      )}

      {/* Table header */}
      <div className="hidden md:grid px-lg py-sm border-b border-outline-variant/10 bg-surface-container"
        style={{ gridTemplateColumns: "1fr 160px 100px 110px 90px 72px" }}>
        <span className="text-label-md text-on-surface-variant">Descripción</span>
        <span className="text-label-md text-on-surface-variant">Cuenta</span>
        <span className="text-label-md text-on-surface-variant">Monto</span>
        <span className="text-label-md text-on-surface-variant">Frecuencia</span>
        <span className="text-label-md text-on-surface-variant">Próximo</span>
        <span />
      </div>
      {rules.map((rule) => (
        <RuleRow key={rule.id} rule={rule} accent={accent} scope={scope} />
      ))}
    </div>
  );
}

function RuleRow({ rule, accent, scope }: { rule: RecurringRuleRow; accent: string; scope: Scope }) {
  const [isPending, startTransition] = useTransition();
  const isIva = isIvaRule(rule);

  function handleToggle() {
    startTransition(async () => {
      await toggleRecurringRule(rule.id, !rule.is_active, scope);
    });
  }

  function handleDelete() {
    const msg = isIva
      ? "Esta es una transferencia de IVA vinculada a un ingreso recurrente.\n\nEliminarla desincronizará el cálculo automático de impuestos. Las transacciones pendientes ya generadas no se eliminarán.\n\n¿Continuar?"
      : "¿Eliminar esta regla recurrente? Las transacciones pendientes generadas no se eliminarán.";
    if (!confirm(msg)) return;
    startTransition(async () => {
      await deleteRecurringRule(rule.id, scope);
    });
  }

  const isTransfer = !!rule.to_account_id;
  const catColor = rule.category?.color ?? accent;

  return (
    <div
      className="border-t border-outline-variant/10 hover:bg-surface-container transition-colors"
      style={{ opacity: rule.is_active ? 1 : 0.5 }}
    >
      {/* Desktop grid */}
      <div className="hidden md:grid px-lg py-sm items-center"
        style={{ gridTemplateColumns: "1fr 160px 100px 110px 90px 72px" }}>

        {/* Description + icon */}
        <div className="flex items-center gap-sm min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: (isTransfer ? "var(--color-primary)" : catColor) + "20" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: isTransfer ? "var(--color-primary)" : catColor }}>
              {isTransfer ? "swap_horiz" : (rule.category?.icon ?? (rule.kind === "income" ? "trending_up" : "shopping_cart"))}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-xs flex-wrap">
              <p className="text-body-sm text-on-surface truncate">{rule.description || rule.category?.name || "—"}</p>
              {isIva && (
                <span className="shrink-0 inline-flex items-center gap-xs px-xs rounded text-label-md font-bold"
                  style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 10 }}>link</span>
                  IVA vinculado
                </span>
              )}
            </div>
            {isTransfer ? (
              <p className="text-label-md text-on-surface-variant truncate">
                {rule.account?.name} → {rule.to_account?.name}
              </p>
            ) : (
              <p className="text-label-md text-on-surface-variant truncate">{rule.category?.name}</p>
            )}
          </div>
        </div>

        {/* Account */}
        <div className="flex items-center gap-xs min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: rule.account?.color ?? "var(--color-outline)" }} />
          <span className="text-body-sm text-on-surface-variant truncate">{rule.account?.name ?? "—"}</span>
        </div>

        {/* Amount */}
        <span className="text-body-sm font-bold" style={{ color: accent }}>
          {rule.kind === "income" ? "+" : "-"}{formatCurrency(rule.amount)}
        </span>

        {/* Frequency */}
        <div className="flex items-center gap-xs">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>event_repeat</span>
          <span className="text-body-sm text-on-surface-variant">{FREQ_LABEL[rule.frequency] ?? rule.frequency}</span>
        </div>

        {/* Next run */}
        <span className="text-body-sm text-on-surface-variant">{formatDay(rule.next_run)}</span>

        {/* Actions */}
        <div className="flex items-center gap-xs justify-end">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            title={rule.is_active ? "Pausar" : "Activar"}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {rule.is_active ? "pause" : "play_arrow"}
            </span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="Eliminar regla"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          </button>
        </div>
      </div>

      {/* Mobile card */}
      <div className="flex md:hidden items-start gap-sm px-lg py-md">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-xs"
          style={{ background: (isTransfer ? "var(--color-primary)" : catColor) + "20" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: isTransfer ? "var(--color-primary)" : catColor }}>
            {isTransfer ? "swap_horiz" : (rule.category?.icon ?? (rule.kind === "income" ? "trending_up" : "shopping_cart"))}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-xs flex-wrap">
            <p className="text-body-sm font-bold text-on-surface truncate">{rule.description || rule.category?.name || "—"}</p>
            {isIva && (
              <span className="shrink-0 inline-flex items-center gap-xs px-xs rounded text-label-md font-bold"
                style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 10 }}>link</span>
                IVA vinculado
              </span>
            )}
          </div>
          {isTransfer ? (
            <p className="text-label-md text-on-surface-variant">{rule.account?.name} → {rule.to_account?.name}</p>
          ) : (
            <p className="text-label-md text-on-surface-variant">{rule.account?.name}</p>
          )}
          <div className="flex items-center gap-sm mt-xs flex-wrap">
            <span className="text-label-md font-bold" style={{ color: accent }}>
              {rule.kind === "income" ? "+" : "-"}{formatCurrency(rule.amount)}
            </span>
            <span className="text-label-md text-on-surface-variant">{FREQ_LABEL[rule.frequency]}</span>
            <span className="text-label-md text-on-surface-variant">Próx. {formatDay(rule.next_run)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-xs shrink-0">
          <button type="button" onClick={handleToggle} disabled={isPending}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{rule.is_active ? "pause" : "play_arrow"}</span>
          </button>
          <button type="button" onClick={handleDelete} disabled={isPending}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
