-- 0014_shopping_lists_shared.sql
-- Cambia el acceso a las listas de mercado de per-user a per-scope,
-- igual que el resto de las tablas (accounts, transactions, etc.).
-- Así todos los usuarios del scope personal ven y editan la misma lista.

-- ── 1. Limpiar listas activas duplicadas (conservar la más reciente por scope) ─
-- Si hay varias listas activas en el mismo scope, archivar todas salvo la más nueva.
UPDATE shopping_lists
SET status = 'archived'
WHERE status = 'active'
  AND id NOT IN (
    SELECT DISTINCT ON (scope) id
    FROM shopping_lists
    WHERE status = 'active'
    ORDER BY scope, created_at DESC
  );

-- ── 2. Reemplazar el índice único per-user por uno per-scope ──────────────────
DROP INDEX IF EXISTS shopping_lists_one_active_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_one_active_per_scope
  ON shopping_lists(scope) WHERE status = 'active';

-- ── 3. Nuevas políticas RLS — shopping_lists ──────────────────────────────────
DROP POLICY IF EXISTS "own_lists" ON shopping_lists;

CREATE POLICY "lists_select" ON shopping_lists
  FOR SELECT USING (has_role(scope::scope_t, 'viewer'));

CREATE POLICY "lists_insert" ON shopping_lists
  FOR INSERT WITH CHECK (has_role(scope::scope_t, 'editor'));

CREATE POLICY "lists_update" ON shopping_lists
  FOR UPDATE USING (has_role(scope::scope_t, 'editor'));

CREATE POLICY "lists_delete" ON shopping_lists
  FOR DELETE USING (has_role(scope::scope_t, 'owner'));

-- ── 4. Nuevas políticas RLS — shopping_list_items ────────────────────────────
DROP POLICY IF EXISTS "own_list_items" ON shopping_list_items;

CREATE POLICY "list_items_select" ON shopping_list_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'viewer')
  ));

CREATE POLICY "list_items_insert" ON shopping_list_items
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'editor')
  ));

CREATE POLICY "list_items_update" ON shopping_list_items
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'editor')
  ));

CREATE POLICY "list_items_delete" ON shopping_list_items
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'editor')
  ));

-- ── 5. Nuevas políticas RLS — shopping_list_transactions ─────────────────────
DROP POLICY IF EXISTS "own_list_txs" ON shopping_list_transactions;

CREATE POLICY "list_txs_select" ON shopping_list_transactions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'viewer')
  ));

CREATE POLICY "list_txs_insert" ON shopping_list_transactions
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'editor')
  ));

CREATE POLICY "list_txs_delete" ON shopping_list_transactions
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l
    WHERE l.id = list_id AND has_role(l.scope::scope_t, 'owner')
  ));
