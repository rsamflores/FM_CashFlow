"use client";

import { useState, useTransition } from "react";
import {
  createAccount,
  updateAccount,
  type AccountRow,
} from "@/lib/actions/accounts";
import type { Scope } from "@/lib/scope";
import { COLOR_PALETTE } from "@/lib/colors";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Cuenta corriente" },
  { value: "savings", label: "Ahorro" },
  { value: "cash", label: "Efectivo" },
  { value: "credit_card", label: "Tarjeta de crédito" },
  { value: "other", label: "Otra" },
] as const;


type Props = {
  scope: Scope;
  open: boolean;
  onClose: () => void;
  editAccount?: AccountRow;
};

export function AccountDialog({ scope, open, onClose, editAccount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedColor, setSelectedColor] = useState(
    editAccount?.color ?? COLOR_PALETTE[0],
  );
  const [selectedType, setSelectedType] = useState(
    editAccount?.type ?? "checking",
  );
  const [isTaxAccount, setIsTaxAccount] = useState(editAccount?.is_tax_account ?? false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("color", selectedColor);
    formData.set("is_tax_account", isTaxAccount ? "true" : "false");
    setError(null);
    startTransition(async () => {
      const result = editAccount
        ? await updateAccount(editAccount.id, scope, formData)
        : await createAccount(scope, formData);
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
        className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full flex flex-col"
        style={{ maxWidth: 480, margin: "0 16px", maxHeight: "90dvh" }}
      >
        <div className="flex items-center justify-between p-lg border-b border-outline-variant/10 shrink-0">
          <h2 className="text-title-md text-on-surface">
            {editAccount ? "Editar cuenta" : "Nueva cuenta"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              close
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-lg flex flex-col gap-lg overflow-y-auto">
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">
              Nombre de la cuenta *
            </label>
            <input
              name="name"
              required
              defaultValue={editAccount?.name}
              placeholder="Ej: Banco Agrícola"
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">
              Tipo de cuenta *
            </label>
            <select
              name="type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as AccountRow["type"])}
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {selectedType === "credit_card" ? (
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">
                Límite de crédito (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
                <input
                  name="credit_limit"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  defaultValue={editAccount?.credit_limit ?? ""}
                  placeholder="0.00"
                  className="w-full h-12 pl-[36px] pr-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-xs">
              <label className="text-label-md text-on-surface-variant">
                Saldo inicial (USD)
              </label>
              <div className="relative">
                <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
                <input
                  name="opening_balance"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editAccount?.opening_balance ?? "0"}
                  placeholder="0.00"
                  className="w-full h-12 pl-[36px] pr-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-sm">
            <label className="text-label-md text-on-surface-variant">
              Color de la tarjeta
            </label>
            <div className="grid gap-xs" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className="w-8 h-8 rounded-full transition-all"
                  style={{
                    backgroundColor: color,
                    outline: selectedColor === color ? "2px solid white" : "2px solid transparent",
                    outlineOffset: 2,
                    transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-sm mt-xs">
              <div className="w-8 h-8 rounded-full shrink-0 border border-outline-variant/30" style={{ backgroundColor: selectedColor }} />
              <input
                type="text"
                value={selectedColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setSelectedColor(v);
                }}
                maxLength={7}
                placeholder="#000000"
                className="flex-1 h-8 px-sm rounded-lg bg-surface-container-high text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <label className="text-label-md text-on-surface-variant shrink-0">Color personalizado</label>
            </div>
          </div>

          {/* Tax account toggle */}
          <label className="flex items-center gap-sm cursor-pointer select-none">
            <div
              onClick={() => setIsTaxAccount(!isTaxAccount)}
              className="relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0"
              style={{ background: isTaxAccount ? "var(--color-tertiary-container)" : "var(--color-surface-container-highest)" }}
            >
              <div
                className="absolute top-1 w-4 h-4 rounded-full transition-all"
                style={{
                  background: isTaxAccount ? "var(--color-on-tertiary-container)" : "var(--color-outline)",
                  left: isTaxAccount ? "calc(100% - 20px)" : "4px",
                }}
              />
            </div>
            <div>
              <p className="text-body-sm text-on-surface">Cuenta de impuestos</p>
              <p className="text-label-md text-on-surface-variant">El IVA de ingresos empresariales se transferirá aquí</p>
            </div>
          </label>

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
              {isPending
                ? "Guardando…"
                : editAccount
                  ? "Guardar cambios"
                  : "Crear cuenta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
