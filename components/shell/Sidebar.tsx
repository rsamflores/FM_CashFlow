"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Scope } from "@/lib/scope";
import { ScopeSwitcher } from "./ScopeSwitcher";
import { useSidebar } from "@/lib/sidebar-context";

const NAV_ALL = [
  { key: "dashboard",       label: "Dashboard",      icon: "dashboard",               recorderHide: true,  employeeHide: true,  personalOnly: false },
  { key: "transactions",    label: "Transacciones",  icon: "receipt_long",            recorderHide: false, employeeHide: true,  personalOnly: false },
  { key: "mercado",         label: "Mercado",         icon: "shopping_cart",           recorderHide: true,  employeeHide: true,  personalOnly: true  },
  { key: "accounts",        label: "Cuentas",         icon: "account_balance",         recorderHide: true,  employeeHide: true,  personalOnly: false },
  { key: "categories",      label: "Categorías",      icon: "category",                recorderHide: true,  employeeHide: true,  personalOnly: false },
  { key: "budgets",         label: "Presupuestos",    icon: "account_balance_wallet",  recorderHide: true,  employeeHide: true,  personalOnly: false },
  { key: "recurring",       label: "Recurrentes",     icon: "event_repeat",            recorderHide: true,  employeeHide: true,  personalOnly: false },
  { key: "reimbursements",  label: "Reembolsos",      icon: "payments",                recorderHide: true,  employeeHide: false, personalOnly: false },
  { key: "reports",         label: "Reportes",        icon: "analytics",               recorderHide: true,  employeeHide: true,  personalOnly: false },
] as const;

const EMPLOYEE_NAV = [
  { key: "employee",        label: "Mi Panel",        icon: "person" },
  { key: "reimbursements",  label: "Reembolsos",      icon: "payments" },
] as const;

type Props = { scope: Scope; userRole?: string };

export function Sidebar({ scope, userRole }: Props) {
  const pathname = usePathname();
  const { open, close } = useSidebar();

  const isRecorder = userRole === "recorder";
  const isEmployee = userRole === "employee";
  const NAV = isEmployee
    ? EMPLOYEE_NAV
    : NAV_ALL.filter(
        (item) =>
          (!isRecorder || !item.recorderHide) &&
          (!item.personalOnly || scope === "personal"),
      );

  const inner = (
    <aside
      className={cn(
        "flex flex-col h-full bg-surface-container-low shadow-md py-lg px-md",
        "fixed left-0 top-0 z-50 w-[240px]",
        // Mobile: shown only when open (drawer); desktop: always visible
        "transition-transform duration-300",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      <div className="mb-md px-sm flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-primary-container">account_balance_wallet</span>
          </div>
          <div>
            <h1 className="text-title-md font-bold text-secondary tracking-tight">FM-CashFlow</h1>
            <p className="text-label-md text-on-surface-variant">Control de flujo</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          onClick={close}
          className="md:hidden p-xs rounded-full hover:bg-surface-container-high text-on-surface-variant"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>

      <div className="mb-lg">
        <ScopeSwitcher scope={scope} userRole={userRole} />
      </div>

      <nav className="flex-1 space-y-xs overflow-y-auto custom-scrollbar">
        {NAV.map((item) => {
          const href = `/${scope}/${item.key}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={item.key}
              href={href}
              onClick={close}
              className={cn(
                "flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200",
                active
                  ? "text-secondary font-bold border-r-4 border-secondary bg-surface-container-high"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              <span className={cn("material-symbols-outlined", active && "fill")}>{item.icon}</span>
              <span className="text-body-lg">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {!isRecorder && !isEmployee && (
        <div className="mt-auto pt-lg border-t border-outline-variant/10 space-y-xs">
          <p className="text-label-md text-on-surface-variant/50 uppercase tracking-widest px-md mb-xs">Sistema</p>
          <Link
            href="/settings/team"
            onClick={close}
            className={cn(
              "flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200",
              pathname.startsWith("/settings/team")
                ? "text-secondary font-bold border-r-4 border-secondary bg-surface-container-high"
                : "text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            <span className={cn("material-symbols-outlined", pathname.startsWith("/settings/team") && "fill")}>group</span>
            <span className="text-body-lg">Usuarios</span>
          </Link>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {inner}
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}
    </>
  );
}
