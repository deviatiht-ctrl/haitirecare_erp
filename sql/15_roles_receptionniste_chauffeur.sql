-- ============================================================
-- NOUVO WÒL — 'receptionniste' ak 'chauffeur'
-- ============================================================
-- Run AFTER: 14_annexes_patients.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
--
-- 1. CHECK constraint sou erp_users.role
-- 2. Validasyon wòl nan erp_register_staff (+ p_annexe_id kenbe)
--    ak erp_assign_role_to_user
-- 3. RLS: resepsyonis a gen aksè klinik nivo sekretè
--    (pasyan, randevou, seyans) — chofè a rete senp
--    (tach, prezans, mesaj — pa gen aksè dosye klinik)
-- ============================================================

-- ------------------------------------------------------------
-- 1. CHECK erp_users.role — ajoute 2 wòl yo
-- ------------------------------------------------------------
ALTER TABLE erp_users
  DROP CONSTRAINT IF EXISTS erp_users_role_check;
ALTER TABLE erp_users
  ADD CONSTRAINT erp_users_role_check
  CHECK (role IN ('pdg','directrice','directeur','manager',
                  'secretaire','comptable','responsable_stock',
                  'commercial','rh','employe',
                  'receptionniste','chauffeur'));

-- ------------------------------------------------------------
-- 2. erp_register_staff — menm siyati ak vèsyon 14 (p_annexe_id)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_register_staff(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text DEFAULT 'employe',
  p_poste_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_annexe_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_eid uuid;
BEGIN
  IF NOT COALESCE(erp_can_manage_users(), false) THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can create staff';
  END IF;

  IF p_role NOT IN ('pdg','directrice','directeur','manager','secretaire',
                    'comptable','responsable_stock','commercial','rh','employe',
                    'receptionniste','chauffeur') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  INSERT INTO erp_users (id, email, first_name, last_name, role, poste_id,
                         phone, annexe_id, is_active)
  VALUES (p_user_id, p_email, p_first_name, p_last_name, p_role, p_poste_id,
          p_phone, p_annexe_id, true)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    poste_id = EXCLUDED.poste_id,
    phone = EXCLUDED.phone,
    annexe_id = EXCLUDED.annexe_id,
    is_active = true,
    updated_at = now();

  v_eid := erp_get_user_enterprise();
  IF v_eid IS NOT NULL THEN
    INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
    VALUES (p_user_id, v_eid, 'employe', true)
    ON CONFLICT (user_id, enterprise_id)
    DO UPDATE SET is_primary = true;
  END IF;

  INSERT INTO erp_employes (id, date_embauche, type_contrat)
  VALUES (p_user_id, CURRENT_DATE, 'CDI')
  ON CONFLICT (id) DO NOTHING;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION erp_register_staff(uuid, text, text, text, text, uuid, text, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3. erp_assign_role_to_user — menm validasyon
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_assign_role_to_user(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_poste_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  auth_user_id uuid;
  existing_profile_id uuid;
BEGIN
  IF NOT erp_can_manage_users() THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can assign roles';
  END IF;

  IF p_role NOT IN ('pdg','directrice','directeur','manager','secretaire',
                    'comptable','responsable_stock','commercial','rh','employe',
                    'receptionniste','chauffeur') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT id INTO auth_user_id FROM auth.users WHERE email = p_email;

  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'User % does not exist in auth.users', p_email;
  END IF;

  SELECT id INTO existing_profile_id FROM erp_users WHERE id = auth_user_id;

  IF existing_profile_id IS NOT NULL THEN
    UPDATE erp_users SET
      first_name = p_first_name,
      last_name = p_last_name,
      role = p_role,
      poste_id = p_poste_id,
      is_active = true,
      updated_at = now()
    WHERE id = auth_user_id;
  ELSE
    INSERT INTO erp_users (id, email, first_name, last_name, role, poste_id, is_active)
    VALUES (auth_user_id, p_email, p_first_name, p_last_name, p_role, p_poste_id, true);
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. RLS — 'receptionniste' = aksè klinik nivo 'secretaire'
--    (anrejistre pasyan, korekte fòm, jere randevou, wè seyans)
--    'chauffeur' pa gen aksè done klinik — li pa nan okenn lis.
-- ------------------------------------------------------------

-- Patients
DROP POLICY IF EXISTS "patients_select" ON erp_patients;
CREATE POLICY "patients_select" ON erp_patients FOR SELECT USING (
  praticien_id = auth.uid() OR created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste','employe','comptable','rh'])
);
DROP POLICY IF EXISTS "patients_insert" ON erp_patients;
CREATE POLICY "patients_insert" ON erp_patients FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste','employe'])
);
DROP POLICY IF EXISTS "patients_update" ON erp_patients;
CREATE POLICY "patients_update" ON erp_patients FOR UPDATE USING (
  praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste'])
);

-- Randevou
DROP POLICY IF EXISTS "rdv_staff" ON erp_rdv;
CREATE POLICY "rdv_staff" ON erp_rdv FOR SELECT USING (
  praticien_id = auth.uid() OR created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste','employe','comptable'])
);
DROP POLICY IF EXISTS "rdv_staff_update" ON erp_rdv;
CREATE POLICY "rdv_staff_update" ON erp_rdv FOR UPDATE USING (
  praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste'])
);

-- Seyans
DROP POLICY IF EXISTS "seances_select" ON erp_seances;
CREATE POLICY "seances_select" ON erp_seances FOR SELECT USING (
  praticien_id = auth.uid() OR created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste','employe'])
);
DROP POLICY IF EXISTS "seances_insert" ON erp_seances;
CREATE POLICY "seances_insert" ON erp_seances FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste','employe'])
);
DROP POLICY IF EXISTS "seances_update" ON erp_seances;
CREATE POLICY "seances_update" ON erp_seances FOR UPDATE USING (
  praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste'])
);

-- Reevalidasyon pasyan (li sèlman — direksyon + sekretè modifye)
DROP POLICY IF EXISTS "reeval_select" ON erp_patient_reevaluations;
CREATE POLICY "reeval_select" ON erp_patient_reevaluations FOR SELECT USING (
  created_by = auth.uid() OR praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','receptionniste','employe','comptable','rh'])
);

-- Kliyan (tab jeneral — itil nan antrepriz ki pa klinik)
DROP POLICY IF EXISTS "erp_clients_manage" ON erp_clients;
CREATE POLICY "erp_clients_manage" ON erp_clients FOR ALL
  USING (erp_has_role(ARRAY['pdg','secretaire','receptionniste','commercial']));
DROP POLICY IF EXISTS "erp_suivi_manage" ON erp_client_suivi;
CREATE POLICY "erp_suivi_manage" ON erp_client_suivi FOR ALL
  USING (erp_has_role(ARRAY['pdg','secretaire','receptionniste','commercial']));

-- ------------------------------------------------------------
-- 5. POSTE — Réceptionniste + Chauffeur (si yo pa egziste)
-- ------------------------------------------------------------
INSERT INTO erp_postes (name, department, description, permissions)
SELECT v.name, v.department, v.description, v.permissions::jsonb
FROM (VALUES
  ('Réceptionniste', 'Administration',
   'Accueil des patients, enregistrement et rendez-vous',
   '{"patients":true,"rdv":true,"seances":true,"clients":true,"agenda":true,"taches":true,"messages":true}'),
  ('Chauffeur', 'Logistique',
   'Transport des patients et livraisons du centre',
   '{"taches_own":true,"presences_own":true,"messages":true}')
) AS v(name, department, description, permissions)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_postes p WHERE p.name = v.name
);
