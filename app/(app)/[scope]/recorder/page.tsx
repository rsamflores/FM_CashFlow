import { notFound } from "next/navigation";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { Topbar } from "@/components/shell/Topbar";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import { RecorderClient } from "./RecorderClient";
import type { Scope } from "@/lib/scope";

export default async function RecorderPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  // Use admin client to bypass RLS — recorder has read-only access
  // but their accepted_at may be null on first login before auto-accept kicks in
  const admin = createAdminClient();
  const otherScope: Scope = scope === "personal" ? "business" : "personal";

  const [{ data: rawAccounts }, { data: rawCategories }, { data: rawOtherAccounts }, { data: rawCashAccounts }] =
    await Promise.all([
      admin.from("accounts").select("*").eq("scope", scope).is("archived_at", null).order("created_at"),
      admin.from("categories").select("*").eq("scope", scope).is("archived_at", null).order("name"),
      admin.from("accounts").select("*").eq("scope", otherScope).is("archived_at", null).order("created_at"),
      scope === "business"
        ? admin.from("accounts").select("*").eq("scope", "personal").eq("type", "cash").is("archived_at", null)
        : Promise.resolve({ data: [] }),
    ]);

  const accounts = (rawAccounts ?? []) as AccountRow[];
  const categories = (rawCategories ?? []) as CategoryRow[];
  const otherAccounts = (rawOtherAccounts ?? []) as AccountRow[];
  const personalCashAccounts = (rawCashAccounts ?? []) as AccountRow[];

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
