"use client";

import { useState, useTransition, useEffect } from "react";
import { inviteMember } from "@/lib/actions/team";

type Props = {
  open: boolean;
  onClose: () => void;
};

const ROLE_INFO = {
  editor: { label: "Editor", desc: "Puede crear y editar transacciones, cuentas y categorías" },
  viewer: { label: "Visor", desc: "Solo puede ver la información, sin poder modificar nada" },
};

export function InviteDialog({ open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [scopes, setScopes] = useState<string[]>(["personal", "business"]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("editor");
      setScopes(["personal", "business"]);
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  function toggleScope(s: string) {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("role", role);
    scopes.forEach((s) => fd.append("scope", s));
    startTransition(async () => {
      const res = await inviteMember(fd);
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
        style={{ maxWidth: 480 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>person_add</span>
            <h2 className="text-body-sm font-bold text-on-surface">Invitar miembro</h2>
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
            <span className="material-symbols-outlined text-secondary-fixed" style={{ fontSize: 48 }}>check_circle</span>
            <p className="text-body-sm font-bold text-on-surface">Invitación enviada</p>
            <p className="text-label-md text-on-surface-variant">Se envió un correo a <strong>{email}</strong> con el acceso.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-md p-lg">
            {/* Email */}
            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Correo electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                className="w-full h-10 px-md rounded-lg bg-surface-container-low border border-outline-variant/20 text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Role */}
            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Rol</label>
              <div className="flex gap-sm">
                {(["editor", "viewer"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="flex-1 rounded-lg border p-sm text-left transition-colors"
                    style={{
                      borderColor: role === r ? "var(--color-primary)" : "var(--color-outline-variant)",
                      background: role === r ? "var(--color-primary)15" : "transparent",
                    }}
                  >
                    <p className="text-body-sm font-bold text-on-surface">{ROLE_INFO[r].label}</p>
                    <p className="text-label-md text-on-surface-variant mt-xs">{ROLE_INFO[r].desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Scopes */}
            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Acceso a</label>
              <div className="flex gap-sm">
                {(["personal", "business"] as const).map((s) => {
                  const active = scopes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleScope(s)}
                      className="flex-1 flex items-center gap-xs h-10 px-md rounded-lg border transition-colors"
                      style={{
                        borderColor: active ? "var(--color-secondary-fixed)" : "var(--color-outline-variant)",
                        background: active ? "var(--color-secondary-fixed)15" : "transparent",
                        color: active ? "var(--color-secondary-fixed)" : "var(--color-on-surface-variant)",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {active ? "check_box" : "check_box_outline_blank"}
                      </span>
                      <span className="text-body-sm font-bold capitalize">{s === "personal" ? "Personal" : "Empresarial"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

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
                disabled={isPending || !email || !scopes.length}
                className="h-9 px-lg rounded-full text-body-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Enviando…" : "Enviar invitación"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
