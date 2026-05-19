-- Add receipt_url to transactions for expense voucher images
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url text;

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload receipts
CREATE POLICY "receipts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

-- Allow anyone to read receipts (public bucket)
CREATE POLICY "receipts_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts');

-- Allow authenticated users to delete their own receipts
CREATE POLICY "receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts');
