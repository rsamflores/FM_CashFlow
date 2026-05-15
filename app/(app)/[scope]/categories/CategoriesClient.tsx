"use client";

import { useState } from "react";
import { CategoryDialog } from "@/components/forms/CategoryDialog";
import { deleteCategory, type CategoryRow } from "@/lib/actions/categories";
import type { Scope } from "@/lib/scope";

type Props = {
  scope: Scope;
  categories: CategoryRow[];
};

export function CategoriesClient({ scope, categories }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultKind, setDefaultKind] = useState<"income" | "expense">("expense");
  const [editCategory, setEditCategory] = useState<CategoryRow | undefined>();

  const income = categories.filter((c) => c.kind === "income");
  const expenses = categories.filter((c) => c.kind === "expense");

  function openCreate(kind: "income" | "expense") {
    setEditCategory(undefined);
    setDefaultKind(kind);
    setDialogOpen(true);
  }

  function openEdit(cat: CategoryRow) {
    setEditCategory(cat);
    setDialogOpen(true);
  }

  async function handleDelete(cat: CategoryRow) {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    await deleteCategory(cat.id, scope);
  }

  return (
    <>
      <header className="mb-xl flex items-end justify-between">
        <div>
          <h2 className="text-headline-lg text-on-surface">Categorías</h2>
          <p className="text-body-sm text-on-surface-variant">
            {income.length} ingresos · {expenses.length} egresos
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate("expense")}
          className="flex items-center gap-xs h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-opacity text-body-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Nueva categoría
        </button>
      </header>

      <div className="grid gap-lg" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <KindColumn
          title="Ingresos"
          kind="income"
          accentColor="var(--color-secondary-fixed)"
          categories={income}
          onAdd={() => openCreate("income")}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        <KindColumn
          title="Egresos"
          kind="expense"
          accentColor="var(--color-error)"
          categories={expenses}
          onAdd={() => openCreate("expense")}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      <CategoryDialog
        scope={scope}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultKind={defaultKind}
        editCategory={editCategory}
      />
    </>
  );
}

function KindColumn({
  title,
  kind,
  accentColor,
  categories,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  kind: "income" | "expense";
  accentColor: string;
  categories: CategoryRow[];
  onAdd: () => void;
  onEdit: (cat: CategoryRow) => void;
  onDelete: (cat: CategoryRow) => void;
}) {
  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div
        className="flex items-center justify-between px-lg py-md border-b border-outline-variant/10"
        style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
      >
        <div className="flex items-center gap-sm">
          <span className="text-body-lg font-bold text-on-surface">{title}</span>
          <span
            className="text-label-md px-sm py-xs rounded-full"
            style={{ background: accentColor + "20", color: accentColor }}
          >
            {categories.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          title={`Nueva categoría de ${title.toLowerCase()}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-xl text-center px-lg">
          <span
            className="material-symbols-outlined text-outline/30 mb-sm"
            style={{ fontSize: 40 }}
          >
            {kind === "income" ? "trending_up" : "trending_down"}
          </span>
          <p className="text-body-sm text-on-surface-variant">Sin categorías</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-md text-label-md font-bold hover:underline"
            style={{ color: accentColor }}
          >
            + Agregar
          </button>
        </div>
      ) : (
        <ul>
          {categories.map((cat, idx) => (
            <li
              key={cat.id}
              className="flex items-center gap-md px-lg py-sm group hover:bg-surface-container transition-colors"
              style={{ borderTop: idx > 0 ? "1px solid var(--color-outline-variant)10" : undefined }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: (cat.color ?? accentColor) + "25" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: cat.color ?? accentColor }}
                >
                  {cat.icon ?? (kind === "income" ? "trending_up" : "shopping_cart")}
                </span>
              </div>
              <span className="flex-1 text-body-sm text-on-surface">{cat.name}</span>
              <div className="flex gap-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onEdit(cat)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(cat)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
