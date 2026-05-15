import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getTransactionsForMonth } from "@/lib/actions/transactions";
import { getAccounts, getPersonalCashAccounts } from "@/lib/actions/accounts";
import type { AccountRow } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ scope: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { scope } = await params;
  const sp = await searchParams;
  if (!isValidScope(scope)) notFound();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = sp.month ?? currentMonth;

  const otherScope = scope === "personal" ? "business" : "personal";
  const [transactions, accounts, categories, personalCashAccounts, otherAccounts] = await Promise.all([
    getTransactionsForMonth(scope, selectedMonth),
    getAccounts(scope),
    getCategories(scope),
    scope === "business" ? getPersonalCashAccounts() : Promise.resolve([] as AccountRow[]),
    getAccounts(otherScope),
  ]);

  const allAccounts = [...accounts, ...otherAccounts];
  const taxAccounts = allAccounts.filter((a) => a.is_tax_account);
  const creditCardAccounts = accounts.filter((a) => a.type === "credit_card");

  // usedByAccount: expenses add, income on credit cards subtracts (card payments)
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]));
  const usedByAccount: Record<string, number> = {};
  for (const tx of transactions.filter((t) => t.is_confirmed)) {
    const amt = Number(tx.amount);
    if (tx.kind === "expense") {
      usedByAccount[tx.account_id] = (usedByAccount[tx.account_id] ?? 0) + amt;
    } else if (accountTypeMap.get(tx.account_id) === "credit_card") {
      usedByAccount[tx.account_id] = (usedByAccount[tx.account_id] ?? 0) - amt;
    }
  }
  for (const id in usedByAccount) {
    if (usedByAccount[id] < 0) usedByAccount[id] = 0;
  }

  return (
    <>
      <Topbar title="Transacciones" subtitle={SCOPE_LABEL[scope]} />
      <TransactionsClient
        scope={scope}
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        usedByAccount={usedByAccount}
        personalCashAccounts={personalCashAccounts}
        allAccounts={allAccounts}
        taxAccounts={taxAccounts}
        creditCardAccounts={creditCardAccounts}
        selectedMonth={selectedMonth}
        currentMonth={currentMonth}
      />
    </>
  );
}
