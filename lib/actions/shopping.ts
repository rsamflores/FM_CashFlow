"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { svToday } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type Store = "walmart" | "pricesmart" | "manual";
export type ListStatus = "active" | "purchased" | "archived";

export type ProductHit = {
  store: "walmart" | "pricesmart";
  external_id: string;
  name: string;
  price: number;
  image_url: string | null;
  product_url: string;
};

export type ShoppingListRow = {
  id: string;
  scope: string;
  user_id: string;
  name: string;
  status: ListStatus;
  created_at: string;
  purchased_at: string | null;
  total_at_purchase: number | null;
};

export type ShoppingListItemRow = {
  id: string;
  list_id: string;
  name: string;
  store: Store;
  quantity: number;
  unit_price: number;
  image_url: string | null;
  product_url: string | null;
  external_id: string | null;
  is_checked: boolean;
  created_at: string;
};

export type Suggestion = {
  name: string;
  store: Store;
  unit_price: number;
  image_url: string | null;
  product_url: string | null;
  external_id: string | null;
  times_seen: number;
};

export type StoreBudgetSnapshot = {
  category_id: string | null;
  category_name: string;
  expected: number;
  spent: number;       // ya gastado este mes en esa categoría (confirmed, affects_balance)
  list_total: number;  // suma de items de esa tienda en la lista activa
};

export type ActiveListPayload = {
  list: ShoppingListRow;
  items: ShoppingListItemRow[];
  suggestions: Suggestion[];
  budgets: { walmart: StoreBudgetSnapshot; pricesmart: StoreBudgetSnapshot };
};

const STORE_BUDGET_CATEGORY: Record<"walmart" | "pricesmart", string> = {
  walmart: "Supermercado",
  pricesmart: "PriceSmart",
};

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda — Walmart SV (VTEX) + PriceSmart (Bloomreach Discovery)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_HOURS = 24;
const SEARCH_TIMEOUT_MS = 6000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Bloomreach Discovery credentials for PriceSmart SV
// (extracted from the Nuxt __NUXT__ state on pricesmart.com/es-sv)
const BR_ACCOUNT_ID = "7024";
const BR_DOMAIN_KEY = "pricesmart_bloomreach_io_es";
const BR_CATALOG_VIEWS = "pricesmart_bloomreach_io_es:sv";
const BR_AUTH_KEY = "ev7libhybjg5h1d1";

// Commercetools (CT) configuration for PriceSmart SV pricing
// Prices come from CT, not from Bloomreach Discovery (which always returns 0)
const CT_API = "https://api.us-central1.gcp.commercetools.com/pricesmart-ecomm-prod-01";
const CT_CURRENCY = "USD";
const CT_COUNTRY = "SV";
const CT_CHANNEL = "1bad5650-9b56-4490-b3c5-2d50f86c6716"; // vsf-channel for El Salvador
const CT_VSF_COOKIES =
  "vsf-locale=es-sv; vsf-currency=USD; vsf-country=sv; vsf-store=SV; vsf-channel=1bad5650-9b56-4490-b3c5-2d50f86c6716";

export async function searchProducts(
  store: "walmart" | "pricesmart",
  query: string,
): Promise<ProductHit[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await createClient();

  // 1. Cache lookup
  const { data: cached } = await supabase
    .from("product_cache")
    .select("results_json, fetched_at")
    .eq("store", store)
    .eq("search_query", q.toLowerCase())
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < CACHE_TTL_HOURS * 3600 * 1000) {
      return cached.results_json as ProductHit[];
    }
  }

  // 2. Live fetch
  let hits: ProductHit[] = [];
  try {
    if (store === "walmart") {
      hits = await scrapeWalmart(q);
    } else {
      hits = await scrapePricesmart(q);
    }
  } catch (err) {
    // Cualquier error → vacío; el UI cae a entrada manual
    console.error("[searchProducts] scrape error", store, q, err);
    hits = [];
  }

  // 3. Persistir caché (UPSERT)
  try {
    await supabase
      .from("product_cache")
      .upsert(
        { store, search_query: q.toLowerCase(), results_json: hits, fetched_at: new Date().toISOString() },
        { onConflict: "store,search_query" },
      );
  } catch {
    // no-op: si falla el caché, igual devolvemos resultados
  }

  return hits;
}

