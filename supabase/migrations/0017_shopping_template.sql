-- Add 'template' as a valid shopping list status and enforce one template per user
ALTER TABLE shopping_lists DROP CONSTRAINT IF EXISTS shopping_lists_status_check;
ALTER TABLE shopping_lists ADD CONSTRAINT shopping_lists_status_check
  CHECK (status IN ('active', 'purchased', 'archived', 'template'));

CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_one_template_per_user
  ON shopping_lists(user_id) WHERE status = 'template';
