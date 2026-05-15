"use client";

import { useState, useTransition, useEffect } from "react";
import { createTransaction, updateTransaction, createTransfer, type TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import { formatCurrency } from "@/lib/format";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  open: boolean;
  onClose: () => void;
  accounts: AccountRow[];
  categories: CategoryRow[];
  usedByAccount?: Record<string, number>;
  editTransaction?: TransactionRow;
  defaultKind?: "income" | "expense";
  personalCashAccounts?: AccountRow[];
  taxAccounts?: AccountRow[];
  creditCardAccounts?: AccountRow[];
  forceConfirmed?: boolean;
  forceAffectsBalance?: boolean;
  filteredCategoryIds?: string[];
  lockedAccountId?: string;
};

export function TransactionDialog({
  scope,
  open,
  onClose,
  accounts,
  categories,
  editTransaction,
  defaultKind = "expense",
  usedByAccount = {},
  personalCashAccounts = [],
  taxAccounts = [],
  creditCardAccounts = [],
  forceConfirmed = false,
  forceAffectsBalance = false,
  filteredCategoryIds,
  lockedAccountId,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

  // All fields are controlled so edit pre-fill works reliably
  const [kind, setKind] = useState<"income" | "expense">(editTransaction?.kind ?? defaultKind);
  const [amount, setAmount] = useState(editTransaction?.amount?.toString() ?? "");
  const [occurredOn, setOccurredOn] = useState(editTransaction?.occurred_on ?? today);
  const [selectedAccountId, setSelectedAccountId] = useState(lockedAccountId ?? editTransaction?.account_id ?? "");
  const [categoryId, setCategoryId] = useState(editTransaction?.category_id ?? "");
  const [description, setDescription] = useState(editTransaction?.description ?? "");
  const [isPlanned, setIsPlanned] = useState(editTransaction?.is_planned ?? false);
  const [affectsBalance, setAffectsBalance] = useState(editTransaction?.affects_balance ?? true);
  const [isRecurring, setIsRecurring] = useState(!!editTransaction?.recurring_rule_id);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly" | "yearly">("monthly");
  const [ivaAccountId, setIvaAccountId] = useState(taxAccounts[0]?.id ?? "");
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  const [isCardPayment, setIsCardPayment] = useState(false);
  const [cardPaymentTargetId, setCardPaymentTargetId] = useState(creditCardAccounts[0]?.id ?? "");

  // Reset all fields when the dialog opens (handles both new and edit)
  useEffect(() => {
    if (open) {
      setKind(editTransaction?.kind ?? defaultKind);
      setAmount(editTransaction?.amount?.toString() ?? "");
      setOccurredOn(editTransaction?.occurred_on ?? today);
      setSelectedAccountId(lockedAccountId ?? editTransaction?.account_id ?? "");
      setCategoryId(editTransaction?.category_id ?? "");
      setDescription(editTransaction?.description ?? "");
      setIsPlanned(editTransaction?.is_planned ?? false);
      setAffectsBalance(editTransaction?.affects_balance ?? true);
      setIsRecurring(!!editTransaction?.recurring_rule_id);
      setFrequency("monthly");
      setIvaAccountId(taxAccounts[0]?.id ?? "");
      setIsTaxExempt(false);
      setIsCardPayment(false);
      setCardPaymentTargetId(creditCardAccounts[0]?.id ?? "");
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTransaction?.id]);

  // Reset category when kind changes (avoid selecting cross-kind category)
  useEffect(() => {
    const currentCatKind = categories.find((c) => c.id === categoryId)?.kind;
    if (currentCatKind && currentCatKind !== kind) setCategoryId("");
  }, [kind, categories, categoryId]);

  // Sync tax-exempt flag with selected category — reset to false if category isn't exempt
  useEffect(() => {
    if (scope === "business" && kind === "income") {
      const cat = categories.find((c) => c.id === categoryId);
      setIsTaxExempt(!!cat?.is_tax_exempt);
    }
  }, [categoryId, categories, scope, kind]);

  const filteredCategories = categories.filter(
    (c) => c.kind === kind && (!filteredCategoryIds || filteredCategoryIds.includes(c.id)),
  );
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const isCreditCard = selectedAccount?.type === "credit_card";
  const usedAmount = usedByAccount[selectedAccountId] ?? 0;
  const creditLimit = selectedAccount?.credit_limit ?? 0;
  const available = creditLimit - usedAmount;
  const usedPct = creditLimit > 0 ? Math.min((usedAmount / creditLimit) * 100, 100) : 0;
  const creditBarColor = usedPct >= 90 ? "var(--color-error)" : usedPct >= 70 ? "#ffd93d" : "var(--color-secondary-fixed)";

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Card payment → create as transfer: bank account → credit card
    if (kind === "expense" && isCardPayment && !editTransaction) {
      const fd = new FormData();
      fd.set("from_account_id", selectedAccountId);
      fd.set("to_account_id", cardPaymentTargetId);
      fd.set("amount", amount);
      fd.set("occurred_on", occurredOn);
      const card = creditCardAccounts.find((c) => c.id === cardPaymentTargetId);
      fd.set("description", description || `Pago ${card?.name ?? "tarjeta"}`);
      fd.set("is_recurring", "false");
      startTransition(async () => {
        const result = await createTransfer(fd);
        if (result?.error) { setError(result.error); return; }
        onClose();
      });
      return;
    }

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("amount", amount);
    formData.set("occurred_on", occurredOn);
    formData.set("account_id", selectedAccountId);
    formData.set("category_id", categoryId);
    formData.set("description", description);
    formData.set("is_planned", isPlanned ? "true" : "false");
    formData.set("affects_balance", forceAffectsBalance ? "false" : affectsBalance ? "true" : "false");
    formData.set("is_recurring", isRecurring ? "true" : "false");
    formData.set("frequency", frequency);
    if (forceConfirmed) formData.set("force_confirmed", "true");
    if (scope === "business" && kind === "income") {
      formData.set("is_tax_exempt", isTaxExempt ? "true" : "false");
      // Pass preferred IVA account if explicitly selected; server will auto-find if absent
      if (ivaAccountId && !isTaxExempt) {
        formData.set("iva_account_id", ivaAccountId);
      }
    }
    startTransition(async () => {
      const result = editTransaction
        ? await updateTransaction(editTransaction.id, scope, formData)
        : await createTransaction(scope, formData);
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
        style={{ maxWidth: 480, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-lg border-b border-outline-variant/10">
          <h2 className="text-title-md text-on-surface">
            {editTransaction ? "Editar transacción" : "Nueva transacción"}
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
          {/* Kind toggle */}
          <div className="flex bg-surface-container-high rounded-full p-xs gap-xs">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="flex-1 h-9 rounded-full text-label-md font-bold transition-colors"
                style={
                  kind === k
                    ? {
                        background: k === "income"
                          ? "var(--color-secondary-container)"
                          : "var(--color-error-container)",
                        color: k === "income"
                          ? "var(--color-on-secondary-container)"
                          : "var(--color-on-error-container)",
                      }
                    : { color: "var(--color-on-surface-variant)" }
                }
              >
                {k === "income" ? "Ingreso" : "Egreso"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Monto (USD) *</label>
            <div className="relative">
              <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant text-body-lg font-bold">$</span>
              <input
                name="amount"
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

          {/* IVA panel — business income only */}
          {scope === "business" && kind === "income" && (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-md flex flex-col gap-sm">
              {/* Exempt toggle */}
              <label className="flex items-center justify-between gap-md cursor-pointer">
                <div className="flex items-center gap-xs">
                  <span className="material-symbols-outlined text-tertiary-fixed" style={{ fontSize: 16 }}>receipt_long</span>
                  <span className="text-label-md font-bold text-tertiary-fixed">IVA</span>
                </div>
                <div className="flex items-center gap-sm">
                  <span className="text-label-md text-on-surface-variant">
                    {isTaxExempt ? "Exento de impuestos" : "Aplica IVA"}
                  </span>
                  <div
                    onClick={() => setIsTaxExempt(!isTaxExempt)}
                    className="relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0"
                    style={{ background: isTaxExempt ? "var(--color-surface-container-highest)" : "var(--color-tertiary-container)" }}
                  >
                    <div
                      className="absolute top-1 w-4 h-4 rounded-full transition-all"
                      style={{
                        background: isTaxExempt ? "var(--color-outline)" : "var(--color-on-tertiary-container)",
                        left: isTaxExempt ? "4px" : "calc(100% - 20px)",
                      }}
                    />
                  </div>
                </div>
              </label>

              {!isTaxExempt && Number(amount) > 0 && (
                <>
                  {(() => {
                    const net = Number(amount) || 0;
                    const subtotal = Math.round(net * 1.11112 * 100) / 100;
                    const iva = Math.round(subtotal * 0.13 * 100) / 100;
                    const total = Math.round((net + iva) * 100) / 100;
                    return (
                      <div className="flex flex-col gap-xs text-label-md border-t border-outline-variant/10 pt-sm">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Monto ingresado</span>
                          <span className="text-on-surface">{formatCurrency(net)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Subtotal (×1.11112)</span>
                          <span className="text-on-surface">{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span className="text-tertiary-fixed">IVA 13%</span>
                          <span className="text-tertiary-fixed">+{formatCurrency(iva)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t border-outline-variant/10 pt-xs">
                          <span className="text-on-surface">Total a recibir</span>
                          <span className="text-secondary-fixed">{formatCurrency(total)}</span>
                        </div>
                      </div>
                    );
                  })()}
                  {taxAccounts.length > 0 ? (
                    <div className="flex flex-col gap-xs">
                      <label className="text-label-md text-on-surface-variant">Transferir IVA a</label>
                      <select
                        value={ivaAccountId}
                        onChange={(e) => setIvaAccountId(e.target.value)}
                        className="h-10 px-md rounded-lg bg-surface-container text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none text-label-md"
                      >
                        <option value="">No transferir IVA</option>
                        {taxAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-label-md text-on-surface-variant">
                      Marca una cuenta como "cuenta de impuestos" en Cuentas para auto-transferir el IVA.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Date */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">
              {isRecurring && kind === "income" ? "Día de cobro mensual *" : "Fecha *"}
            </label>
            <input
              name="occurred_on"
              type="date"
              required
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
            {isRecurring && kind === "income" && occurredOn && (
              <div className="flex items-center gap-xs pt-xs">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>event_repeat</span>
                <p className="text-label-md text-on-surface-variant">
                  Se generará un pendiente el{" "}
                  <strong className="text-primary">
                    día {new Date(occurredOn + "T12:00:00").getDate()} de cada{" "}
                    {frequency === "monthly" ? "mes" : frequency === "yearly" ? "año" : frequency === "weekly" ? "semana" : "quincena"}
                  </strong>
                </p>
              </div>
            )}
          </div>

          {/* Account */}
          {lockedAccountId ? (
            <input type="hidden" name="account_id" value={lockedAccountId} />
          ) : (
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Cuenta *</label>
            {accounts.length === 0 ? (
              <p className="text-body-sm text-error">Crea una cuenta primero.</p>
            ) : (
              <>
                <select
                  name="account_id"
                  required
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
                >
                  <option value="" disabled>Selecciona una cuenta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                  {scope === "business" && kind === "income" && personalCashAccounts.length > 0 && (
                    <optgroup label="── Efectivo personal ──">
                      {personalCashAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} (Personal)</option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {isCreditCard && selectedAccountId && (
                  <div className="rounded-xl p-md border border-outline-variant/20 bg-surface-container-high flex flex-col gap-sm">
                    <div className="flex justify-between text-label-md">
                      <span className="text-on-surface-variant">Límite</span>
                      <span className="text-on-surface-variant">Usado</span>
                      <span className="font-bold" style={{ color: creditBarColor }}>Disponible</span>
                    </div>
                    <div className="flex justify-between text-body-sm font-bold">
                      <span className="text-on-surface">{formatCurrency(creditLimit)}</span>
                      <span className="text-error">{formatCurrency(usedAmount)}</span>
                      <span style={{ color: creditBarColor }}>{formatCurrency(available)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${usedPct}%`, background: creditBarColor }}
                      />
                    </div>
                    <p className="text-label-md text-on-surface-variant text-right">
                      {usedPct.toFixed(1)}% utilizado
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* Card payment toggle — expenses only, personal scope, non-editing */}
          {kind === "expense" && scope === "personal" && creditCardAccounts.length > 0 && !editTransaction && (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-md flex flex-col gap-sm">
              <label className="flex items-center gap-md cursor-pointer">
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    checked={isCardPayment}
                    onChange={(e) => setIsCardPayment(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 rounded-full bg-surface-container-highest peer-checked:bg-primary-container transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-outline peer-checked:bg-on-primary-container peer-checked:translate-x-4 transition-all" />
                </div>
                <div>
                  <div className="flex items-center gap-xs">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--color-primary)" }}>credit_card</span>
                    <p className="text-body-sm text-on-surface font-bold">Pago de tarjeta de crédito</p>
                  </div>
                  <p className="text-label-md text-on-surface-variant">
                    Reducirá el saldo usado de la tarjeta al confirmar
                  </p>
                </div>
              </label>

              {isCardPayment && (
                <div className="flex flex-col gap-xs border-t border-outline-variant/10 pt-sm">
                  <label className="text-label-md text-on-surface-variant">Tarjeta a pagar *</label>
                  <select
                    value={cardPaymentTargetId}
                    onChange={(e) => setCardPaymentTargetId(e.target.value)}
                    className="h-12 px-md rounded-lg bg-surface-container text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
                  >
                    <option value="" disabled>Selecciona una tarjeta</option>
                    {creditCardAccounts.map((c) => {
                      const limit = c.credit_limit ?? 0;
                      const used = Math.max(usedByAccount[c.id] ?? 0, 0);
                      const available = Math.max(limit - used, 0);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} — {formatCurrency(available)} disponible
                        </option>
                      );
                    })}
                  </select>
                  {cardPaymentTargetId && (() => {
                    const card = creditCardAccounts.find((c) => c.id === cardPaymentTargetId);
                    if (!card) return null;
                    const limit = card.credit_limit ?? 0;
                    const used = Math.max(usedByAccount[card.id] ?? 0, 0);
                    const available = Math.max(limit - used, 0);
                    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                    const barColor = pct >= 90 ? "var(--color-error)" : pct >= 70 ? "#ffd93d" : "var(--color-secondary-fixed)";
                    const payAmt = Number(amount) || 0;
                    const newUsed = Math.max(used - payAmt, 0);
                    const newPct = limit > 0 ? Math.min((newUsed / limit) * 100, 100) : 0;
                    return (
                      <div className="rounded-lg p-sm border border-outline-variant/10 flex flex-col gap-xs text-label-md">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Usado actual</span>
                          <span className="font-bold" style={{ color: "var(--color-error)" }}>{formatCurrency(used)}</span>
                        </div>
                        {payAmt > 0 && (
                          <div className="flex justify-between">
                            <span className="text-on-surface-variant">Después del pago</span>
                            <span className="font-bold" style={{ color: barColor }}>{formatCurrency(newUsed)} ({newPct.toFixed(0)}%)</span>
                          </div>
                        )}
                        <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Disponible actual</span>
                          <span style={{ color: barColor }}>{formatCurrency(available)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Category — hidden when paying a credit card (it's a transfer) */}
          {!isCardPayment && (
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Categoría *</label>
            {filteredCategories.length === 0 ? (
              <p className="text-body-sm text-error">
                No hay categorías de {kind === "income" ? "ingresos" : "egresos"}. Créalas primero.
              </p>
            ) : (
              <select
                name="category_id"
                required={!isCardPayment}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface focus:ring-2 focus:ring-primary-container outline-none border-none"
              >
                <option value="" disabled>Selecciona una categoría</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          )}

          {/* Description */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">Descripción (opcional)</label>
            <input
              name="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Pago de factura eléctrica"
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
          </div>

          {/* Recurring — only for new transactions, not card payments */}
          {!editTransaction && !isCardPayment && (
            <div className="flex flex-col gap-sm">
              <label className="flex items-center gap-md cursor-pointer">
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 rounded-full bg-surface-container-highest peer-checked:bg-primary-container transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-outline peer-checked:bg-on-primary-container peer-checked:translate-x-4 transition-all" />
                </div>
                <div>
                  <p className="text-body-sm text-on-surface font-bold">Transacción recurrente</p>
                  <p className="text-label-md text-on-surface-variant">
                    {kind === "income"
                      ? "Se generará automáticamente y requerirá confirmación"
                      : "Se registrará automáticamente en cada período"}
                  </p>
                </div>
              </label>

              {isRecurring && (
                <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-md flex flex-col gap-sm">
                  <label className="text-label-md text-on-surface-variant">Frecuencia</label>
                  <div className="grid grid-cols-2 gap-xs">
                    {(["weekly","biweekly","monthly","yearly"] as const).map((f) => {
                      const labels = { weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual", yearly: "Anual" };
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          className="h-9 rounded-lg text-body-sm font-bold transition-colors"
                          style={
                            frequency === f
                              ? { background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }
                              : { background: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }
                          }
                        >
                          {labels[f]}
                        </button>
                      );
                    })}
                  </div>
                  {kind === "income" && (
                    <div className="flex items-start gap-sm pt-xs border-t border-outline-variant/10">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: 16, marginTop: 2 }}>info</span>
                      <p className="text-label-md text-on-surface-variant">
                        Cada ingreso generado deberá marcarse como <strong className="text-primary">recibido</strong> antes de sumarse al saldo.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Affects balance — only for expenses, hidden when forceAffectsBalance */}
          {kind === "expense" && !forceAffectsBalance && (
            <label className="flex items-center gap-md cursor-pointer">
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  checked={!affectsBalance}
                  onChange={(e) => setAffectsBalance(!e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 rounded-full bg-surface-container-highest peer-checked:bg-error-container transition-colors" />
                <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-outline peer-checked:bg-on-error-container peer-checked:translate-x-4 transition-all" />
              </div>
              <div>
                <p className="text-body-sm text-on-surface font-bold">Gasto externo (no debitar cuenta)</p>
                <p className="text-label-md text-on-surface-variant">
                  El dinero ya salió por otro medio — queda registrado para reportes sin afectar el saldo
                </p>
              </div>
            </label>
          )}

          {/* Planned */}
          <label className="flex items-center gap-md cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={isPlanned}
                onChange={(e) => setIsPlanned(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 rounded-full bg-surface-container-highest peer-checked:bg-primary-container transition-colors" />
              <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-outline peer-checked:bg-on-primary-container peer-checked:translate-x-4 transition-all" />
            </div>
            <div>
              <p className="text-body-sm text-on-surface font-bold">Gasto previsto</p>
              <p className="text-label-md text-on-surface-variant">Ya estaba contemplado en el presupuesto</p>
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
              {isPending ? "Guardando…" : editTransaction ? "Guardar cambios" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
