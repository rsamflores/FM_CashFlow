import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { SidebarProvider } from "@/lib/sidebar-context";
import { isValidScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Fetch the current user's role for this scope
  let userRole: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Use admin client so RLS doesn't block the membership read
      const admin = createAdminClient();
      const { data } = await admin
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

  // Redirect recorder users to the recorder page (unless already there)
  if (userRole === "recorder") {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "";
    if (!pathname.startsWith(`/${scope}/recorder`)) {
      redirect(`/${scope}/recorder`);
    }
  }

  // Redirect employee users always to the business scope (assignments live there)
  if (userRole === "employee") {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "";
    if (!pathname.startsWith("/business/employee") && !pathname.startsWith("/business/reimbursements")) {
      redirect("/business/employee");
    }
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-surface">
        <Sidebar scope={scope} userRole={userRole} />
        <main className="ml-0 md:ml-[240px] min-h-screen px-md pb-md md:px-lg md:pb-lg pt-[80px] md:pt-[88px]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
