-- Add sequential code column to reimbursement_requests
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS code text;

-- Sequence for generating RE0001, RE0002, ...
CREATE SEQUENCE IF NOT EXISTS reimbursement_code_seq START 1;

-- Function called before INSERT to assign the code
CREATE OR REPLACE FUNCTION generate_reimbursement_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'RE' || LPAD(nextval('reimbursement_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS set_reimbursement_code ON reimbursement_requests;
CREATE TRIGGER set_reimbursement_code
  BEFORE INSERT ON reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION generate_reimbursement_code();

-- Backfill existing rows in insertion order
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM reimbursement_requests WHERE code IS NULL ORDER BY created_at ASC LOOP
    UPDATE reimbursement_requests
      SET code = 'RE' || LPAD(nextval('reimbursement_code_seq')::text, 4, '0')
    WHERE id = r.id;
  END LOOP;
END $$;
