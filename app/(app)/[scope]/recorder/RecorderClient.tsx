"use client";

import { useState } from "react";
import { TransactionDialog } from "@/components/forms/TransactionDialog";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  accounts: AccountRow[];
  categories: CategoryRow[];
  personalCashAccounts: AccountRow[];
  allAccounts: AccountRow[];
  taxAccounts: AccountRow[];
  creditCardAccounts: AccountRow[];
  usedByAccount: Record<string, number>;
};

export function RecorderClient({
  scope,
  accounts,
  categories,
  personalCashAccounts,
  allAccounts,
  taxAccounts,
  creditCardAccounts,
  usedByAccount,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultKind, setDefaultKind] = useState<"income" | "expense">("expense");
  const [lastRegistered, setLastRegistered] = useState<{ kind: "income" | "expense"; amount: string } | null>(null);

  function openDialog(kind: "income" | "expense") {
    setDefaultKind(kind);
    setDialogOpen(true);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-md py-xl">
      {/* Greeting card */}
      <div className="w-full mb-xl" style={{ maxWidth: 480 }}>
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-lg flex items-center gap-md">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "var(--color-primary)20" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: "var(--color-primary)" }}>
              edit_note
            </span>
          </div>
          <div>
            <p className="text-body-sm font-bold text-on-surface">Panel de registro</p>
            <p className="text-label-md text-on-surface-variant">
              Selecciona el tipo de transacción que deseas registrar
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-md" style={{ maxWidth: 480 }}>
        {/* Income button */}
        <button
          type="button"
          onClick={() => openDialog("income")}
          className="group rounded-2xl border p-lg flex flex-col items-center gap-md text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            borderColor: "var(--color-secondary-fixed)40",
            background: "var(--color-secondary-fixed)08",
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: "var(--color-secondary-fixed)20" }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 32, color: "var(--color-secondary-fixed)" }}
            >
              trending_up
            </span>
          </div>
          <div>
            <p className="text-title-md font-bold" style={{ color: "var(--color-secondary-fixed)" }}>
              Registrar Ingreso
            </p>
            <p className="text-label-md text-on-surface-variant mt-xs">
              Dinero que entra a la cuenta
            </p>
          </div>
          <div
            className="w-full flex items-center justify-center gap-xs h-10 rounded-full font-bold text-body-sm transition-opacity group-hover:opacity-90"
            style={{ background: "var(--color-secondary-fixed)", color: "var(--color-on-secondary)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Nuevo ingreso
          </div>
        </button>

        {/* Expense button */}
        <button
          type="button"
          onClick={() => openDialog("expense")}
          className="group rounded-2xl border p-lg flex flex-col items-center gap-md text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            borderColor: "var(--color-error)40",
            background: "var(--color-error)08",
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--color-error)20" }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 32, color: "var(--color-error)" }}
            >
              trending_down
            </span>
          </div>
          <div>
            <p className="text-title-md font-bold" style={{ color: "var(--color-error)" }}>
              Registrar Egreso
            </p>
            <p className="text-label-md text-on-surface-variant mt-xs">
              Dinero que sale de la cuenta
            </p>
          </div>
          <div
            className="w-full flex items-center justify-center gap-xs h-10 rounded-full font-bold text-body-sm transition-opacity group-hover:opacity-90"
            style={{ background: "var(--color-error)", color: "var(--color-on-error)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove</span>
            Nuevo egreso
          </div>
        </button>
      </div>

      {/* Last registered feedback */}
      {lastRegistered && (
        <div
          className="mt-xl w-full rounded-2xl border p-md flex items-center gap-sm"
          style={{
            maxWidth: 480,
            borderColor: lastRegistered.kind === "income" ? "var(--color-secondary-fixed)40" : "var(--color-error)40",
            background: lastRegistered.kind === "income" ? "var(--color-secondary-fixed)10" : "var(--color-error)10",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              color: lastRegistered.kind === "income" ? "var(--color-secondary-fixed)" : "var(--color-error)",
            }}
          >
            check_circle
          </span>
          <p className="text-body-sm font-bold" style={{ color: lastRegistered.kind === "income" ? "var(--color-secondary-fixed)" : "var(--color-error)" }}>
            {lastRegistered.kind === "income" ? "Ingreso" : "Egreso"} registrado correctamente
          </p>
        </div>
      )}

      <TransactionDialog
        scope={scope}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setLastRegistered({ kind: defaultKind, amount: "" });
          // Clear feedback after 4 seconds
          setTimeout(() => setLastRegistered(null), 4000);
        }}
        accounts={accounts}
        categories={categories}
        usedByAccount={usedByAccount}
        defaultKind={defaultKind}
        personalCashAccounts={personalCashAccounts}
        taxAccounts={taxAccounts}
        creditCardAccounts={creditCardAccounts}
      />
    </div>
  );
}
