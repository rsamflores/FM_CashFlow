-- Track price changes on shopping list items
-- prev_price: the price before the last automatic update (null = never updated)
-- price_checked_at: timestamp of last successful price fetch

ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS prev_price       numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_checked_at timestamptz;
