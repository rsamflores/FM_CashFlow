import Link from "next/link";

export type EmptyStateProps = {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  variant?: "default" | "compact";
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  variant = "default",
}: EmptyStateProps) {
  return (
    <section
      className={`flex flex-col items-center justify-center text-center mx-auto ${
        variant === "default" ? "py-xl" : "py-lg"
      }`}
      style={{ maxWidth: 672 }}
    >
      <div className="relative mb-lg">
        <div className="w-48 h-48 bg-surface-container-low rounded-full flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl" />
          <span
            className="material-symbols-outlined text-outline/30"
            style={{ fontSize: 96 }}
          >
            {icon}
          </span>
        </div>
      </div>
      <h3 className="text-headline-lg-mobile text-on-surface mb-sm">{title}</h3>
      <p className="text-body-sm text-on-surface-variant mb-lg" style={{ maxWidth: 480 }}>
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            add
          </span>
          {actionLabel}
        </Link>
      )}
    </section>
  );
}
