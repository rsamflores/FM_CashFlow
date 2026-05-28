-- 0015_stores_agromercado_dollarcity.sql
-- Agrega 'agromercado' y 'dollarcity' como valores válidos de store.

-- shopping_list_items.store
ALTER TABLE shopping_list_items
  DROP CONSTRAINT IF EXISTS shopping_list_items_store_check;

ALTER TABLE shopping_list_items
  ADD CONSTRAINT shopping_list_items_store_check
  CHECK (store IN ('walmart','pricesmart','manual','agromercado','dollarcity'));

-- shopping_list_transactions.store
ALTER TABLE shopping_list_transactions
  DROP CONSTRAINT IF EXISTS shopping_list_transactions_store_check;

ALTER TABLE shopping_list_transactions
  ADD CONSTRAINT shopping_list_transactions_store_check
  CHECK (store IN ('walmart','pricesmart','agromercado','dollarcity'));
