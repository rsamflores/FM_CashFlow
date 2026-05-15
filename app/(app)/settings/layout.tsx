import { cookies } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { SidebarProvider } from "@/lib/sidebar-context";
import type { Scope } from "@/lib/scope";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const scope = (cookieStore.get("scope")?.value as Scope) ?? "personal";

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-surface">
        <Sidebar scope={scope} />
        <main className="ml-0 md:ml-[240px] pt-16 min-h-screen p-md md:p-lg">{children}</main>
      </div>
    </SidebarProvider>
  );
}
