import { Topbar } from "@/components/shell/Topbar";
import { getTeamMembers } from "@/lib/actions/team";
import { createClient } from "@/lib/supabase/server";
import { TeamClient } from "./TeamClient";

export default async function SettingsTeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const members = await getTeamMembers();

  return (
    <>
      <Topbar title="Usuarios" subtitle="Gestión del equipo" />
      <TeamClient members={members} currentUserId={user?.id ?? ""} />
    </>
  );
}
