"use client";

import { useState, useTransition, useEffect } from "react";
import { resetMemberPassword } from "@/lib/actions/team";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
};

export function ResetPasswordDialog({ open, onClose, userId, displayName }: Props) {
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setShowPassword(false);
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres"); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    setError(null);
    startTransition(async () => {
      const res = await resetMemberPassword(userId, password);
      if (res?.error) { setError(res.error); return; }
      setSuccess(true);
      setTimeout(onClose, 1500);
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-md">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full rounded-2xl border border-outline-variant/10 bg-surface-container flex flex-col shadow-2xl overflow-hidden"
        style={{ maxWidth: 440 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>lock_reset</span>
            <div>
              <h2 className="text-body-sm font-bold text-on-surface">Cambiar contraseña</h2>
              <p className="text-label-md text-on-surface-variant">{displayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-xl px-lg text-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-secondary-fixed)" }}>check_circle</span>
            <p className="text-body-sm font-bold text-on-surface">Contraseña actualizada</p>
            <p className="text-label-md text-on-surface-variant">El usuario ya puede iniciar sesión con la nueva contraseña.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-md p-lg">
            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full h-10 px-md pr-10 rounded-lg bg-surface-container-low border border-outline-variant/20 text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Confirmar contraseña</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full h-10 px-md rounded-lg bg-surface-container-low border border-outline-variant/20 text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Strength indicator */}
            {password.length > 0 && (
              <div className="flex gap-xs">
                {[1, 2, 3, 4].map((level) => {
                  const strength = password.length >= 12 ? 4 : password.length >= 10 ? 3 : password.length >= 8 ? 2 : 1;
                  const color = strength >= 3 ? "var(--color-secondary-fixed)" : strength === 2 ? "var(--color-tertiary-fixed)" : "var(--color-error)";
                  return (
                    <div
                      key={level}
                      className="flex-1 h-1 rounded-full transition-colors"
                      style={{ background: level <= strength ? color : "var(--color-outline-variant)" }}
                    />
                  );
                })}
              </div>
            )}

            {error && (
              <p className="text-label-md px-sm py-xs rounded-lg" style={{ background: "var(--color-error)15", color: "var(--color-error)" }}>
                {error}
              </p>
            )}

            <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant/10">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-lg rounded-full text-body-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending || !password || !confirm}
                className="h-9 px-lg rounded-full text-body-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
