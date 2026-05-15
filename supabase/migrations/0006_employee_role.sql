-- Add employee role
ALTER TYPE role_t ADD VALUE IF NOT EXISTS 'employee';

-- Update has_role to include employee at viewer level
CREATE OR REPLACE FUNCTION has_role(s scope_t, min_role role_t)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id  = auth.uid()
      AND scope    = s
      AND accepted_at IS NOT NULL
      AND CASE min_role
            WHEN 'viewer'   THEN role IN ('viewer', 'editor', 'owner', 'recorder', 'employee')
            WHEN 'editor'   THEN role IN ('editor', 'owner')
            WHEN 'owner'    THEN role =  'owner'
          END
  );
$$;

-- SECURITY DEFINER to avoid RLS recursion
CREATE OR REPLACE FUNCTION is_employee(s scope_t)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid() AND scope = s AND role = 'employee'
  );
$$;

-- Employee category assignments (owner assigns specific categories to employees)
CREATE TABLE IF NOT EXISTS employee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scope scope_t NOT NULL DEFAULT 'business',
  category_id uuid NOT NULL REFERENCES categories ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id)
);
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "EmployeeAssignments: owners manage" ON employee_assignments
  USING (has_role(scope, 'owner')) WITH CHECK (has_role(scope, 'owner'));
CREATE POLICY "EmployeeAssignments: employee read own" ON employee_assignments
  FOR SELECT USING (user_id = auth.uid());

-- Reimbursement requests
CREATE TABLE IF NOT EXISTS reimbursement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope scope_t NOT NULL DEFAULT 'business',
  employee_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  total_amount numeric(12,2) NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('checking','savings')),
  account_holder text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users,
  reject_reason text,
  transaction_id uuid REFERENCES transactions
);
ALTER TABLE reimbursement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reimbursements: employee read own" ON reimbursement_requests
  FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY "Reimbursements: employee insert" ON reimbursement_requests
  FOR INSERT WITH CHECK (employee_id = auth.uid());
CREATE POLICY "Reimbursements: editors read scope" ON reimbursement_requests
  FOR SELECT USING (has_role(scope, 'editor'));
CREATE POLICY "Reimbursements: editors update" ON reimbursement_requests
  FOR UPDATE USING (has_role(scope, 'editor'));

-- Items linking expenses to a reimbursement request
CREATE TABLE IF NOT EXISTS reimbursement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_id uuid NOT NULL REFERENCES reimbursement_requests ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions ON DELETE CASCADE,
  UNIQUE(transaction_id)
);
ALTER TABLE reimbursement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ReimbursementItems: employee read own" ON reimbursement_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM reimbursement_requests r WHERE r.id = reimbursement_items.reimbursement_id AND r.employee_id = auth.uid()));
CREATE POLICY "ReimbursementItems: employee insert" ON reimbursement_items
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM reimbursement_requests r WHERE r.id = reimbursement_items.reimbursement_id AND r.employee_id = auth.uid()));
CREATE POLICY "ReimbursementItems: editors read" ON reimbursement_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM reimbursement_requests r WHERE r.id = reimbursement_items.reimbursement_id AND has_role(r.scope, 'editor')));

-- Allow employee to INSERT transactions (SECURITY DEFINER avoids RLS recursion)
DROP POLICY IF EXISTS "Transactions: employees insert" ON transactions;
CREATE POLICY "Transactions: employees insert" ON transactions
  FOR INSERT WITH CHECK (is_employee(transactions.scope::scope_t));
