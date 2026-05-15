import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyReimbursements } from "@/lib/actions/reimbursements";
import type { Scope } from "@/lib/scope";
import type { TransactionRow } from "@/lib/actions/transactions";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import type { BudgetRow } from "@/lib/actions/budgets";
import { EmployeeClient } from "./EmployeeClient";

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Get user's membership to verify employee role
  const { data: membership } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("scope", scope as Scope)
    .maybeSingle();

  if (!membership || membership.role !== "employee") {
    redirect(`/${scope}/dashboard`);
  }

  // Get this employee's assigned categories
  const { data: assignments } = await admin
    .from("employee_assignments")
    .select("category_id")
    .eq("user_id", user.id)
    .eq("scope", scope as Scope);

  const assignedCategoryIds = (assignments ?? []).map((a) => a.category_id);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Fetch data in parallel
  const [
    categoriesResult,
    budgetsResult,
    transactionsResult,
    accountsResult,
    reimbursements,
  ] = await Promise.all([
    admin
      .from("categories")
      .select("*")
      .eq("scope", scope)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    assignedCategoryIds.length > 0
      ? admin
          .from("planned_budgets")
          .select("*, category:categories(name,color,icon), account:accounts(name,color)")
          .eq("scope", scope)
          .eq("period_month", currentMonth)
          .in("category_id", assignedCategoryIds)
      : Promise.resolve({ data: [], error: null }),
    // Employee's own confirmed expenses this month in assigned categories
    assignedCategoryIds.length > 0
      ? admin
          .from("transactions")
          .select("*, account:accounts(name,color), category:categories(name,color,icon)")
          .eq("scope", scope)
          .eq("kind", "expense")
          .eq("is_confirmed", true)
          .eq("created_by", user.id)
          .gte("occurred_on", currentMonth)
          .lt("occurred_on", (() => {
            const d = new Date(currentMonth + "T00:00:00");
            d.setMonth(d.getMonth() + 1);
            return d.toLocaleDateString("en-CA");
          })())
          .in("category_id", assignedCategoryIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("accounts")
      .select("*")
      .eq("scope", scope)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    getMyReimbursements(scope as Scope),
  ]);

  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const budgets = (budgetsResult.data ?? []) as BudgetRow[];
  const transactions = (transactionsResult.data ?? []) as TransactionRow[];
  const accounts = (accountsResult.data ?? []) as AccountRow[];

  // Fetch user's display name for topbar
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const userName = profile?.full_name || user.email?.split("@")[0] || "Empleado";

  return (
    <>
      <Topbar title="Mi Panel" userName={userName} userRole="employee" />
      <EmployeeClient
        scope={scope as Scope}
        userId={user.id}
        assignedCategoryIds={assignedCategoryIds}
        categories={categories}
        budgets={budgets}
        transactions={transactions}
        accounts={accounts}
        reimbursements={reimbursements}
        currentMonth={currentMonth}
      />
    </>
  );
}
