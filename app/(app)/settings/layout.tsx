import { cookies } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import type { Scope } from "@/lib/scope";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const scope = (cookieStore.get("scope")?.value as Scope) ?? "personal";

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar scope={scope} />
      <main className="ml-[240px] pt-16 min-h-screen p-lg">{children}</main>
    </div>
  );
}
