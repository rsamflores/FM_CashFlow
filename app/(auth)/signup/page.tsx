"use client";

import { useActionState } from "react";
import { signup, type AuthState } from "../actions";
import { AuthShell, AuthFooter } from "@/components/auth/AuthShell";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signup,
    null,
  );

  return (
    <AuthShell>
      <div className="space-y-sm">
        <h2 className="text-headline-lg text-on-surface">Crear cuenta</h2>
        <p className="text-body-sm text-on-surface-variant">
          Únete a FM-CashFlow y empieza a controlar tus finanzas.
        </p>
      </div>

      <form
        action={formAction}
        className="grid grid-cols-1 md:grid-cols-2 gap-lg"
      >
        <Field
          name="full_name"
          label="Nombre completo"
          type="text"
          placeholder="Ej. Juan Pérez"
          full
        />
        <Field
          name="email"
          label="Correo electrónico"
          type="email"
          placeholder="email@ejemplo.com"
          autoComplete="email"
          full
        />
        <Field
          name="password"
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <Field
          name="confirm"
          label="Confirmar contraseña"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
        />

        {state?.error && (
          <p
            className="md:col-span-2 text-body-sm text-error"
            role="alert"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="md:col-span-2 w-full h-12 bg-primary-container hover:bg-primary disabled:opacity-50 transition-all text-on-primary-container text-title-md rounded-lg shadow-lg active:scale-[0.98]"
        >
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <AuthFooter
        text="¿Ya tienes cuenta?"
        linkHref="/login"
        linkText="Volver al login"
      />
    </AuthShell>
  );
}

function Field({
  name,
  label,
  type,
  placeholder,
  autoComplete,
  full,
}: {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  autoComplete?: string;
  full?: boolean;
}) {
  return (
    <div className={`space-y-sm ${full ? "md:col-span-2" : ""}`}>
      <label htmlFor={name} className="text-label-md text-on-surface-variant">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full h-12 px-md rounded-lg bg-surface-container-highest border-none text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none"
      />
    </div>
  );
}
