"use client";

import { useState, useTransition } from "react";
import { updateMemberRole, removeMember, deleteUser, type MemberRow } from "@/lib/actions/team";
import { InviteDialog } from "@/components/forms/InviteDialog";
import { EditPermissionsDialog } from "@/components/forms/EditPermissionsDialog";
import { ResetPasswordDialog } from "@/components/forms/ResetPasswordDialog";

type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
};

const ROLE_LABEL: Record<MemberRow["role"], string> = {
  owner:    "Propietario",
  editor:   "Editor",
  viewer:   "Visor",
  recorder: "Registrador",
  employee: "Empleado",
};

const ROLE_COLOR: Record<MemberRow["role"], string> = {
  owner:    "var(--color-secondary-fixed)",
  editor:   "var(--color-primary)",
  viewer:   "var(--color-outline)",
  recorder: "var(--color-tertiary-fixed)",
  employee: "var(--color-tertiary)",
};

const SCOPE_LABEL: Record<string, string> = {
  personal: "Personal",
  business: "Empresarial",
};

type Props = {
  members: MemberRow[];
  currentUserId: string;
  businessCategories?: CategoryOption[];
  employeeAssignments?: Record<string, string[]>;
};

type GroupedMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  accepted_at: string | null;
  invited_at: string;
  scopes: { scope: string; role: MemberRow["role"] }[];
};

