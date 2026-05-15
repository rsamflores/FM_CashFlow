"use client";

import { logout } from "@/app/(auth)/actions";
import { useSidebar } from "@/lib/sidebar-context";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
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
        <div className="hidden sm:flex items-center gap-xs">
          <IconButton icon="search" />
          <IconButton icon="notifications" badge />
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

function IconButton({ icon, badge }: { icon: string; badge?: boolean }) {
  return (
    <button
      type="button"
      className="p-sm text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-all relative"
    >
      <span className="material-symbols-outlined">{icon}</span>
      {badge && (
        <span className="absolute top-2 right-2 w-2 h-2 bg-secondary-fixed rounded-full" />
      )}
    </button>
  );
}
