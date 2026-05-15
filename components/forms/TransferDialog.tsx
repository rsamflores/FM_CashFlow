"use client";

import { useState, useTransition, useEffect } from "react";
import { createTransfer, updateTransfer, type TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import { formatCurrency } from "@/lib/format";

type Props = {
  open: boolean;
  onClose: () => void;
  allAccounts: AccountRow[];
  editTransfer?: TransactionRow;   // expense leg
  editTransferTo?: TransactionRow; // income leg
};

export function TransferDialog({ open, onClose, allAccounts, editTransfer, editTransferTo }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("monthly");

  useEffect(() => {
    if (open) {
      if (editTransfer) {
        setFromId(editTransfer.account_id);
        setToId(editTransferTo?.account_id ?? "");
        setAmount(editTransfer.amount?.toString() ?? "");
        setOccurredOn(editTransfer.occurred_on);
        setDescription(editTransfer.description ?? "");
        setIsRecurring(!!editTransfer.recurring_rule_id);
        setFrequency("monthly");
      } else {
        setFromId("");
        setToId("");
        setAmount("");
        setOccurredOn(new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
        setDescription("");
        setIsRecurring(false);
        setFrequency("monthly");
      }
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTransfer?.id]);

  if (!open) return null;

  const fromAccount = allAccounts.find((a) => a.id === fromId);
  const toAccount = allAccounts.find((a) => a.id === toId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("from_account_id", fromId);
    fd.set("to_account_id", toId);
    fd.set("amount", amount);
    fd.set("occurred_on", occurredOn);
    fd.set("description", description);
    fd.set("is_recurring", isRecurring ? "true" : "false");
    fd.set("frequency", frequency);
    startTransition(async () => {
      const result = editTransfer
        ? await updateTransfer(editTransfer.transfer_id!, fd)
        : await createTransfer(fd);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  // Group accounts by scope for the selects
  const personalAccounts = allAccounts.filter((a) => a.scope === "personal");
  const businessAccounts = allAccounts.filter((a) => a.scope === "business");

  function AccountSelect({
    value,
    onChange,
    exclude,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    exclude?: string;
    label: string;
  }) {
    return (
      <div className="flex flex-col gap-xs">
        <label className="text-label-md text-on-surface-variant">{label} *</label>
        <select
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
        >
          <option value="" disabled>Selecciona una cuenta</option>
          {personalAccounts.length > 0 && (
            <optgroup label="Personal">
              {personalAccounts
                .filter((a) => a.id !== exclude)
                .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
          )}
          {businessAccounts.length > 0 && (
            <optgroup label="Empresarial">
              {businessAccounts
                .filter((a) => a.id !== exclude)
                .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>
    );
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
        style={{ maxWidth: 440, margin: "0 16px", maxHeight: "90vh" }}
      >
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>swap_horiz</span>
            <h2 className="text-title-md text-on-surface">{editTransfer ? "Editar transferencia" : "Transferencia"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="p-lg flex flex-col gap-md overflow-y-auto">
          <AccountSelect
            label="Cuenta origen (sale dinero)"
            value={fromId}
            onChange={setFromId}
            exclude={toId}
          />

          {/* Arrow divider */}
          <div className="flex items-center justify-center gap-md -my-xs">
            <div className="flex-1 h-px bg-outline-variant/20" />
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>arrow_downward</span>
            <div className="flex-1 h-px bg-outline-variant/20" />
          </div>

          <AccountSelect
            label="Cuenta destino (entra dinero)"
            value={toId}
            onChange={setToId}
            exclude={fromId}
          />

          {/* Summary pill */}
          {fromAccount && toAccount && (
            <div className="rounded-xl bg-surface-container-high border border-outline-variant/10 p-sm flex flex-col gap-xs">
              <div className="flex items-center gap-xs min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: fromAccount.color ?? "var(--color-outline)" }} />
                <span className="text-label-md text-on-surface-variant truncate flex-1">{fromAccount.name}</span>
                <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: 14 }}>arrow_downward</span>
                <span className="text-label-md text-on-surface-variant truncate flex-1 text-right">{toAccount.name}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: toAccount.color ?? "var(--color-outline)" }} />
              </div>
              {fromAccount.scope !== toAccount.scope && (
                <div className="flex justify-center">
                  <span className="text-label-md font-bold text-tertiary-fixed bg-tertiary-container/20 px-sm py-[2px] rounded-full">
                    entre secciones
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Monto (USD) *</label>
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

          {/* Date */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Fecha *</label>
            <input
              type="date"
              required
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Descripción (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Depósito de efectivo"
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
          </div>

          {/* Recurring — only for new transfers */}
          {!editTransfer && <div className="flex flex-col gap-sm">
            <label className="flex items-center gap-sm cursor-pointer select-none">
              <div
                onClick={() => setIsRecurring(!isRecurring)}
                className="relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0"
                style={{ background: isRecurring ? "var(--color-primary-container)" : "var(--color-surface-container-highest)" }}
              >
                <div
                  className="absolute top-1 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: isRecurring ? "var(--color-on-primary-container)" : "var(--color-outline)",
                    left: isRecurring ? "calc(100% - 20px)" : "4px",
                  }}
                />
              </div>
              <span className="text-body-sm text-on-surface">Transferencia recurrente</span>
            </label>

            {isRecurring && (
              <div className="flex flex-col gap-xs">
                <label className="text-label-md text-on-surface-variant">Frecuencia</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
                <p className="text-label-md text-on-surface-variant flex items-center gap-xs">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>event_repeat</span>
                  Se realizará el día {occurredOn ? new Date(occurredOn + "T12:00:00").getDate() : "—"} de cada{" "}
                  {frequency === "monthly" ? "mes" : frequency === "yearly" ? "año" : frequency === "weekly" ? "semana" : "quincena"}
                </p>
              </div>
            )}
          </div>}

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
              className="h-10 px-lg rounded-full bg-primary-container text-on-primary-container hover:opacity-90 disabled:opacity-50 transition-all text-body-sm font-bold flex items-center gap-xs"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>swap_horiz</span>
              {isPending ? "Guardando…" : editTransfer ? "Guardar cambios" : "Transferir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
