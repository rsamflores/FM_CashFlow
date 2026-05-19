-- Track which budget alert thresholds (80%, 100%) have already been sent
-- so we don't spam notifications on every transaction.
CREATE TABLE IF NOT EXISTS budget_alerts_sent (
  budget_id  uuid NOT NULL REFERENCES planned_budgets(id) ON DELETE CASCADE,
  threshold  int  NOT NULL CHECK (threshold IN (80, 100)),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, threshold)
);
