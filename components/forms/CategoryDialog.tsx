"use client";

import { useState, useEffect, useTransition } from "react";
import {
  createCategory,
  updateCategory,
  type CategoryRow,
} from "@/lib/actions/categories";
import type { Scope } from "@/lib/scope";

const COLORS = [
  "#c0c1ff", "#c3f400", "#4cd6ff", "#ffb4ab", "#abd600",
  "#8083ff", "#009dc1", "#ff8fab", "#a8e063", "#ffd93d",
];

const ICONS = [
  // Finanzas
  "payments", "savings", "trending_up", "trending_down", "account_balance",
  "credit_card", "currency_exchange", "attach_money", "wallet", "receipt_long",
  // Hogar
  "home", "house", "water_drop", "bolt", "local_gas_station", "cleaning_services",
  // Alimentación
  "restaurant", "local_cafe", "local_pizza", "grocery", "lunch_dining", "bakery_dining",
  // Transporte
  "directions_car", "directions_bus", "flight", "local_taxi", "two_wheeler", "train",
  // Salud
  "medical_services", "local_pharmacy", "fitness_center", "spa", "favorite", "self_improvement",
  // Educación y trabajo
  "school", "work", "business_center", "laptop", "menu_book", "science",
  // Entretenimiento
  "sports_esports", "movie", "music_note", "sports_soccer", "celebration", "theater_comedy",
  // Compras
  "shopping_cart", "shopping_bag", "storefront", "checkroom", "diamond", "card_giftcard",
  // Tecnología
  "phone_android", "wifi", "tv", "headphones", "watch", "devices",
  // Otros
  "pets", "child_care", "volunteer_activism", "church", "travel_explore", "more_horiz",
];

type Props = {
  scope: Scope;
  open: boolean;
  onClose: () => void;
  defaultKind?: "income" | "expense";
  editCategory?: CategoryRow;
};

export function CategoryDialog({
  scope,
  open,
  onClose,
  defaultKind = "expense",
  editCategory,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedColor, setSelectedColor] = useState(
    editCategory?.color ?? COLORS[0],
  );
  const [selectedIcon, setSelectedIcon] = useState(
    editCategory?.icon ?? ICONS[0],
  );
  const [kind, setKind] = useState<"income" | "expense">(
    editCategory?.kind ?? defaultKind,
  );
  const [isTaxExempt, setIsTaxExempt] = useState(editCategory?.is_tax_exempt ?? false);
  const [iconSearch, setIconSearch] = useState("");

  // Reset all controlled state when the dialog opens or switches between create/edit
  useEffect(() => {
    if (open) {
      setKind(editCategory?.kind ?? defaultKind);
      setSelectedColor(editCategory?.color ?? COLORS[0]);
      setSelectedIcon(editCategory?.icon ?? ICONS[0]);
      setIsTaxExempt(editCategory?.is_tax_exempt ?? false);
      setIconSearch("");
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCategory?.id]);

  const filteredIcons = iconSearch.trim()
    ? ICONS.filter((icon) =>
        icon.replace(/_/g, " ").includes(iconSearch.toLowerCase().trim()),
      )
    : ICONS;

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("color", selectedColor);
    formData.set("icon", selectedIcon);
    formData.set("kind", kind);
    formData.set("is_tax_exempt", isTaxExempt ? "true" : "false");
    setError(null);
    startTransition(async () => {
      const result = editCategory
        ? await updateCategory(editCategory.id, scope, formData)
        : await createCategory(scope, formData);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full"
        style={{ maxWidth: 480, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between p-lg border-b border-outline-variant/10">
          <h2 className="text-title-md text-on-surface">
            {editCategory ? "Editar categoría" : "Nueva categoría"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-lg flex flex-col gap-lg">
          {/* Kind toggle */}
          <div className="flex bg-surface-container-high rounded-full p-xs gap-xs">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="flex-1 h-9 rounded-full text-label-md font-bold transition-colors"
                  style={
                    kind === k
                      ? {
                          background: k === "income" ? "var(--color-secondary-container)" : "var(--color-error-container)",
                          color: k === "income" ? "var(--color-on-secondary-container)" : "var(--color-on-error-container)",
                        }
                      : { color: "var(--color-on-surface-variant)" }
                  }
                >
                  {k === "income" ? "Ingreso" : "Egreso"}
                </button>
              ))}
            </div>

          {/* Name */}
          <div className="flex flex-col gap-xs">
            <label className="text-label-md text-on-surface-variant">
              Nombre *
            </label>
            <input
              name="name"
              required
              defaultValue={editCategory?.name}
              placeholder={kind === "income" ? "Ej: Sueldo" : "Ej: Supermercado"}
              className="h-12 px-md rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-container outline-none border-none"
            />
          </div>

          {/* Color */}
          <div className="flex flex-col gap-sm">
            <label className="text-label-md text-on-surface-variant">Color</label>
            <div className="flex gap-sm flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className="w-8 h-8 rounded-full transition-all"
                  style={{
                    backgroundColor: color,
                    outline: selectedColor === color ? "2px solid white" : "2px solid transparent",
                    outlineOffset: 2,
                    transform: selectedColor === color ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="flex flex-col gap-sm">
            <label className="text-label-md text-on-surface-variant">Ícono</label>
            <div className="relative">
              <span
                className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline pointer-events-none"
                style={{ fontSize: 18 }}
              >
                search
              </span>
              <input
                type="text"
                placeholder="Buscar ícono…"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                className="w-full h-9 pl-[36px] pr-sm rounded-lg bg-surface-container-high text-on-surface placeholder:text-outline text-body-sm focus:ring-2 focus:ring-primary-container outline-none border-none"
              />
            </div>
            <div
              className="flex gap-xs flex-wrap overflow-y-auto custom-scrollbar"
              style={{ maxHeight: 160 }}
            >
              {filteredIcons.length === 0 ? (
                <p className="text-body-sm text-outline py-sm">Sin resultados</p>
              ) : filteredIcons.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: selectedIcon === icon ? selectedColor + "40" : "var(--color-surface-container-high)",
                    outline: selectedIcon === icon ? `2px solid ${selectedColor}` : "2px solid transparent",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 20, color: selectedIcon === icon ? selectedColor : "var(--color-on-surface-variant)" }}
                  >
                    {icon}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tax exempt — business income only */}
          {scope === "business" && kind === "income" && (
            <label className="flex items-center gap-sm cursor-pointer select-none">
              <div
                onClick={() => setIsTaxExempt(!isTaxExempt)}
                className="relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0"
                style={{ background: isTaxExempt ? "var(--color-surface-container-highest)" : "var(--color-tertiary-container)" }}
              >
                <div
                  className="absolute top-1 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: isTaxExempt ? "var(--color-outline)" : "var(--color-on-tertiary-container)",
                    left: isTaxExempt ? "4px" : "calc(100% - 20px)",
                  }}
                />
              </div>
              <div>
                <p className="text-body-sm text-on-surface">Exenta de impuestos</p>
                <p className="text-label-md text-on-surface-variant">
                  Los ingresos de esta categoría no generarán cálculo de IVA
                </p>
              </div>
            </label>
          )}

          {error && <p className="text-body-sm text-error">{error}</p>}

          <div className="flex gap-sm justify-end pt-sm border-t border-outline-variant/10">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-lg rounded-full bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors text-body-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-10 px-lg rounded-full bg-primary-container text-on-primary-container hover:opacity-90 disabled:opacity-50 transition-all text-body-sm font-bold"
            >
              {isPending ? "Guardando…" : editCategory ? "Guardar cambios" : "Crear categoría"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
