-- Add 'shopper' role: restricted to shopping list only, no financial data access
ALTER TYPE role_t ADD VALUE IF NOT EXISTS 'shopper';

-- Helper function (mirrors is_employee pattern)
CREATE OR REPLACE FUNCTION is_shopper(s scope_t)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id     = auth.uid()
      AND scope       = s
      AND role        = 'shopper'
      AND accepted_at IS NOT NULL
  );
$$;

-- shopping_lists: shopper can SELECT (to find the active list)
-- and INSERT (needed by ensureActiveList if somehow no active list exists)
CREATE POLICY "lists_select_shopper" ON shopping_lists
  FOR SELECT USING (is_shopper(scope::scope_t));

CREATE POLICY "lists_insert_shopper" ON shopping_lists
  FOR INSERT WITH CHECK (is_shopper(scope::scope_t));

-- shopping_list_items: shopper can do full CRUD (add, edit, check off, remove items)
CREATE POLICY "list_items_select_shopper" ON shopping_list_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND is_shopper(l.scope::scope_t)
  ));

CREATE POLICY "list_items_insert_shopper" ON shopping_list_items
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND is_shopper(l.scope::scope_t)
  ));

CREATE POLICY "list_items_update_shopper" ON shopping_list_items
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND is_shopper(l.scope::scope_t)
  ));

CREATE POLICY "list_items_delete_shopper" ON shopping_list_items
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists l WHERE l.id = list_id AND is_shopper(l.scope::scope_t)
  ));
