-- Employee saved bank accounts for reimbursement requests
CREATE TABLE employee_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('checking', 'savings')),
  account_holder text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own bank accounts
CREATE POLICY "employee_bank_accounts_own"
  ON employee_bank_accounts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
