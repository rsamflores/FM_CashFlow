import { notFound } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { isValidScope } from "@/lib/scope";

export default async function ScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar scope={scope} />
      <main className="ml-[240px] pt-16 min-h-screen p-lg">{children}</main>
    </div>
  );
}