async function scrapeWalmart(query: string): Promise<ProductHit[]> {
  // VTEX public catalog API — entrega JSON limpio sin autenticación
  const url =
    `https://www.walmart.com.sv/api/catalog_system/pub/products/search/${encodeURIComponent(query)}?_from=0&_to=4`;

  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);

  let raw: unknown[];
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "es-SV,es;q=0.9",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    raw = (await res.json()) as unknown[];
  } finally {
    clearTimeout(tmo);
  }

  if (!Array.isArray(raw)) return [];

  // Mapeo defensivo: el shape de VTEX puede traer items sin precio o sin imagen
  const hits: ProductHit[] = [];
  for (const p of raw.slice(0, 5)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prod = p as any;
    const id = String(prod?.productId ?? "");
    const name = String(prod?.productName ?? "").trim();
    if (!id || !name) continue;

    // Precio: primer SKU > primer seller > listPrice/Price
    let price = 0;
    const item0 = Array.isArray(prod?.items) ? prod.items[0] : null;
    const seller0 = Array.isArray(item0?.sellers) ? item0.sellers[0] : null;
    const offer = seller0?.commertialOffer;
    if (offer?.Price && offer.Price > 0) price = Number(offer.Price);
    else if (offer?.ListPrice && offer.ListPrice > 0) price = Number(offer.ListPrice);

    // Imagen: primera del primer SKU
    let image: string | null = null;
    const imgs = Array.isArray(item0?.images) ? item0.images : null;
    if (imgs && imgs.length > 0) image = String(imgs[0]?.imageUrl ?? "") || null;

    hits.push({
      store: "walmart",
      external_id: id,
      name,
      price,
      image_url: image,
      product_url: String(prod?.link ?? ""),
    });
  }
  return hits;
}

/**
 * Obtain a short-lived Commercetools anonymous Bearer token by calling
 * PriceSmart's VSF middleware createCart endpoint.
 * The token has a 3-hour TTL and grants view_products / view_published_products.
 */
async function getPricesmartCTToken(): Promise<string | null> {
  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://www.pricesmart.com/api/ct/createCart", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: CT_VSF_COOKIES,
        Origin: "https://www.pricesmart.com",
        Referer: "https://www.pricesmart.com/es-sv/",
      },
      body: "{}",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;

    // Token is returned as a Set-Cookie header: vsf-commercetools-token={urlencoded JSON}
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const match = cookie.match(/vsf-commercetools-token=([^;]+)/);
      if (match) {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        return (parsed?.access_token as string) ?? null;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(tmo);
  }
}

/**
 * Batch-fetch SV USD prices for an array of product keys from Commercetools.
 * Returns a map of { [key]: price_in_usd }.
 */
async function fetchCTPrices(
  pids: string[],
  token: string,
): Promise<Record<string, number>> {
  if (!pids.length) return {};

  // CT where clause: key in ("pid1","pid2",...)
  const whereClause = `key in (${pids.map((p) => `"${p}"`).join(",")})`;
  const params = new URLSearchParams({
    where: whereClause,
    priceCurrency: CT_CURRENCY,
    priceCountry: CT_COUNTRY,
    priceChannel: CT_CHANNEL,
    limit: String(pids.length),
  });

  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${CT_API}/product-projections?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const priceMap: Record<string, number> = {};
    for (const p of data?.results ?? []) {
      const key = String(p?.key ?? "");
      // Selected price is at masterVariant.price (set by the priceCurrency/priceCountry/priceChannel params)
      const centAmount: number = p?.masterVariant?.price?.value?.centAmount ?? 0;
      const fractionDigits: number = p?.masterVariant?.price?.value?.fractionDigits ?? 2;
      if (key && centAmount > 0) {
        priceMap[key] = centAmount / Math.pow(10, fractionDigits);
      }
    }
    return priceMap;
  } catch {
    return {};
  } finally {
    clearTimeout(tmo);
  }
}

