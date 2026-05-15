"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Scope } from "@/lib/scope";
import { ScopeSwitcher } from "./ScopeSwitcher";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "transactions", label: "Transacciones", icon: "receipt_long" },
  { key: "accounts", label: "Cuentas", icon: "account_balance" },
  { key: "categories", label: "Categorías", icon: "category" },
  { key: "budgets", label: "Presupuestos", icon: "account_balance_wallet" },
  { key: "recurring", label: "Recurrentes", icon: "event_repeat" },
  { key: "reports", label: "Reportes", icon: "analytics" },
] as const;

export function Sidebar({ scope }: { scope: Scope }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] z-50 bg-surface-container-low shadow-md flex flex-col py-lg px-md">
      <div className="mb-md px-sm flex items-center gap-sm">
        <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-primary-container">
            account_balance_wallet
          </span>
        </div>
        <div>
          <h1 className="text-title-md font-bold text-secondary tracking-tight">
            FM-CashFlow
          </h1>
          <p className="text-label-md text-on-surface-variant">Control de flujo</p>
        </div>
      </div>

      <div className="mb-lg">
        <ScopeSwitcher scope={scope} />
      </div>

      <nav className="flex-1 space-y-xs overflow-y-auto custom-scrollbar">
        {NAV.map((item) => {
          const href = `/${scope}/${item.key}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={item.key}
              href={href}
              className={cn(
                "flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200",
                active
                  ? "text-secondary font-bold border-r-4 border-secondary bg-surface-container-high"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined",
                  active && "fill",
                )}
              >
                {item.icon}
              </span>
              <span className="text-body-lg">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-lg border-t border-outline-variant/10 space-y-xs">
        <p className="text-label-md text-on-surface-variant/50 uppercase tracking-widest px-md mb-xs">
          Sistema
        </p>
        <Link
          href="/settings/team"
          className={cn(
            "flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200",
            pathname.startsWith("/settings/team")
              ? "text-secondary font-bold border-r-4 border-secondary bg-surface-container-high"
              : "text-on-surface-variant hover:bg-surface-container-high",
          )}
        >
          <span className={cn("material-symbols-outlined", pathname.startsWith("/settings/team") && "fill")}>
            group
          </span>
          <span className="text-body-lg">Usuarios</span>
        </Link>
      </div>
    </aside>
  );
}
