"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TransactionDialog } from "@/components/forms/TransactionDialog";
import { TransferDialog } from "@/components/forms/TransferDialog";
import { deleteTransaction, confirmTransaction, generateRetroactiveIvaTransfers, type TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import type { ReimbursementMeta } from "@/lib/actions/reimbursements";
import { formatCurrency, formatDay, formatMonth } from "@/lib/format";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  usedByAccount: Record<string, number>;
  personalCashAccounts?: AccountRow[];
  allAccounts?: AccountRow[];
  taxAccounts?: AccountRow[];
  creditCardAccounts?: AccountRow[];
  selectedMonth: string;
  currentMonth: string;
  reimbursementByTxId?: Record<string, ReimbursementMeta>;
  coveredExpenseIds?: string[];
};

export function TransactionsClient({ scope, transactions, accounts, categories, usedByAccount, personalCashAccounts = [], allAccounts = [], taxAccounts = [], creditCardAccounts = [], selectedMonth, currentMonth, reimbursementByTxId = {}, coveredExpenseIds = [] }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editTx, setEditTx] = useState<TransactionRow | undefined>();
  const [editTransfer, setEditTransfer] = useState<TransactionRow | undefined>();
  const [editTransferTo, setEditTransferTo] = useState<TransactionRow | undefined>();
  const [defaultKind, setDefaultKind] = useState<"income" | "expense">("expense");
  const [retroIvaLoading, setRetroIvaLoading] = useState(false);
  const [retroIvaResult, setRetroIvaResult] = useState<{ created?: number; error?: string } | null>(null);

  function openCreate(kind: "income" | "expense" = "expense") {
    setEditTx(undefined);
    setDefaultKind(kind);
    setDialogOpen(true);
  }

  function openEdit(tx: TransactionRow) {
    setEditTx(tx);
    setDialogOpen(true);
  }

  async function handleDelete(tx: TransactionRow) {
    if (!confirm("¿Eliminar esta transacción?")) return;
    await deleteTransaction(tx.id, scope);
  }

  async function handleConfirm(tx: TransactionRow) {
    await confirmTransaction(tx.id, scope);
  }

  function openEditTransfer(tx: TransactionRow) {
    const toTx = transactions.find(
      (t) => t.transfer_id === tx.transfer_id && t.kind === "income"
    );
    setEditTransfer(tx);
    setEditTransferTo(toTx);
    setTransferOpen(true);
  }

  function closeTransferDialog() {
    setTransferOpen(false);
    setEditTransfer(undefined);
    setEditTransferTo(undefined);
  }

  function navigateMonth(direction: -1 | 1) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const newDate = new Date(y, m - 1 + direction, 1);
    const newMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/${scope}/transactions?month=${newMonth}`);
  }

  const isCurrentMonth = selectedMonth === currentMonth;
  const monthLabel = formatMonth(`${selectedMonth}-01`);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

  const pending = transactions
    .filter((t) => !t.is_confirmed)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  const coveredSet = new Set(coveredExpenseIds);

  // Confirmed: exclude employee expenses (affects_balance=false) — they show as sub-items under the reimbursement payment
  const confirmed = transactions.filter(
    (t) => t.is_confirmed && !(t.affects_balance === false && coveredSet.has(t.id)),
  );

  // Totals: exclude transfers AND employee expenses (affects_balance=false)
  const nonTransfer = confirmed.filter((t) => !t.transfer_id && t.affects_balance !== false);
  const totalIncome = nonTransfer
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = nonTransfer
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <>
      {/* Header */}
      <header className="mb-lg">
        <div className="flex items-center justify-between gap-md mb-sm">
          {/* Month navigator */}
          <div className="flex items-center gap-xs">
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
            </button>
            <span className="text-title-md text-on-surface capitalize" style={{ minWidth: 120, textAlign: "center" }}>
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              disabled={isCurrentMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-30"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
            </button>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => router.push(`/${scope}/transactions`)}
                className="h-7 px-sm rounded-full text-label-md font-bold transition-colors"
                style={{ background: "var(--color-primary-container)30", color: "var(--color-primary)" }}
              >
                Hoy
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => openCreate()}
            className="flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity text-body-sm shrink-0"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Nueva transacción
          </button>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          <span className="text-secondary font-bold">+{formatCurrency(totalIncome)}</span>
          {" · "}
          <span className="text-error font-bold">-{formatCurrency(totalExpense)}</span>
          {" · "}
          <span className={`font-bold ${totalIncome - totalExpense >= 0 ? "text-on-surface" : "text-error"}`}>
            Neto {formatCurrency(totalIncome - totalExpense)}
          </span>
        </p>
      </header>

      {/* Quick kind buttons */}
      <div className="flex gap-sm mb-lg">
        <button
          type="button"
          onClick={() => openCreate("income")}
          className="flex items-center gap-xs h-9 px-md rounded-full text-body-sm font-bold transition-colors"
          style={{ background: "var(--color-secondary-container)20", color: "var(--color-secondary-fixed)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Ingreso
        </button>
        <button
          type="button"
          onClick={() => openCreate("expense")}
          className="flex items-center gap-xs h-9 px-md rounded-full text-body-sm font-bold transition-colors"
          style={{ background: "var(--color-error-container)20", color: "var(--color-error)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span>
          Egreso
        </button>
        <button
          type="button"
          onClick={() => { setEditTransfer(undefined); setEditTransferTo(undefined); setTransferOpen(true); }}
          className="flex items-center gap-xs h-9 px-md rounded-full text-body-sm font-bold transition-colors"
          style={{ background: "var(--color-primary-container)20", color: "var(--color-primary)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>swap_horiz</span>
          Transferencia
        </button>
      </div>

      {/* Retroactive IVA banner — business scope only, shown until dismissed */}
      {scope === "business" && retroIvaResult === null && (
        <div className="mb-lg rounded-2xl border p-md flex items-center gap-md"
          style={{ borderColor: "var(--color-tertiary-container)", background: "var(--color-tertiary-container)12" }}>
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 22, color: "var(--color-tertiary-fixed)" }}>receipt_long</span>
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-bold" style={{ color: "var(--color-tertiary-fixed)" }}>Generar IVA retroactivo</p>
            <p className="text-label-md text-on-surface-variant">Crea las transferencias de IVA pendientes para los ingresos existentes</p>
          </div>
          <button
            type="button"
            disabled={retroIvaLoading}
            onClick={async () => {
              setRetroIvaLoading(true);
              const res = await generateRetroactiveIvaTransfers();
              setRetroIvaResult(res as { created?: number; error?: string });
              setRetroIvaLoading(false);
            }}
            className="shrink-0 h-9 px-md rounded-full text-body-sm font-bold transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-tertiary-container)", color: "var(--color-on-tertiary-container)" }}
          >
            {retroIvaLoading ? "Procesando…" : "Ejecutar"}
          </button>
          <button type="button" onClick={() => setRetroIvaResult({ created: 0 })} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}

      {retroIvaResult && (
        <div className="mb-lg rounded-2xl border p-md flex items-center gap-md"
          style={{
            borderColor: retroIvaResult.error ? "var(--color-error)" : "var(--color-secondary-container)",
            background: retroIvaResult.error ? "var(--color-error-container)20" : "var(--color-secondary-container)20",
          }}>
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: retroIvaResult.error ? "var(--color-error)" : "var(--color-secondary-fixed)" }}>
            {retroIvaResult.error ? "error" : "check_circle"}
          </span>
          <p className="text-body-sm flex-1" style={{ color: retroIvaResult.error ? "var(--color-error)" : "var(--color-secondary-fixed)" }}>
            {retroIvaResult.error ?? `${retroIvaResult.created} transferencias de IVA generadas correctamente`}
          </p>
          <button type="button" onClick={() => setRetroIvaResult(null)} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}

      {/* Pending income (non-transfer) */}
      {pending.filter(t => t.kind === "income" && !t.transfer_id).length > 0 && (
        <div className="mb-lg rounded-2xl border border-primary/30 bg-surface-container-low overflow-hidden">
          <div className="flex items-center gap-sm px-lg py-md border-b border-primary/20"
            style={{ background: "var(--color-primary)08" }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>schedule</span>
            <h3 className="text-body-sm font-bold text-primary flex-1">
              Ingresos por confirmar ({pending.filter(t => t.kind === "income" && !t.transfer_id).length})
            </h3>
            <p className="text-label-md text-on-surface-variant">Marca como recibido para sumar al saldo</p>
          </div>
          {pending.filter(t => t.kind === "income" && !t.transfer_id).map((tx) => (
            <PendingRow key={tx.id} tx={tx} today={today} onConfirm={() => handleConfirm(tx)} onDelete={() => handleDelete(tx)} onEdit={() => openEdit(tx)} />
          ))}
        </div>
      )}

      {/* Pending expenses (non-transfer) */}
      {pending.filter(t => t.kind === "expense" && !t.transfer_id).length > 0 && (
        <div className="mb-lg rounded-2xl border border-error/30 bg-surface-container-low overflow-hidden">
          <div className="flex items-center gap-sm px-lg py-md border-b border-error/20"
            style={{ background: "var(--color-error)08" }}>
            <span className="material-symbols-outlined text-error" style={{ fontSize: 20 }}>payments</span>
            <h3 className="text-body-sm font-bold text-error flex-1">
              Egresos por pagar ({pending.filter(t => t.kind === "expense" && !t.transfer_id).length})
            </h3>
            <p className="text-label-md text-on-surface-variant">Confirma el pago para debitar la cuenta</p>
          </div>
          {pending.filter(t => t.kind === "expense" && !t.transfer_id).map((tx) => (
            <PendingRow key={tx.id} tx={tx} today={today} onConfirm={() => handleConfirm(tx)} onDelete={() => handleDelete(tx)} onEdit={() => openEdit(tx)} />
          ))}
        </div>
      )}

      {/* Pending transfers — show only the expense leg (source) to avoid duplicates */}
      {pending.filter(t => t.transfer_id && t.kind === "expense").length > 0 && (
        <div className="mb-lg rounded-2xl border border-primary/30 bg-surface-container-low overflow-hidden"
          style={{ borderColor: "var(--color-tertiary-container)" }}>
          <div className="flex items-center gap-sm px-lg py-md border-b"
            style={{ borderColor: "var(--color-tertiary-container)", background: "var(--color-tertiary-container)15" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--color-tertiary-fixed)" }}>swap_horiz</span>
            <h3 className="text-body-sm font-bold flex-1" style={{ color: "var(--color-tertiary-fixed)" }}>
              Transferencias pendientes ({pending.filter(t => t.transfer_id && t.kind === "expense").length})
            </h3>
            <p className="text-label-md text-on-surface-variant">Confirma para mover el dinero entre cuentas</p>
          </div>
          {pending.filter(t => t.transfer_id && t.kind === "expense").map((tx) => (
            <PendingRow key={tx.id} tx={tx} today={today} onConfirm={() => handleConfirm(tx)} onDelete={() => handleDelete(tx)} onEdit={() => openEditTransfer(tx)} />
          ))}
        </div>
      )}

      {/* List */}
      {confirmed.length === 0 && pending.length === 0 ? (
        <EmptyTransactions onAdd={() => openCreate()} />
      ) : confirmed.length === 0 ? null : (
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
          {/* Table header — desktop only */}
          <div className="hidden md:grid px-lg py-sm border-b border-outline-variant/10"
            style={{ gridTemplateColumns: "1fr 140px 130px 100px 72px" }}>
            <span className="text-label-md text-on-surface-variant">Descripción / Categoría</span>
            <span className="text-label-md text-on-surface-variant">Cuenta</span>
            <span className="text-label-md text-on-surface-variant">Fecha</span>
            <span className="text-label-md text-on-surface-variant text-right">Monto</span>
            <span />
          </div>

          {confirmed.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              onEdit={() => openEdit(tx)}
              onDelete={() => handleDelete(tx)}
              reimbursementMeta={reimbursementByTxId[tx.id]}
            />
          ))}
        </div>
      )}

      <TransactionDialog
        scope={scope}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        accounts={accounts}
        categories={categories}
        usedByAccount={usedByAccount}
        editTransaction={editTx}
        defaultKind={defaultKind}
        personalCashAccounts={personalCashAccounts}
        taxAccounts={taxAccounts}
        creditCardAccounts={creditCardAccounts}
      />

      <TransferDialog
        open={transferOpen}
        onClose={closeTransferDialog}
        allAccounts={allAccounts}
        editTransfer={editTransfer}
        editTransferTo={editTransferTo}
      />
    </>
  );
}

function TransactionRow({
  tx,
  onEdit,
  onDelete,
  reimbursementMeta,
}: {
  tx: TransactionRow;
  onEdit: () => void;
  onDelete: () => void;
  reimbursementMeta?: ReimbursementMeta;
}) {
  const [expanded, setExpanded] = useState(false);
  const isIncome = tx.kind === "income";
  const isTransfer = !!tx.transfer_id;
  const isReimbursementPayment = !!reimbursementMeta;
  const accent = isTransfer ? "var(--color-primary)" : isIncome ? "var(--color-secondary-fixed)" : "var(--color-error)";
  const catColor = isTransfer ? "var(--color-primary)" : isReimbursementPayment ? "var(--color-tertiary)" : (tx.category?.color ?? accent);

  const iconEl = (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: catColor + "20" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: catColor }}>
        {isTransfer ? "swap_horiz" : isReimbursementPayment ? "payments" : (tx.category?.icon ?? (isIncome ? "trending_up" : "shopping_cart"))}
      </span>
    </div>
  );
  const descEl = (
    <div className="min-w-0">
      <div className="flex items-center gap-xs">
        <p className="text-body-sm text-on-surface truncate">
          {tx.description || (isTransfer ? "Transferencia" : tx.category?.name) || "—"}
        </p>
        {isReimbursementPayment && reimbursementMeta.code && (
          <span className="text-label-md font-bold px-xs py-[2px] rounded-full shrink-0"
            style={{ background: "var(--color-tertiary)20", color: "var(--color-tertiary)" }}>
            {reimbursementMeta.code}
          </span>
        )}
      </div>
      <p className="text-label-md text-on-surface-variant">
        {isTransfer ? (isIncome ? "Transferencia entrante" : "Transferencia saliente") : isReimbursementPayment ? "Pago de reembolso" : tx.category?.name}
      </p>
    </div>
  );
  const badgeEl = (
    <>
      {!isTransfer && !isReimbursementPayment && tx.is_planned && <span className="text-label-md px-xs py-[2px] rounded-full shrink-0" style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>previsto</span>}
      {isTransfer && <span className="text-label-md px-xs py-[2px] rounded-full shrink-0" style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>transferencia</span>}
      {!isTransfer && !isReimbursementPayment && tx.kind === "expense" && !tx.affects_balance && <span className="text-label-md px-xs py-[2px] rounded-full shrink-0" style={{ background: "var(--color-outline)20", color: "var(--color-outline)" }}>externo</span>}
    </>
  );
  const actionsEl = (
    <div className="flex gap-xs">
      {isReimbursementPayment && reimbursementMeta.items.length > 0 && (
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors" title="Ver gastos">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{expanded ? "expand_less" : "expand_more"}</span>
        </button>
      )}
      <button type="button" onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors" title="Editar">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
      </button>
      <button type="button" onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors" title="Eliminar">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
      </button>
    </div>
  );

  const subItemsEl = isReimbursementPayment && expanded && reimbursementMeta.items.length > 0 && (
    <div className="border-t border-outline-variant/10 px-lg py-sm flex flex-col gap-xs"
      style={{ background: "var(--color-surface-container)" }}>
      <p className="text-label-md text-on-surface-variant mb-xs">
        {reimbursementMeta.items.length} gasto{reimbursementMeta.items.length !== 1 ? "s" : ""} incluido{reimbursementMeta.items.length !== 1 ? "s" : ""}
      </p>
      {reimbursementMeta.items.map((item) => {
        const color = item.category?.color ?? "var(--color-outline)";
        return (
          <div key={item.transactionId} className="flex items-center gap-sm text-label-md">
            <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color }}>
                {item.category?.icon ?? "receipt"}
              </span>
            </div>
            <span className="flex-1 text-on-surface truncate">
              {item.description || item.category?.name || "Gasto"}
            </span>
            <span className="text-on-surface-variant shrink-0">{formatDay(item.occurred_on)}</span>
            <span className="font-bold shrink-0" style={{ color: "var(--color-error)" }}>
              -{formatCurrency(item.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="border-t border-outline-variant/10 hover:bg-surface-container transition-colors">
      {/* Desktop row */}
      <div className="hidden md:grid px-lg py-sm items-center" style={{ gridTemplateColumns: "1fr 140px 130px 100px 72px" }}>
        <div className="flex items-center gap-sm min-w-0">{iconEl}{descEl}{badgeEl}</div>
        <div className="flex items-center gap-xs">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: tx.account?.color ?? "var(--color-outline)" }} />
          <span className="text-body-sm text-on-surface-variant truncate">{tx.account?.name ?? "—"}</span>
        </div>
        <span className="text-body-sm text-on-surface-variant">{formatDay(tx.occurred_on)}</span>
        <span className="text-body-sm font-bold text-right" style={{ color: accent }}>
          {isTransfer ? "" : (isIncome ? "+" : "-")}{formatCurrency(tx.amount)}
        </span>
        <div className="flex gap-xs justify-end">{actionsEl}</div>
      </div>

      {/* Mobile card */}
      <div className="flex md:hidden items-center gap-sm px-md py-sm">
        {iconEl}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-xs flex-wrap">
            <p className="text-body-sm text-on-surface truncate">
              {tx.description || (isTransfer ? "Transferencia" : tx.category?.name) || "—"}
            </p>
            {isReimbursementPayment && reimbursementMeta.code && (
              <span className="text-label-md font-bold px-xs py-[2px] rounded-full shrink-0"
                style={{ background: "var(--color-tertiary)20", color: "var(--color-tertiary)" }}>
                {reimbursementMeta.code}
              </span>
            )}
            {badgeEl}
          </div>
          <div className="flex items-center gap-xs mt-[2px]">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: tx.account?.color ?? "var(--color-outline)" }} />
            <span className="text-label-md text-on-surface-variant">{tx.account?.name ?? "—"}</span>
            <span className="text-label-md text-on-surface-variant/50">·</span>
            <span className="text-label-md text-on-surface-variant">{formatDay(tx.occurred_on)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-xs shrink-0">
          <span className="text-body-sm font-bold" style={{ color: accent }}>
            {isTransfer ? "" : (isIncome ? "+" : "-")}{formatCurrency(tx.amount)}
          </span>
          <div className="flex gap-xs">{actionsEl}</div>
        </div>
      </div>

      {subItemsEl}
    </div>
  );
}

function PendingRow({
  tx,
  today,
  onConfirm,
  onDelete,
  onEdit,
}: {
  tx: TransactionRow;
  today: string;
  onConfirm: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const isOverdue = tx.occurred_on < today;
  const isExpense = tx.kind === "expense";
  const isTransfer = !!tx.transfer_id;
  const catColor = isTransfer
    ? "var(--color-tertiary-fixed)"
    : tx.category?.color ?? (isExpense ? "var(--color-error)" : "var(--color-secondary-fixed)");

  const btnStyle = isTransfer
    ? { background: "var(--color-tertiary-container)", color: "var(--color-on-tertiary-container)" }
    : isExpense
    ? { background: "var(--color-error-container)", color: "var(--color-on-error-container)" }
    : { background: "var(--color-secondary-container)", color: "var(--color-on-secondary-container)" };

  const btnIcon = isTransfer ? "check_circle" : isExpense ? "payments" : "check_circle";
  const btnLabel = isTransfer ? "Realizada" : isExpense ? "Pagado" : "Recibido";
  const amountColor = isTransfer
    ? "var(--color-primary)"
    : isExpense ? "var(--color-error)" : "var(--color-secondary-fixed)";

  const iconEl = (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: catColor + "20" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: catColor }}>
        {isTransfer ? "swap_horiz" : tx.category?.icon ?? (isExpense ? "trending_down" : "trending_up")}
      </span>
    </div>
  );

  const textEl = (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-xs flex-wrap">
        <p className="text-body-sm text-on-surface font-bold truncate">
          {tx.description || (isTransfer ? "Transferencia" : tx.category?.name) || "—"}
        </p>
        {isOverdue && (
          <span
            className="shrink-0 text-label-md font-bold px-xs py-[2px] rounded-full"
            style={{ background: "var(--color-error-container)", color: "#ffffff" }}
          >
            ATRASADA
          </span>
        )}
      </div>
      <p className="text-label-md text-on-surface-variant">
        {tx.account?.name} · {formatDay(tx.occurred_on)}
        {tx.recurring_rule_id && (
          <span className="ml-xs font-bold" style={{ color: "var(--color-primary)" }}>
            · recurrente
          </span>
        )}
      </p>
    </div>
  );

  const amountEl = (
    <span className="text-body-sm font-bold shrink-0" style={{ color: amountColor }}>
      {isTransfer ? "" : isExpense ? "-" : "+"}{formatCurrency(tx.amount)}
    </span>
  );

  return (
    <div className="border-t border-outline-variant/10 hover:bg-surface-container transition-colors">
      {/* Desktop */}
      <div className="hidden md:flex items-center gap-md px-lg py-sm">
        {iconEl}
        {textEl}
        {amountEl}
        <button
          type="button"
          onClick={onConfirm}
          className="flex items-center gap-xs h-8 px-md rounded-full text-body-sm font-bold transition-colors shrink-0"
          style={btnStyle}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{btnIcon}</span>
          {btnLabel}
        </button>
        <button type="button" onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors shrink-0" title="Editar">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
        </button>
        <button type="button" onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors shrink-0" title="Eliminar">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      </div>

      {/* Mobile */}
      <div className="flex md:hidden items-center gap-sm px-md py-sm">
        {iconEl}
        {textEl}
        <div className="flex flex-col items-end gap-xs shrink-0">
          {amountEl}
          <div className="flex gap-xs">
            <button
              type="button"
              onClick={onConfirm}
              className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant transition-colors shrink-0"
              style={btnStyle}
              title={btnLabel}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{btnIcon}</span>
            </button>
            <button type="button" onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors shrink-0" title="Editar">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
            </button>
            <button type="button" onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors shrink-0" title="Eliminar">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyTransactions({ onAdd }: { onAdd: () => void }) {
  return (
    <section
      className="flex flex-col items-center justify-center text-center py-xl mx-auto"
      style={{ maxWidth: 480 }}
    >
      <div className="w-48 h-48 bg-surface-container-low rounded-full flex items-center justify-center mb-lg relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
        <span className="material-symbols-outlined text-outline/30" style={{ fontSize: 96 }}>
          receipt_long
        </span>
      </div>
      <h3 className="text-headline-lg-mobile text-on-surface mb-sm">Sin transacciones aún</h3>
      <p className="text-body-sm text-on-surface-variant mb-lg" style={{ maxWidth: 360 }}>
        Registra tu primer ingreso o egreso para empezar a ver tu flujo de dinero.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        Nueva transacción
      </button>
    </section>
  );
}
