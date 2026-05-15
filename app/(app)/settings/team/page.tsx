import { Topbar } from "@/components/shell/Topbar";
import { getTeamMembers } from "@/lib/actions/team";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamClient } from "./TeamClient";

export default async function SettingsTeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const [members, categoriesResult, assignmentsResult] = await Promise.all([
    getTeamMembers(),
    admin
      .from("categories")
      .select("id, name, color, kind")
      .eq("scope", "business")
      .is("archived_at", null)
      .order("name", { ascending: true }),
    admin
      .from("employee_assignments")
      .select("user_id, category_id")
      .eq("scope", "business"),
  ]);

  const businessCategories = (categoriesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    kind: c.kind,
  }));

  // Build a map: userId → assigned category ids
  const employeeAssignments: Record<string, string[]> = {};
  for (const a of assignmentsResult.data ?? []) {
    if (!employeeAssignments[a.user_id]) employeeAssignments[a.user_id] = [];
    employeeAssignments[a.user_id].push(a.category_id);
  }

  return (
    <>
      <Topbar title="Usuarios" subtitle="Gestión del equipo" />
      <TeamClient
        members={members}
        currentUserId={user?.id ?? ""}
        businessCategories={businessCategories}
        employeeAssignments={employeeAssignments}
      />
    </>
  );
}
