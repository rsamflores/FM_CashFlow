import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getRecurringRules } from "@/lib/actions/recurring";
import { RecurringClient } from "./RecurringClient";

export default async function RecurringPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const rules = await getRecurringRules(scope);

  const incomes   = rules.filter((r) => r.kind === "income");
  const transfers = rules.filter((r) => r.kind === "expense" && !!r.to_account_id);
  const expenses  = rules.filter((r) => r.kind === "expense" && !r.to_account_id);

  const total = rules.length;

  return (
    <>
      <Topbar title="Recurrentes" subtitle={SCOPE_LABEL[scope]} />
      <header className="mb-xl">
        <h2 className="text-headline-lg text-on-surface">Transacciones recurrentes</h2>
        <p className="text-body-sm text-on-surface-variant">
          {total > 0
            ? `${total} regla${total !== 1 ? "s" : ""} · ${SCOPE_LABEL[scope]}`
            : `Automatiza sueldos, alquileres y suscripciones · ${SCOPE_LABEL[scope]}`}
        </p>
      </header>
      <RecurringClient
        scope={scope}
        incomes={incomes}
        expenses={expenses}
        transfers={transfers}
      />
    </>
  );
}
