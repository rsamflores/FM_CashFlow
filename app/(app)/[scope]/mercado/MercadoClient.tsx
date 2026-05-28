"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import {
  addItem,
  removeItem,
  updateItem,
  toggleItemChecked,
  searchProducts,
  type ShoppingListRow,
  type ShoppingListItemRow,
  type Suggestion,
  type ProductHit,
  type StoreBudgetSnapshot,
  type Store,
  type HistoryEntry,
} from "@/lib/actions/shopping";
import { PurchaseDialog } from "./PurchaseDialog";

type Props = {
  list: ShoppingListRow;
  items: ShoppingListItemRow[];
  suggestions: Suggestion[];
  budgets: { walmart: StoreBudgetSnapshot; pricesmart: StoreBudgetSnapshot };
  accounts: AccountRow[];
  categories: CategoryRow[];
  history: HistoryEntry[];
};

const STORE_LABEL: Record<Store, string> = {
  walmart: "Walmart",
  pricesmart: "PriceSmart",
  manual: "Otro",
};

const STORE_COLOR: Record<Store, string> = {
  walmart: "#0071ce",
  pricesmart: "#ef4123",
  manual: "var(--color-tertiary)",
};

const STORE_ICON: Record<Store, string> = {
  walmart: "shopping_cart",
  pricesmart: "store",
  manual: "edit",
};

export function MercadoClient({
  list,
  items,
  suggestions,
  budgets,
  accounts,
  categories,
  history,
}: Props) {
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  // Totals per store
  const sum = (s: Store) =>
    items.filter((i) => i.store === s).reduce((acc, i) => acc + Number(i.quantity) * Number(i.unit_price), 0);
  const totalWalmart = sum("walmart");
  const totalPricesmart = sum("pricesmart");
  const totalManual = sum("manual");
  const grandTotal = totalWalmart + totalPricesmart + totalManual;

  return (
    <div className="flex flex-col gap-lg">
      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-md">
        <div>
          <h2 className="text-headline-lg text-on-surface">{list.name}</h2>
          <p className="text-body-sm text-on-surface-variant">
            {items.length} item{items.length !== 1 ? "s" : ""} · Total{" "}
            <span className="font-bold text-on-surface">{formatCurrency(grandTotal)}</span>
          </p>
        </div>
        <button
          type="button"
          disabled={grandTotal <= 0}
          onClick={() => setPurchaseOpen(true)}
          className="h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold flex items-center gap-xs disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shopping_cart_checkout</span>
          Marcar como comprada
        </button>
      </header>

      {/* Budget cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <BudgetCard store="walmart" snap={budgets.walmart} listTotal={totalWalmart} />
        <BudgetCard store="pricesmart" snap={budgets.pricesmart} listTotal={totalPricesmart} />
      </div>

      {/* Search / add panel */}
      <SearchPanel listId={list.id} />

      {/* Items grouped by store */}
      <ItemGroups items={items} />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <SuggestionsPanel suggestions={suggestions} listId={list.id} />
      )}

      {/* History */}
      {history.length > 0 && <HistoryPanel history={history} />}

      <PurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        listId={list.id}
        totals={{ walmart: totalWalmart, pricesmart: totalPricesmart, manual: totalManual }}
        budgets={budgets}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget card
// ─────────────────────────────────────────────────────────────────────────────

