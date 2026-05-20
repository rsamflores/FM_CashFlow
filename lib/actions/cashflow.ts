"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { svToday } from "@/lib/format";
import type { Scope } from "@/lib/scope";

export type CashFlowPoint = {
  date: string;       // "YYYY-MM-DD"
  label: string;      // formatted for chart axis
  balance: number;
  events: string[];   // descriptions of what happens this day
};

export type CashFlowProjection = {
  series: CashFlowPoint[];
  currentBalance: number;
  minBalance: number;
  minDate: string | null;
  dangerDays: number; // days where balance < 0
  // When the current month has no budgets, we fall back to a previous month
  // and use those as a template. These fields surface that fact to the UI.
  budgetsRolledFromMonth: string | null; // e.g. "2026-05-01" or null
};

// Add n days to a YYYY-MM-DD string using local noon to avoid TZ/DST drift.
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

// Advance a YYYY-MM-DD date by one recurrence cycle.
function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T12:00:00");
  switch (frequency) {
    case "weekly":   d.setDate(d.getDate() + 7);      break;
    case "biweekly": d.setDate(d.getDate() + 14);     break;
    case "monthly":  d.setMonth(d.getMonth() + 1);    break;
    case "yearly":   d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toLocaleDateString("en-CA");
}

function formatLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-SV", { day: "numeric", month: "short" });
}

function lastDayOfMonthStr(year: number, month0: number): string {
  // month0 is 0-indexed; day 0 of next month = last day of this month
  const d = new Date(year, month0 + 1, 0);
  return d.toLocaleDateString("en-CA");
}

