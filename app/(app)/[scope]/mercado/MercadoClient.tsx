"use client";

import { useState, useEffect, useTransition } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
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
  saveAsTemplate,
  type ShoppingListRow,
  type ShoppingListItemRow,
  type Suggestion,
  type ProductHit,
  type StoreBudgetSnapshot,
  type Store,
  type HistoryEntry,
  type TemplateInfo,
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
  template: TemplateInfo | null;
  userRole?: string;
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
// Grocery category classifier — word/bigram dictionary, no regex word-boundary
// issues with accented chars, numbers, or slashes in product names.
// ─────────────────────────────────────────────────────────────────────────────

// Normalize: lowercase + remove accents + keep letters and digits
function normStr(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritical marks
}

// Split a product name into tokens (words ≥ 3 chars that aren't pure numbers)
function tokenize(name: string): string[] {
  return normStr(name)
    .split(/[\s/\-,.()[\]'"]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}

type CatDef = { label: string; icon: string; unigrams: string[]; bigrams: string[] };

// Each entry: unigrams are single-word triggers; bigrams are "word1 word2" pairs.
// All strings already normalized (no accents, lowercase).
const CAT_DEFS: CatDef[] = [
  {
    label: "Frutas y Verduras", icon: "🥦",
    unigrams: ["manzana","pera","naranja","mandarina","uva","fresa","melon","sandia","pina","mango","papaya","aguacate","platano","banano","banana","tomate","lechuga","espinaca","zanahoria","cebolla","papa","yuca","brocoli","coliflor","chile","pepino","ejote","elote","maiz","apio","rabano","betabel","remolacha","cilantro","perejil","nopal","champinon","chayote","guisquil","hongos","champin"],
    bigrams: [],
  },
  {
    label: "Carnes y Mariscos", icon: "🥩",
    unigrams: ["pollo","pechuga","muslo","filete","bistec","costilla","chuleta","lomo","cerdo","puerco","chorizo","salchicha","jamon","tocino","bacon","mortadela","salami","pepperoni","marisco","camaron","langosta","cangrejo","pescado","salmon","tilapia","mojarra","bagre","atun","tuna","sardina","calamar","pulpo"],
    bigrams: ["carne res","carne molida","carne cerdo","filete salmon","filete tilapia","pollo entero"],
  },
  {
    label: "Lácteos y Huevos", icon: "🥛",
    unigrams: ["leche","queso","yogur","yogurt","mantequilla","margarina","butter","huevo","huevos","crema","lacto"],
    bigrams: ["queso rallado","queso crema","queso fresco","queso cheddar","queso parmesano","queso mozzarella","crema acida","crema agria","leche descremada","leche entera","leche deslactosada","yogurt griego","yogurt natural","palitos queso"],
  },
  {
    label: "Pan y Tortillas", icon: "🍞",
    unigrams: ["tortilla","baguette","bollo","croissant","brioche","waffle","waffles","biscocho","pan"],
    bigrams: ["pan molde","pan integral","pan dulce","pan artesanal","tortilla trigo","tortilla maiz","tortilla harina"],
  },
  {
    label: "Granos y Pasta", icon: "🌾",
    unigrams: ["arroz","frijol","frijoles","lenteja","garbanzo","harina","pasta","espagueti","spaghetti","fideos","macarron","cereal","avena","granola","quinoa","cebada","trigo","amaranto"],
    bigrams: ["pasta dental","pasta tomate"],
  },
  {
    label: "Enlatados y Conservas", icon: "🥫",
    unigrams: ["sardina","spam","conserva","enlatado"],
    bigrams: ["atun lata","atun agua","pasta tomate","tomate lata","frijoles lata","frijoles refritos","sardinas lata"],
  },
  {
    label: "Condimentos y Salsas", icon: "🧂",
    unigrams: ["pimienta","azucar","vinagre","ketchup","mayonesa","mostaza","worcestershire","tabasco","sazonador","condimento","canela","oregano","comino","consome","maggi","adobo","recado","sofrito","miel","salsa","aceite"],
    bigrams: ["salsa tomate","salsa soya","salsa inglesa","aceite oliva","aceite vegetal","aceite coco","sal marina","sal mesa","azucar morena","azucar blanca","pimienta negra"],
  },
  {
    label: "Snacks y Dulces", icon: "🍿",
    unigrams: ["platanitos","frituras","mani","nuez","nueces","almendra","pistache","chocolate","dulce","caramelo","gomitas","galletas","galleta","barrita","chips","snack","palomitas","popcorn","nachos","doritos","ruffles","cheetos","pretzel","brownie"],
    bigrams: ["papas fritas","papas francesa","palomitas maiz"],
  },
  {
    label: "Bebidas", icon: "🧃",
    unigrams: ["jugo","refresco","soda","gaseosa","cafe","limonada","horchata","energizante","cerveza","vino","licor","whisky","vodka","nectar","bebida","capuchino","latte","expreso"],
    bigrams: ["agua mineral","agua purificada","agua coco","cafe molido","cafe tostado","te verde","te negro","jugo naranja","jugo manzana","leche soya","leche almendra","leche coco"],
  },
  {
    label: "Congelados", icon: "🧊",
    unigrams: ["helado","nuggets","waffles","frozen","congelado"],
    bigrams: ["ice cream","papas francesa","pizza congelada","pollo congelado","carne congelada"],
  },
  {
    label: "Limpieza del Hogar", icon: "🧹",
    unigrams: ["detergente","suavizante","cloro","blanqueador","limpiador","desinfectante","fabuloso","escoba","trapeador","esponja","ambientador","aromatizante","insecticida","lysol","axion","ajax"],
    bigrams: ["lava trastes","papel toalla","bolsa basura","guantes hule","fibra acero","cera pisos"],
  },
  {
    label: "Higiene Personal", icon: "🧴",
    unigrams: ["shampoo","champu","acondicionador","desodorante","antitranspirante","jabon","pañal","panal","tampon","rasurador","rastrillos","bloqueador","locion","perfume","colonia"],
    bigrams: ["pasta dental","cepillo dental","hilo dental","enjuague bucal","papel higienico","toallas femeninas","toallas humedas","toallas sanitarias","toallitas humedas","crema corporal","crema manos","protector solar","espuma afeitar","jabón corporal","jabón baño"],
  },
];

// Build lookup index at module init time: normalized token → { label, icon }
type CatInfo = { label: string; icon: string };
const UNIGRAM_MAP = new Map<string, CatInfo>();
const BIGRAM_MAP  = new Map<string, CatInfo>();
for (const cat of CAT_DEFS) {
  const info: CatInfo = { label: cat.label, icon: cat.icon };
  for (const w of cat.unigrams) UNIGRAM_MAP.set(normStr(w), info);
  for (const b of cat.bigrams)  BIGRAM_MAP.set(normStr(b), info);
}

// All canonical category labels in display order (for sorting groups)
const CAT_ORDER = CAT_DEFS.map((c) => c.label);

// Look up icon for a given category label (used when restoring an override)
function catIcon(label: string): string {
  return CAT_DEFS.find((c) => c.label === label)?.icon ?? "📦";
}

// Classify item by name, respecting a user-set override
function classifyItem(name: string, override?: string | null): CatInfo {
  if (override) return { label: override, icon: catIcon(override) };
  const tokens = tokenize(name);
  // Check bigrams first (more specific)
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = tokens[i] + " " + tokens[i + 1];
    const hit = BIGRAM_MAP.get(bg);
    if (hit) return hit;
  }
  // Then unigrams
  for (const t of tokens) {
    const hit = UNIGRAM_MAP.get(t);
    if (hit) return hit;
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
  template,
  userRole,
}: Props) {
  const isShopper = userRole === "shopper";
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("store");
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(template);
  const [templatePending, startTemplateTx] = useTransition();
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);

  function handleSaveTemplate() {
    setTemplateMsg(null);
    startTemplateTx(async () => {
      const res = await saveAsTemplate();
      if ("error" in res) {
        setTemplateMsg("Error: " + res.error);
      } else {
        setTemplateInfo({ itemCount: res.itemCount });
        setTemplateMsg(`Plantilla guardada con ${res.itemCount} producto${res.itemCount !== 1 ? "s" : ""}`);
        setTimeout(() => setTemplateMsg(null), 3500);
      }
    });
  }

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
      <header className="flex flex-col gap-sm">
        <div className="flex items-end justify-between flex-wrap gap-md">
          <div>
            <h2 className="text-headline-lg text-on-surface">{list.name}</h2>
            <p className="text-body-sm text-on-surface-variant">
              {items.length} item{items.length !== 1 ? "s" : ""} · Total{" "}
              <span className="font-bold text-on-surface">{formatCurrency(grandTotal)}</span>
            </p>
          </div>
          {!isShopper && (
            <button
              type="button"
              disabled={grandTotal <= 0}
              onClick={() => setPurchaseOpen(true)}
              className="h-10 px-lg rounded-full bg-primary-container text-on-primary-container font-bold flex items-center gap-xs disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shopping_cart_checkout</span>
              Marcar como comprada
            </button>
          )}
        </div>

        {/* Template bar — owners/editors only */}
        {!isShopper && (
          <div className="flex items-center gap-sm flex-wrap">
            <button
              type="button"
              disabled={templatePending || items.length === 0}
              onClick={handleSaveTemplate}
              className="h-8 px-md rounded-full text-body-sm font-bold flex items-center gap-xs transition-colors disabled:opacity-50"
              style={{
                background: templateInfo ? "var(--color-secondary-container)" : "var(--color-surface-container-high)",
                color: templateInfo ? "var(--color-on-secondary-container)" : "var(--color-on-surface-variant)",
              }}
              title={templateInfo
                ? `Actualizar plantilla (actualmente ${templateInfo.itemCount} productos)`
                : "Guardar lista actual como plantilla base"}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {templatePending ? "hourglass_empty" : templateInfo ? "bookmark" : "bookmark_add"}
              </span>
              {templatePending
                ? "Guardando…"
                : templateInfo
                ? `Plantilla: ${templateInfo.itemCount} productos · Actualizar`
                : "Guardar como plantilla"}
            </button>
            {templateMsg && (
              <span className="text-label-md" style={{ color: templateMsg.startsWith("Error") ? "var(--color-error)" : "var(--color-tertiary)" }}>
                {templateMsg}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Budget cards — owners/editors only */}
      {!isShopper && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <BudgetCard store="walmart" snap={budgets.walmart} listTotal={totalWalmart} />
          <BudgetCard store="pricesmart" snap={budgets.pricesmart} listTotal={totalPricesmart} />
        </div>
      )}

      {/* Category pie charts — owners/editors only, when items have value */}
      {!isShopper && items.some((i) => Number(i.quantity) * Number(i.unit_price) > 0) && (
        <CategoryPieCharts items={items} />
      )}

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

      {/* Suggestions — owners/editors only */}
      {!isShopper && suggestions.length > 0 && (
        <SuggestionsPanel suggestions={suggestions} listId={list.id} />
      )}

      {/* History — owners/editors only */}
      {!isShopper && history.length > 0 && <HistoryPanel history={history} activeItems={items} listId={list.id} />}

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
          <p className="text-body-sm font-bold text-on-surface">{snap.category_name}</p>
          <p className="text-label-md text-on-surface-variant flex items-center gap-xs flex-wrap">
            {store === "walmart"
              ? "Walmart · Agromercado · otros"
              : STORE_LABEL[store]}
            {!snap.category_id && (
              <span className="text-error">(crea esta categoría para activar comparación)</span>
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
// Category pie charts
// ─────────────────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  "Frutas y Verduras":     "#4caf50",
  "Carnes y Mariscos":     "#ef5350",
  "Lácteos y Huevos":      "#64b5f6",
  "Pan y Tortillas":       "#ffb74d",
  "Granos y Pasta":        "#ffd54f",
  "Enlatados y Conservas": "#ff8a65",
  "Condimentos y Salsas":  "#ba68c8",
  "Snacks y Dulces":       "#f06292",
  "Bebidas":               "#29b6f6",
  "Congelados":            "#4dd0e1",
  "Limpieza del Hogar":    "#4db6ac",
  "Higiene Personal":      "#81c784",
  "Otros":                 "#90a4ae",
};

type PieSlice = { name: string; value: number; icon: string; color: string };

function buildPieData(items: ShoppingListItemRow[]): PieSlice[] {
  const map = new Map<string, { value: number; icon: string }>();
  for (const item of items) {
    const amount = Number(item.quantity) * Number(item.unit_price);
    if (amount <= 0) continue;
    const cat = classifyItem(item.name, item.category_override);
    const prev = map.get(cat.label);
    map.set(cat.label, { value: (prev?.value ?? 0) + amount, icon: cat.icon });
  }
  return [...map.entries()]
    .map(([name, { value, icon }]) => ({
      name,
      value,
      icon,
      color: CAT_COLORS[name] ?? "#90a4ae",
    }))
    .sort((a, b) => b.value - a.value);
}

function CategoryPieCharts({ items }: { items: ShoppingListItemRow[] }) {
  const [open, setOpen] = useState(false);
  const superItems = items.filter((i) => i.store !== "pricesmart");
  const psItems    = items.filter((i) => i.store === "pricesmart");
  const superData  = buildPieData(superItems);
  const psData     = buildPieData(psItems);
  const hasSuper   = superData.length > 0;
  const hasPS      = psData.length > 0;
  if (!hasSuper && !hasPS) return null;

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-sm px-lg py-md hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-secondary)" }}>
          donut_small
        </span>
        <p className="text-body-sm font-bold text-on-surface flex-1 text-left">
          Distribución por tipo de producto
        </p>
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform"
          style={{ fontSize: 18, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-lg pb-lg pt-xs flex flex-col gap-md border-t border-outline-variant/10">
          <div className={hasSuper && hasPS ? "grid grid-cols-1 md:grid-cols-2 gap-lg" : "grid grid-cols-1 gap-lg"}>
            {hasSuper && (
              <PieChartPanel
                title="Supermercado"
                subtitle="Walmart · Agromercado · otros"
                storeColor={STORE_COLOR.walmart}
                data={superData}
              />
            )}
            {hasPS && (
              <PieChartPanel
                title="PriceSmart"
                subtitle="PriceSmart"
                storeColor={STORE_COLOR.pricesmart}
                data={psData}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PieChartPanel({
  title,
  subtitle,
  storeColor,
  data,
}: {
  title: string;
  subtitle: string;
  storeColor: string;
  data: PieSlice[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col gap-xs">
      {/* Store label */}
      <div>
        <p className="text-body-sm font-bold" style={{ color: storeColor }}>{title}</p>
        <p className="text-label-md text-on-surface-variant">{subtitle}</p>
      </div>

      {/* Horizontal: donut left, legend right */}
      <div className="flex items-center gap-md">
        {/* Donut — fixed square so it never gets squished */}
        <div style={{ width: 120, height: 120, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={33}
                outerRadius={54}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val) => [formatCurrency(Number(val)), ""]}
                contentStyle={{
                  background: "var(--color-surface-container)",
                  border: "1px solid color-mix(in srgb, var(--color-outline-variant) 30%, transparent)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-on-surface)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend — fills remaining width, truncates gracefully */}
        <div className="flex flex-col gap-xs flex-1 min-w-0">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-xs min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-label-md text-on-surface flex-1 truncate min-w-0">{d.icon} {d.name}</span>
              <span className="text-label-md font-bold text-on-surface shrink-0">{formatCurrency(d.value)}</span>
              <span
                className="text-label-md text-on-surface-variant shrink-0"
                style={{ minWidth: 32, textAlign: "right" }}
              >
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
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
              step="1"
              min="1"
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

// Sort category sub-groups: canonical order first, then "Otros" last
function sortCatGroups(entries: [string, { icon: string; items: ShoppingListItemRow[] }][]) {
  return entries.sort(([a], [b]) => {
    if (a === "Otros" && b !== "Otros") return 1;
    if (b === "Otros" && a !== "Otros") return -1;
    const ia = CAT_ORDER.indexOf(a);
    const ib = CAT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

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

  const stores: Store[] = ["walmart", "pricesmart", "agromercado", "dollarcity", "manual"];

  if (viewMode === "category") {
    // Two-level: store (outer) → grocery category (inner)
    return (
      <div className="flex flex-col gap-md">
        {stores.map((store) => {
          const storeItems = items.filter((i) => i.store === store);
          if (storeItems.length === 0) return null;
          const storeSubtotal = storeItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);

          // Group within this store by grocery category
          const byCategory = new Map<string, { icon: string; items: ShoppingListItemRow[] }>();
          for (const item of storeItems) {
            const { label, icon } = classifyItem(item.name, item.category_override);
            if (!byCategory.has(label)) byCategory.set(label, { icon, items: [] });
            byCategory.get(label)!.items.push(item);
          }
          const catGroups = sortCatGroups([...byCategory.entries()]);

          return (
            <CollapsibleStoreSection
              key={store}
              store={store}
              count={storeItems.length}
              subtotal={storeSubtotal}
            >
              {/* Category sub-groups */}
              <div className="flex flex-col divide-y divide-outline-variant/10 bg-surface-container-low">
                {catGroups.map(([label, { icon, items: group }]) => {
                  const catSubtotal = group.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
                  return (
                    <div key={label}>
                      <div className="px-lg py-xs flex items-center gap-sm bg-surface-container/60 border-b border-outline-variant/10">
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        <span className="text-label-md font-bold text-on-surface-variant flex-1">{label}</span>
                        <span className="text-label-md text-on-surface-variant">{formatCurrency(catSubtotal)}</span>
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
            </CollapsibleStoreSection>
          );
        })}
      </div>
    );
  }

  // Default: flat group by store
  return (
    <div className="flex flex-col gap-md">
      {stores.map((store) => {
        const group = items.filter((i) => i.store === store);
        if (group.length === 0) return null;
        const subtotal = group.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
        return (
          <CollapsibleStoreSection
            key={store}
            store={store}
            count={group.length}
            subtotal={subtotal}
          >
            <ul className="divide-y divide-outline-variant/10 bg-surface-container-low">
              {group.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          </CollapsibleStoreSection>
        );
      })}
    </div>
  );
}

function CollapsibleStoreSection({
  store,
  count,
  subtotal,
  children,
}: {
  store: Store;
  count: number;
  subtotal: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: STORE_COLOR[store] + "30" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-lg py-sm flex items-center gap-sm transition-colors"
        style={{ background: STORE_COLOR[store] + "14" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: STORE_COLOR[store] }}>
          {STORE_ICON[store]}
        </span>
        <h3 className="text-body-sm font-bold flex-1 text-left" style={{ color: STORE_COLOR[store] }}>
          {STORE_LABEL[store]} ({count})
        </h3>
        <span className="text-body-sm font-bold text-on-surface mr-xs">{formatCurrency(subtotal)}</span>
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform"
          style={{ fontSize: 18, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>
      {open && children}
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
          step="1"
          min="1"
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
  // "" means auto-detect; any CAT_DEFS label means manual override
  const [catOverride, setCatOverride] = useState<string>(item.category_override ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Live preview: show the typed URL as an image if it looks like a URL
  const previewUrl = imageUrl.trim().startsWith("http") ? imageUrl.trim() : null;

  // Show auto-detected category as hint in the selector
  const autoDetected = classifyItem(name.trim() || item.name);

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
        category_override: catOverride || null,
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

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Tipo de producto</span>
          <select
            value={catOverride}
            onChange={(e) => setCatOverride(e.target.value)}
            className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
          >
            <option value="">
              Auto-detectar ({autoDetected.icon} {autoDetected.label})
            </option>
            {CAT_DEFS.map((c) => (
              <option key={c.label} value={c.label}>
                {c.icon} {c.label}
              </option>
            ))}
            <option value="Otros">📦 Otros</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-sm">
          <label className="flex flex-col gap-xs">
            <span className="text-label-md text-on-surface-variant">Cantidad</span>
            <input
              type="number"
              step="1"
              min="1"
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
  const [open, setOpen] = useState(false);
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
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-sm px-lg py-md hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-tertiary)" }}>
          lightbulb
        </span>
        <h3 className="text-body-sm font-bold text-on-surface flex-1 text-left">
          Sugerencias del historial ({suggestions.length})
        </h3>
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform"
          style={{ fontSize: 18, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-lg pb-md pt-xs border-t border-outline-variant/10">
          <p className="text-label-md text-on-surface-variant mb-sm">
            Items que sueles comprar y no están en esta lista
          </p>
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
      )}
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

