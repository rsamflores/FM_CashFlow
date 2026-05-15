"use client";

import { useState, useTransition } from "react";
import { payReimbursement, rejectReimbursement, type ReimbursementRow } from "@/lib/actions/reimbursements";
import type { AccountRow } from "@/lib/actions/accounts";
import { formatCurrency, formatDay } from "@/lib/format";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  requests: ReimbursementRow[];
  accounts: AccountRow[];
};

const STATUS_LABEL: Record<string, string> = {
  pending:  "Pendiente",
  approved: "Aprobado",
  paid:     "Pagado",
  rejected: "Rechazado",
};

const STATUS_COLOR: Record<string, string> = {
  pending:  "var(--color-primary)",
  approved: "var(--color-secondary-fixed)",
  paid:     "var(--color-tertiary)",
  rejected: "var(--color-error)",
};

const STATUS_ORDER = ["pending", "approved", "paid", "rejected"];

export function ReimbursementsClient({ scope, requests, accounts }: Props) {
  const [payDialog, setPayDialog] = useState<ReimbursementRow | null>(null);
  const [rejectDialog, setRejectDialog] = useState<ReimbursementRow | null>(null);

  // Group by status
  const grouped = new Map<string, ReimbursementRow[]>();
  for (const status of STATUS_ORDER) grouped.set(status, []);
  for (const req of requests) {
    const list = grouped.get(req.status) ?? [];
    list.push(req);
    grouped.set(req.status, list);
  }

  const totalPending = grouped.get("pending")?.reduce((s, r) => s + Number(r.total_amount), 0) ?? 0;

  return (
    <>
      {/* Header summary */}
      <div className="mb-xl">
        <h2 className="text-headline-lg text-on-surface">Reembolsos</h2>
        <p className="text-body-sm text-on-surface-variant">
          {requests.length} solicitud{requests.length !== 1 ? "es" : ""} total
          {totalPending > 0 && ` · ${formatCurrency(totalPending)} pendiente`}
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-xl">
          <span className="material-symbols-outlined text-on-surface-variant/30" style={{ fontSize: 64 }}>payments</span>
          <p className="text-headline-sm text-on-surface mt-md">Sin solicitudes de reembolso</p>
          <p className="text-body-sm text-on-surface-variant mt-xs">
            Cuando los empleados soliciten reembolsos, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-xl">
          {STATUS_ORDER.map((status) => {
            const group = grouped.get(status) ?? [];
            if (group.length === 0) return null;
            return (
              <section key={status}>
                <div className="flex items-center gap-sm mb-md">
                  <StatusChip status={status} />
                  <span className="text-label-md text-on-surface-variant">
                    {group.length} solicitud{group.length !== 1 ? "es" : ""}
                  </span>
                  {status === "pending" && (
                    <span className="text-label-md font-bold text-error ml-auto">
                      Total: {formatCurrency(group.reduce((s, r) => s + Number(r.total_amount), 0))}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-sm">
                  {group.map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      isPending={status === "pending"}
                      onPay={() => setPayDialog(req)}
                      onReject={() => setRejectDialog(req)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {payDialog && (
        <PayDialog
          request={payDialog}
          accounts={accounts}
          scope={scope}
          onClose={() => setPayDialog(null)}
        />
      )}

      {rejectDialog && (
        <RejectDialog
          request={rejectDialog}
          scope={scope}
          onClose={() => setRejectDialog(null)}
        />
      )}
    </>
  );
}

function RequestCard({
  request,
  isPending,
  onPay,
  onReject,
}: {
  request: ReimbursementRow;
  isPending: boolean;
  onPay: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
      {/* Main info */}
      <div className="p-lg">
        <div className="flex items-start justify-between mb-sm">
          <div>
            <div className="flex items-center gap-sm mb-xs">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-body-sm font-bold shrink-0"
                style={{ background: "var(--color-primary)30", color: "var(--color-primary)" }}
              >
                {(request.employee_name?.[0] ?? "E").toUpperCase()}
              </div>
              <p className="text-body-sm font-bold text-on-surface">
                {request.employee_name ?? "Empleado"}
              </p>
            </div>
            <p className="text-label-md text-on-surface-variant">{formatDay(request.created_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-title-md font-bold text-error">{formatCurrency(Number(request.total_amount))}</p>
            <StatusChip status={request.status} />
          </div>
        </div>

        {/* Bank info */}
        <div
          className="rounded-lg p-sm flex flex-wrap gap-md text-label-md text-on-surface-variant mb-sm"
          style={{ background: "var(--color-surface-container)" }}
        >
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>account_balance</span>
            <span>{request.bank_name}</span>
          </div>
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {request.account_type === "checking" ? "credit_card" : "savings"}
            </span>
            <span>{request.account_type === "checking" ? "Corriente" : "Ahorros"}</span>
          </div>
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tag</span>
            <span className="font-mono">{request.account_number}</span>
          </div>
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span>
            <span>{request.account_holder}</span>
          </div>
        </div>

        {request.notes && (
          <p className="text-label-md text-on-surface-variant italic mb-sm">"{request.notes}"</p>
        )}

        {request.reject_reason && (
          <div
            className="rounded-lg px-sm py-xs text-label-md mb-sm"
            style={{ background: "var(--color-error)10", color: "var(--color-error)" }}
          >
            Rechazado: {request.reject_reason}
          </div>
        )}

        {/* Expenses list toggle */}
        {request.items.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-xs text-label-md font-bold transition-colors"
            style={{ color: "var(--color-primary)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {expanded ? "expand_less" : "expand_more"}
            </span>
            {request.items.length} gasto{request.items.length !== 1 ? "s" : ""} incluido{request.items.length !== 1 ? "s" : ""}
          </button>
        )}

        {expanded && (
          <div className="mt-sm flex flex-col gap-xs border-t border-outline-variant/10 pt-sm">
            {request.items.map((item) => {
              const tx = item.transaction;
              const catColor = tx?.category?.color ?? "var(--color-primary)";
              return (
                <div key={item.id} className="flex items-center gap-sm text-label-md">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    style={{ background: catColor + "20" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: catColor }}>
                      {tx?.category?.icon ?? "receipt"}
                    </span>
                  </div>
                  <span className="flex-1 text-on-surface truncate">
                    {tx?.description || tx?.category?.name || "Gasto"}
                  </span>
                  <span className="text-on-surface-variant">{tx ? formatDay(tx.occurred_on) : "—"}</span>
                  <span className="font-bold text-error shrink-0">{tx ? formatCurrency(Number(tx.amount)) : "—"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      {isPending && (
        <div
          className="flex items-center gap-sm px-lg py-sm border-t border-outline-variant/10"
          style={{ background: "var(--color-surface-container)" }}
        >
          <button
            type="button"
            onClick={onPay}
            className="flex items-center gap-xs h-9 px-lg rounded-full text-body-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-tertiary-container)", color: "var(--color-on-tertiary-container)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>paid</span>
            Marcar como pagado
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-xs h-9 px-lg rounded-full text-body-sm font-bold hover:opacity-90 transition-opacity"
            style={{ background: "var(--color-error-container)", color: "var(--color-on-error-container)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cancel</span>
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "var(--color-outline)";
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className="text-label-md font-bold px-sm py-xs rounded-full"
      style={{ background: color + "20", color }}
    >
      {label}
    </span>
  );
}

function PayDialog({
  request,
  accounts,
  scope,
  onClose,
}: {
  request: ReimbursementRow;
  accounts: AccountRow[];
  scope: Scope;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) { setError("Selecciona una cuenta"); return; }
    setError(null);
    startTransition(async () => {
      const res = await payReimbursement(request.id, scope, accountId);
      if ("error" in res) { setError(res.error); return; }
      setSuccess(true);
      setTimeout(onClose, 1400);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-md">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full rounded-2xl border border-outline-variant/10 bg-surface-container shadow-2xl overflow-hidden"
        style={{ maxWidth: 400 }}
      >
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 20 }}>paid</span>
            <h2 className="text-body-sm font-bold text-on-surface">Marcar como pagado</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-xl text-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-tertiary)" }}>check_circle</span>
            <p className="text-body-sm font-bold text-on-surface">Reembolso registrado</p>
          </div>
        ) : (
          <form onSubmit={handlePay} className="p-lg flex flex-col gap-md">
            <div
              className="rounded-xl p-md flex items-center justify-between"
              style={{ background: "var(--color-tertiary)10" }}
            >
              <div>
                <p className="text-label-md text-on-surface-variant">Total a pagar</p>
                <p className="text-title-md font-bold text-error">{formatCurrency(Number(request.total_amount))}</p>
              </div>
              <div className="text-right">
                <p className="text-label-md text-on-surface-variant">Empleado</p>
                <p className="text-body-sm font-bold text-on-surface">{request.employee_name ?? "—"}</p>
              </div>
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Débitar de cuenta *</label>
              {accounts.length === 0 ? (
                <p className="text-body-sm text-error">No hay cuentas disponibles.</p>
              ) : (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  className="w-full h-10 px-md rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-primary-container text-body-sm text-on-surface"
                >
                  <option value="" disabled>Selecciona una cuenta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>

            <p className="text-label-md text-on-surface-variant">
              Se creará un egreso de {formatCurrency(Number(request.total_amount))} como "Reembolso" en la cuenta seleccionada.
            </p>

            {error && (
              <p className="text-label-md px-sm py-xs rounded-lg" style={{ background: "var(--color-error)15", color: "var(--color-error)" }}>
                {error}
              </p>
            )}

            <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant/10">
              <button type="button" onClick={onClose} className="h-9 px-lg rounded-full text-body-sm text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending || !accountId}
                className="h-9 px-lg rounded-full text-body-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: "var(--color-tertiary-container)", color: "var(--color-on-tertiary-container)" }}
              >
                {isPending ? "Procesando…" : "Confirmar pago"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RejectDialog({
  request,
  scope,
  onClose,
}: {
  request: ReimbursementRow;
  scope: Scope;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleReject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await rejectReimbursement(request.id, scope, reason);
      if ("error" in res) { setError(res.error); return; }
      setSuccess(true);
      setTimeout(onClose, 1200);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-md">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full rounded-2xl border border-outline-variant/10 bg-surface-container shadow-2xl overflow-hidden"
        style={{ maxWidth: 400 }}
      >
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-error" style={{ fontSize: 20 }}>cancel</span>
            <h2 className="text-body-sm font-bold text-on-surface">Rechazar solicitud</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-xl text-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-secondary-fixed)" }}>check_circle</span>
            <p className="text-body-sm font-bold text-on-surface">Solicitud rechazada</p>
          </div>
        ) : (
          <form onSubmit={handleReject} className="p-lg flex flex-col gap-md">
            <p className="text-body-sm text-on-surface-variant">
              ¿Rechazar la solicitud de reembolso de <strong className="text-on-surface">{request.employee_name ?? "este empleado"}</strong> por{" "}
              <strong className="text-error">{formatCurrency(Number(request.total_amount))}</strong>?
            </p>

            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Motivo (opcional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explica el motivo del rechazo..."
                className="w-full px-md py-sm rounded-lg bg-surface-container-high border-none outline-none focus:ring-2 focus:ring-error-container text-body-sm text-on-surface placeholder:text-on-surface-variant/40 resize-none"
              />
            </div>

            {error && (
              <p className="text-label-md px-sm py-xs rounded-lg" style={{ background: "var(--color-error)15", color: "var(--color-error)" }}>
                {error}
              </p>
            )}

            <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant/10">
              <button type="button" onClick={onClose} className="h-9 px-lg rounded-full text-body-sm text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-9 px-lg rounded-full text-body-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 bg-error-container text-on-error-container"
              >
                {isPending ? "Rechazando…" : "Rechazar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
