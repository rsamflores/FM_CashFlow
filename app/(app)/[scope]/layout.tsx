import { notFound } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { SidebarProvider } from "@/lib/sidebar-context";
import { isValidScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/scope";

export default async function ScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  // Fetch the current user's role for this scope (used to restrict recorder nav)
  let userRole: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("scope", scope as Scope)
        .maybeSingle();
      userRole = data?.role ?? undefined;
    }
  } catch {
    // Non-fatal: sidebar degrades gracefully without role info
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-surface">
        <Sidebar scope={scope} userRole={userRole} />
        <main className="ml-0 md:ml-[240px] pt-16 min-h-screen p-md md:p-lg">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
