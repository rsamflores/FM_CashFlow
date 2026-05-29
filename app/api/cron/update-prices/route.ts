import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCurrentPrice } from "@/lib/actions/shopping";
import { insertNotifications } from "@/lib/actions/notifications";

// Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically for cron routes.
// In dev (no secret set), all calls are allowed.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Process `items` with `fn` in sequential batches of `concurrency`.
async function batchRun<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 5,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.allSettled(items.slice(i, i + concurrency).map(fn));
  }
}

type ItemRecord = {
  id: string;
  name: string;
  unit_price: number;
  prev_price: number | null;
  product_url: string;
  list_id: string;
};

type ChangeRecord = {
  id: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  userId: string;
  direction: "up" | "down";
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 1. All active shopping lists ────────────────────────────────────────────
  const { data: lists, error: listsErr } = await admin
    .from("shopping_lists")
    .select("id, user_id")
    .eq("status", "active");

  if (listsErr) {
    console.error("[price-cron] lists:", listsErr.message);
    return NextResponse.json({ error: listsErr.message }, { status: 500 });
  }
  if (!lists || lists.length === 0) {
    return NextResponse.json({ updated: 0, message: "no active lists" });
  }

  // ── 2. Items with a product URL (only trackable items) ──────────────────────
  const listIds = lists.map((l: { id: string }) => l.id);
  const userById = new Map<string, string>(
    lists.map((l: { id: string; user_id: string }) => [l.id, l.user_id]),
  );

  const { data: rawItems, error: itemsErr } = await admin
    .from("shopping_list_items")
    .select("id, name, unit_price, prev_price, product_url, list_id")
    .in("list_id", listIds)
    .not("product_url", "is", null);

  if (itemsErr) {
    console.error("[price-cron] items:", itemsErr.message);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }
  if (!rawItems || rawItems.length === 0) {
    return NextResponse.json({ updated: 0, message: "no trackable items" });
  }

  const items = rawItems as ItemRecord[];
  const changes: ChangeRecord[] = [];
  const checkedAt = new Date().toISOString();

  // ── 3. Fetch current prices in parallel batches ──────────────────────────────
  await batchRun(items, async (item) => {
    try {
      const newPrice = await fetchCurrentPrice(item.product_url);
      if (newPrice === null) return;

      const oldPrice = Number(item.unit_price);
      if (Math.abs(newPrice - oldPrice) < 0.02) return; // ignore rounding noise

      const userId = userById.get(item.list_id);
      if (!userId) return;

      changes.push({
        id: item.id,
        name: item.name,
        oldPrice,
        newPrice,
        userId,
        direction: newPrice > oldPrice ? "up" : "down",
      });
    } catch (e) {
      console.warn(`[price-cron] item ${item.id}:`, e);
    }
  }, 5);

  if (changes.length === 0) {
    console.log("[price-cron] no price changes detected");
    return NextResponse.json({ updated: 0 });
  }

  // ── 4. Persist price changes ─────────────────────────────────────────────────
  await Promise.allSettled(
    changes.map((c) =>
      admin
        .from("shopping_list_items")
        .update({ prev_price: c.oldPrice, unit_price: c.newPrice, price_checked_at: checkedAt })
        .eq("id", c.id),
    ),
  );

  // ── 5. One notification per user summarising all changes ────────────────────
  const byUser = new Map<string, ChangeRecord[]>();
  for (const c of changes) {
    const arr = byUser.get(c.userId) ?? [];
    arr.push(c);
    byUser.set(c.userId, arr);
  }

  for (const [userId, list] of byUser) {
    const ups   = list.filter((c) => c.direction === "up");
    const downs = list.filter((c) => c.direction === "down");
    const type  = ups.length > 0 && downs.length > 0
      ? "price_change"
      : ups.length > 0 ? "price_up" : "price_down";

    const top3 = list.slice(0, 3).map((c) => {
      const arrow = c.direction === "up" ? "↑" : "↓";
      return `${arrow} ${c.name}: $${c.oldPrice.toFixed(2)} → $${c.newPrice.toFixed(2)}`;
    });
    const extra = list.length > 3 ? ` · +${list.length - 3} más` : "";

    await insertNotifications([userId], {
      scope: "personal",
      type,
      title: `${list.length} precio${list.length !== 1 ? "s" : ""} actualizado${list.length !== 1 ? "s" : ""} en tu lista`,
      body: top3.join(" · ") + extra,
      link: "/personal/mercado",
    });
  }

  console.log(`[price-cron] updated=${changes.length} users=${byUser.size}`);
  return NextResponse.json({ updated: changes.length, users: byUser.size });
}
