import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getBudgets } from "@/lib/actions/budgets";
import { getCategories } from "@/lib/actions/categories";
import { getTransactions } from "@/lib/actions/transactions";
import { getAccounts } from "@/lib/actions/accounts";
import { svToday } from "@/lib/format";
import { BudgetsClient } from "./BudgetsClient";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const { year, month } = svToday();
  const currentMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const [budgets, categories, transactions, accounts] = await Promise.all([
    getBudgets(scope, currentMonth),
    getCategories(scope),
    getTransactions(scope),
    getAccounts(scope),
  ]);

  return (
    <>
      <Topbar title="Presupuestos" subtitle={SCOPE_LABEL[scope]} />
      <BudgetsClient
        scope={scope}
        budgets={budgets}
        categories={categories}
        transactions={transactions}
        accounts={accounts}
        currentMonth={currentMonth}
      />
    </>
  );
}
