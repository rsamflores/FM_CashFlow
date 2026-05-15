import Link from "next/link";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", minHeight: "100vh", width: "100%" }}>
      <section
        className="hidden md:flex relative overflow-hidden bg-surface-container-low flex-col justify-between"
        style={{ width: "60%", flexShrink: 0, padding: 48 }}
      >
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-primary blur-[120px]" />
          <div className="absolute bottom-[10%] right-0 w-[60%] h-[60%] rounded-full bg-secondary-fixed-dim blur-[100px] opacity-20" />
        </div>

        <div className="relative z-10 flex items-center gap-sm">
          <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container">
              account_balance_wallet
            </span>
          </div>
          <span className="text-title-md font-bold text-secondary tracking-tight">
            FM-CashFlow
          </span>
        </div>

        <div className="relative z-10" style={{ maxWidth: 672 }}>
          <h1 className="text-headline-lg text-on-surface mb-lg leading-tight">
            Controla tus finanzas personales y de tu empresa en un solo lugar
          </h1>
          <div className="space-y-md">
            <Feature
              icon="account_balance"
              color="text-primary"
              title="Múltiples cuentas bancarias"
              desc="Centraliza bancos, efectivo y tarjetas en USD."
            />
            <Feature
              icon="receipt_long"
              color="text-secondary-fixed-dim"
              title="Gastos previstos vs reales"
              desc="Detecta desviaciones antes de que afecten tu presupuesto."
            />
            <Feature
              icon="analytics"
              color="text-tertiary"
              title="Reportes y exportación"
              desc="Datos listos para tu contador en Excel y PDF."
            />
          </div>
        </div>

        <p className="relative z-10 text-label-md text-outline">
          © {new Date().getFullYear()} FM-CashFlow · El Salvador · USD
        </p>
      </section>

      <section
        className="flex items-center justify-center bg-surface"
        style={{ flex: 1, padding: 48 }}
      >
        <div className="w-full flex flex-col gap-8" style={{ maxWidth: 440 }}>
          <div className="md:hidden flex items-center gap-sm mb-lg">
            <div className="w-8 h-8 bg-primary-container rounded-md flex items-center justify-center">
              <span
                className="material-symbols-outlined text-on-primary-container"
                style={{ fontSize: 18 }}
              >
                account_balance_wallet
              </span>
            </div>
            <span className="text-title-md font-bold text-secondary">
              FM-CashFlow
            </span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  color,
  title,
  desc,
}: {
  icon: string;
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-md">
      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-surface-container-high border border-outline-variant/20">
        <span className={`material-symbols-outlined ${color}`}>{icon}</span>
      </div>
      <div>
        <p className="text-body-lg text-on-surface">{title}</p>
        <p className="text-body-sm text-on-surface-variant">{desc}</p>
      </div>
    </div>
  );
}

export function AuthFooter({
  text,
  linkHref,
  linkText,
}: {
  text: string;
  linkHref: string;
  linkText: string;
}) {
  return (
    <div className="text-center pt-md border-t border-outline-variant/10">
      <p className="text-body-sm text-on-surface-variant">
        {text}{" "}
        <Link
          href={linkHref}
          className="text-secondary font-bold hover:text-primary transition-colors"
        >
          {linkText}
        </Link>
      </p>
    </div>
  );
}
