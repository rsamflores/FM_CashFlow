import { logout } from "@/app/(auth)/actions";

export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="fixed top-0 right-0 w-[calc(100%-240px)] z-40 bg-surface/80 backdrop-blur-md border-b border-outline-variant/10 flex items-center justify-between px-lg h-16 ml-[240px]">
      <div className="flex flex-col leading-tight">
        <span className="text-title-md font-bold text-on-surface">{title}</span>
        {subtitle && (
          <span className="text-body-sm text-on-surface-variant">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs">
          <IconButton icon="search" />
          <IconButton icon="notifications" badge />
        </div>
        <button
          type="button"
          className="hidden md:flex bg-primary-container text-on-primary-container font-bold px-md h-10 rounded-full text-body-sm items-center gap-xs hover:opacity-90"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            add
          </span>
          Nueva transacción
        </button>
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
