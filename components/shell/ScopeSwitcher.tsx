"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Scope } from "@/lib/scope";

const OPTIONS: { key: Scope; label: string; icon: string }[] = [
  { key: "personal", label: "Personal", icon: "person" },
  { key: "business", label: "Empresarial", icon: "business_center" },
];

export function ScopeSwitcher({ scope, userRole }: { scope: Scope; userRole?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const isRestricted = userRole === "employee" || userRole === "recorder";
  const visibleOptions = isRestricted ? OPTIONS.filter((o) => o.key === scope) : OPTIONS;

  function switchTo(next: Scope) {
    if (next === scope || isRestricted) return;
    const newPath = pathname.replace(/^\/(personal|business)/, `/${next}`);
    router.push(newPath);
  }

  return (
    <div className="flex bg-surface-container p-xs rounded-full border border-outline-variant/20">
      {visibleOptions.map((opt) => {
        const active = scope === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => switchTo(opt.key)}
            disabled={isRestricted}
            className={cn(
              "flex-1 flex items-center justify-center gap-xs px-xs py-xs rounded-full text-label-md transition-colors",
              active
                ? "bg-primary-container text-on-primary-container font-bold"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {opt.icon}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
