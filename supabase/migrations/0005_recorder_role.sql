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

-- 3. Allow recorder to INSERT transactions (existing editor policy stays for editor/owner)
CREATE POLICY "Transactions: recorders insert" ON transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id     = auth.uid()
        AND m.scope       = transactions.scope
        AND m.role        = 'recorder'
        AND m.accepted_at IS NOT NULL
    )
  );

-- 4. Memberships policy: owners can manage recorder role same as others
-- (already covered by existing "Memberships: owners can manage scope" policy)
