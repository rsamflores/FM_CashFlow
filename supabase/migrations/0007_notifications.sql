-- Notifications table: one row per user per event
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope       text,                   -- null = global/cross-scope
  type        text NOT NULL,          -- reimbursement_submitted | reimbursement_paid | reimbursement_rejected | transaction_confirmed
  title       text NOT NULL,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read and update their own notifications
CREATE POLICY "notifications: select own" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications: update own" ON notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Service role (admin client) inserts notifications on behalf of the system
CREATE POLICY "notifications: service insert" ON notifications
  FOR INSERT TO service_role WITH CHECK (true);
