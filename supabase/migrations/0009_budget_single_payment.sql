ALTER TABLE planned_budgets
  ADD COLUMN IF NOT EXISTS is_single_payment boolean NOT NULL DEFAULT false;
