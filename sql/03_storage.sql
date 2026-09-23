-- Storage Buckets and Policies
-- Run this after: 02_rls.sql

INSERT INTO storage.buckets (id, name, public) VALUES
  ('erp-produits', 'erp-produits', true),
  ('erp-recus', 'erp-recus', false),
  ('erp-documents', 'erp-documents', false),
  ('erp-avatars', 'erp-avatars', true),
  ('erp-settings', 'erp-settings', true);

CREATE POLICY "erp_produits_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'erp-produits');
CREATE POLICY "erp_produits_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'erp-produits' AND
    erp_has_role(ARRAY['pdg','responsable_stock']));

CREATE POLICY "erp_recus_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'erp-recus' AND auth.uid() IS NOT NULL);
CREATE POLICY "erp_recus_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'erp-recus' AND
    erp_has_role(ARRAY['pdg','comptable']));

CREATE POLICY "erp_docs_manage" ON storage.objects
  FOR ALL USING (bucket_id = 'erp-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "erp_avatars_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'erp-avatars');
CREATE POLICY "erp_avatars_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'erp-avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "erp_settings_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'erp-settings');
CREATE POLICY "erp_settings_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'erp-settings' AND erp_is_pdg());
