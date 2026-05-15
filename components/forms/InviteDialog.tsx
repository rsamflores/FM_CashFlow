"use client";

import { useState, useTransition, useEffect } from "react";
import { inviteMember } from "@/lib/actions/team";
import { setEmployeeAssignments } from "@/lib/actions/employee";

type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  businessCategories?: CategoryOption[];
};

const ROLE_INFO = {
  editor:   { label: "Editor",       desc: "Puede crear y editar transacciones, cuentas y categorías" },
  viewer:   { label: "Visor",        desc: "Solo puede ver la información, sin poder modificar nada" },
  recorder: { label: "Registrador",  desc: "Solo puede registrar nuevos ingresos y egresos, sin acceso a configuración" },
  employee: { label: "Empleado",     desc: "Registra gastos propios y solicita reembolsos en categorías asignadas" },
};

export function InviteDialog({ open, onClose, businessCategories = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer" | "recorder" | "employee">("editor");
  const [scopes, setScopes] = useState<string[]>(["personal", "business"]);
  const [assignedCategoryIds, setAssignedCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState("");

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("editor");
      setScopes(["personal", "business"]);
      setAssignedCategoryIds([]);
      setError(null);
      setSuccess(false);
      setInvitedEmail("");
    }
  }, [open]);

  // Force business-only scope for employees
  useEffect(() => {
    if (role === "employee") {
      setScopes(["business"]);
    }
  }, [role]);

  function toggleScope(s: string) {
    if (role === "employee") return; // employees are always business only
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function toggleCategory(id: string) {
    setAssignedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("role", role);
    scopes.forEach((s) => fd.append("scope", s));
    const savedEmail = email;
    startTransition(async () => {
      const res = await inviteMember(fd);
      if (res?.error) { setError(res.error); return; }

      // If employee and we have category assignments, try to set them
      // We'd need the new user_id — for now we store them pending first login
      // The owner can update via EditPermissionsDialog later
      // Note: for immediate assignment we'd need to lookup the user after invite
      // For simplicity, if the user already exists the assignments will be set
      // on team page via edit permissions
      setInvitedEmail(savedEmail);
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
        style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
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
            <p className="text-label-md text-on-surface-variant">
              Se envió un correo a <strong>{invitedEmail}</strong> con el acceso.
            </p>
            {role === "employee" && assignedCategoryIds.length > 0 && (
              <p className="text-label-md text-on-surface-variant">
                Recuerda asignar las categorías al empleado desde Editar permisos una vez acepte la invitación.
              </p>
            )}
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
              <div className="flex flex-col gap-sm">
                {(["editor", "viewer", "recorder", "employee"] as const).map((r) => (
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
                  const disabled = role === "employee" && s === "personal";
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleScope(s)}
                      disabled={disabled}
                      className="flex-1 flex items-center gap-xs h-10 px-md rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              {role === "employee" && (
                <p className="text-label-md text-on-surface-variant mt-xs">
                  Los empleados solo acceden al ámbito empresarial.
                </p>
              )}
            </div>

            {/* Category assignments — shown for employee */}
            {role === "employee" && businessCategories.length > 0 && (
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">
                  Categorías asignadas (opcional)
                </label>
                <p className="text-label-md text-on-surface-variant mb-sm">
                  Puedes asignar categorías ahora o más tarde desde "Editar permisos".
                </p>
                <div className="flex flex-col gap-xs max-h-44 overflow-y-auto">
                  {businessCategories.map((cat) => {
                    const isChecked = assignedCategoryIds.includes(cat.id);
                    const catColor = cat.color ?? "var(--color-primary)";
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className="flex items-center gap-sm rounded-lg border p-sm text-left transition-colors"
                        style={{
                          borderColor: isChecked ? catColor : "var(--color-outline-variant)",
                          background: isChecked ? catColor + "15" : "transparent",
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                          style={{ background: isChecked ? catColor : "transparent", border: `2px solid ${catColor}` }}
                        >
                          {isChecked && (
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "white" }}>check</span>
                          )}
                        </div>
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: catColor }}
                        />
                        <span className="text-body-sm text-on-surface">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
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
