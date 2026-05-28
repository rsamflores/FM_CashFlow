"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import {
  markListAsPurchased,
  type StoreBudgetSnapshot,
} from "@/lib/actions/shopping";

type Totals = {
  walmart: number;
  pricesmart: number;
  agromercado: number;
  dollarcity: number;
  manual: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  totals: Totals;
  budgets: { walmart: StoreBudgetSnapshot; pricesmart: StoreBudgetSnapshot };
  accounts: AccountRow[];
  categories: CategoryRow[];
};

export function PurchaseDialog({
  open,
  onClose,
  listId,
  totals,
  budgets,
  accounts,
  categories,
}: Props) {
  // ── Defaults por tienda ────────────────────────────────────────────────────
  const firstNonCredit = useMemo(
    () => accounts.find((a) => a.type !== "credit_card")?.id ?? accounts[0]?.id ?? "",
    [accounts],
  );
  const firstCard = useMemo(
    () => accounts.find((a) => a.type === "credit_card")?.id ?? accounts[0]?.id ?? "",
    [accounts],
  );
  const psCard = useMemo(
    () =>
      accounts.find((a) => a.type === "credit_card" && /pricesmart/i.test(a.name))?.id ??
      firstCard,
    [accounts, firstCard],
  );

  const catSuper = useMemo(
    () =>
      budgets.walmart.category_id ??
      categories.find((c) => /supermercado/i.test(c.name))?.id ??
      categories[0]?.id ?? "",
    [budgets.walmart.category_id, categories],
  );
  const catPS = useMemo(
    () =>
      budgets.pricesmart.category_id ??
      categories.find((c) => /pricesmart/i.test(c.name))?.id ??
      categories[0]?.id ?? "",
    [budgets.pricesmart.category_id, categories],
  );
  const catOther = useMemo(
    () => categories.find((c) => /supermercado|hogar/i.test(c.name))?.id ?? categories[0]?.id ?? "",
    [categories],
  );

  // ── Estado por tienda ──────────────────────────────────────────────────────
  const [walmartAccount,     setWalmartAccount]     = useState(firstNonCredit);
  const [walmartCategory,    setWalmartCategory]    = useState(catSuper);
  const [pricesmartAccount,  setPricesmartAccount]  = useState(psCard);
  const [pricesmartCategory, setPricesmartCategory] = useState(catPS);
  const [agroAccount,        setAgroAccount]        = useState(firstNonCredit);
  const [agroCategory,       setAgroCategory]       = useState(catOther);
  const [dcAccount,          setDcAccount]          = useState(firstNonCredit);
  const [dcCategory,         setDcCategory]         = useState(catOther);

  const [manualTarget, setManualTarget] = useState<"walmart" | "pricesmart" | "agromercado" | "dollarcity">("walmart");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const hasManual = totals.manual > 0;
  const mt = manualTarget;
  const walmartTotal     = totals.walmart     + (mt === "walmart"      ? totals.manual : 0);
  const pricesmartTotal  = totals.pricesmart  + (mt === "pricesmart"   ? totals.manual : 0);
  const agroTotal        = totals.agromercado + (mt === "agromercado"  ? totals.manual : 0);
  const dcTotal          = totals.dollarcity  + (mt === "dollarcity"   ? totals.manual : 0);

  const grand = walmartTotal + pricesmartTotal + agroTotal + dcTotal;

  function submit() {
    setError(null);
    if (walmartTotal    > 0 && (!walmartAccount     || !walmartCategory))    return setError("Falta cuenta o categoría para Walmart");
    if (pricesmartTotal > 0 && (!pricesmartAccount  || !pricesmartCategory)) return setError("Falta cuenta o categoría para PriceSmart");
    if (agroTotal       > 0 && (!agroAccount        || !agroCategory))       return setError("Falta cuenta o categoría para Agromercado");
    if (dcTotal         > 0 && (!dcAccount          || !dcCategory))         return setError("Falta cuenta o categoría para Dollar City");

    startTransition(async () => {
      const res = await markListAsPurchased({
        list_id: listId,
        walmart:     walmartTotal    > 0 ? { account_id: walmartAccount,    category_id: walmartCategory }    : undefined,
        pricesmart:  pricesmartTotal > 0 ? { account_id: pricesmartAccount, category_id: pricesmartCategory } : undefined,
        agromercado: agroTotal       > 0 ? { account_id: agroAccount,       category_id: agroCategory }       : undefined,
        dollarcity:  dcTotal         > 0 ? { account_id: dcAccount,         category_id: dcCategory }         : undefined,
        manual_target: manualTarget,
        description: description.trim() || undefined,
      });
      if ("error" in res && res.error) setError(res.error);
      else onClose();
    });
  }

  // Opciones de destino para items manuales (solo tiendas con items propios o la tienda activa)
  const manualOptions: { value: typeof manualTarget; label: string }[] = [
    { value: "walmart",     label: "Walmart" },
    { value: "pricesmart",  label: "PriceSmart" },
    { value: "agromercado", label: "Agromercado" },
    { value: "dollarcity",  label: "Dollar City" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        style={{ backdropFilter: "blur(4px)" }}
      />
      <div
        className="relative z-10 bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full"
        style={{ maxWidth: 480, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between p-lg border-b border-outline-variant/10">
          <h2 className="text-title-md text-on-surface">Marcar lista como comprada</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-surface-container-high flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="p-lg flex flex-col gap-md">
          {/* Resumen */}
          <div className="rounded-xl border border-outline-variant/15 bg-surface-container-high p-md">
            <p className="text-label-md text-on-surface-variant">Total compra</p>
            <p className="text-headline-lg-mobile font-bold text-on-surface">
              {formatCurrency(grand)}
            </p>
            <div className="flex flex-wrap gap-x-md gap-y-xs mt-xs">
              {[
                { label: "Walmart",      total: walmartTotal,    color: "#0071ce" },
                { label: "PriceSmart",   total: pricesmartTotal, color: "#ef4123" },
                { label: "Agromercado",  total: agroTotal,       color: "#2e7d32" },
                { label: "Dollar City",  total: dcTotal,         color: "#f59e0b" },
              ]
                .filter((s) => s.total > 0)
                .map((s) => (
                  <span key={s.label} className="text-label-md" style={{ color: s.color }}>
                    {s.label} {formatCurrency(s.total)}
                  </span>
                ))}
            </div>
          </div>

          {/* Items manuales — asignar a tienda */}
          {hasManual && (
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-md flex flex-col gap-xs">
              <p className="text-label-md text-on-surface-variant">
                Items &quot;Otro&quot; ({formatCurrency(totals.manual)}) — sumar a:
              </p>
              <div className="flex flex-wrap gap-sm">
                {manualOptions.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-xs text-body-sm">
                    <input
                      type="radio"
                      name="manual_target"
                      checked={manualTarget === opt.value}
                      onChange={() => setManualTarget(opt.value)}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Grupos por tienda */}
          {walmartTotal > 0 && (
            <GroupSection
              title="Walmart" accent="#0071ce" icon="shopping_cart"
              total={walmartTotal} account={walmartAccount} category={walmartCategory}
              accounts={accounts} categories={categories}
              onAccount={setWalmartAccount} onCategory={setWalmartCategory}
            />
          )}
          {pricesmartTotal > 0 && (
            <GroupSection
              title="PriceSmart" accent="#ef4123" icon="store"
              total={pricesmartTotal} account={pricesmartAccount} category={pricesmartCategory}
              accounts={accounts} categories={categories}
              onAccount={setPricesmartAccount} onCategory={setPricesmartCategory}
            />
          )}
          {agroTotal > 0 && (
            <GroupSection
              title="Agromercado" accent="#2e7d32" icon="storefront"
              total={agroTotal} account={agroAccount} category={agroCategory}
              accounts={accounts} categories={categories}
              onAccount={setAgroAccount} onCategory={setAgroCategory}
            />
          )}
          {dcTotal > 0 && (
            <GroupSection
              title="Dollar City" accent="#f59e0b" icon="sell"
              total={dcTotal} account={dcAccount} category={dcCategory}
              accounts={accounts} categories={categories}
              onAccount={setDcAccount} onCategory={setDcCategory}
            />
          )}

          <label className="flex flex-col gap-xs">
            <span className="text-label-md text-on-surface-variant">Descripción (opcional)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='ej. "Mercado fin de semana"'
              className="h-10 px-md rounded-lg bg-surface-container-high text-on-surface text-body-sm outline-none border-none"
            />
          </label>

          {error && <p className="text-label-md text-error">{error}</p>}

          <div className="flex justify-end gap-sm pt-sm">
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
              onClick={submit}
              className="h-10 px-md rounded-full bg-primary-container text-on-primary-container text-body-sm font-bold disabled:opacity-50"
            >
              {pending ? "Procesando…" : "Confirmar compra"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupSection({
  title, accent, icon, total,
  account, category, accounts, categories,
  onAccount, onCategory,
}: {
  title: string; accent: string; icon: string; total: number;
  account: string; category: string;
  accounts: AccountRow[]; categories: CategoryRow[];
  onAccount: (v: string) => void; onCategory: (v: string) => void;
}) {
  return (
    <div
      className="rounded-xl border p-md flex flex-col gap-sm"
      style={{ borderColor: accent + "40", background: accent + "08" }}
    >
      <div className="flex items-center gap-sm">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: accent }}>
          {icon}
        </span>
        <h4 className="text-body-sm font-bold flex-1" style={{ color: accent }}>{title}</h4>
        <span className="text-body-sm font-bold text-on-surface">{formatCurrency(total)}</span>
      </div>
      <label className="flex flex-col gap-xs">
        <span className="text-label-md text-on-surface-variant">Cuenta</span>
        <select
          value={account}
          onChange={(e) => onAccount(e.target.value)}
          className="h-10 px-md rounded-lg bg-surface-container text-on-surface text-body-sm outline-none border-none"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}{a.type === "credit_card" ? " (tarjeta)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-xs">
        <span className="text-label-md text-on-surface-variant">Categoría</span>
        <select
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="h-10 px-md rounded-lg bg-surface-container text-on-surface text-body-sm outline-none border-none"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
