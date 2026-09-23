-- Row Level Security Policies
-- Run this after: 01_schema.sql

-- Enable RLS on all tables
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'erp_settings','erp_postes','erp_users','erp_produits',
    'erp_stock_movements','erp_clients','erp_client_suivi',
    'erp_revenus','erp_depenses','erp_caisse','erp_caisse_operations',
    'erp_employes','erp_presences','erp_conges','erp_performances',
    'erp_taches','erp_notifications','erp_activites','erp_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Helper functions
CREATE OR REPLACE FUNCTION erp_get_role()
RETURNS text AS $$
BEGIN
  RETURN (SELECT role FROM erp_users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION erp_is_pdg()
RETURNS boolean AS $$
BEGIN
  RETURN erp_get_role() = 'pdg';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION erp_has_role(roles text[])
RETURNS boolean AS $$
BEGIN
  RETURN erp_get_role() = ANY(roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settings: everyone reads, only PDG writes
CREATE POLICY "erp_settings_read" ON erp_settings FOR SELECT USING (true);
CREATE POLICY "erp_settings_pdg" ON erp_settings FOR ALL USING (erp_is_pdg());

-- Users: PDG sees all, others see own + active colleagues (for task assignment)
CREATE POLICY "erp_users_pdg" ON erp_users FOR ALL USING (erp_is_pdg());
CREATE POLICY "erp_users_own" ON erp_users FOR SELECT
  USING (id = auth.uid() OR is_active = true);
CREATE POLICY "erp_users_self_update" ON erp_users FOR UPDATE
  USING (id = auth.uid());

-- Stock: stock manager + PDG + commercial (read)
CREATE POLICY "erp_produits_manage" ON erp_produits FOR ALL
  USING (erp_has_role(ARRAY['pdg','responsable_stock']));
CREATE POLICY "erp_produits_read" ON erp_produits FOR SELECT
  USING (erp_has_role(ARRAY['pdg','responsable_stock','commercial','secretaire']));

CREATE POLICY "erp_movements_manage" ON erp_stock_movements FOR ALL
  USING (erp_has_role(ARRAY['pdg','responsable_stock']));
CREATE POLICY "erp_movements_read" ON erp_stock_movements FOR SELECT
  USING (erp_has_role(ARRAY['pdg','responsable_stock','commercial']));

-- Clients: secretaire + commercial + PDG
CREATE POLICY "erp_clients_manage" ON erp_clients FOR ALL
  USING (erp_has_role(ARRAY['pdg','secretaire','commercial']));
CREATE POLICY "erp_suivi_manage" ON erp_client_suivi FOR ALL
  USING (erp_has_role(ARRAY['pdg','secretaire','commercial']));

-- Finances: comptable + PDG
CREATE POLICY "erp_revenus_manage" ON erp_revenus FOR ALL
  USING (erp_has_role(ARRAY['pdg','comptable']));
CREATE POLICY "erp_depenses_manage" ON erp_depenses FOR ALL
  USING (erp_has_role(ARRAY['pdg','comptable']));
CREATE POLICY "erp_caisse_manage" ON erp_caisse FOR ALL
  USING (erp_has_role(ARRAY['pdg','comptable']));
CREATE POLICY "erp_caisse_ops_manage" ON erp_caisse_operations FOR ALL
  USING (erp_has_role(ARRAY['pdg','comptable']));

-- HR: rh + pdg for all, employees see own
CREATE POLICY "erp_employes_manage" ON erp_employes FOR ALL
  USING (erp_has_role(ARRAY['pdg','rh']));
CREATE POLICY "erp_employes_own" ON erp_employes FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "erp_presences_manage" ON erp_presences FOR ALL
  USING (erp_has_role(ARRAY['pdg','rh']));
CREATE POLICY "erp_presences_own" ON erp_presences FOR SELECT
  USING (employe_id = auth.uid());

CREATE POLICY "erp_conges_manage" ON erp_conges FOR ALL
  USING (erp_has_role(ARRAY['pdg','rh']));
CREATE POLICY "erp_conges_own" ON erp_conges FOR SELECT
  USING (employe_id = auth.uid());
CREATE POLICY "erp_conges_own_insert" ON erp_conges FOR INSERT
  WITH CHECK (employe_id = auth.uid());

CREATE POLICY "erp_perf_manage" ON erp_performances FOR ALL
  USING (erp_has_role(ARRAY['pdg','rh']));
CREATE POLICY "erp_perf_own" ON erp_performances FOR SELECT
  USING (employe_id = auth.uid());

-- Tasks: assignee sees own, assigner sees theirs, PDG sees all
CREATE POLICY "erp_taches_pdg" ON erp_taches FOR ALL USING (erp_is_pdg());
CREATE POLICY "erp_taches_own" ON erp_taches FOR SELECT
  USING (assigne_a = auth.uid() OR assigne_par = auth.uid());
CREATE POLICY "erp_taches_create" ON erp_taches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "erp_taches_update_own" ON erp_taches FOR UPDATE
  USING (assigne_a = auth.uid() OR assigne_par = auth.uid() OR erp_is_pdg());

-- Notifications: own only
CREATE POLICY "erp_notif_own" ON erp_notifications FOR ALL
  USING (user_id = auth.uid());

-- Activities: PDG sees all, others see own
CREATE POLICY "erp_activites_pdg" ON erp_activites FOR SELECT USING (erp_is_pdg());
CREATE POLICY "erp_activites_own" ON erp_activites FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "erp_activites_insert" ON erp_activites FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Postes: PDG manages, all read
CREATE POLICY "erp_postes_read" ON erp_postes FOR SELECT USING (true);
CREATE POLICY "erp_postes_pdg" ON erp_postes FOR ALL USING (erp_is_pdg());

-- Messages: users can see messages they sent or received
CREATE POLICY "erp_messages_own" ON erp_messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());
CREATE POLICY "erp_messages_insert" ON erp_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY "erp_messages_update_read" ON erp_messages FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
