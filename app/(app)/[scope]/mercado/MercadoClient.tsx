"use client";

import { useState, useEffect, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import {
  addItem,
  removeItem,
  updateItem,
  toggleItemChecked,
  searchProducts,
  fetchProductFromUrl,
  getListItems,
  importItems,
  fetchGenericImage,
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
  walmart:     "Walmart",
  pricesmart:  "PriceSmart",
  agromercado: "Agromercado",
  dollarcity:  "Dollar City",
  manual:      "Otro",
};

const STORE_COLOR: Record<Store, string> = {
  walmart:     "#0071ce",
  pricesmart:  "#ef4123",
  agromercado: "#2e7d32",
  dollarcity:  "#f59e0b",
  manual:      "var(--color-tertiary)",
};

const STORE_ICON: Record<Store, string> = {
  walmart:     "shopping_cart",
  pricesmart:  "store",
  agromercado: "storefront",
  dollarcity:  "sell",
  manual:      "edit",
};

// ─────────────────────────────────────────────────────────────────────────────
// Grocery category classifier (client-side keyword matching, no API needed)
// ─────────────────────────────────────────────────────────────────────────────

const GROCERY_CATEGORIES: { label: string; icon: string; keywords: RegExp[] }[] = [
  {
    label: "Frutas y Verduras", icon: "🥦",
    keywords: [/\b(manzana|pera|naranja|mandarina|uvas?|fresas?|melón|melon|sandía|sandia|piña|pina|mango|papaya|aguacate|plátanos?|platanos?|banano|banana|tomates?|lechuga|espinaca|zanahorias?|cebolla|ajo|papas?|yuca|brócoli|brocoli|coliflor|chile|pepino|ejotes?|elotes?|maíz|maiz|apio|rábano|rabano|betabel|remolacha|cilantro|perejil|nopal|champiñones?|hongos?|chayote|güisquil)\b/i],
  },
  {
    label: "Carnes y Mariscos", icon: "🥩",
    keywords: [/\b(pollo|pechuga|muslo|alas?|filete|carne\s+de\s+res|carne\s+molida|bistec|costilla|chuleta|lomo|cerdo|puerco|chorizo|salchicha|jamón|jamon|tocino|bacon|mortadela|salami|pepperoni|mariscos?|camarones?|langosta|cangrejo|pescado|salmón|salmon|tilapia|mojarra|bagre|atún|tuna|sardinas?|calamares?|pulpo)\b/i],
  },
  {
    label: "Lácteos y Huevos", icon: "🥛",
    keywords: [/\b(leche|queso|yogur|yogurt|crema\s+(ácida|acida|de\s+leche)|mantequilla|margarina|butter|huevos?)\b/i],
  },
  {
    label: "Pan y Tortillas", icon: "🍞",
    keywords: [/\b(pan\b|tortillas?|baguette|bollos?|croissant|brioche|pita|wraps?|chapatas?)\b/i],
  },
  {
    label: "Granos y Pasta", icon: "🌾",
    keywords: [/\b(arroz|frijoles?|lentejas?|garbanzos?|habas?|soya|harina|pasta\b|espagueti|spaghetti|fideos?|macarrones?|cereal|avena|granola|quinoa|trigo|cebada)\b/i],
  },
  {
    label: "Enlatados y Conservas", icon: "🥫",
    keywords: [/\b(atún\s+en\s+lata|atun\s+en\s+lata|sardinas?\s+en|spam|conservas?|enlatados?|frijoles?\s+(refritos|negros|rojos)\s+en\s+lata|pasta\s+de\s+tomate|tomate\s+de\s+lata)\b/i],
  },
  {
    label: "Condimentos y Salsas", icon: "🧂",
    keywords: [/\b(sal\b|sal\s+(de|marina)|pimienta|azúcar|azucar|aceite\b|vinagre|salsa\b|salsas?|ketchup|mayonesa|mostaza|soya\b|worcestershire|tabasco|picante|sazonador|condimento|especias?|canela|orégano|oregano|comino|consomé|consome|sopita|maggi|adobo|recado|sofrito|crema\s+(de\s+coco|de\s+cacahuate))\b/i],
  },
  {
    label: "Snacks y Dulces", icon: "🍿",
    keywords: [/\b(papas\s+fritas|platanitos|frituras?|maní|mani|nueces?|almendras?|pistaches?|chocolates?|dulces?|caramelos?|gomitas?|galletas?\b|barritas?|chips\b|snacks?|palomitas?|popcorn|nachos|doritos|ruffles|cheetos)\b/i],
  },
  {
    label: "Bebidas", icon: "🧃",
    keywords: [/\b(jugo|refresco|soda\b|gaseosa|agua\s+(de|con|mineral|pura)?|café\b|cafe\b|tés?|te\b|bebidas?|néctar|nectar|limonada|horchata|energizante|cerveza|vino\b|licor|whisky|ron\b|vodka|leche\s+de\s+(soya|almendra|coco))\b/i],
  },
  {
    label: "Congelados", icon: "🧊",
    keywords: [/\b(congelados?|helados?|ice\s+cream|frozen|nuggets?|pizza\s+congelada|waffles?|fries\b|papas\s+a\s+la\s+francesa)\b/i],
  },
  {
    label: "Limpieza del Hogar", icon: "🧹",
    keywords: [/\b(detergente|suavizante|cloro|blanqueador|limpiador|desinfectante|fabuloso|ajax\b|axion|lava\s*trastes?|lavaplatos|escoba|trapeador|mopa\b|papel\s+toalla|bolsa(s)?\s+(de\s+)?basura|esponjas?|fibra\s+(de\s+acero)?|trapos?|jergas?|guantes?\s+de\s+hule|plumeros?|ambientador|aromatizante)\b/i],
  },
  {
    label: "Higiene Personal", icon: "🧴",
    keywords: [/\b(shampoo|champú|champu|acondicionador|jabón\s+(de\s+baño|corporal|líquido)?|jabon\b|pasta\s+dental|cepillo\s+dental|hilo\s+dental|enjuague\s+bucal|desodorante|antitranspirante|papel\s+higiénico|papel\s+higienico|servilletas?|toallas?\s+(húmedas|higienicas|sanitar)|pañales?|panales?|tampones?|toallitas?|rasuradoras?|rastrillos?|espuma\s+de\s+afeitar|loción|locion|crema\s+corporal|perfume|colonia\b|bloqueador|protector\s+solar)\b/i],
  },
  { label: "Otros", icon: "📦", keywords: [] },
];

function classifyItem(name: string): { label: string; icon: string } {
  for (const cat of GROCERY_CATEGORIES.slice(0, -1)) {
    if (cat.keywords.some((re) => re.test(name))) {
      return { label: cat.label, icon: cat.icon };
    }
  }
  return { label: "Otros", icon: "📦" };
}

type ViewMode = "store" | "category";

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
  const [viewMode, setViewMode] = useState<ViewMode>("store");

  // Totals per store
  const sum = (s: Store) =>
    items.filter((i) => i.store === s).reduce((acc, i) => acc + Number(i.quantity) * Number(i.unit_price), 0);
  const totalWalmart      = sum("walmart");
  const totalPricesmart   = sum("pricesmart");
  const totalAgromercado  = sum("agromercado");
  const totalDollarcity   = sum("dollarcity");
  const totalManual       = sum("manual");
  const grandTotal = totalWalmart + totalPricesmart + totalAgromercado + totalDollarcity + totalManual;

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

      {/* View mode toggle + items */}
      {items.length > 0 && (
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={() => setViewMode("store")}
            className="h-8 px-md rounded-full text-body-sm font-bold flex items-center gap-xs transition-colors"
            style={{
              background: viewMode === "store" ? "var(--color-primary-container)" : "var(--color-surface-container-high)",
              color: viewMode === "store" ? "var(--color-on-primary-container)" : "var(--color-on-surface-variant)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>store</span>
            Por tienda
          </button>
          <button
            type="button"
            onClick={() => setViewMode("category")}
            className="h-8 px-md rounded-full text-body-sm font-bold flex items-center gap-xs transition-colors"
            style={{
              background: viewMode === "category" ? "var(--color-primary-container)" : "var(--color-surface-container-high)",
              color: viewMode === "category" ? "var(--color-on-primary-container)" : "var(--color-on-surface-variant)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>category</span>
            Por tipo
          </button>
        </div>
      )}
      <ItemGroups items={items} viewMode={viewMode} />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <SuggestionsPanel suggestions={suggestions} listId={list.id} />
      )}

      {/* History */}
      {history.length > 0 && <HistoryPanel history={history} activeItems={items} listId={list.id} />}

      <PurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        listId={list.id}
        totals={{ walmart: totalWalmart, pricesmart: totalPricesmart, agromercado: totalAgromercado, dollarcity: totalDollarcity, manual: totalManual }}
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

function isProductUrl(q: string) {
  return /^https?:\/\//i.test(q.trim());
}
function detectStoreFromUrl(q: string): "walmart" | "pricesmart" | null {
  if (/walmart\.com\.sv/i.test(q)) return "walmart";
  if (/pricesmart\.com/i.test(q)) return "pricesmart";
  return null;
}

function SearchPanel({ listId }: { listId: string }) {
  const [query, setQuery] = useState("");
  const [searchStore, setSearchStore] = useState<"walmart" | "pricesmart">("walmart");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [urlResult, setUrlResult] = useState<ProductHit | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);

  const urlMode = isProductUrl(query);
  const detectedStore = urlMode ? detectStoreFromUrl(query) : null;

  function resetResults() {
    setResults([]);
    setUrlResult(null);
    setUrlError(null);
    setSearched(false);
  }

  async function runSearch(store: "walmart" | "pricesmart" = searchStore) {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    resetResults();
    try {
      if (urlMode) {
        const res = await fetchProductFromUrl(q);
        if ("error" in res) {
          setUrlError(res.error);
        } else {
          setUrlResult(res);
        }
      } else {
        const hits = await searchProducts(store, q);
        setResults(hits);
      }
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function switchStore(store: "walmart" | "pricesmart") {
    setSearchStore(store);
    resetResults();
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
      setUrlResult(null);
      setQuery("");
      setSearched(false);
    });
  }

  const activeStore = urlMode ? (detectedStore ?? searchStore) : searchStore;

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-md flex flex-col gap-sm">
      {/* Header */}
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

      {/* Store selector — oculto cuando hay URL pegada */}
      {!urlMode && (
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
      )}

      {/* Chip de URL detectada */}
      {urlMode && (
        <div className="flex items-center gap-xs">
          <span
            className="flex items-center gap-xs h-7 px-sm rounded-full text-label-md font-bold text-white"
            style={{ background: detectedStore ? STORE_COLOR[detectedStore] : "var(--color-tertiary)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
            {detectedStore === "walmart" && "Enlace de Walmart SV"}
            {detectedStore === "pricesmart" && "Enlace de PriceSmart"}
            {!detectedStore && "Enlace no reconocido"}
          </span>
        </div>
      )}

      {/* Input + botón */}
      <div className="flex items-center gap-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); resetResults(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
          placeholder="Busca por nombre o pega un enlace de Walmart / PriceSmart…"
          className="flex-1 h-10 px-md rounded-lg bg-surface-container text-on-surface text-body-sm focus:ring-2 focus:ring-primary-container outline-none border-none"
        />
        <button
          type="button"
          disabled={loading || (urlMode && !detectedStore)}
          onClick={() => runSearch()}
          className="h-10 px-md rounded-full font-bold text-body-sm disabled:opacity-50 text-white shrink-0"
          style={{ background: STORE_COLOR[activeStore] }}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {/* Error de URL */}
      {urlError && (
        <p className="text-label-md text-error">{urlError}</p>
      )}

      {/* Sin resultados */}
      {searched && !urlMode && results.length === 0 && !loading && (
        <p className="text-label-md text-on-surface-variant">
          Sin resultados. Usa &quot;Añadir manual&quot; o intenta otra búsqueda.
        </p>
      )}

      {/* Resultado de URL — tarjeta grande única */}
      {urlResult && (
        <button
          type="button"
          disabled={pending}
          onClick={() => addHit(urlResult)}
          className="text-left rounded-xl border-2 bg-surface-container hover:bg-surface-container-high transition-colors p-md flex gap-md disabled:opacity-50"
          style={{ borderColor: STORE_COLOR[urlResult.store] + "60" }}
        >
          {urlResult.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={urlResult.image_url}
              alt={urlResult.name}
              className="w-20 h-20 object-contain rounded-lg bg-white shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 32 }}>image</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-bold text-on-surface">{urlResult.name}</p>
            {urlResult.price > 0 ? (
              <p className="text-title-sm font-bold mt-xs" style={{ color: STORE_COLOR[urlResult.store] }}>
                {formatCurrency(urlResult.price)}
              </p>
            ) : (
              <p className="text-label-md text-on-surface-variant mt-xs italic">Precio no disponible — editable en la lista</p>
            )}
            <p className="text-label-md text-on-surface-variant mt-xs flex items-center gap-xs">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_circle</span>
              Toca para añadir a la lista
            </p>
          </div>
        </button>
      )}

      {/* Resultados de búsqueda por texto */}
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
                <img src={h.image_url} alt={h.name} className="w-16 h-16 object-contain rounded-md bg-white shrink-0" loading="lazy" />
              ) : (
                <div className="w-16 h-16 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 24 }}>image</span>
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
    const nameCopy = name.trim();
    startTransition(async () => {
      const res = await addItem({
        list_id: listId,
        name: nameCopy,
        store,
        quantity: qn,
        unit_price: pn,
      });
      if ("error" in res && res.error) { setError(res.error); return; }
      onClose();
      // Fetch reference image from Wikipedia ES in the background — non-blocking
      if ("id" in res && typeof res.id === "string") {
        const imageUrl = await fetchGenericImage(nameCopy);
        if (imageUrl) await updateItem(res.id, { image_url: imageUrl });
      }
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
            <option value="walmart">Walmart</option>
            <option value="pricesmart">PriceSmart</option>
            <option value="agromercado">Agromercado</option>
            <option value="dollarcity">Dollar City</option>
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
// Items grouped by store or by grocery category
// ─────────────────────────────────────────────────────────────────────────────

function ItemGroups({ items, viewMode }: { items: ShoppingListItemRow[]; viewMode: ViewMode }) {
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

  if (viewMode === "category") {
    // Group items by grocery category, preserving the canonical category order
    const byCategory = new Map<string, { icon: string; items: ShoppingListItemRow[] }>();
    for (const item of items) {
      const { label, icon } = classifyItem(item.name);
      if (!byCategory.has(label)) byCategory.set(label, { icon, items: [] });
      byCategory.get(label)!.items.push(item);
    }
    // Sort groups following GROCERY_CATEGORIES order, then alphabetically for unknowns
    const catOrder = GROCERY_CATEGORIES.map((c) => c.label);
    const groups = [...byCategory.entries()].sort(
      ([a], [b]) => {
        const ia = catOrder.indexOf(a);
        const ib = catOrder.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      },
    );

    return (
      <div className="flex flex-col gap-md">
        {groups.map(([label, { icon, items: group }]) => {
          const subtotal = group.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
          return (
            <div key={label} className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
              <div className="px-lg py-sm border-b border-outline-variant/10 flex items-center gap-sm bg-surface-container">
                <span style={{ fontSize: 18 }}>{icon}</span>
                <h3 className="text-body-sm font-bold text-on-surface flex-1">
                  {label} ({group.length})
                </h3>
                <span className="text-body-sm font-bold text-on-surface">{formatCurrency(subtotal)}</span>
              </div>
              <ul className="divide-y divide-outline-variant/10">
                {group.map((it) => (
                  <ItemRow key={it.id} item={it} showStoreBadge />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    );
  }

  // Default: group by store
  const stores: Store[] = ["walmart", "pricesmart", "agromercado", "dollarcity", "manual"];
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

function ItemRow({ item, showStoreBadge = false }: { item: ShoppingListItemRow; showStoreBadge?: boolean }) {
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(String(item.unit_price));
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function commitQty() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0 || n === Number(item.quantity)) {
      setQty(String(item.quantity));
      return;
    }
    startTransition(async () => { await updateItem(item.id, { quantity: n }); });
  }
  function commitPrice() {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0 || n === Number(item.unit_price)) {
      setPrice(String(item.unit_price));
      return;
    }
    startTransition(async () => { await updateItem(item.id, { unit_price: n }); });
  }
  function toggle() {
    startTransition(async () => { await toggleItemChecked(item.id, !item.is_checked); });
  }
  function remove() {
    if (!confirm("¿Eliminar este item?")) return;
    startTransition(async () => { await removeItem(item.id); });
  }

  const subtotal = Number(item.quantity) * Number(item.unit_price);

  return (
    <>
      <li className="flex items-center gap-sm px-md py-sm" style={{ opacity: pending ? 0.5 : 1 }}>
        <input
          type="checkbox"
          checked={item.is_checked}
          onChange={toggle}
          className="w-5 h-5 accent-primary shrink-0"
          title="En el carrito"
        />
        {/* Thumbnail — clickable to open edit */}
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          title="Editar ítem"
          className="w-12 h-12 rounded-md shrink-0 overflow-hidden hover:ring-2 hover:ring-primary transition-all"
        >
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-contain bg-white"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>
                shopping_basket
              </span>
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p
            className="text-body-sm text-on-surface truncate"
            style={{ textDecoration: item.is_checked ? "line-through" : "none" }}
          >
            {item.name}
          </p>
          <p className="text-label-md text-on-surface-variant flex items-center gap-xs">
            {formatCurrency(subtotal)}
            {showStoreBadge && (
              <span
                className="flex items-center gap-xs px-xs rounded-full"
                style={{ background: STORE_COLOR[item.store] + "20", color: STORE_COLOR[item.store] }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 10 }}>{STORE_ICON[item.store]}</span>
                <span style={{ fontSize: 10 }}>{STORE_LABEL[item.store]}</span>
              </span>
            )}
          </p>
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
          onClick={() => setEditOpen(true)}
          title="Editar ítem"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-highest text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
        </button>
        <button
          type="button"
          onClick={remove}
          title="Eliminar"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </li>
      {editOpen && <ItemEditDialog item={item} onClose={() => setEditOpen(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item edit dialog
// ─────────────────────────────────────────────────────────────────────────────

function ItemEditDialog({ item, onClose }: { item: ShoppingListItemRow; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [store, setStore] = useState<Store>(item.store);
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(String(item.unit_price));
  const [imageUrl, setImageUrl] = useState(item.image_url ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Live preview: show the typed URL as an image if it looks like a URL
  const previewUrl = imageUrl.trim().startsWith("http") ? imageUrl.trim() : null;

  function save() {
    setError(null);
    const qn = Number(qty);
    const pn = Number(price);
    if (!name.trim()) return setError("Nombre requerido");
    if (!qn || qn <= 0) return setError("Cantidad inválida");
    if (pn < 0 || Number.isNaN(pn)) return setError("Precio inválido");

    startTransition(async () => {
      const res = await updateItem(item.id, {
        name: name.trim(),
        store,
        quantity: qn,
        unit_price: pn,
        image_url: imageUrl.trim() || null,
      });
      if ("error" in res && res.error) { setError(res.error); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        style={{ backdropFilter: "blur(4px)" }}
      />
      <div
        className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full p-lg flex flex-col gap-md"
        style={{ maxWidth: 420, margin: "0 16px" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-title-md text-on-surface">Editar ítem</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Image preview + URL input */}
        <div className="flex gap-md items-start">
          <div className="w-16 h-16 rounded-xl bg-surface-container-highest overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant/20">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="preview" className="w-full h-full object-contain bg-white" />
            ) : (
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 28 }}>image</span>
            )}
          </div>
          <label className="flex flex-col gap-xs flex-1">
            <span className="text-label-md text-on-surface-variant">URL de imagen</span>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
            />
            {imageUrl && !previewUrl && (
              <span className="text-label-md text-on-surface-variant">Pega una URL que empiece con https://</span>
            )}
          </label>
        </div>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Nombre</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Tienda</span>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as Store)}
            className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
          >
            <option value="walmart">Walmart</option>
            <option value="pricesmart">PriceSmart</option>
            <option value="agromercado">Agromercado</option>
            <option value="dollarcity">Dollar City</option>
            <option value="manual">Otro / sin tienda</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-sm">
          <label className="flex flex-col gap-xs">
            <span className="text-label-md text-on-surface-variant">Cantidad</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
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
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-md rounded-full bg-surface-container-high text-on-surface text-body-sm font-bold"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="h-10 px-md rounded-full bg-primary-container text-on-primary-container text-body-sm font-bold disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
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
// History + Import
// ─────────────────────────────────────────────────────────────────────────────

function HistoryPanel({
  history,
  activeItems,
  listId,
}: {
  history: HistoryEntry[];
  activeItems: ShoppingListItemRow[];
  listId: string;
}) {
  const [open, setOpen] = useState(false);
  const [importEntry, setImportEntry] = useState<HistoryEntry | null>(null);

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
            <li key={h.id} className="flex items-center gap-sm px-lg py-sm flex-wrap">
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
              <button
                type="button"
                onClick={() => setImportEntry(h)}
                className="h-8 px-sm rounded-full bg-surface-container-high hover:bg-surface-container-highest text-body-sm text-on-surface flex items-center gap-xs transition-colors shrink-0"
                title="Ver ítems e importar a la lista activa"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                Ver ítems
              </button>
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

      {importEntry && (
        <ImportDialog
          sourceEntry={importEntry}
          activeItems={activeItems}
          targetListId={listId}
          onClose={() => setImportEntry(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Import dialog — importar ítems de una lista anterior
// ─────────────────────────────────────────────────────────────────────────────

function ImportDialog({
  sourceEntry,
  activeItems,
  targetListId,
  onClose,
}: {
  sourceEntry: HistoryEntry;
  activeItems: ShoppingListItemRow[];
  targetListId: string;
  onClose: () => void;
}) {
  const [sourceItems, setSourceItems] = useState<ShoppingListItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Set of "store|name_lower" keys already in the active list
  const activeKeys = new Set(
    activeItems.map((i) => `${i.store}|${i.name.toLowerCase().trim()}`),
  );

  useEffect(() => {
    setLoading(true);
    getListItems(sourceEntry.id).then((items) => {
      setSourceItems(items);
      setLoading(false);
    });
  }, [sourceEntry.id]);

  const alreadyIn = (item: ShoppingListItemRow) =>
    activeKeys.has(`${item.store}|${item.name.toLowerCase().trim()}`);

  const importable = sourceItems.filter((i) => !alreadyIn(i));

  function toggleAll() {
    if (selected.size === importable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map((i) => i.id)));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doImport() {
    setError(null);
    const toImport = sourceItems.filter((i) => selected.has(i.id));
    if (!toImport.length) return;
    startTransition(async () => {
      const res = await importItems(targetListId, toImport);
      if ("error" in res) { setError(res.error); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        style={{ backdropFilter: "blur(4px)" }}
      />
      <div
        className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full flex flex-col"
        style={{ maxWidth: 520, margin: "0 16px", maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-lg border-b border-outline-variant/10 shrink-0">
          <div>
            <h2 className="text-title-md text-on-surface">Importar ítems</h2>
            <p className="text-label-md text-on-surface-variant mt-xs">
              {new Date(sourceEntry.purchased_at).toLocaleDateString("es-SV", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · {formatCurrency(sourceEntry.total_at_purchase)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-surface-container-high flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* Actions bar */}
        {!loading && importable.length > 0 && (
          <div className="flex items-center gap-sm px-lg py-sm border-b border-outline-variant/10 bg-surface-container-low shrink-0">
            <button
              type="button"
              onClick={toggleAll}
              className="text-label-md text-primary hover:underline"
            >
              {selected.size === importable.length ? "Deseleccionar todos" : "Seleccionar todos los que faltan"}
            </button>
            <span className="text-label-md text-on-surface-variant flex-1 text-right">
              {importable.length - selected.size} disponibles
            </span>
          </div>
        )}

        {/* Item list */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center p-xl">
              <span className="text-label-md text-on-surface-variant">Cargando ítems…</span>
            </div>
          ) : sourceItems.length === 0 ? (
            <div className="flex items-center justify-center p-xl">
              <span className="text-label-md text-on-surface-variant">Esta lista no tiene ítems.</span>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {sourceItems.map((item) => {
                const inList = alreadyIn(item);
                const isSelected = selected.has(item.id);
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-sm px-md py-sm"
                    style={{ opacity: inList ? 0.5 : 1 }}
                  >
                    {inList ? (
                      <div className="w-5 h-5 shrink-0" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(item.id)}
                        className="w-5 h-5 accent-primary shrink-0"
                      />
                    )}
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-11 h-11 object-contain rounded-md bg-white shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 16 }}>
                          shopping_basket
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-on-surface truncate">{item.name}</p>
                      <p className="text-label-md text-on-surface-variant flex items-center gap-xs">
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 11, color: STORE_COLOR[item.store] }}
                        >
                          {STORE_ICON[item.store]}
                        </span>
                        {STORE_LABEL[item.store]} · {formatCurrency(Number(item.unit_price))}
                      </p>
                    </div>
                    {inList ? (
                      <span
                        className="text-label-md px-xs py-0.5 rounded-full shrink-0"
                        style={{ background: "var(--color-surface-container-highest)", color: "var(--color-on-surface-variant)" }}
                      >
                        Ya en lista
                      </span>
                    ) : (
                      <span className="text-label-md text-on-surface-variant shrink-0">
                        ×{item.quantity}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-lg border-t border-outline-variant/10 flex flex-col gap-sm shrink-0">
          {error && <p className="text-label-md text-error">{error}</p>}
          <div className="flex justify-end gap-sm">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-md rounded-full bg-surface-container-high text-on-surface text-body-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending || selected.size === 0}
              onClick={doImport}
              className="h-10 px-md rounded-full bg-primary-container text-on-primary-container text-body-sm font-bold disabled:opacity-50"
            >
              {pending ? "Añadiendo…" : `Añadir seleccionados (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