async function scrapePricesmart(query: string): Promise<ProductHit[]> {
  // ── Step 1: Bloomreach Discovery for SV catalog (names, thumbnails, pids) ──
  const brParams = new URLSearchParams({
    account_id: BR_ACCOUNT_ID,
    domain_key: BR_DOMAIN_KEY,
    auth_key: BR_AUTH_KEY,
    catalog_views: BR_CATALOG_VIEWS,
    request_type: "search",
    search_type: "keyword",
    q: query,
    fl: "pid,title,thumb_image,url,brand",
    rows: "5",
    url: "https://www.pricesmart.com/es-sv/search",
    ref_url: "https://www.pricesmart.com/es-sv/",
  });

  const brUrl = `https://core.dxpapi.com/api/v1/core/?${brParams.toString()}`;
  const brCtrl = new AbortController();
  const brTmo = setTimeout(() => brCtrl.abort(), SEARCH_TIMEOUT_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let brData: any;
  try {
    const res = await fetch(brUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "es-SV,es;q=0.9",
      },
      signal: brCtrl.signal,
    });
    if (!res.ok) return [];
    brData = await res.json();
  } catch {
    return [];
  } finally {
    clearTimeout(brTmo);
  }

  const docs: unknown[] = brData?.response?.docs;
  if (!Array.isArray(docs) || docs.length === 0) return [];

  // ── Step 2: Extract pids, names, images from Bloomreach ──
  type BrHit = { pid: string; name: string; image: string | null };
  const brHits: BrHit[] = [];
  for (const d of docs.slice(0, 5)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = d as any;
    const pid = String(doc?.pid ?? "").trim();
    const name = String(doc?.title ?? "").trim();
    if (!pid || !name) continue;
    brHits.push({
      pid,
      name,
      image: doc?.thumb_image ? String(doc.thumb_image) : null,
    });
  }
  if (!brHits.length) return [];

  // ── Step 3: Get CT token + batch-fetch prices ──
  const pids = brHits.map((h) => h.pid);
  let priceMap: Record<string, number> = {};
  try {
    const token = await getPricesmartCTToken();
    if (token) {
      priceMap = await fetchCTPrices(pids, token);
    }
  } catch {
    // Price fetch failed — return hits with 0 price (user can edit)
  }

  // ── Step 4: Merge ──
  return brHits.map((hit) => ({
    store: "pricesmart" as const,
    external_id: hit.pid,
    name: hit.name,
    price: priceMap[hit.pid] ?? 0,
    image_url: hit.image,
    product_url: `https://www.pricesmart.com/es-sv/p/${hit.pid}`,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD de listas e ítems
// ─────────────────────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function ensureActiveList(): Promise<{ id: string } | { error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "No autenticado" };
  const supabase = await createClient();

  // Buscar lista activa del scope (compartida entre todos los miembros)
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("scope", "personal")
    .eq("status", "active")
    .maybeSingle();
  if (existing?.id) return { id: existing.id };

  // Buscar la última lista purchased del scope para copiar items
  const { data: lastPurchased } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("scope", "personal")
    .eq("status", "purchased")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: newList, error: insErr } = await supabase
    .from("shopping_lists")
    .insert({
      user_id: userId,
      scope: "personal",
      name: "Lista de mercado",
      status: "active",
    })
    .select("id")
    .single();
  if (insErr || !newList) return { error: insErr?.message ?? "No se pudo crear la lista" };

  if (lastPurchased?.id) {
    const { data: prevItems } = await supabase
      .from("shopping_list_items")
      .select("name, store, quantity, unit_price, image_url, product_url, external_id")
      .eq("list_id", lastPurchased.id);
    if (prevItems && prevItems.length > 0) {
      await supabase.from("shopping_list_items").insert(
        prevItems.map((it) => ({
          list_id: newList.id,
          name: it.name,
          store: it.store,
          quantity: it.quantity,
          unit_price: it.unit_price,
          image_url: it.image_url,
          product_url: it.product_url,
          external_id: it.external_id,
          is_checked: false,
        })),
      );
    }
  }

  return { id: newList.id };
}

export async function getActiveList(): Promise<ActiveListPayload | { error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "No autenticado" };
  const supabase = await createClient();

  // 1. Lista activa del scope (compartida)
  const { data: list, error: listErr } = await supabase
    .from("shopping_lists")
    .select("*")
    .eq("scope", "personal")
    .eq("status", "active")
    .maybeSingle();
  if (listErr) return { error: listErr.message };
  if (!list) return { error: "Sin lista activa" };

  // 2. Items
  const { data: items } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("list_id", list.id)
    .order("created_at", { ascending: true });
  const itemRows = (items ?? []) as ShoppingListItemRow[];

  // 3. Presupuestos por tienda (mes actual)
  const { year, month } = svToday();
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(year, month + 1, 1);
  const monthEnd = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  const budgets: ActiveListPayload["budgets"] = {
    walmart: await buildStoreBudget("walmart", itemRows, monthStart, monthEnd),
    pricesmart: await buildStoreBudget("pricesmart", itemRows, monthStart, monthEnd),
  };

  // 4. Sugerencias: items vistos en últimas 5 listas purchased pero ausentes en activa
  const { data: pastLists } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("scope", "personal")
    .eq("status", "purchased")
    .order("purchased_at", { ascending: false })
    .limit(5);

  let suggestions: Suggestion[] = [];
  if (pastLists && pastLists.length > 0) {
    const ids = pastLists.map((l) => l.id);
    const { data: pastItems } = await supabase
      .from("shopping_list_items")
      .select("name, store, unit_price, image_url, product_url, external_id")
      .in("list_id", ids);
    const activeKeys = new Set(itemRows.map((i) => `${i.store}|${i.name.toLowerCase().trim()}`));
    const tally = new Map<string, Suggestion>();
    for (const it of pastItems ?? []) {
      const key = `${it.store}|${(it.name as string).toLowerCase().trim()}`;
      if (activeKeys.has(key)) continue;
      const prev = tally.get(key);
      if (prev) {
        prev.times_seen += 1;
      } else {
        tally.set(key, {
          name: it.name as string,
          store: it.store as Store,
          unit_price: Number(it.unit_price),
          image_url: (it.image_url as string | null) ?? null,
          product_url: (it.product_url as string | null) ?? null,
          external_id: (it.external_id as string | null) ?? null,
          times_seen: 1,
        });
      }
    }
    suggestions = [...tally.values()]
      .sort((a, b) => b.times_seen - a.times_seen)
      .slice(0, 10);
  }

  return { list: list as ShoppingListRow, items: itemRows, suggestions, budgets };
}