export function TeamClient({ members, currentUserId, businessCategories = [], employeeAssignments = {} }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<GroupedMember | null>(null);
  const [resetUser, setResetUser] = useState<GroupedMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupedMember | null>(null);

  // Group by user
  const grouped = new Map<string, GroupedMember>();
  for (const m of members) {
    if (!grouped.has(m.user_id)) {
      grouped.set(m.user_id, {
        user_id: m.user_id,
        email: m.email,
        full_name: m.full_name,
        accepted_at: m.accepted_at,
        invited_at: m.invited_at,
        scopes: [],
      });
    }
    grouped.get(m.user_id)!.scopes.push({ scope: m.scope, role: m.role });
  }
  const users = [...grouped.values()];

  return (
    <>
      <header className="mb-xl flex items-end justify-between">
        <div>
          <h2 className="text-headline-lg text-on-surface">Equipo</h2>
          <p className="text-body-sm text-on-surface-variant">
            {users.length} miembro{users.length !== 1 ? "s" : ""} con acceso al sistema
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity text-body-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
          Invitar miembro
        </button>
      </header>

      {/* Role legend */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg mb-xl">
        <p className="text-label-md font-bold text-on-surface-variant mb-sm">Permisos por rol</p>
        <div className="grid gap-sm" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {[
            { role: "owner",    icon: "shield_person", perms: "Control total · puede invitar y eliminar miembros" },
            { role: "editor",   icon: "edit",          perms: "Crear y editar transacciones, cuentas y categorías" },
            { role: "viewer",   icon: "visibility",    perms: "Solo lectura · no puede modificar datos" },
            { role: "recorder", icon: "edit_note",     perms: "Solo puede registrar ingresos y egresos" },
            { role: "employee", icon: "person",        perms: "Gastos propios y solicitudes de reembolso" },
          ].map(({ role, icon, perms }) => (
            <div key={role} className="flex items-start gap-sm">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: ROLE_COLOR[role as MemberRow["role"]] + "20" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: ROLE_COLOR[role as MemberRow["role"]] }}>
                  {icon}
                </span>
              </div>
              <div>
                <p className="text-body-sm font-bold text-on-surface">{ROLE_LABEL[role as MemberRow["role"]]}</p>
                <p className="text-label-md text-on-surface-variant">{perms}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Members list */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
        {/* Table header */}
        <div className="hidden md:grid px-lg py-sm border-b border-outline-variant/10 bg-surface-container"
          style={{ gridTemplateColumns: "1fr 200px 120px 140px" }}>
          <span className="text-label-md text-on-surface-variant">Miembro</span>
          <span className="text-label-md text-on-surface-variant">Acceso</span>
          <span className="text-label-md text-on-surface-variant">Estado</span>
          <span className="text-label-md text-on-surface-variant text-right">Acciones</span>
        </div>

        {users.map((user) => (
          <MemberRowItem
            key={user.user_id}
            user={user}
            isCurrentUser={user.user_id === currentUserId}
            allMembers={members}
            onEdit={() => setEditUser(user)}
            onResetPassword={() => setResetUser(user)}
            onDelete={() => setDeleteTarget(user)}
          />
        ))}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        businessCategories={businessCategories}
      />

      {editUser && (
        <EditPermissionsDialog
          open={!!editUser}
          onClose={() => setEditUser(null)}
          userId={editUser.user_id}
          displayName={editUser.full_name ?? editUser.email ?? "—"}
          currentRole={(editUser.scopes[0]?.role ?? "viewer") as MemberRow["role"]}
          currentScopes={editUser.scopes.map((s) => s.scope)}
          businessCategories={businessCategories}
          currentAssignedCategories={employeeAssignments[editUser.user_id] ?? []}
        />
      )}

      {resetUser && (
        <ResetPasswordDialog
          open={!!resetUser}
          onClose={() => setResetUser(null)}
          userId={resetUser.user_id}
          displayName={resetUser.full_name ?? resetUser.email ?? "—"}
        />
      )}

      {deleteTarget && (
        <DeleteUserDialog
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function MemberRowItem({
  user,
  isCurrentUser,
  allMembers,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  user: GroupedMember;
  isCurrentUser: boolean;
  allMembers: MemberRow[];
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const initials = user.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user.email?.[0] ?? "?").toUpperCase();

  const isOwnerAnywhere = user.scopes.some((s) => s.role === "owner");
  const isPending_ = !user.accepted_at;

  function handleRoleChange(scope: string, newRole: "editor" | "viewer" | "recorder" | "employee") {
    startTransition(async () => {
      await updateMemberRole(user.user_id, scope as "personal" | "business", newRole);
    });
  }

  function handleRemove(scope: string) {
    if (!confirm(`¿Eliminar acceso de ${user.email ?? "este miembro"} al ámbito ${SCOPE_LABEL[scope]}?`)) return;
    startTransition(async () => {
      await removeMember(user.user_id, scope as "personal" | "business");
    });
  }

  return (
    <div className="border-t border-outline-variant/10" style={{ opacity: isPending ? 0.6 : 1 }}>
      {/* Desktop */}
      <div className="hidden md:grid px-lg py-md items-start gap-md"
        style={{ gridTemplateColumns: "1fr 200px 120px 140px" }}>

        {/* Member info */}
        <div className="flex items-center gap-sm min-w-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-body-sm font-bold"
            style={{ background: "var(--color-primary)30", color: "var(--color-primary)" }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-xs">
              <p className="text-body-sm font-bold text-on-surface truncate">
                {user.full_name ?? user.email ?? "—"}
              </p>
              {isCurrentUser && (
                <span className="text-label-md px-xs rounded" style={{ background: "var(--color-secondary-fixed)20", color: "var(--color-secondary-fixed)" }}>
                  tú
                </span>
              )}
            </div>
            {user.full_name && (
              <p className="text-label-md text-on-surface-variant truncate">{user.email}</p>
            )}
          </div>
        </div>

        {/* Scope + role badges */}
        <div className="flex flex-col gap-xs">
          {user.scopes.map(({ scope, role }) => (
            <div key={scope} className="flex items-center gap-xs">
              <span className="text-label-md text-on-surface-variant w-24 shrink-0">{SCOPE_LABEL[scope]}</span>
              <RoleBadge role={role} />
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-xs">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: isPending_ ? "var(--color-outline)" : "var(--color-secondary-fixed)" }}
          />
          <span className="text-body-sm text-on-surface-variant">
            {isPending_ ? "Pendiente" : "Activo"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-xs justify-end">
          {!isCurrentUser && (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={isPending}
                className="flex items-center gap-xs h-7 px-sm rounded-full text-label-md font-bold transition-colors disabled:opacity-30"
                style={{ background: "var(--color-primary)15", color: "var(--color-primary)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                Editar rol
              </button>
              <button
                type="button"
                onClick={onResetPassword}
                disabled={isPending}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-30"
                title="Cambiar contraseña"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock_reset</span>
              </button>
              {!isOwnerAnywhere && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isPending}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors disabled:opacity-30"
                  title="Eliminar usuario"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="flex md:hidden items-start gap-sm px-lg py-md">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-body-sm font-bold"
          style={{ background: "var(--color-primary)30", color: "var(--color-primary)" }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-xs flex-wrap">
            <p className="text-body-sm font-bold text-on-surface truncate">
              {user.full_name ?? user.email ?? "—"}
            </p>
            {isCurrentUser && (
              <span className="text-label-md px-xs rounded" style={{ background: "var(--color-secondary-fixed)20", color: "var(--color-secondary-fixed)" }}>
                tú
              </span>
            )}
            <span
              className="text-label-md px-xs rounded"
              style={{ background: isPending_ ? "var(--color-outline)20" : "var(--color-secondary-fixed)15", color: isPending_ ? "var(--color-outline)" : "var(--color-secondary-fixed)" }}
            >
              {isPending_ ? "Pendiente" : "Activo"}
            </span>
          </div>
          {user.full_name && (
            <p className="text-label-md text-on-surface-variant truncate max-w-[180px]">{user.email}</p>
          )}
          <div className="flex flex-wrap gap-xs mt-xs">
            {user.scopes.map(({ scope, role }) => (
              <span key={scope} className="flex items-center gap-xs text-label-md text-on-surface-variant">
                {SCOPE_LABEL[scope]}: <RoleBadge role={role} />
              </span>
            ))}
          </div>
        </div>
        {!isCurrentUser && (
          <div className="flex gap-xs shrink-0">
            <button
              type="button"
              onClick={onEdit}
              disabled={isPending}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-30"
              title="Editar permisos"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
            </button>
            <button
              type="button"
              onClick={onResetPassword}
              disabled={isPending}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-30"
              title="Cambiar contraseña"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock_reset</span>
            </button>
            {!isOwnerAnywhere && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isPending}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors disabled:opacity-30"
                title="Eliminar usuario"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DeleteUserDialog({ user, onClose }: { user: GroupedMember; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const displayName = user.full_name ?? user.email ?? "este usuario";

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteUser(user.user_id);
      if ("error" in result) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-md">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full rounded-2xl border border-outline-variant/10 bg-surface-container shadow-2xl"
        style={{ maxWidth: 400 }}
      >
        <div className="p-lg flex flex-col gap-md">
          {/* Icon + title */}
          <div className="flex items-center gap-sm">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--color-error)20" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--color-error)" }}>
                delete_forever
              </span>
            </div>
            <div>
              <p className="text-body-sm font-bold text-on-surface">Eliminar usuario</p>
              <p className="text-label-md text-on-surface-variant">Esta acción no se puede deshacer</p>
            </div>
          </div>

          {/* Warning */}
          <div
            className="rounded-xl p-md text-label-md"
            style={{ background: "var(--color-error)10", color: "var(--color-on-surface-variant)" }}
          >
            Se eliminará a <strong className="text-on-surface">{displayName}</strong> permanentemente:
            <ul className="mt-xs space-y-[2px] list-disc list-inside">
              <li>Acceso a todos los ámbitos</li>
              <li>Asignaciones de categorías</li>
              <li>Cuenta de autenticación</li>
            </ul>
            <p className="mt-sm" style={{ color: "var(--color-error)" }}>
              Sus transacciones y solicitudes de reembolso quedarán registradas en el sistema.
            </p>
          </div>

          {error && (
            <p className="text-label-md px-sm py-xs rounded-lg" style={{ background: "var(--color-error)15", color: "var(--color-error)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-sm justify-end pt-sm border-t border-outline-variant/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-9 px-lg rounded-full text-body-sm text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="h-9 px-lg rounded-full text-body-sm font-bold transition-opacity disabled:opacity-50"
              style={{ background: "var(--color-error)", color: "var(--color-on-error)" }}
            >
              {isPending ? "Eliminando…" : "Eliminar usuario"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: MemberRow["role"] }) {
  return (
    <span
      className="text-label-md px-xs rounded font-bold"
      style={{ background: ROLE_COLOR[role] + "20", color: ROLE_COLOR[role] }}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
