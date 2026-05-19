import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getTransactionsFrom } from "@/lib/actions/transactions";
import { getMonthClosure } from "@/lib/actions/closures";
import { formatMonth, svToday } from "@/lib/format";
import { ReportsClient } from "./ReportsClient";
import { MonthClosureCard } from "./MonthClosureCard";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const { year, month } = svToday();
  const currentMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Most recently finished month (previous month relative to today)
  const prevDate = new Date(year, month - 1, 1);
  const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  // Fetch confirmed transactions from the last 24 months, excluding the current month
  const from = new Date(year, month - 23, 1);
  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;

  const [transactions, closure] = await Promise.all([
    getTransactionsFrom(scope, fromStr),
    getMonthClosure(scope, prevYearMonth),
  ]);

  // Only past months (exclude current month and unconfirmed)
  const past = transactions.filter(
    (tx) => tx.is_confirmed && !tx.occurred_on.startsWith(currentMonth)
  );

  // Group by YYYY-MM, most recent first
  const byMonth: Record<string, typeof past> = {};
  for (const tx of past) {
    const key = tx.occurred_on.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(tx);
  }

  const months = Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([yearMonth, txs]) => {
      const nonTransfer = txs.filter((t) => !t.transfer_id);
      return {
        yearMonth,
        label: formatMonth(`${yearMonth}-01`),
        income: nonTransfer.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0),
        expense: nonTransfer.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0),
        transactions: txs.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
      };
    });

  return (
    <>
      <Topbar title="Reportes" subtitle={SCOPE_LABEL[scope]} />
      <header className="mb-xl flex items-end justify-between">
        <div>
          <h2 className="text-headline-lg text-on-surface">Historial mensual</h2>
          <p className="text-body-sm text-on-surface-variant">
            Transacciones confirmadas de meses anteriores · {SCOPE_LABEL[scope]}
          </p>
        </div>
        <a
          href={`/${scope}/transactions`}
          className="flex items-center gap-xs h-10 px-lg rounded-full bg-surface-container-high text-on-surface font-bold hover:bg-surface-container-highest transition-colors text-body-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
          Mes actual
        </a>
      </header>
      <MonthClosureCard closure={closure} />
      <ReportsClient months={months} />
    </>
  );
}