async function buildStoreBudget(
  store: "walmart" | "pricesmart",
  items: ShoppingListItemRow[],
  monthStart: string,
  monthEnd: string,
): Promise<StoreBudgetSnapshot> {
  const supabase = await createClient();
  const targetName = STORE_BUDGET_CATEGORY[store];

  // Suma de items de esa tienda en la lista activa
  const list_total = items
    .filter((i) => i.store === store)
    .reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);

  // Buscar categoría por nombre (case-insensitive) en scope personal
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name")
    .eq("scope", "personal")
    .ilike("name", targetName);
  const cat = cats?.[0] ?? null;
  if (!cat) {
    return { category_id: null, category_name: targetName, expected: 0, spent: 0, list_total };
  }

  // Expected: planned_budgets del mes
  const { data: budgetRow } = await supabase
    .from("planned_budgets")
    .select("expected_amount")
    .eq("scope", "personal")
    .eq("category_id", cat.id)
    .eq("period_month", monthStart)
    .maybeSingle();
  const expected = Number(budgetRow?.expected_amount ?? 0);

  // Spent: egresos confirmados que afectan balance en esa categoría este mes
  const { data: spentRows } = await supabase
    .from("transactions")
    .select("amount")
    .eq("scope", "personal")
    .eq("kind", "expense")
    .eq("category_id", cat.id)
    .eq("is_confirmed", true)
    .eq("affects_balance", true)
    .gte("occurred_on", monthStart)
    .lt("occurred_on", monthEnd);
  const spent = (spentRows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  return { category_id: cat.id, category_name: cat.name, expected, spent, list_total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutaciones de items
// ─────────────────────────────────────────────────────────────────────────────

export async function addItem(input: {
  list_id: string;
  name: string;
  store: Store;
  quantity: number;
  unit_price: number;
  image_url?: string | null;
  product_url?: string | null;
  external_id?: string | null;
}) {
  if (!input.name?.trim()) return { error: "El nombre es requerido" };
  if (input.quantity <= 0) return { error: "Cantidad inválida" };
  if (input.unit_price < 0) return { error: "Precio inválido" };

  const supabase = await createClient();
  const { error } = await supabase.from("shopping_list_items").insert({
    list_id: input.list_id,
    name: input.name.trim(),
    store: input.store,
    quantity: input.quantity,
    unit_price: input.unit_price,
    image_url: input.image_url ?? null,
    product_url: input.product_url ?? null,
    external_id: input.external_id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/personal/mercado");
  return { success: true };
}

export async function updateItem(
  id: string,
  patch: { quantity?: number; unit_price?: number; name?: string; store?: Store },
) {
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (patch.quantity !== undefined) updates.quantity = patch.quantity;
  if (patch.unit_price !== undefined) updates.unit_price = patch.unit_price;
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.store !== undefined) updates.store = patch.store;
  if (Object.keys(updates).length === 0) return { success: true };
  const { error } = await supabase.from("shopping_list_items").update(updates).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/personal/mercado");
  return { success: true };
}

export async function removeItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/personal/mercado");
  return { success: true };
}

export async function toggleItemChecked(id: string, value: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ is_checked: value })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/personal/mercado");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marcar como comprada → crea 1 o 2 egresos pendientes + nueva lista activa
// ─────────────────────────────────────────────────────────────────────────────

export async function markListAsPurchased(input: {
  list_id: string;
  walmart?: { account_id: string; category_id: string };
  pricesmart?: { account_id: string; category_id: string };
  manual_target: "walmart" | "pricesmart";
  description?: string;
}): Promise<
  | { success: true; walmartTxId?: string; pricesmartTxId?: string; newListId: string }
  | { error: string }
> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "No autenticado" };
  const supabase = await createClient();

  // 1. Cargar items
  const { data: items, error: itemsErr } = await supabase
    .from("shopping_list_items")
    .select("name, store, quantity, unit_price, image_url, product_url, external_id")
    .eq("list_id", input.list_id);
  if (itemsErr) return { error: itemsErr.message };
  if (!items || items.length === 0) return { error: "La lista está vacía" };

  const sum = (filter: (i: { store: string }) => boolean) =>
    items
      .filter(filter)
      .reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);

  const walmartItemsTotal = sum((i) => i.store === "walmart");
  const pricesmartItemsTotal = sum((i) => i.store === "pricesmart");
  const manualTotal = sum((i) => i.store === "manual");

  const walmartTotal =
    Math.round(
      (walmartItemsTotal + (input.manual_target === "walmart" ? manualTotal : 0)) * 100,
    ) / 100;
  const pricesmartTotal =
    Math.round(
      (pricesmartItemsTotal + (input.manual_target === "pricesmart" ? manualTotal : 0)) * 100,
    ) / 100;

  if (walmartTotal === 0 && pricesmartTotal === 0) {
    return { error: "El total es 0" };
  }
  if (walmartTotal > 0 && !input.walmart) {
    return { error: "Falta seleccionar cuenta y categoría para el grupo Walmart" };
  }
  if (pricesmartTotal > 0 && !input.pricesmart) {
    return { error: "Falta seleccionar cuenta y categoría para el grupo PriceSmart" };
  }

  const { dateStr: today } = svToday();
  const baseDesc = input.description?.trim() || "Mercado";

  let walmartTxId: string | undefined;
  let pricesmartTxId: string | undefined;

  // 2. Crear egreso Walmart
  if (walmartTotal > 0 && input.walmart) {
    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        scope: "personal",
        account_id: input.walmart.account_id,
        category_id: input.walmart.category_id,
        kind: "expense",
        amount: walmartTotal,
        occurred_on: today,
        description: `${baseDesc} — Walmart`,
        is_planned: false,
        is_confirmed: false,
        affects_balance: true,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !tx) return { error: error?.message ?? "Error creando egreso Walmart" };
    walmartTxId = tx.id;
    await supabase.from("shopping_list_transactions").insert({
      list_id: input.list_id,
      transaction_id: tx.id,
      store: "walmart",
    });
  }

  // 3. Crear egreso PriceSmart
  if (pricesmartTotal > 0 && input.pricesmart) {
    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        scope: "personal",
        account_id: input.pricesmart.account_id,
        category_id: input.pricesmart.category_id,
        kind: "expense",
        amount: pricesmartTotal,
        occurred_on: today,
        description: `${baseDesc} — PriceSmart`,
        is_planned: false,
        is_confirmed: false,
        affects_balance: true,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !tx) return { error: error?.message ?? "Error creando egreso PriceSmart" };
    pricesmartTxId = tx.id;
    await supabase.from("shopping_list_transactions").insert({
      list_id: input.list_id,
      transaction_id: tx.id,
      store: "pricesmart",
    });
  }

  // 4. Archivar la lista actual
  await supabase
    .from("shopping_lists")
    .update({
      status: "purchased",
      purchased_at: new Date().toISOString(),
      total_at_purchase: Math.round((walmartTotal + pricesmartTotal) * 100) / 100,
    })
    .eq("id", input.list_id);

  // 5. Crear nueva lista activa con items copiados
  const { data: newList, error: newErr } = await supabase
    .from("shopping_lists")
    .insert({
      user_id: userId,
      scope: "personal",
      name: "Lista de mercado",
      status: "active",
    })
    .select("id")
    .single();
  if (newErr || !newList) {
    // La lista vieja ya quedó purchased; reportamos pero el efecto principal está hecho
    return { error: `Egresos creados, pero no se pudo crear la nueva lista: ${newErr?.message ?? ""}` };
  }
  if (items.length > 0) {
    await supabase.from("shopping_list_items").insert(
      items.map((it) => ({
        list_id: newList.id,
        name: it.name,
        store: it.store,
        quantity: it.quantity,
        unit_price: it.unit_price,
        image_url: it.image_url,
        product_url: it.product_url,
        external_id: it.external_id,
        is_checked: false,
      })),
    );
  }

  revalidatePath("/personal/mercado");
  revalidatePath("/personal/transactions");
  revalidatePath("/personal/dashboard");
  revalidatePath("/personal/budgets");

  return { success: true, walmartTxId, pricesmartTxId, newListId: newList.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Historial
// ─────────────────────────────────────────────────────────────────────────────

export type HistoryEntry = {
  id: string;
  name: string;
  purchased_at: string;
  total_at_purchase: number;
  transaction_ids: { walmart?: string; pricesmart?: string };
};

export async function getHistory(limit = 10): Promise<HistoryEntry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const supabase = await createClient();

  const { data: lists } = await supabase
    .from("shopping_lists")
    .select("id, name, purchased_at, total_at_purchase")
    .eq("scope", "personal")
    .eq("status", "purchased")
    .order("purchased_at", { ascending: false })
    .limit(limit);
  if (!lists || lists.length === 0) return [];

  const ids = lists.map((l) => l.id);
  const { data: links } = await supabase
    .from("shopping_list_transactions")
    .select("list_id, store, transaction_id")
    .in("list_id", ids);

  const byList = new Map<string, { walmart?: string; pricesmart?: string }>();
  for (const link of links ?? []) {
    const entry = byList.get(link.list_id as string) ?? {};
    if (link.store === "walmart") entry.walmart = link.transaction_id as string;
    if (link.store === "pricesmart") entry.pricesmart = link.transaction_id as string;
    byList.set(link.list_id as string, entry);
  }

  return lists.map((l) => ({
    id: l.id as string,
    name: l.name as string,
    purchased_at: l.purchased_at as string,
    total_at_purchase: Number(l.total_at_purchase ?? 0),
    transaction_ids: byList.get(l.id as string) ?? {},
  }));
}
