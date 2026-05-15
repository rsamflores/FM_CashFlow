import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReimbursementRequests } from "@/lib/actions/reimbursements";
import type { Scope } from "@/lib/scope";
import type { AccountRow } from "@/lib/actions/accounts";
import { ReimbursementsClient } from "./ReimbursementsClient";

export default async function ReimbursementsPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const admin = createAdminClient();

  const [requests, accountsResult] = await Promise.all([
    getReimbursementRequests(scope as Scope),
    admin
      .from("accounts")
      .select("*")
      .eq("scope", scope)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const accounts = (accountsResult.data ?? []) as AccountRow[];

  return (
    <>
      <Topbar title="Reembolsos" subtitle={SCOPE_LABEL[scope]} />
      <ReimbursementsClient
        scope={scope as Scope}
        requests={requests}
        accounts={accounts}
      />
    </>
  );
}
