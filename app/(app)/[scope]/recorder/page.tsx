import { notFound } from "next/navigation";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getAccounts, getPersonalCashAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import { Topbar } from "@/components/shell/Topbar";
import type { AccountRow } from "@/lib/actions/accounts";
import { RecorderClient } from "./RecorderClient";
import type { Scope } from "@/lib/scope";

export default async function RecorderPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const otherScope: Scope = scope === "personal" ? "business" : "personal";

  const [accounts, categories, personalCashAccounts, otherAccounts] = await Promise.all([
    getAccounts(scope),
    getCategories(scope),
    scope === "business" ? getPersonalCashAccounts() : Promise.resolve([] as AccountRow[]),
    getAccounts(otherScope),
  ]);

  const allAccounts = [...accounts, ...otherAccounts];
  const taxAccounts = allAccounts.filter((a) => a.is_tax_account);
  const creditCardAccounts = accounts.filter((a) => a.type === "credit_card");

  // usedByAccount for credit cards
  const usedByAccount: Record<string, number> = {};

  return (
    <>
      <Topbar title="Registrar transacción" subtitle={SCOPE_LABEL[scope]} />
      <RecorderClient
        scope={scope}
        accounts={accounts}
        categories={categories}
        personalCashAccounts={personalCashAccounts}
        allAccounts={allAccounts}
        taxAccounts={taxAccounts}
        creditCardAccounts={creditCardAccounts}
        usedByAccount={usedByAccount}
      />
    </>
  );
}
