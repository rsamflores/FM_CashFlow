-- 0013_shopping_lists.sql
-- Listas de mercado (Walmart SV + PriceSmart + manual)

CREATE TABLE IF NOT EXISTS shopping_lists (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope             text NOT NULL DEFAULT 'personal',
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  status            text NOT NULL CHECK (status IN ('active','purchased','archived')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  purchased_at      timestamptz,
  total_at_purchase numeric(12,2)
);

-- Solo UNA lista activa por usuario
CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_one_active_per_user
  ON shopping_lists(user_id) WHERE status = 'active';

-- Vínculo lista ↔ egresos generados (1 lista puede generar 1 o 2 egresos)
CREATE TABLE IF NOT EXISTS shopping_list_transactions (
  list_id        uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  store          text NOT NULL CHECK (store IN ('walmart','pricesmart')),
  PRIMARY KEY (list_id, store)
);

-- Ítems de la lista
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id      uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name         text NOT NULL,
  store        text NOT NULL CHECK (store IN ('walmart','pricesmart','manual')),
  quantity     numeric(6,2) NOT NULL DEFAULT 1,
  unit_price   numeric(12,2) NOT NULL DEFAULT 0,
  image_url    text,
  product_url  text,
  external_id  text,
  is_checked   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_list_items_list ON shopping_list_items(list_id);

-- Caché de búsquedas (TTL ~24h aplicado en server action)
CREATE TABLE IF NOT EXISTS product_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store        text NOT NULL CHECK (store IN ('walmart','pricesmart')),
  search_query text NOT NULL,
  results_json jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_cache_store_query
  ON product_cache(store, lower(search_query));

-- RLS
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_lists" ON shopping_lists;
CREATE POLICY "own_lists" ON shopping_lists FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_list_items" ON shopping_list_items;
CREATE POLICY "own_list_items" ON shopping_list_items FOR ALL
  USING (EXISTS (SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS "own_list_txs" ON shopping_list_transactions;
CREATE POLICY "own_list_txs" ON shopping_list_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS "read_cache" ON product_cache;
CREATE POLICY "read_cache" ON product_cache FOR SELECT USING (true);
DROP POLICY IF EXISTS "write_cache" ON product_cache;
CREATE POLICY "write_cache" ON product_cache FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update_cache" ON product_cache;
CREATE POLICY "update_cache" ON product_cache FOR UPDATE USING (true) WITH CHECK (true);
