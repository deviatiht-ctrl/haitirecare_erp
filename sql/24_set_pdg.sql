-- 24_set_pdg.sql
-- Mete haitirecarepdg@gmail.com kòm PDG HAITI REH-CARE.
--
-- ANVAN: kreye kont lan nan Supabase Dashboard
--   Authentication → Users → Add user → haitirecarepdg@gmail.com
--
-- Apre sa kouri fichye sa a nan SQL Editor. Li idempotent —
-- ou ka kouri l plizyè fwa san pwoblèm.

DO $$
DECLARE
  v_uid uuid;
  v_eid uuid;
BEGIN
  -- Jwenn antrepriz la
  SELECT id INTO v_eid FROM erp_enterprise_registrations
   WHERE lower(company_email) = 'haitirecarepdg@gmail.com'
   LIMIT 1;

  -- Debloke antrepriz la nèt
  UPDATE erp_enterprise_registrations
     SET features_unlocked = '{"all": true}', statut = 'active'
   WHERE id = v_eid;
  UPDATE erp_settings SET features_enabled = '{"all": true}'
   WHERE enterprise_id = v_eid OR enterprise_id IS NULL;

  -- Jwenn kont auth la
  SELECT id INTO v_uid FROM auth.users
   WHERE lower(email) = 'haitirecarepdg@gmail.com';

  IF v_uid IS NULL THEN
    RAISE NOTICE 'Kont auth haitirecarepdg@gmail.com pa egziste — kreye l nan Authentication → Users epi re-kouri fichye sa a.';
    RETURN;
  END IF;

  -- Mete l PDG nan erp_users
  INSERT INTO erp_users (id, email, first_name, last_name, role, is_active)
  VALUES (v_uid, 'haitirecarepdg@gmail.com', 'Direction', 'HAITI REH-CARE', 'pdg', true)
  ON CONFLICT (id) DO UPDATE SET role = 'pdg', is_active = true;

  -- Lye l ak antrepriz la
  IF v_eid IS NOT NULL THEN
    UPDATE erp_user_enterprises SET is_primary = false WHERE user_id = v_uid;
    INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
    VALUES (v_uid, v_eid, 'pdg', true)
    ON CONFLICT (user_id, enterprise_id) DO UPDATE
      SET is_primary = true, role_in_enterprise = 'pdg';
  END IF;

  -- Fichye employe a
  INSERT INTO erp_employes (id, date_embauche, type_contrat)
  VALUES (v_uid, CURRENT_DATE, 'CDI')
  ON CONFLICT (id) DO NOTHING;

  -- Retire nenpòt modil ki te dezaktive manyèlman
  DELETE FROM erp_user_modules WHERE user_id = v_uid AND is_enabled = false;

  RAISE NOTICE 'haitirecarepdg@gmail.com se PDG kounye a.';
END $$;
