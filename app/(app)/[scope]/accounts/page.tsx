import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getAccounts } from "@/lib/actions/accounts";
import { getTransactionsByAccountIds } from "@/lib/actions/transactions";
import { AccountsClient } from "./AccountsClient";

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const accounts = await getAccounts(scope);
  const accountIds = accounts.map((a) => a.id);

  // Cross-scope query: includes business income that landed in personal cash accounts
  const transactions = await getTransactionsByAccountIds(accountIds);

  // Only confirmed transactions that affect balance count toward account totals
  const confirmed = transactions.filter((tx) => tx.is_confirmed);

  const netByAccount: Record<string, number> = {};
  const usedByAccount: Record<string, number> = {};
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]));

  for (const tx of confirmed) {
    if (!tx.affects_balance) continue;
    const amt = Number(tx.amount);
    if (tx.kind === "income") {
      netByAccount[tx.account_id] = (netByAccount[tx.account_id] ?? 0) + amt;
      // Card payment received (income on credit card) reduces the used balance
      if (accountTypeMap.get(tx.account_id) === "credit_card") {
        usedByAccount[tx.account_id] = (usedByAccount[tx.account_id] ?? 0) - amt;
      }
    } else {
      netByAccount[tx.account_id] = (netByAccount[tx.account_id] ?? 0) - amt;
      usedByAccount[tx.account_id] = (usedByAccount[tx.account_id] ?? 0) + amt;
    }
  }
  // Clamp used amounts — can't be negative (overpayment still shows 0 used)
  for (const id in usedByAccount) {
    if (usedByAccount[id] < 0) usedByAccount[id] = 0;
  }

  return (
    <>
      <Topbar title="Cuentas" subtitle={SCOPE_LABEL[scope]} />
      <AccountsClient
        scope={scope}
        accounts={accounts}
        netByAccount={netByAccount}
        usedByAccount={usedByAccount}
        transactions={transactions}
      />
    </>
  );
}
