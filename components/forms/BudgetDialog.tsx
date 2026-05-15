"use client";

import { useState, useTransition, useEffect } from "react";
import { upsertBudget, type BudgetRow } from "@/lib/actions/budgets";
import type { CategoryRow } from "@/lib/actions/categories";
import type { AccountRow } from "@/lib/actions/accounts";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  accounts: AccountRow[];
  currentMonth: string;
  editBudget?: BudgetRow;
};

export function BudgetDialog({
  scope,
  open,
  onClose,
  categories,
  accounts,
  currentMonth,
  editBudget,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(editBudget?.category_id ?? "");
  const [accountId, setAccountId] = useState(editBudget?.account_id ?? "");
  const [amount, setAmount] = useState(editBudget?.expected_amount?.toString() ?? "");
  const [note, setNote] = useState(editBudget?.note ?? "");

  useEffect(() => {
    if (open) {
      setCategoryId(editBudget?.category_id ?? "");
      setAccountId(editBudget?.account_id ?? "");
      setAmount(editBudget?.expected_amount?.toString() ?? "");
      setNote(editBudget?.note ?? "");
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editBudget?.id]);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const nonCreditAccounts = accounts.filter((a) => a.type !== "credit_card" && !a.archived_at);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("period_month", editBudget?.period_month ?? currentMonth);
    formData.set("category_id", categoryId);
    formData.set("account_id", accountId);
    formData.set("expected_amount", amount);
    formData.set("note", note);
    setError(null);
    startTransition(async () => {
      const result = await upsertBudget(scope, formData);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full"
        style={{ maxWidth: 440, margin: "0 16px" }}
      >
        <div className="flex items-center justify-between p-lg border-b border-outline-variant/10">
          <h2 className="text-title-md text-on-surface">
            {editBudget ? "Editar presupuesto" : "Nuevo presupuesto"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-lg flex flex-col gap-lg">
          {/* Category */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Categoría de egreso *</label>
            {expenseCategories.length === 0 ? (
              <p className="text-body-sm text-error">Crea categorías de egreso primero.</p>
            ) : (
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
              >
                <option value="" disabled>Selecciona una categoría</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Account */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Cuenta de débito</label>
            {nonCreditAccounts.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">Sin cuentas disponibles</p>
            ) : (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
              >
                <option value="">Sin cuenta asignada</option>
                {nonCreditAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <p className="text-label-md text-on-surface-variant">
              Cuenta de la que se debitará este gasto al ejecutarse
            </p>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Monto previsto (USD) *</label>
            <div className="relative">
              <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-12 pl-[36px] pr-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none text-body-lg font-bold"
              />
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Nota (opcional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Incluye Netflix y Spotify"
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
          </div>

          {error && <p className="text-body-sm text-error">{error}</p>}

          <div className="flex gap-sm justify-end pt-sm border-t border-outline-variant/10">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-lg rounded-full bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors text-body-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-10 px-lg rounded-full bg-primary-container text-on-primary-container hover:opacity-90 disabled:opacity-50 transition-all text-body-sm font-bold"
            >
              {isPending ? "Guardando…" : editBudget ? "Guardar cambios" : "Crear presupuesto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
