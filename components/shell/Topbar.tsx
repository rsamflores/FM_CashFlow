"use client";

import { logout } from "@/app/(auth)/actions";
import { useSidebar } from "@/lib/sidebar-context";
import { NotificationBell } from "./NotificationBell";

const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario", editor: "Editor", viewer: "Visor",
  recorder: "Registrador", employee: "Empleado",
};

export function Topbar({
  title,
  subtitle,
  userName,
  userRole,
}: {
  title: string;
  subtitle?: string;
  userName?: string;
  userRole?: string;
}) {
  const { toggle } = useSidebar();

  return (
    <header className="fixed top-0 right-0 w-full md:w-[calc(100%-240px)] z-40 bg-surface/80 backdrop-blur-md border-b border-outline-variant/10 flex items-center justify-between px-md md:px-lg h-16">
      <div className="flex items-center gap-sm">
        <button
          type="button"
          onClick={toggle}
          className="md:hidden p-sm text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-all"
          aria-label="Abrir menú"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="flex flex-col leading-tight">
          <span className="text-title-md font-bold text-on-surface">{title}</span>
          {subtitle && (
            <span className="text-body-sm text-on-surface-variant hidden sm:block">{subtitle}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-sm md:gap-md">
        {userName && (
          <div className="hidden sm:flex items-center gap-xs px-sm py-xs rounded-full border border-outline-variant/20 bg-surface-container">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--color-primary)" }}>account_circle</span>
            <div className="leading-tight">
              <p className="text-label-md font-bold text-on-surface">{userName}</p>
              {userRole && (
                <p className="text-label-md" style={{ color: "var(--color-primary)", fontSize: 10 }}>
                  {ROLE_LABEL[userRole] ?? userRole}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="hidden sm:flex items-center gap-xs">
          <NotificationBell />
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="p-sm text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-all"
            title="Cerrar sesión"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </form>
      </div>
    </header>
  );
}

