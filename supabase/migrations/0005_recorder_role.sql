-- Add recorder role: can only INSERT transactions in both scopes, read-only everything else

-- 1. Extend the role enum
ALTER TYPE role_t ADD VALUE IF NOT EXISTS 'recorder';

-- 2. Update has_role to include recorder at viewer level (can read accounts, categories, etc.)
CREATE OR REPLACE FUNCTION has_role(s scope_t, min_role role_t)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id  = auth.uid()
      AND scope    = s
      AND accepted_at IS NOT NULL
      AND CASE min_role
            WHEN 'viewer'   THEN role IN ('viewer', 'editor', 'owner', 'recorder')
            WHEN 'editor'   THEN role IN ('editor', 'owner')
            WHEN 'owner'    THEN role =  'owner'
          END
  );
$$;

-- 3. SECURITY DEFINER function avoids infinite recursion when memberships has RLS
CREATE OR REPLACE FUNCTION is_recorder(s scope_t)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
      AND scope   = s
      AND role    = 'recorder'
  );
$$;

-- 4. Allow recorder to INSERT transactions using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Transactions: recorders insert" ON transactions;
CREATE POLICY "Transactions: recorders insert" ON transactions
  FOR INSERT WITH CHECK (
    is_recorder(transactions.scope::scope_t)
  );

-- 4. Memberships policy: owners can manage recorder role same as others
-- (already covered by existing "Memberships: owners can manage scope" policy)
