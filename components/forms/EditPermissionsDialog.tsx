"use client";

import { useState, useTransition, useEffect } from "react";
import { updateMemberPermissions } from "@/lib/actions/team";
import { setEmployeeAssignments } from "@/lib/actions/employee";

type Role = "editor" | "viewer" | "recorder" | "employee" | "owner" | "shopper";

type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
  currentRole: Role;
  currentScopes: string[];
  businessCategories?: CategoryOption[];
  currentAssignedCategories?: string[];
};

const ROLE_INFO: Record<Role, { label: string; desc: string }> = {
  owner:    { label: "Propietario",       desc: "Control total del sistema" },
  editor:   { label: "Editor",            desc: "Puede crear y editar transacciones, cuentas y categorías" },
  viewer:   { label: "Visor",             desc: "Solo puede ver la información, sin poder modificar nada" },
  recorder: { label: "Registrador",       desc: "Solo puede registrar nuevos ingresos y egresos" },
  employee: { label: "Empleado",          desc: "Registra gastos propios y solicita reembolsos en categorías asignadas" },
  shopper:  { label: "Lista de mercado",  desc: "Solo puede ver y editar la lista de compras — sin acceso a información financiera" },
};

export function EditPermissionsDialog({
  open,
  onClose,
  userId,
  displayName,
  currentRole,
  currentScopes,
  businessCategories = [],
  currentAssignedCategories = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>(currentRole);
  const [scopes, setScopes] = useState<string[]>(currentScopes);
  const [assignedCategoryIds, setAssignedCategoryIds] = useState<string[]>(currentAssignedCategories);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setRole(currentRole);
      setScopes(currentRole === "employee" ? ["business"] : currentScopes);
      setAssignedCategoryIds(currentAssignedCategories);
      setError(null);
      setSuccess(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentRole, currentScopes.join(","), currentAssignedCategories.join(",")]);

  // When role switches to employee, force business-only; shopper, force personal-only
  useEffect(() => {
    if (role === "employee") setScopes(["business"]);
    if (role === "shopper")  setScopes(["personal"]);
  }, [role]);

  function toggleScope(s: string) {
    if (role === "employee" || role === "shopper") return; // scope locked by role
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function toggleCategory(id: string) {
    setAssignedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scopes.length) { setError("Selecciona al menos un ámbito"); return; }
    setError(null);
    startTransition(async () => {
      const res = await updateMemberPermissions(userId, role as Exclude<Role, "owner">, scopes as ("personal" | "business")[]);
      if (res?.error) { setError(res.error); return; }

      // If employee, also save category assignments
      if (role === "employee" && scopes.includes("business")) {
        const assignRes = await setEmployeeAssignments(userId, "business", assignedCategoryIds);
        if ("error" in assignRes) { setError(assignRes.error); return; }
      }

      setSuccess(true);
      setTimeout(onClose, 1200);
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
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>manage_accounts</span>
            <div>
              <h2 className="text-body-sm font-bold text-on-surface">Editar permisos</h2>
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
            <p className="text-body-sm font-bold text-on-surface">Permisos actualizados</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-md p-lg">
            {/* Role */}
            <div>
              <label className="text-label-md text-on-surface-variant block mb-xs">Rol</label>
              <div className="flex flex-col gap-sm">
                {(["editor", "viewer", "recorder", "employee", "shopper"] as Exclude<Role, "owner">[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="rounded-lg border p-sm text-left transition-colors"
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
                  // Employee: business only; Shopper: personal only
                  const disabled = (role === "employee" && s === "personal") || (role === "shopper" && s === "business");
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => !disabled && toggleScope(s)}
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
                      <span className="text-body-sm font-bold">{s === "personal" ? "Personal" : "Empresarial"}</span>
                    </button>
                  );
                })}
              </div>
              {role === "employee" && (
                <p className="text-label-md text-on-surface-variant mt-xs">
                  Los empleados solo pueden acceder al ámbito empresarial.
                </p>
              )}
            </div>

            {/* Category assignments — only for employee role */}
            {role === "employee" && businessCategories.length > 0 && (
              <div>
                <label className="text-label-md text-on-surface-variant block mb-xs">
                  Categorías asignadas
                </label>
                <p className="text-label-md text-on-surface-variant mb-sm">
                  El empleado solo podrá registrar gastos en estas categorías.
                </p>
                <div className="flex flex-col gap-xs max-h-48 overflow-y-auto">
                  {businessCategories.filter((c) => (c as CategoryOption & { kind?: string }).kind === "expense" || true).map((cat) => {
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
                {assignedCategoryIds.length === 0 && (
                  <p className="text-label-md mt-xs" style={{ color: "var(--color-error)" }}>
                    Sin categorías asignadas — el empleado no podrá registrar gastos.
                  </p>
                )}
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
                disabled={isPending || !scopes.length}
                className="h-9 px-lg rounded-full text-body-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
