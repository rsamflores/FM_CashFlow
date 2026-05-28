"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import type { AccountRow } from "@/lib/actions/accounts";
import type { CategoryRow } from "@/lib/actions/categories";
import {
  markListAsPurchased,
  type StoreBudgetSnapshot,
} from "@/lib/actions/shopping";

type Totals = { walmart: number; pricesmart: number; manual: number };

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
  // Defaults: cuenta y categoría por tienda según el plan
  const walmartCategoryDefault = useMemo(() => {
    if (budgets.walmart.category_id) return budgets.walmart.category_id;
    return categories.find((c) => /supermercado/i.test(c.name))?.id ?? categories[0]?.id ?? "";
  }, [budgets.walmart.category_id, categories]);

  const pricesmartCategoryDefault = useMemo(() => {
    if (budgets.pricesmart.category_id) return budgets.pricesmart.category_id;
    return categories.find((c) => /pricesmart/i.test(c.name))?.id ?? categories[0]?.id ?? "";
  }, [budgets.pricesmart.category_id, categories]);

  const walmartAccountDefault = useMemo(() => {
    const nonCredit = accounts.filter((a) => a.type !== "credit_card");
    return nonCredit[0]?.id ?? accounts[0]?.id ?? "";
  }, [accounts]);

  const pricesmartAccountDefault = useMemo(() => {
    const psCard = accounts.find(
      (a) => a.type === "credit_card" && /pricesmart/i.test(a.name),
    );
    if (psCard) return psCard.id;
    const anyCard = accounts.find((a) => a.type === "credit_card");
    if (anyCard) return anyCard.id;
    return accounts[0]?.id ?? "";
  }, [accounts]);

  const [walmartAccount, setWalmartAccount] = useState(walmartAccountDefault);
  const [walmartCategory, setWalmartCategory] = useState(walmartCategoryDefault);
  const [pricesmartAccount, setPricesmartAccount] = useState(pricesmartAccountDefault);
  const [pricesmartCategory, setPricesmartCategory] = useState(pricesmartCategoryDefault);
  const [manualTarget, setManualTarget] = useState<"walmart" | "pricesmart">("walmart");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const walmartGroupTotal =
    totals.walmart + (manualTarget === "walmart" ? totals.manual : 0);
  const pricesmartGroupTotal =
    totals.pricesmart + (manualTarget === "pricesmart" ? totals.manual : 0);
  const hasManual = totals.manual > 0;
  const hasWalmart = walmartGroupTotal > 0;
  const hasPricesmart = pricesmartGroupTotal > 0;
  const grand = walmartGroupTotal + pricesmartGroupTotal;

  function submit() {
    setError(null);
    if (hasWalmart && (!walmartAccount || !walmartCategory))
      return setError("Falta cuenta o categoría para el grupo Walmart");
    if (hasPricesmart && (!pricesmartAccount || !pricesmartCategory))
      return setError("Falta cuenta o categoría para el grupo PriceSmart");

    startTransition(async () => {
      const res = await markListAsPurchased({
        list_id: listId,
        walmart: hasWalmart
          ? { account_id: walmartAccount, category_id: walmartCategory }
          : undefined,
        pricesmart: hasPricesmart
          ? { account_id: pricesmartAccount, category_id: pricesmartCategory }
          : undefined,
        manual_target: manualTarget,
        description: description.trim() || undefined,
      });
      if ("error" in res && res.error) setError(res.error);
      else onClose();
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
            <p className="text-label-md text-on-surface-variant">Total</p>
            <p className="text-headline-lg-mobile font-bold text-on-surface">
              {formatCurrency(grand)}
            </p>
            <p className="text-label-md text-on-surface-variant mt-xs">
              Walmart {formatCurrency(walmartGroupTotal)} · PriceSmart {formatCurrency(pricesmartGroupTotal)}
              {hasManual && ` · Manual ${formatCurrency(totals.manual)} (asignado abajo)`}
            </p>
          </div>

          {hasManual && (
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-md flex flex-col gap-xs">
              <p className="text-label-md text-on-surface-variant">
                Items manuales ({formatCurrency(totals.manual)}) — ¿a qué grupo se suman?
              </p>
              <div className="flex gap-sm">
                <label className="flex items-center gap-xs text-body-sm">
                  <input
                    type="radio"
                    name="manual_target"
                    checked={manualTarget === "walmart"}
                    onChange={() => setManualTarget("walmart")}
                    className="accent-primary"
                  />
                  Supermercado / Walmart
                </label>
                <label className="flex items-center gap-xs text-body-sm">
                  <input
                    type="radio"
                    name="manual_target"
                    checked={manualTarget === "pricesmart"}
                    onChange={() => setManualTarget("pricesmart")}
                    className="accent-primary"
                  />
                  PriceSmart
                </label>
              </div>
            </div>
          )}

          {hasWalmart && (
            <GroupSection
              title="Egreso Walmart"
              accent="#0071ce"
              icon="shopping_cart"
              total={walmartGroupTotal}
              account={walmartAccount}
              category={walmartCategory}
              accounts={accounts}
              categories={categories}
              onAccount={setWalmartAccount}
              onCategory={setWalmartCategory}
            />
          )}

          {hasPricesmart && (
            <GroupSection
              title="Egreso PriceSmart"
              accent="#e30613"
              icon="store"
              total={pricesmartGroupTotal}
              account={pricesmartAccount}
              category={pricesmartCategory}
              accounts={accounts}
              categories={categories}
              onAccount={setPricesmartAccount}
              onCategory={setPricesmartCategory}
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
  title,
  accent,
  icon,
  total,
  account,
  category,
  accounts,
  categories,
  onAccount,
  onCategory,
}: {
  title: string;
  accent: string;
  icon: string;
  total: number;
  account: string;
  category: string;
  accounts: AccountRow[];
  categories: CategoryRow[];
  onAccount: (v: string) => void;
  onCategory: (v: string) => void;
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
        <h4 className="text-body-sm font-bold flex-1" style={{ color: accent }}>
          {title}
        </h4>
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
              {a.name}
              {a.type === "credit_card" ? " (tarjeta)" : ""}
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
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