function BudgetCard({
  store,
  snap,
  listTotal,
}: {
  store: "walmart" | "pricesmart";
  snap: StoreBudgetSnapshot;
  listTotal: number;
}) {
  const hasBudget = snap.expected > 0;
  const projected = snap.spent + listTotal;
  const remaining = Math.max(0, snap.expected - projected);
  const pct = hasBudget ? Math.min((projected / snap.expected) * 100, 100) : 0;
  const over = hasBudget && projected > snap.expected;
  const near = hasBudget && projected >= snap.expected * 0.8 && !over;

  const barColor = over
    ? "var(--color-error)"
    : near
      ? "#ffd93d"
      : "var(--color-secondary-fixed)";

  return (
    <div
      className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-md flex flex-col gap-sm"
      style={{ borderColor: over ? "var(--color-error)" : undefined }}
    >
      <div className="flex items-center gap-sm">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: STORE_COLOR[store] + "20" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: STORE_COLOR[store] }}>
            {STORE_ICON[store]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-bold text-on-surface">{STORE_LABEL[store]}</p>
          <p className="text-label-md text-on-surface-variant">
            Presupuesto: <span className="font-bold">{snap.category_name}</span>
            {!snap.category_id && (
              <span className="ml-xs text-error">(crea esta categoría para activar comparación)</span>
            )}
          </p>
        </div>
      </div>

      {hasBudget ? (
        <>
          <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <div className="flex justify-between text-label-md">
            <span className="text-on-surface-variant">
              {formatCurrency(snap.spent)} ya gastado
              {listTotal > 0 && (
                <> + <span className="font-bold">{formatCurrency(listTotal)}</span> de la lista</>
              )}
            </span>
            <span
              className="font-bold"
              style={{ color: over ? "var(--color-error)" : "var(--color-on-surface)" }}
            >
              {over
                ? `Excede ${formatCurrency(projected - snap.expected)}`
                : `${formatCurrency(remaining)} restante`}
            </span>
          </div>
          <p className="text-label-md text-on-surface-variant">
            de {formatCurrency(snap.expected)} mensual
          </p>
        </>
      ) : (
        <p className="text-label-md text-on-surface-variant">
          {snap.category_id
            ? "Sin presupuesto para este mes."
            : "Crea la categoría y asígnale un presupuesto en Presupuestos."}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search panel — Walmart + PriceSmart lookup + manual add
// ─────────────────────────────────────────────────────────────────────────────

function SearchPanel({ listId }: { listId: string }) {
  const [query, setQuery] = useState("");
  const [searchStore, setSearchStore] = useState<"walmart" | "pricesmart">("walmart");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);

  async function runSearch(store: "walmart" | "pricesmart" = searchStore) {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(false);
    setResults([]);
    try {
      const hits = await searchProducts(store, q);
      setResults(hits);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function switchStore(store: "walmart" | "pricesmart") {
    setSearchStore(store);
    setResults([]);
    setSearched(false);
  }

  function addHit(h: ProductHit) {
    startTransition(async () => {
      await addItem({
        list_id: listId,
        name: h.name,
        store: h.store,
        quantity: 1,
        unit_price: h.price,
        image_url: h.image_url ?? undefined,
        product_url: h.product_url ?? undefined,
        external_id: h.external_id ?? undefined,
      });
    });
  }

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-md flex flex-col gap-sm">
      {/* Store toggle + manual add */}
      <div className="flex items-center gap-sm flex-wrap">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-primary)" }}>
          search
        </span>
        <h3 className="text-body-sm font-bold text-on-surface flex-1">Buscar productos</h3>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="h-9 px-md rounded-full bg-surface-container-high text-on-surface text-body-sm font-bold flex items-center gap-xs"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Añadir manual
        </button>
      </div>

      {/* Store selector */}
      <div className="flex gap-xs">
        <button
          type="button"
          onClick={() => switchStore("walmart")}
          className="h-8 px-md rounded-full text-body-sm font-bold transition-colors flex items-center gap-xs"
          style={{
            background: searchStore === "walmart" ? STORE_COLOR.walmart : "var(--color-surface-container-high)",
            color: searchStore === "walmart" ? "#fff" : "var(--color-on-surface-variant)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>shopping_cart</span>
          Walmart
        </button>
        <button
          type="button"
          onClick={() => switchStore("pricesmart")}
          className="h-8 px-md rounded-full text-body-sm font-bold transition-colors flex items-center gap-xs"
          style={{
            background: searchStore === "pricesmart" ? STORE_COLOR.pricesmart : "var(--color-surface-container-high)",
            color: searchStore === "pricesmart" ? "#fff" : "var(--color-on-surface-variant)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>store</span>
          PriceSmart
        </button>
      </div>

      {/* Search input */}
      <div className="flex items-center gap-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder={searchStore === "walmart" ? "leche, huevos, papel higiénico…" : "busca en PriceSmart SV…"}
          className="flex-1 h-10 px-md rounded-lg bg-surface-container text-on-surface text-body-sm focus:ring-2 focus:ring-primary-container outline-none border-none"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => runSearch()}
          className="h-10 px-md rounded-full font-bold text-body-sm disabled:opacity-50 text-white"
          style={{ background: STORE_COLOR[searchStore] }}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {searched && results.length === 0 && !loading && (
        <p className="text-label-md text-on-surface-variant">
          Sin resultados. Usa &quot;Añadir manual&quot; o intenta otra búsqueda.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-sm">
          {results.map((h) => (
            <button
              key={h.external_id}
              type="button"
              disabled={pending}
              onClick={() => addHit(h)}
              className="text-left rounded-xl border border-outline-variant/15 bg-surface-container hover:bg-surface-container-high transition-colors p-sm flex gap-sm disabled:opacity-50"
            >
              {h.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.image_url}
                  alt={h.name}
                  className="w-16 h-16 object-contain rounded-md bg-white shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-16 h-16 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 24 }}>
                    image
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-label-md text-on-surface line-clamp-2">{h.name}</p>
                {h.price > 0 ? (
                  <p className="text-body-sm font-bold mt-xs" style={{ color: STORE_COLOR[h.store] }}>
                    {formatCurrency(h.price)}
                  </p>
                ) : (
                  <p className="text-label-md text-on-surface-variant mt-xs italic">Editar precio</p>
                )}
                <p className="text-label-md text-on-surface-variant mt-xs">+ Añadir</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {manualOpen && <ManualAddDialog listId={listId} onClose={() => setManualOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual add dialog
// ─────────────────────────────────────────────────────────────────────────────

function ManualAddDialog({ listId, onClose }: { listId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [store, setStore] = useState<Store>("manual");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const qn = Number(qty);
    const pn = Number(price);
    if (!name.trim()) return setError("Nombre requerido");
    if (!qn || qn <= 0) return setError("Cantidad inválida");
    if (pn < 0 || Number.isNaN(pn)) return setError("Precio inválido");
    startTransition(async () => {
      const res = await addItem({
        list_id: listId,
        name,
        store,
        quantity: qn,
        unit_price: pn,
      });
      if ("error" in res && res.error) setError(res.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} style={{ backdropFilter: "blur(4px)" }} />
      <div className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full p-lg flex flex-col gap-md"
        style={{ maxWidth: 380, margin: "0 16px" }}
      >
        <h3 className="text-title-md text-on-surface">Añadir producto manual</h3>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Nombre</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm focus:ring-2 focus:ring-primary-container outline-none border-none"
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Tienda (afecta presupuesto)</span>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as Store)}
            className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm focus:ring-2 focus:ring-primary-container outline-none border-none"
          >
            <option value="walmart">Walmart (Supermercado)</option>
            <option value="pricesmart">PriceSmart</option>
            <option value="manual">Otro / sin tienda</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-sm">
          <label className="flex flex-col gap-xs">
            <span className="text-label-md text-on-surface-variant">Cantidad</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
            />
          </label>
          <label className="flex flex-col gap-xs">
            <span className="text-label-md text-on-surface-variant">Precio unitario</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
            />
          </label>
        </div>

        {error && <p className="text-label-md text-error">{error}</p>}

        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onClose} className="h-10 px-md rounded-full bg-surface-container-high text-on-surface text-body-sm font-bold">
            Cancelar
          </button>
          <button type="button" disabled={pending} onClick={submit} className="h-10 px-md rounded-full bg-primary-container text-on-primary-container text-body-sm font-bold disabled:opacity-50">
            {pending ? "Guardando…" : "Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Items grouped by store
// ─────────────────────────────────────────────────────────────────────────────

function ItemGroups({ items }: { items: ShoppingListItemRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-xl text-center">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 40 }}>
          shopping_basket
        </span>
        <p className="text-body-sm text-on-surface-variant mt-sm">
          Tu lista está vacía. Busca productos arriba o añade manualmente.
        </p>
      </div>
    );
  }

  const stores: Store[] = ["walmart", "pricesmart", "manual"];
  return (
    <div className="flex flex-col gap-md">
      {stores.map((store) => {
        const group = items.filter((i) => i.store === store);
        if (group.length === 0) return null;
        const subtotal = group.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
        return (
          <div key={store} className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
            <div
              className="px-lg py-sm border-b border-outline-variant/10 flex items-center gap-sm"
              style={{ background: STORE_COLOR[store] + "12" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: STORE_COLOR[store] }}>
                {STORE_ICON[store]}
              </span>
              <h3 className="text-body-sm font-bold flex-1" style={{ color: STORE_COLOR[store] }}>
                {STORE_LABEL[store]} ({group.length})
              </h3>
              <span className="text-body-sm font-bold text-on-surface">{formatCurrency(subtotal)}</span>
            </div>
            <ul className="divide-y divide-outline-variant/10">
              {group.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ item }: { item: ShoppingListItemRow }) {
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(String(item.unit_price));
  const [pending, startTransition] = useTransition();

  function commitQty() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0 || n === Number(item.quantity)) {
      setQty(String(item.quantity));
      return;
    }
    startTransition(async () => {
      await updateItem(item.id, { quantity: n });
    });
  }
  function commitPrice() {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0 || n === Number(item.unit_price)) {
      setPrice(String(item.unit_price));
      return;
    }
    startTransition(async () => {
      await updateItem(item.id, { unit_price: n });
    });
  }
  function toggle() {
    startTransition(async () => {
      await toggleItemChecked(item.id, !item.is_checked);
    });
  }
  function remove() {
    if (!confirm("¿Eliminar este item?")) return;
    startTransition(async () => {
      await removeItem(item.id);
    });
  }

  const subtotal = Number(item.quantity) * Number(item.unit_price);

  return (
    <li className="flex items-center gap-sm px-md py-sm" style={{ opacity: pending ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={toggle}
        className="w-5 h-5 accent-primary shrink-0"
        title="En el carrito"
      />
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.name}
          className="w-12 h-12 object-contain rounded-md bg-white shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>
            shopping_basket
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p
          className="text-body-sm text-on-surface truncate"
          style={{ textDecoration: item.is_checked ? "line-through" : "none" }}
        >
          {item.name}
        </p>
        <p className="text-label-md text-on-surface-variant">{formatCurrency(subtotal)}</p>
      </div>
      <input
        type="number"
        step="0.01"
        min="0"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={commitQty}
        className="w-16 h-8 px-sm rounded-md bg-surface-container-high text-on-surface text-body-sm text-right outline-none border-none"
        title="Cantidad"
      />
      <span className="text-label-md text-on-surface-variant">×</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={commitPrice}
        className="w-20 h-8 px-sm rounded-md bg-surface-container-high text-on-surface text-body-sm text-right outline-none border-none"
        title="Precio unitario"
      />
      <button
        type="button"
        onClick={remove}
        title="Eliminar"
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestions
// ─────────────────────────────────────────────────────────────────────────────

function SuggestionsPanel({ suggestions, listId }: { suggestions: Suggestion[]; listId: string }) {
  const [pending, startTransition] = useTransition();
  function pick(s: Suggestion) {
    startTransition(async () => {
      await addItem({
        list_id: listId,
        name: s.name,
        store: s.store,
        quantity: 1,
        unit_price: s.unit_price,
        image_url: s.image_url ?? undefined,
        product_url: s.product_url ?? undefined,
        external_id: s.external_id ?? undefined,
      });
    });
  }

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-md">
      <div className="flex items-center gap-sm mb-sm">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-tertiary)" }}>
          lightbulb
        </span>
        <h3 className="text-body-sm font-bold text-on-surface">
          Sugerencias del historial ({suggestions.length})
        </h3>
        <span className="text-label-md text-on-surface-variant">
          Items que sueles comprar y no están en esta lista
        </span>
      </div>
      <div className="flex flex-wrap gap-xs">
        {suggestions.map((s, idx) => (
          <button
            key={`${s.store}|${s.name}|${idx}`}
            type="button"
            disabled={pending}
            onClick={() => pick(s)}
            className="h-8 px-sm rounded-full bg-surface-container-high hover:bg-surface-container-highest text-body-sm text-on-surface flex items-center gap-xs disabled:opacity-50 transition-colors"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 12, color: STORE_COLOR[s.store] }}
            >
              {STORE_ICON[s.store]}
            </span>
            {s.name}
            <span className="text-label-md text-on-surface-variant">
              · {formatCurrency(s.unit_price)}
            </span>
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 14 }}>
              add
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-sm px-lg py-md border-b border-outline-variant/10 hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-primary)" }}>
          history
        </span>
        <h3 className="text-body-sm font-bold text-on-surface flex-1 text-left">
          Historial de listas ({history.length})
        </h3>
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform"
          style={{ fontSize: 18, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-outline-variant/10">
          {history.map((h) => (
            <li key={h.id} className="flex items-center gap-sm px-lg py-sm">
              <div className="flex-1 min-w-0">
                <p className="text-body-sm text-on-surface">
                  {new Date(h.purchased_at).toLocaleDateString("es-SV", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <p className="text-label-md text-on-surface-variant">{h.name}</p>
              </div>
              <span className="text-body-sm font-bold text-on-surface">
                {formatCurrency(h.total_at_purchase)}
              </span>
              {(h.transaction_ids.walmart || h.transaction_ids.pricesmart) && (
                <a
                  href="/personal/transactions"
                  className="text-label-md text-primary hover:underline shrink-0"
                  title="Ver egresos vinculados"
                >
                  Ver egresos
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

