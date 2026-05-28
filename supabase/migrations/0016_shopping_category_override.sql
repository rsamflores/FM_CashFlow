-- Allow users to manually override the auto-detected grocery category for a shopping list item
ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS category_override text;
