"use client";

import { useState, useTransition } from "react";
import {
  toggleRecurringRule,
  deleteRecurringRule,
  type DuplicateGroup,
  type RecurringRuleRow,
} from "@/lib/actions/recurring";
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
  groups: DuplicateGroup[];
};

export function DuplicatesAlert({ scope, groups }: Props) {
  const [open, setOpen] = useState(true);

  if (groups.length === 0) return null;

  const highCount = groups.filter((g) => g.confidence === "high").length;
  const totalRules = groups.reduce((s, g) => s + g.rules.length, 0);

  return (
    <div className="rounded-2xl border overflow-hidden mb-xl" style={{ borderColor: "var(--color-error)40" }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-sm px-lg py-md border-b hover:bg-surface-container transition-colors"
        style={{ borderColor: "var(--color-error)30", background: "var(--color-error)08" }}
      >
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: "var(--color-error)" }}>
          content_copy
        </span>
        <div className="flex-1 text-left">
          <h3 className="text-body-sm font-bold" style={{ color: "var(--color-error)" }}>
            {groups.length} grupo{groups.length !== 1 ? "s" : ""} con posibles reglas duplicadas
          </h3>
          <p className="text-label-md text-on-surface-variant">
            {totalRules} reglas activas con igual monto y frecuencia
            {highCount > 0 && ` · ${highCount} con mismo día de disparo`}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform shrink-0"
          style={{ fontSize: 18, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="divide-y" style={{ borderColor: "var(--color-error)15" }}>
          {groups.map((group) => (
            <GroupSection key={group.key} group={group} scope={scope} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupSection({ group, scope }: { group: DuplicateGroup; scope: Scope }) {
  const isHigh = group.confidence === "high";

  // Detect which rules share the exact same next_run date
  const dateCounts = new Map<string, number>();
  for (const r of group.rules) {
    dateCounts.set(r.next_run, (dateCounts.get(r.next_run) ?? 0) + 1);
  }

  return (
    <div className="px-lg py-md" style={{ background: isHigh ? "var(--color-error)05" : undefined }}>
      {/* Group header */}
      <div className="flex items-center gap-sm mb-sm flex-wrap">
        <span
          className="inline-flex items-center gap-xs px-sm py-xs rounded-full text-label-md font-bold"
          style={{
            background: isHigh ? "var(--color-error)20" : "var(--color-tertiary)15",
            color: isHigh ? "var(--color-error)" : "var(--color-tertiary)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
            {isHigh ? "warning" : "info"}
          </span>
          {isHigh ? "Alta probabilidad" : "Posible duplicado"}
        </span>
        <span className="text-body-sm font-bold text-on-surface">
          {group.kind === "income" ? "+" : "−"}{formatCurrency(group.amount)}
        </span>
        <span className="text-label-md text-on-surface-variant">·</span>
        <span className="text-label-md text-on-surface-variant">
          {FREQ_LABEL[group.frequency] ?? group.frequency}
        </span>
        <span className="text-label-md text-on-surface-variant">·</span>
        <span className="text-label-md text-on-surface-variant">
          {group.rules.length} reglas
        </span>
      </div>

      {/* Rules list */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-outline-variant)30" }}>
        {group.rules.map((rule, idx) => (
          <DuplicateRuleRow
            key={rule.id}
            rule={rule}
            scope={scope}
            isLast={idx === group.rules.length - 1}
            sameDate={(dateCounts.get(rule.next_run) ?? 0) >= 2}
          />
        ))}
      </div>
    </div>
  );
}

function DuplicateRuleRow({
  rule,
  scope,
  isLast,
  sameDate,
}: {
  rule: RecurringRuleRow;
  scope: Scope;
  isLast: boolean;
  sameDate: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleRecurringRule(rule.id, !rule.is_active, scope);
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "¿Eliminar esta regla recurrente? Las transacciones pendientes ya generadas no se eliminarán.",
      )
    )
      return;
    startTransition(async () => {
      await deleteRecurringRule(rule.id, scope);
    });
  }

  const accent = rule.kind === "income" ? "var(--color-secondary-fixed)" : "var(--color-error)";
  const catColor = rule.category?.color ?? accent;
  const displayName = rule.description || rule.category?.name || "Sin nombre";
  const categoryName = rule.category?.name;

  return (
    <div
      className="flex items-center gap-sm px-md py-sm bg-surface-container-low hover:bg-surface-container transition-colors"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--color-outline-variant)20",
        opacity: isPending ? 0.5 : 1,
      }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: catColor + "20" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: catColor }}>
          {rule.category?.icon ?? (rule.kind === "income" ? "trending_up" : "shopping_cart")}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-xs flex-wrap">
          <span className="text-body-sm text-on-surface truncate">{displayName}</span>
          {categoryName && displayName !== categoryName && (
            <span className="text-label-md text-on-surface-variant truncate">· {categoryName}</span>
          )}
          {sameDate && (
            <span
              className="shrink-0 text-label-md px-xs rounded"
              style={{ background: "var(--color-error)20", color: "var(--color-error)", fontSize: 10 }}
            >
              mismo día
            </span>
          )}
        </div>
        <div className="flex items-center gap-sm text-label-md text-on-surface-variant flex-wrap">
          <span>{rule.account?.name ?? "—"}</span>
          <span>·</span>
          <span>Próx. {formatDay(rule.next_run)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-xs shrink-0">
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
  );
}
