import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { SCOPE_LABEL } from "@/lib/scope";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import { ensureActiveList, getActiveList, getHistory } from "@/lib/actions/shopping";
import { MercadoClient } from "./MercadoClient";

export default async function MercadoPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (scope !== "personal") notFound();

  const ensured = await ensureActiveList();
  if ("error" in ensured) {
    return (
      <>
        <Topbar title="Mercado" subtitle={SCOPE_LABEL.personal} />
        <div className="p-lg text-body-sm text-error">{ensured.error}</div>
      </>
    );
  }

  const [payload, accounts, categories, history] = await Promise.all([
    getActiveList(),
    getAccounts("personal"),
    getCategories("personal"),
    getHistory(10),
  ]);

  if ("error" in payload) {
    return (
      <>
        <Topbar title="Mercado" subtitle={SCOPE_LABEL.personal} />
        <div className="p-lg text-body-sm text-error">{payload.error}</div>
      </>
    );
  }

  const expenseCategories = categories.filter((c) => c.kind === "expense" && !c.archived_at);
  const activeAccounts = accounts.filter((a) => !a.archived_at);

  return (
    <>
      <Topbar title="Mercado" subtitle={SCOPE_LABEL.personal} />
      <MercadoClient
        list={payload.list}
        items={payload.items}
        suggestions={payload.suggestions}
        budgets={payload.budgets}
        accounts={activeAccounts}
        categories={expenseCategories}
        history={history}
      />
    </>
  );
}
