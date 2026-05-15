"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthState } from "../actions";
import { AuthShell, AuthFooter } from "@/components/auth/AuthShell";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    login,
    null,
  );

  return (
    <AuthShell>
      <div className="space-y-sm">
        <h2 className="text-headline-lg text-on-surface">Iniciar sesión</h2>
        <p className="text-body-sm text-on-surface-variant">
          Bienvenido de nuevo. Ingresa tus credenciales.
        </p>
      </div>

      <form action={formAction} className="space-y-lg">
        <div className="space-y-sm">
          <label
            htmlFor="email"
            className="text-label-md text-on-surface-variant"
          >
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="nombre@empresa.com"
            className="w-full h-12 px-md rounded-lg bg-surface-container-highest border-none text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container transition-all outline-none"
          />
        </div>

        <div className="space-y-sm">
          <div className="flex justify-between items-center">
            <label
              htmlFor="password"
              className="text-label-md text-on-surface-variant"
            >
              Contraseña
            </label>
            <Link
              href="/auth/forgot"
              className="text-label-md text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full h-12 px-md rounded-lg bg-surface-container-highest border-none text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container transition-all outline-none"
          />
        </div>

        {state?.error && (
          <p className="text-body-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full h-12 bg-primary-container hover:bg-primary disabled:opacity-50 transition-all text-on-primary-container text-title-md rounded-lg shadow-lg active:scale-[0.98]"
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <AuthFooter
        text="¿No tienes cuenta?"
        linkHref="/signup"
        linkText="Crear cuenta"
      />
    </AuthShell>
  );
}
