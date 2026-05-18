"use client";

import { useState } from "react";
import { AccountDialog } from "@/components/forms/AccountDialog";
import { archiveAccount, deleteAccount, type AccountRow } from "@/lib/actions/accounts";
import { formatCurrency, formatDay } from "@/lib/format";
import type { TransactionRow } from "@/lib/actions/transactions";
import type { Scope } from "@/lib/scope";

const TYPE_ICONS: Record<AccountRow["type"], string> = {
  checking: "account_balance",
  savings: "savings",
  cash: "payments",
  credit_card: "credit_card",
  other: "account_balance_wallet",
};

const TYPE_LABELS: Record<AccountRow["type"], string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  other: "Otra",
};

type Props = {
  scope: Scope;
  accounts: AccountRow[];
  netByAccount: Record<string, number>;
  usedByAccount: Record<string, number>;
  transactions: TransactionRow[];
};

export function AccountsClient({ scope, accounts, netByAccount, usedByAccount, transactions }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountRow | undefined>();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Current month income/expense per account (confirmed, non-transfer)
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthIncomeByAccount: Record<string, number> = {};
  const monthExpenseByAccount: Record<string, number> = {};
  for (const tx of transactions) {
    if (!tx.is_confirmed || tx.transfer_id) continue;
    if (!tx.occurred_on.startsWith(currentYearMonth)) continue;
    if (tx.kind === "income") {
      monthIncomeByAccount[tx.account_id] = (monthIncomeByAccount[tx.account_id] ?? 0) + Number(tx.amount);
    } else {
      monthExpenseByAccount[tx.account_id] = (monthExpenseByAccount[tx.account_id] ?? 0) + Number(tx.amount);
    }
  }

  function openCreate() {
    setEditAccount(undefined);
    setDialogOpen(true);
  }

  function openEdit(account: AccountRow) {
    setEditAccount(account);
    setDialogOpen(true);
  }

  async function handleArchive(account: AccountRow) {
    if (!confirm(`¿Archivar la cuenta "${account.name}"?`)) return;
    await archiveAccount(account.id, scope);
  }

  async function handleDelete(account: AccountRow) {
    if (!confirm(`¿Eliminar permanentemente "${account.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteAccount(account.id, scope);
  }

  const totalBalance = accounts
    .filter((a) => a.type !== "credit_card")
    .reduce((sum, a) => sum + Number(a.opening_balance) + (netByAccount[a.id] ?? 0), 0);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;
  const accountTxs = selectedAccountId
    ? transactions.filter((tx) => tx.account_id === selectedAccountId && tx.is_confirmed)
    : [];

  return (
    <>
      <header className="mb-xl flex items-end justify-between">
        <div>
          <h2 className="text-headline-lg text-on-surface">Cuentas</h2>
          <p className="text-body-sm text-on-surface-variant">
            {accounts.length} cuenta{accounts.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-secondary font-bold">
              {formatCurrency(totalBalance)}
            </span>{" "}
            saldo total
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity text-body-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            add
          </span>
          Nueva cuenta
        </button>
      </header>

      {accounts.length === 0 ? (
        <EmptyAccountsState onAdd={openCreate} />
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md md:gap-lg"
        >
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              netAmount={netByAccount[account.id] ?? 0}
              usedAmount={usedByAccount[account.id] ?? 0}
              monthIncome={monthIncomeByAccount[account.id] ?? 0}
              monthExpense={monthExpenseByAccount[account.id] ?? 0}
              isSelected={selectedAccountId === account.id}
              onSelect={() =>
                setSelectedAccountId((prev) => (prev === account.id ? null : account.id))
              }
              onEdit={() => openEdit(account)}
              onArchive={() => handleArchive(account)}
              onDelete={() => handleDelete(account)}
            />
          ))}
        </div>
      )}

      {/* Transaction history drawer */}
      {selectedAccount && (
        <AccountHistoryDrawer
          account={selectedAccount}
          transactions={accountTxs}
          netAmount={netByAccount[selectedAccount.id] ?? 0}
          usedAmount={usedByAccount[selectedAccount.id] ?? 0}
          onClose={() => setSelectedAccountId(null)}
        />
      )}

      <AccountDialog
        scope={scope}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editAccount={editAccount}
      />
    </>
  );
}

function AccountCard({
  account,
  netAmount,
  usedAmount,
  monthIncome,
  monthExpense,
  isSelected,
  onSelect,
  onEdit,
  onArchive,
  onDelete,
}: {
  account: AccountRow;
  netAmount: number;
  usedAmount: number;
  monthIncome: number;
  monthExpense: number;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const accentColor = account.color ?? "#c0c1ff";
  const icon = TYPE_ICONS[account.type];
  const isCreditCard = account.type === "credit_card";
  const creditLimit = account.credit_limit ?? 0;
  const currentBalance = Number(account.opening_balance) + netAmount;
  const available = creditLimit - usedAmount;
  const usedPct = creditLimit > 0 ? Math.min((usedAmount / creditLimit) * 100, 100) : 0;
  const barColor = usedPct >= 90 ? "var(--color-error)" : usedPct >= 70 ? "#ffd93d" : "var(--color-secondary-fixed)";

  return (
    <div
      className="rounded-2xl border border-outline-variant/10 p-lg flex flex-col gap-md relative overflow-hidden cursor-pointer transition-all"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${accentColor}30 0%, var(--color-surface-container-high) 100%)`
          : `linear-gradient(135deg, ${accentColor}18 0%, var(--color-surface-container) 100%)`,
        boxShadow: isSelected ? `0 0 0 2px ${accentColor}60` : undefined,
      }}
      onClick={onSelect}
    >
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none"
        style={{ background: `${accentColor}20`, transform: "translate(30%, -30%)" }}
      />

      <div className="flex items-start justify-between relative z-10">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: `${accentColor}30` }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: accentColor, fontSize: 24 }}
          >
            {icon}
          </span>
        </div>
        <div className="flex gap-xs" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onEdit}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              edit
            </span>
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
            title="Archivar"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              archive
            </span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
            title="Eliminar"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              delete
            </span>
          </button>
        </div>
      </div>

      <div className="relative z-10">
        <p className="text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
          {TYPE_LABELS[account.type]}
        </p>
        <h3 className="text-body-lg font-bold text-on-surface">{account.name}</h3>
      </div>

      <div className="relative z-10 mt-auto pt-md border-t border-outline-variant/10">
        {isCreditCard ? (
          <>
            <div className="flex justify-between mb-xs">
              <div>
                <p className="text-label-md text-on-surface-variant">Disponible</p>
                <p className="text-title-md font-bold" style={{ color: barColor }}>
                  {formatCurrency(available)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-label-md text-on-surface-variant">Límite</p>
                <p className="text-body-sm font-bold text-on-surface">{formatCurrency(creditLimit)}</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${usedPct}%`, background: barColor }}
              />
            </div>
            <p className="text-label-md text-on-surface-variant mt-xs">
              {formatCurrency(usedAmount)} usado · {usedPct.toFixed(0)}%
            </p>
          </>
        ) : (
          <>
            <div className="mb-sm">
              <p className="text-label-md text-on-surface-variant mb-xs">Saldo en cuenta</p>
              <p className="text-headline-lg font-bold" style={{ color: accentColor, lineHeight: 1.1 }}>
                {formatCurrency(currentBalance)}
              </p>
            </div>
            <div className="flex gap-md pt-sm border-t border-outline-variant/10">
              <div className="flex-1 flex items-center gap-xs">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--color-secondary-fixed)" }}>arrow_upward</span>
                <div>
                  <p className="text-label-md text-on-surface-variant">Ingresos</p>
                  <p className="text-label-md font-bold" style={{ color: "var(--color-secondary-fixed)" }}>
                    {monthIncome > 0 ? `+${formatCurrency(monthIncome)}` : "—"}
                  </p>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-xs">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--color-error)" }}>arrow_downward</span>
                <div>
                  <p className="text-label-md text-on-surface-variant">Egresos</p>
                  <p className="text-label-md font-bold" style={{ color: "var(--color-error)" }}>
                    {monthExpense > 0 ? `-${formatCurrency(monthExpense)}` : "—"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* "Ver historial" hint */}
      <div className="relative z-10 flex items-center gap-xs text-on-surface-variant" style={{ marginTop: -4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
          {isSelected ? "expand_less" : "history"}
        </span>
        <span className="text-label-md">{isSelected ? "Ocultar historial" : "Ver historial"}</span>
      </div>
    </div>
  );
}

function AccountHistoryDrawer({
  account,
  transactions,
  netAmount,
  usedAmount,
  onClose,
}: {
  account: AccountRow;
  transactions: TransactionRow[];
  netAmount: number;
  usedAmount: number;
  onClose: () => void;
}) {
  const accentColor = account.color ?? "#c0c1ff";
  const isCreditCard = account.type === "credit_card";
  const creditLimit = account.credit_limit ?? 0;
  const currentBalance = Number(account.opening_balance) + netAmount;
  const available = creditLimit - usedAmount;
  const usedPct = creditLimit > 0 ? Math.min((usedAmount / creditLimit) * 100, 100) : 0;
  const barColor = usedPct >= 90 ? "var(--color-error)" : usedPct >= 70 ? "#ffd93d" : "var(--color-secondary-fixed)";

  // Group by month
  const byMonth: Record<string, TransactionRow[]> = {};
  for (const tx of transactions) {
    const key = tx.occurred_on.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(tx);
  }
  const months = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="mt-xl rounded-2xl border border-outline-variant/10 overflow-hidden" style={{ background: "var(--color-surface-container-low)" }}>
      {/* Drawer header */}
      <div
        className="flex items-center gap-md px-lg py-md border-b border-outline-variant/10"
        style={{ background: `linear-gradient(90deg, ${accentColor}18 0%, transparent 100%)` }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}30` }}
        >
          <span className="material-symbols-outlined" style={{ color: accentColor, fontSize: 20 }}>
            {TYPE_ICONS[account.type]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-body-sm font-bold text-on-surface truncate">{account.name}</h3>
          <p className="text-label-md text-on-surface-variant">
            {transactions.length} transacción{transactions.length !== 1 ? "es" : ""}
            {" · "}
            {isCreditCard ? (
              <>Disponible <span className="font-bold" style={{ color: barColor }}>{formatCurrency(available)}</span></>
            ) : (
              <>Saldo <span className="font-bold" style={{ color: accentColor }}>{formatCurrency(currentBalance)}</span></>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors shrink-0"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-xl text-center px-lg">
          <span className="material-symbols-outlined text-outline/30 mb-sm" style={{ fontSize: 48 }}>receipt_long</span>
          <p className="text-body-sm text-on-surface-variant">Sin transacciones en esta cuenta</p>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/10">
          {months.map(([yearMonth, txs]) => (
            <MonthGroup key={yearMonth} yearMonth={yearMonth} transactions={txs} accentColor={accentColor} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthGroup({
  yearMonth,
  transactions,
  accentColor,
}: {
  yearMonth: string;
  transactions: TransactionRow[];
  accentColor: string;
}) {
  const [date] = useState(() => new Date(yearMonth + "-15T12:00:00"));
  const label = date.toLocaleDateString("es-SV", { month: "long", year: "numeric" });
  const monthIncome = transactions
    .filter((t) => t.kind === "income" && t.is_confirmed && !t.transfer_id)
    .reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = transactions
    .filter((t) => t.kind === "expense" && t.is_confirmed && !t.transfer_id)
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between px-lg py-sm bg-surface-container/50">
        <span className="text-label-md font-bold text-on-surface-variant capitalize">{label}</span>
        <div className="flex items-center gap-md">
          {monthIncome > 0 && (
            <span className="text-label-md font-bold" style={{ color: "var(--color-secondary-fixed)" }}>
              +{formatCurrency(monthIncome)}
            </span>
          )}
          {monthExpense > 0 && (
            <span className="text-label-md font-bold" style={{ color: "var(--color-error)" }}>
              -{formatCurrency(monthExpense)}
            </span>
          )}
        </div>
      </div>

      {/* Transaction rows */}
      {transactions
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
        .map((tx) => (
          <TxRow key={tx.id} tx={tx} accentColor={accentColor} />
        ))}
    </div>
  );
}

function TxRow({ tx, accentColor }: { tx: TransactionRow; accentColor: string }) {
  const isTransfer = !!tx.transfer_id;
  const catColor = (tx.category as { color?: string } | null)?.color;
  const iconColor = isTransfer
    ? "var(--color-primary)"
    : tx.kind === "income"
    ? "var(--color-secondary-fixed)"
    : catColor ?? "var(--color-error)";
  const icon = isTransfer
    ? "swap_horiz"
    : (tx.category as { icon?: string } | null)?.icon ?? (tx.kind === "income" ? "trending_up" : "shopping_cart");

  return (
    <div
      className="flex items-center gap-sm px-lg py-sm hover:bg-surface-container transition-colors"
      style={{ opacity: tx.is_confirmed ? 1 : 0.6 }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: iconColor + "20" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: iconColor }}>
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body-sm text-on-surface truncate">
          {tx.description || (tx.category as { name?: string } | null)?.name || (isTransfer ? "Transferencia" : "—")}
        </p>
        <div className="flex items-center gap-xs flex-wrap">
          <span className="text-label-md text-on-surface-variant">{formatDay(tx.occurred_on)}</span>
          {!tx.is_confirmed && (
            <span className="text-label-md px-xs rounded" style={{ background: "var(--color-primary)20", color: "var(--color-primary)" }}>
              pendiente
            </span>
          )}
          {isTransfer && (
            <span className="text-label-md text-on-surface-variant">transferencia</span>
          )}
        </div>
      </div>
      <span
        className="text-body-sm font-bold shrink-0"
        style={{
          color: tx.kind === "income"
            ? "var(--color-secondary-fixed)"
            : "var(--color-error)",
        }}
      >
        {tx.kind === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
      </span>
    </div>
  );
}

function EmptyAccountsState({ onAdd }: { onAdd: () => void }) {
  return (
    <section
      className="flex flex-col items-center justify-center text-center py-xl mx-auto"
      style={{ maxWidth: 480 }}
    >
      <div className="w-48 h-48 bg-surface-container-low rounded-full flex items-center justify-center mb-lg relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
        <span
          className="material-symbols-outlined text-outline/30"
          style={{ fontSize: 96 }}
        >
          account_balance
        </span>
      </div>
      <h3 className="text-headline-lg-mobile text-on-surface mb-sm">
        Sin cuentas aún
      </h3>
      <p className="text-body-sm text-on-surface-variant mb-lg">
        Agrega tus cuentas bancarias, efectivo y tarjetas para centralizar tu
        flujo de dinero.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          add
        </span>
        Nueva cuenta
      </button>
    </section>
  );
}
