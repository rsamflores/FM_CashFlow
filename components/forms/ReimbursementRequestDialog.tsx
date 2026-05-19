"use client";

import { useState, useTransition, useEffect } from "react";
import { createReimbursementRequest, getMyExpensesForReimbursement } from "@/lib/actions/reimbursements";
import { getMyBankAccounts, saveBankAccount, deleteBankAccount, type EmployeeBankAccount } from "@/lib/actions/employee_bank_accounts";
import type { TransactionRow } from "@/lib/actions/transactions";
import { formatCurrency, formatDay } from "@/lib/format";
import type { Scope } from "@/lib/scope";

type Props = {
  open: boolean;
  onClose: () => void;
  scope: Scope;
};

type Step = 1 | 2;

export function ReimbursementRequestDialog({ open, onClose, scope }: Props) {
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>(1);
  const [expenses, setExpenses] = useState<TransactionRow[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");
  const [accountHolder, setAccountHolder] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Saved bank accounts
  const [savedAccounts, setSavedAccounts] = useState<EmployeeBankAccount[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [saveLabel, setSaveLabel] = useState("");
  const [wantToSave, setWantToSave] = useState(false);
  const [savingAccount, startSaveTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedIds([]);
      setBankName("");
      setAccountNumber("");
      setAccountType("checking");
      setAccountHolder("");
      setNotes("");
      setError(null);
      setSuccess(false);
      setSelectedSavedId(null);
      setSaveLabel("");
      setWantToSave(false);
      // Load expenses and saved bank accounts in parallel
      setLoadingExpenses(true);
      Promise.all([
        getMyExpensesForReimbursement(scope),
        getMyBankAccounts(),
      ]).then(([exps, accounts]) => {
        setExpenses(exps);
        setSavedAccounts(accounts);
        // Auto-select default account
        const def = accounts.find((a) => a.is_default);
        if (def) applyAccount(def);
      }).catch(() => {
        setExpenses([]);
        setSavedAccounts([]);
      }).finally(() => setLoadingExpenses(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  function applyAccount(acc: EmployeeBankAccount) {
    setSelectedSavedId(acc.id);
    setBankName(acc.bank_name);
    setAccountNumber(acc.account_number);
    setAccountType(acc.account_type);
    setAccountHolder(acc.account_holder);
  }

  function clearSavedSelection() {
    setSelectedSavedId(null);
    setBankName("");
    setAccountNumber("");
    setAccountType("checking");
    setAccountHolder("");
  }

  function handleDeleteSaved(id: string) {
    setDeletingId(id);
    deleteBankAccount(id).then(() => {
      setSavedAccounts((prev) => prev.filter((a) => a.id !== id));
      if (selectedSavedId === id) clearSavedSelection();
    }).finally(() => setDeletingId(null));
  }

  function toggleExpense(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const selectedExpenses = expenses.filter((e) => selectedIds.includes(e.id));
  const totalAmount = selectedExpenses.reduce((s, e) => s + Number(e.amount), 0);

  function handleStep1Next(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedIds.length) { setError("Selecciona al menos un gasto"); return; }
    setError(null);
    setStep(2);
  }

  function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("bank_name", bankName);
    fd.set("account_number", accountNumber);
    fd.set("account_type", accountType);
    fd.set("account_holder", accountHolder);
    if (notes) fd.set("notes", notes);
    selectedIds.forEach((id) => fd.append("transaction_ids", id));

    startTransition(async () => {
      const res = await createReimbursementRequest(scope, fd);
      if ("error" in res) { setError(res.error); return; }

      // Optionally save the bank account for future use
      if (wantToSave && !selectedSavedId && saveLabel.trim()) {
        const sfd = new FormData();
        sfd.set("label", saveLabel.trim());
        sfd.set("bank_name", bankName);
        sfd.set("account_number", accountNumber);
        sfd.set("account_type", accountType);
        sfd.set("account_holder", accountHolder);
        sfd.set("is_default", savedAccounts.length === 0 ? "true" : "false");
        await saveBankAccount(sfd);
      }

      setSuccess(true);
      setTimeout(onClose, 1800);
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-md">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full rounded-2xl border border-outline-variant/10 bg-surface-container shadow-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: 520, maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>payments</span>
            <div>
              <h2 className="text-body-sm font-bold text-on-surface">Solicitar Reembolso</h2>
              <p className="text-label-md text-on-surface-variant">
                Paso {step} de 2 — {step === 1 ? "Seleccionar gastos" : "Datos bancarios"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-lg pt-md pb-sm gap-sm shrink-0">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full transition-colors"
              style={{ background: step >= s ? "var(--color-primary)" : "var(--color-outline-variant)" }}
            />
          ))}
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-xl px-lg text-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-secondary-fixed)" }}>check_circle</span>
            <p className="text-body-sm font-bold text-on-surface">Solicitud enviada</p>
            <p className="text-label-md text-on-surface-variant">
              Tu solicitud de reembolso por {formatCurrency(totalAmount)} fue enviada para revisión.
            </p>
          </div>
        ) : step === 1 ? (
          <form onSubmit={handleStep1Next} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-lg flex flex-col gap-md">
              <p className="text-label-md text-on-surface-variant">
                Selecciona los gastos que deseas incluir en esta solicitud de reembolso.
              </p>

              {loadingExpenses ? (
                <div className="flex items-center justify-center py-xl">
                  <span className="material-symbols-outlined text-on-surface-variant animate-spin" style={{ fontSize: 32 }}>progress_activity</span>
                </div>
              ) : expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-xl text-center gap-sm">
                  <span className="material-symbols-outlined text-on-surface-variant/30" style={{ fontSize: 48 }}>receipt_long</span>
                  <p className="text-body-sm text-on-surface">No hay gastos disponibles</p>
                  <p className="text-label-md text-on-surface-variant">
                    Registra gastos primero para poder solicitar un reembolso.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-sm">
                  {expenses.map((exp) => {
                    const isSelected = selectedIds.includes(exp.id);
                    const catColor = exp.category?.color ?? "var(--color-primary)";
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => toggleExpense(exp.id)}
                        className="flex items-center gap-sm rounded-xl border p-sm text-left transition-all"
                        style={{
                          borderColor: isSelected ? "var(--color-primary)" : "var(--color-outline-variant)",
                          background: isSelected ? "var(--color-primary)10" : "transparent",
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                          style={{
                            background: isSelected ? "var(--color-primary)" : "transparent",
                            border: `2px solid ${isSelected ? "var(--color-primary)" : "var(--color-outline-variant)"}`,
                          }}
                        >
                          {isSelected && (
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "white" }}>check</span>
                          )}
                        </div>

                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: catColor + "20" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: catColor }}>
                            {exp.category?.icon ?? "receipt"}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-bold text-on-surface truncate">
                            {exp.description || exp.category?.name || "Sin descripción"}
                          </p>
                          <div className="flex items-center gap-xs text-label-md text-on-surface-variant">
                            <span>{formatDay(exp.occurred_on)}</span>
                            {exp.category && (
                              <>
                                <span>·</span>
                                <span style={{ color: catColor }}>{exp.category.name}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <span className="text-body-sm font-bold text-error shrink-0">
                          {formatCurrency(Number(exp.amount))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer with total */}
            {selectedIds.length > 0 && (
              <div className="px-lg py-md border-t border-outline-variant/10 bg-surface-container-low shrink-0">
                <div className="flex items-center justify-between mb-sm">
                  <span className="text-label-md text-on-surface-variant">
                    {selectedIds.length} gasto{selectedIds.length !== 1 ? "s" : ""} seleccionado{selectedIds.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-body-sm font-bold text-error">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="px-lg pb-sm shrink-0">
                <p className="text-label-md px-sm py-xs rounded-lg" style={{ background: "var(--color-error)15", color: "var(--color-error)" }}>
                  {error}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-sm px-lg pb-lg pt-sm border-t border-outline-variant/10 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-lg rounded-full text-body-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!selectedIds.length || loadingExpenses}
                className="h-9 px-lg rounded-full text-body-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Siguiente
                <span className="material-symbols-outlined ml-xs" style={{ fontSize: 16 }}>arrow_forward</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2Submit} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-lg flex flex-col gap-md">
              {/* Summary */}
              <div
                className="rounded-xl p-md flex items-center justify-between"
                style={{ background: "var(--color-primary)10" }}
              >
                <div>
                  <p className="text-label-md text-on-surface-variant">{selectedIds.length} gasto{selectedIds.length !== 1 ? "s" : ""}</p>
                  <p className="text-title-md font-bold text-error">{formatCurrency(totalAmount)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-xs h-8 px-md rounded-full text-label-md font-bold"
                  style={{ background: "var(--color-primary)15", color: "var(--color-primary)" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                  Cambiar
                </button>
              </div>

              {/* Saved bank accounts */}
              {savedAccounts.length > 0 && (
                <div className="flex flex-col gap-xs">
                  <p className="text-label-md text-on-surface-variant">Cuentas guardadas</p>
                  {savedAccounts.map((acc) => {
                    const isSelected = selectedSavedId === acc.id;
                    return (
                      <div
                        key={acc.id}
                        className="flex items-center gap-sm rounded-xl border px-md py-sm transition-all"
                        style={{
                          borderColor: isSelected ? "var(--color-primary)" : "var(--color-outline-variant)",
                          background: isSelected ? "var(--color-primary)10" : "transparent",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => isSelected ? clearSavedSelection() : applyAccount(acc)}
                          className="flex-1 flex items-center gap-sm text-left"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: isSelected ? "var(--color-primary)20" : "var(--color-surface-container-high)" }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSelected ? "var(--color-primary)" : "var(--color-on-surface-variant)" }}>
                              account_balance
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-body-sm font-bold text-on-surface flex items-center gap-xs">
                              {acc.label}
                              {acc.is_default && (
                                <span className="text-label-md font-bold px-xs py-[2px] rounded-full"
                                  style={{ background: "var(--color-tertiary)20", color: "var(--color-tertiary)" }}>
                                  Predeterminada
                                </span>
                              )}
                            </p>
                            <p className="text-label-md text-on-surface-variant truncate">
                              {acc.bank_name} · {acc.account_type === "checking" ? "Corriente" : "Ahorros"} · {acc.account_number}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSaved(acc.id)}
                          disabled={deletingId === acc.id}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error/10 transition-colors shrink-0"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--color-error)" }}>
                            {deletingId === acc.id ? "progress_activity" : "delete"}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-sm my-xs">
                    <div className="flex-1 h-px" style={{ background: "var(--color-outline-variant)" }} />
                    <span className="text-label-md text-on-surface-variant">o ingresa manualmente</span>
                    <div className="flex-1 h-px" style={{ background: "var(--color-outline-variant)" }} />
                  </div>
                </div>
              )}

              {/* Bank name */}
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">Banco *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => { setBankName(e.target.value); setSelectedSavedId(null); }}
                  placeholder="Ej: Banco Agrícola"
                  className="w-full h-10 px-md rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-primary-container text-body-sm text-on-surface placeholder:text-on-surface-variant/40"
                />
              </div>

              {/* Account number */}
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">Número de cuenta *</label>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => { setAccountNumber(e.target.value); setSelectedSavedId(null); }}
                  placeholder="Ej: 0000-0000-0000"
                  className="w-full h-10 px-md rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-primary-container text-body-sm text-on-surface placeholder:text-on-surface-variant/40"
                />
              </div>

              {/* Account type */}
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">Tipo de cuenta *</label>
                <div className="flex gap-sm">
                  {(["checking", "savings"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAccountType(t)}
                      className="flex-1 h-10 rounded-lg border text-body-sm font-bold transition-colors"
                      style={{
                        borderColor: accountType === t ? "var(--color-primary)" : "var(--color-outline-variant)",
                        background: accountType === t ? "var(--color-primary)15" : "transparent",
                        color: accountType === t ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                      }}
                    >
                      {t === "checking" ? "Corriente" : "Ahorros"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account holder */}
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">Titular de la cuenta *</label>
                <input
                  type="text"
                  required
                  value={accountHolder}
                  onChange={(e) => { setAccountHolder(e.target.value); setSelectedSavedId(null); }}
                  placeholder="Nombre completo del titular"
                  className="w-full h-10 px-md rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-primary-container text-body-sm text-on-surface placeholder:text-on-surface-variant/40"
                />
              </div>

              {/* Save for future use — only shown when manually filling (no saved account selected) */}
              {!selectedSavedId && (
                <div
                  className="rounded-xl border p-sm flex flex-col gap-sm transition-colors"
                  style={{ borderColor: wantToSave ? "var(--color-tertiary)" : "var(--color-outline-variant)", background: wantToSave ? "var(--color-tertiary)08" : "transparent" }}
                >
                  <button
                    type="button"
                    onClick={() => setWantToSave((v) => !v)}
                    className="flex items-center gap-sm text-left"
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        background: wantToSave ? "var(--color-tertiary)" : "transparent",
                        border: `2px solid ${wantToSave ? "var(--color-tertiary)" : "var(--color-outline-variant)"}`,
                      }}
                    >
                      {wantToSave && <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--color-on-tertiary)" }}>check</span>}
                    </div>
                    <span className="text-body-sm text-on-surface">Guardar esta cuenta para futuros reembolsos</span>
                  </button>
                  {wantToSave && (
                    <input
                      type="text"
                      value={saveLabel}
                      onChange={(e) => setSaveLabel(e.target.value)}
                      placeholder='Alias (ej: "Mi cuenta BAC")'
                      className="w-full h-9 px-md rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-tertiary text-body-sm text-on-surface placeholder:text-on-surface-variant/40"
                    />
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Contexto adicional sobre los gastos..."
                  className="w-full px-md py-sm rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-primary-container text-body-sm text-on-surface placeholder:text-on-surface-variant/40 resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="px-lg pb-sm shrink-0">
                <p className="text-label-md px-sm py-xs rounded-lg" style={{ background: "var(--color-error)15", color: "var(--color-error)" }}>
                  {error}
                </p>
              </div>
            )}

            <div className="flex justify-between gap-sm px-lg pb-lg pt-sm border-t border-outline-variant/10 shrink-0">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-xs h-9 px-lg rounded-full text-body-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Atrás
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-xs h-9 px-lg rounded-full text-body-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Enviando…" : "Enviar solicitud"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