export async function getCashFlowProjection(
  scope: Scope,
  days: 30 | 60 | 90,
): Promise<CashFlowProjection> {
  const admin = createAdminClient();

  // ── 0. Anchor all dates in El Salvador timezone ────────────────────────────
  const { year, month, dateStr: todayStr } = svToday();
  const endDateStr = addDays(todayStr, days);
  const tomorrowStr = addDays(todayStr, 1);

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = lastDayOfMonthStr(year, month); // last day of current month

  // ── 1. Accounts + confirmed balance ────────────────────────────────────────
  const [accountsRes, confirmedTxsRes] = await Promise.all([
    admin.from("accounts").select("id, type, opening_balance").eq("scope", scope).is("archived_at", null),
    admin.from("transactions").select("account_id, kind, amount")
      .eq("scope", scope).eq("is_confirmed", true).eq("affects_balance", true),
  ]);

  const accounts = accountsRes.data ?? [];
  // Only non-credit accounts hold cash; credit cards are debt, not liquidity.
  const nonCreditIds = new Set(accounts.filter((a) => a.type !== "credit_card").map((a) => a.id));

  const balanceByAccount: Record<string, number> = {};
  for (const a of accounts) balanceByAccount[a.id] = Number(a.opening_balance ?? 0);
  for (const tx of confirmedTxsRes.data ?? []) {
    const amt = Number(tx.amount);
    balanceByAccount[tx.account_id] = (balanceByAccount[tx.account_id] ?? 0)
      + (tx.kind === "income" ? amt : -amt);
  }
  const currentBalance = accounts
    .filter((a) => nonCreditIds.has(a.id))
    .reduce((s, a) => s + (balanceByAccount[a.id] ?? 0), 0);

  // ── 2. Fetch recurring rules, pending transactions, budgets ─────────────────
  const [rulesRes, pendingRes, budgetsCurrentRes, confirmedAdminThisMonthRes] = await Promise.all([
    admin.from("recurring_rules")
      .select("id, kind, amount, frequency, next_run, end_date, to_account_id, account_id, category_id, category:categories(name)")
      .eq("scope", scope)
      .eq("is_active", true),
    // All unconfirmed transactions — concrete future (or overdue) cash movements
    admin.from("transactions")
      .select("account_id, kind, amount, occurred_on, affects_balance, transfer_id, category_id, recurring_rule_id, description")
      .eq("scope", scope)
      .eq("is_confirmed", false),
    admin.from("planned_budgets")
      .select("category_id, expected_amount, category:categories(name)")
      .eq("scope", scope)
      .eq("period_month", monthStart),
    // Confirmed expenses that already debited the balance this month (for budget remainder)
    admin.from("transactions")
      .select("category_id, amount")
      .eq("scope", scope)
      .eq("kind", "expense")
      .eq("is_confirmed", true)
      .eq("affects_balance", true)
      .gte("occurred_on", monthStart)
      .lte("occurred_on", monthEnd),
  ]);

  const allRules = rulesRes.data ?? [];
  const pendingTxs = pendingRes.data ?? [];

  // ── 3. Budgets (with auto-roll fallback) ────────────────────────────────────
  let budgetsRes = budgetsCurrentRes;
  let rolledFromMonth: string | null = null;
  if (!budgetsCurrentRes.data || budgetsCurrentRes.data.length === 0) {
    const { data: priorPeriodRow } = await admin
      .from("planned_budgets")
      .select("period_month")
      .eq("scope", scope)
      .lt("period_month", monthStart)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorPeriodRow?.period_month) {
      const priorMonth = priorPeriodRow.period_month as string;
      const priorRes = await admin
        .from("planned_budgets")
        .select("category_id, expected_amount, category:categories(name)")
        .eq("scope", scope)
        .eq("period_month", priorMonth);
      if (priorRes.data && priorRes.data.length > 0) {
        budgetsRes = priorRes;
        rolledFromMonth = priorMonth;
      }
    }
  }
  const budgets = budgetsRes.data ?? [];
  const budgetedCategoryIds = new Set<string>(budgets.map((b) => b.category_id));

  // Confirmed admin spend per category (already reflected in currentBalance).
  // Used to compute the *remaining* spend the budget will still pull this month.
  const confirmedAdminSpentByCategory: Record<string, number> = {};
  for (const tx of confirmedAdminThisMonthRes.data ?? []) {
    if (tx.category_id) {
      confirmedAdminSpentByCategory[tx.category_id] =
        (confirmedAdminSpentByCategory[tx.category_id] ?? 0) + Number(tx.amount);
    }
  }

  // ── 4. Build day-by-day event map ──────────────────────────────────────────
  const eventDeltas: Map<string, { delta: number; labels: string[] }> = new Map();
  function addEvent(date: string, delta: number, label: string) {
    if (date < tomorrowStr || date > endDateStr) return; // outside window
    if (!eventDeltas.has(date)) eventDeltas.set(date, { delta: 0, labels: [] });
    const e = eventDeltas.get(date)!;
    e.delta += delta;
    e.labels.push(label);
  }

  // 4a. Pending transactions (concrete events already in the system).
  //   - Skip credit-card accounts (no cash impact until card is paid).
  //   - Overdue pendings (occurred_on < tomorrow) are clamped to tomorrow.
  //   - Budgeted-category EXPENSES are skipped here (covered by month-end debit).
  //   - Income is always applied; transfers net to zero across the scope total.
  //   - Track (rule_id|date) to avoid double-counting recurring projection below.
  const pendingRuleDates = new Set<string>();
  for (const tx of pendingTxs) {
    if (!nonCreditIds.has(tx.account_id)) continue;
    const isExpense = tx.kind === "expense";
    const budgetedExpense =
      isExpense && tx.category_id && budgetedCategoryIds.has(tx.category_id);

    if (tx.recurring_rule_id && tx.occurred_on) {
      pendingRuleDates.add(`${tx.recurring_rule_id}|${tx.occurred_on}`);
    }
    if (budgetedExpense) continue; // handled by budget month-end debit

    const date = tx.occurred_on < tomorrowStr ? tomorrowStr : tx.occurred_on;
    const amt = Number(tx.amount);
    const delta = tx.kind === "income" ? amt : -amt;
    const baseName = tx.description
      || (tx.kind === "income" ? "Ingreso pendiente" : "Egreso pendiente");
    const overdue = tx.occurred_on < tomorrowStr ? " (atrasado)" : "";
    const sign = delta > 0 ? "+" : "−";
    addEvent(date, delta, `${baseName}${overdue}: ${sign}$${amt.toFixed(2)}`);
  }

  // 4b. Recurring rules — project future fire dates.
  for (const rule of allRules) {
    if (!rule.next_run) continue;
    if (!nonCreditIds.has(rule.account_id)) continue;          // card activity → no cash impact
    if (rule.to_account_id && rule.kind === "expense") continue; // internal transfer (legs cancel)
    if (rule.category_id && budgetedCategoryIds.has(rule.category_id)) continue; // budget wins

    let current = rule.next_run as string;
    let guard = 0;
    while (current <= endDateStr && guard++ < 500) {
      const withinEndDate = !rule.end_date || current <= rule.end_date;
      const alreadyPending = pendingRuleDates.has(`${rule.id}|${current}`);
      if (withinEndDate && !alreadyPending) {
        const amt = Number(rule.amount);
        const delta = rule.kind === "income" ? amt : -amt;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (rule.category as any)?.name
          ?? (rule.kind === "income" ? "Ingreso recurrente" : "Egreso recurrente");
        const sign = delta > 0 ? "+" : "−";
        addEvent(current, delta, `${name}: ${sign}$${amt.toFixed(2)}`);
      }
      current = advanceDate(current, rule.frequency);
    }
  }

  // 4c. Budgets — debited at the last day of every month within the window.
  //   Current month: only the spend NOT yet reflected in the balance
  //     (expected − confirmed admin spend). This naturally captures both the
  //     remaining budgeted spend AND the eventual employee reimbursements,
  //     since employee expenses never debit the balance.
  //   Future months: full expected amount (budgets repeat monthly).
  let cursorYear = year;
  let cursorMonth = month;
  for (let i = 0; i < 24; i++) {
    const lastDay = lastDayOfMonthStr(cursorYear, cursorMonth);
    if (lastDay > endDateStr) break;
    const isCurrentMonth = cursorYear === year && cursorMonth === month;
    for (const b of budgets) {
      const expected = Number(b.expected_amount);
      const debit = isCurrentMonth
        ? Math.max(0, expected - (confirmedAdminSpentByCategory[b.category_id] ?? 0))
        : expected;
      if (debit <= 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catName = (b.category as any)?.name ?? "Presupuesto";
      addEvent(lastDay, -debit, `${catName} (presupuesto): −$${debit.toFixed(2)}`);
    }
    // advance cursor one month
    cursorMonth++;
    if (cursorMonth > 11) { cursorMonth = 0; cursorYear++; }
  }

  // ── 5. Build the running daily series ───────────────────────────────────────
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const fullSeries: CashFlowPoint[] = [{
    date: todayStr,
    label: "Hoy",
    balance: round2(currentBalance),
    events: [`Saldo actual: $${currentBalance.toFixed(2)}`],
  }];

  let balance = currentBalance;
  let minBalance = round2(currentBalance);
  let minDate: string | null = todayStr; // today participates in the minimum
  let dangerDays = 0;
  const zeroCrossIndices: number[] = [];

  for (let i = 1; i <= days; i++) {
    const dateStr = addDays(todayStr, i);
    const ev = eventDeltas.get(dateStr);
    const prevBalance = balance;
    if (ev) balance += ev.delta;
    balance = round2(balance);

    if (balance < minBalance) {
      minBalance = balance;
      minDate = dateStr;
    }
    if (balance < 0) dangerDays++;
    // Detect sign change for thinning (so the chart shows the crossing)
    if ((prevBalance >= 0 && balance < 0) || (prevBalance < 0 && balance >= 0)) {
      zeroCrossIndices.push(i);
    }

    fullSeries.push({
      date: dateStr,
      label: formatLabel(dateStr),
      balance,
      events: ev?.labels ?? [],
    });
  }

  // ── 6. Thin for chart readability, but always keep meaningful points ────────
  const keepIdx = new Set<number>();
  keepIdx.add(0);                       // today
  keepIdx.add(fullSeries.length - 1);   // last day
  const step = Math.max(1, Math.floor(fullSeries.length / 40));
  for (let i = 0; i < fullSeries.length; i += step) keepIdx.add(i);
  // min point
  const minIdx = fullSeries.findIndex((p) => p.date === minDate);
  if (minIdx >= 0) keepIdx.add(minIdx);
  // zero crossings (and the day before, so the slope reads correctly)
  for (const i of zeroCrossIndices) {
    keepIdx.add(i);
    if (i - 1 >= 0) keepIdx.add(i - 1);
  }
  // any day with events (so the tooltip surfaces what happens)
  for (let i = 0; i < fullSeries.length; i++) {
    if (fullSeries[i].events.length > 0) keepIdx.add(i);
  }

  const thinned = Array.from(keepIdx)
    .sort((a, b) => a - b)
    .map((i) => fullSeries[i]);

  return {
    series: thinned,
    currentBalance: round2(currentBalance),
    minBalance,
    minDate,
    dangerDays,
    budgetsRolledFromMonth: rolledFromMonth,
  };
}
