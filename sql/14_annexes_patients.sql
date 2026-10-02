-- ============================================================
-- ANNEXES + DOSYE PASYAN KONPLÈ — HAITI REH-CARE
-- Run this AFTER: 13_modules_complets.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
--
-- Sa fichye sa a fè:
--   1. Tab "erp_annexes" — sikisal/brans sant la (Siège, Delmas, ...)
--   2. Kolòn "annexe_id" sou erp_users — PDG asiye chak anplwaye
--      nan yon annexe.
--   3. Kolòn "annexe_id" + "code" sou erp_patients — kòd pasyan an
--      gen prefiks annex la (ex: PAP-0001, DEL-0001).
--   4. Tout chan fòm papye a (Fèy 1-9) sou erp_patients.
--   5. Tab "erp_patient_reevaluations" (Fèy 10).
--   6. RPC: erp_next_patient_code, erp_register_patient,
--      erp_register_staff (+annexe).
--   7. Modil "annexes" nan ERP la (jestion = direksyon).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TAB ANNEXES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_annexes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  code text NOT NULL,                  -- prefiks kòd pasyan (ex: "PAP")
  nom text NOT NULL,
  ville text,
  adresse text,
  phone text,
  email text,
  responsable_id uuid REFERENCES erp_users(id),
  patient_seq int DEFAULT 0,           -- kontè pwochen nimewo pasyan
  is_principale boolean DEFAULT false, -- annex prensipal/syèj la
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(enterprise_id, code)
);

DROP TRIGGER IF EXISTS trg_annexes_ts ON erp_annexes;
CREATE TRIGGER trg_annexes_ts BEFORE UPDATE ON erp_annexes
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();

ALTER TABLE erp_annexes ENABLE ROW LEVEL SECURITY;

-- Tout staff la li annex yo (bezwen prefiks la pou kòd pasyan)
DROP POLICY IF EXISTS "annexes_select" ON erp_annexes;
CREATE POLICY "annexes_select" ON erp_annexes FOR SELECT
  USING (erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                            'secretaire','comptable','responsable_stock',
                            'commercial','rh','employe']));

-- Sèlman direksyon an (PDG / directrice / directeur) jere annex yo
DROP POLICY IF EXISTS "annexes_manage" ON erp_annexes;
CREATE POLICY "annexes_manage" ON erp_annexes FOR ALL
  USING (erp_can_manage_users())
  WITH CHECK (erp_can_manage_users());

-- ------------------------------------------------------------
-- 2. ANNEXE SOU ANPLWAYE YO
-- ------------------------------------------------------------
ALTER TABLE erp_users
  ADD COLUMN IF NOT EXISTS annexe_id uuid REFERENCES erp_annexes(id);
CREATE INDEX IF NOT EXISTS idx_users_annexe ON erp_users(annexe_id);

-- Pwoteksyon: yon anplwaye pa ka chanje pwòp annex li
-- (policy "erp_users_self_update" pèmèt self-update; sèlman
-- direksyon an ka modifye annexe_id).
CREATE OR REPLACE FUNCTION erp_users_annexe_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.annexe_id IS DISTINCT FROM OLD.annexe_id
     AND NOT COALESCE(erp_can_manage_users(), false) THEN
    NEW.annexe_id := OLD.annexe_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_annexe_guard ON erp_users;
CREATE TRIGGER trg_users_annexe_guard BEFORE UPDATE ON erp_users
  FOR EACH ROW EXECUTE FUNCTION erp_users_annexe_guard();

-- ------------------------------------------------------------
-- 3. DOSYE PASYAN — tout chan fòm papye a (Fèy 1-9)
-- ------------------------------------------------------------
-- Kòd pasyan + annex
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS annexe_id uuid REFERENCES erp_annexes(id);

-- FÈY 1 — Enregistrement I (dosye & enfòmasyon pèsonèl)
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS numero_dossier text;      -- N° du dossier (U.N)
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS type_service text[];      -- P/O, PHYSIO, MED
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS date_enregistrement date DEFAULT CURRENT_DATE;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS personne_responsable text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS adresse_rue text;         -- N° maison / rue
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS commune text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS departement text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS localite text;            -- village / ville
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS etat_civil text
  CHECK (etat_civil IN ('celibataire','marie','divorce','veuf'));
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS carte_identite text;

-- FÈY 2 — Enregistrement II (referans & invalidite)
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS envoye_de text[];         -- referan yo
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS envoye_de_autre text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS deja_appareille text
  CHECK (deja_appareille IN ('non','oui','oui_hrc'));
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS cause_invalidite text[];  -- congenitale_infectieuse, cancereuse, traumatique, vasculaire
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS raison_trauma text[];     -- morsure, accident_pro, circulation, sport, conflit

-- FÈY 3 — Nivo anplitasyon
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS date_amputation date;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS hopital_amputation text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS region_accident text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS lieu_accident text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS niveau_amputation jsonb;
--  {mi_gauche:[], mi_droite:[], ms_gauche:[], ms_droite:[]}
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS activite text
  CHECK (activite IN ('etudiant','salarie','autres'));
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS activite_autre text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS nombre_enfants int;

-- FÈY 4 — Evalyasyon inisyal / anamnèz
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS date_evaluation date;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS motif_consultation text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS antecedent_medical text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS antecedent_familial text;

-- FÈY 5 — Bilan konjitif & doulè
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS bilan_cognitif jsonb;
--  {orientation, resolution_problemes, perspicacite, memoire_court,
--   memoire_long, memoire_ancien, coordination, ecriture, langage, autre}
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_localisation text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_niveau int
  CHECK (douleur_niveau BETWEEN 0 AND 10);
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_nature text[];
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_aspect text[];
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_sommeil text
  CHECK (douleur_sommeil IN ('non','oui'));
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_sommeil_detail text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_facteurs_declenchants text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_facteurs_calmants text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS douleur_symptomes text[];
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS etoile_maigne jsonb;
--  {courber_devant, courber_arriere, cote_gauche, cote_droite, rot_gauche, rot_droite}

-- FÈY 6 — Bilan fonksyonèl
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS test_lasegue text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS autres_tests text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS bilan_fonctionnel jsonb;  -- {activite: score 1-5}
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS bilan_fonctionnel_commentaire text;

-- FÈY 7 — Bilan miskilè / atikilè
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS bilan_musculaire jsonb;
--  {"epaule_flex": {bm_d, bm_g, ba_d, ba_g}, ...}

-- FÈY 8 — Lòt enfòmasyon & objektif
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS bilans_complementaires text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS informations_importantes jsonb; -- [{date, info}]
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS problemes text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS attentes_patient text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS objectifs text[];
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS objectifs_autre text;
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS objectifs_court_terme text;

-- FÈY 9 — Preskripsyon & swivi tretman
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS plan_exercices jsonb;     -- {type: details}
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS contre_indication text;

-- Inik: yon sèl kòd pa antrepriz
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_code
  ON erp_patients(enterprise_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_annexe ON erp_patients(annexe_id);

-- ------------------------------------------------------------
-- 4. FICH REEVALYASYON (Fèy 10) — plizyè pa pasyan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_patient_reevaluations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid REFERENCES erp_patients(id) ON DELETE CASCADE,
  date_reevaluation date DEFAULT CURRENT_DATE,
  conclusion text,
  modifications jsonb DEFAULT '[]',   -- [{date, modification (+/-)}]
  frequence_tx text,
  evaluateur_nom text,
  signature text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE erp_patient_reevaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reeval_select" ON erp_patient_reevaluations;
CREATE POLICY "reeval_select" ON erp_patient_reevaluations FOR SELECT
  USING (created_by = auth.uid()
         OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','comptable','rh']));
DROP POLICY IF EXISTS "reeval_insert" ON erp_patient_reevaluations;
CREATE POLICY "reeval_insert" ON erp_patient_reevaluations FOR INSERT
  WITH CHECK (erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe']));
DROP POLICY IF EXISTS "reeval_update" ON erp_patient_reevaluations;
CREATE POLICY "reeval_update" ON erp_patient_reevaluations FOR UPDATE
  USING (created_by = auth.uid()
         OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire']));
DROP POLICY IF EXISTS "reeval_delete" ON erp_patient_reevaluations;
CREATE POLICY "reeval_delete" ON erp_patient_reevaluations FOR DELETE
  USING (erp_is_pdg());

-- ------------------------------------------------------------
-- 5. RPC — NIMEWO PWOChen PASYAN PA ANNEXE
--    Mete ajou patient_seq annex la epi retounen "CODE-0001".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_next_patient_code(p_annexe_id uuid DEFAULT NULL)
RETURNS text AS $$
DECLARE
  v_annexe_id uuid;
  v_prefix text;
  v_seq int;
  v_eid uuid;
BEGIN
  -- 1. Annex la: paramèt → annex itilizatè a → prensipal → premye aktif
  v_annexe_id := COALESCE(
    p_annexe_id,
    (SELECT annexe_id FROM erp_users WHERE id = auth.uid())
  );

  IF v_annexe_id IS NULL THEN
    v_eid := erp_get_user_enterprise();
    SELECT id INTO v_annexe_id FROM erp_annexes
     WHERE (v_eid IS NULL OR enterprise_id = v_eid OR enterprise_id IS NULL)
       AND is_active
     ORDER BY is_principale DESC, created_at
     LIMIT 1;
  END IF;

  -- 2. Okenn annex poko egziste → kreye syèj la otomatikman
  IF v_annexe_id IS NULL THEN
    v_eid := COALESCE(v_eid, erp_get_user_enterprise());
    INSERT INTO erp_annexes (enterprise_id, code, nom, is_principale, created_by)
    VALUES (v_eid, 'PRN', 'Siège Principal', true, auth.uid())
    ON CONFLICT (enterprise_id, code) DO UPDATE SET is_principale = true
    RETURNING id INTO v_annexe_id;
  END IF;

  -- 3. Enkremante kontè a (lock sou liy lan → pa gen doublon)
  UPDATE erp_annexes
     SET patient_seq = patient_seq + 1
   WHERE id = v_annexe_id
  RETURNING code, patient_seq INTO v_prefix, v_seq;

  RETURN v_prefix || '-' || lpad(v_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5b. TRIGGER — kòd otomatik pou TOUT chemen insert
--     (pòtal piblik erp_portal_register_patient, insert dirèk,
--     elatriye). Si NEW.code deja genyen (RPC pi ba) li pa manyen l.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_patients_assign_code()
RETURNS TRIGGER AS $$
DECLARE
  v_annexe uuid;
  v_prefix text;
  v_seq int;
BEGIN
  IF NEW.code IS NOT NULL THEN RETURN NEW; END IF;

  -- Annex: NEW.annexe_id → annex kreyatè a → prensipal/premye aktif
  v_annexe := COALESCE(
    NEW.annexe_id,
    (SELECT annexe_id FROM erp_users
      WHERE id = COALESCE(NEW.created_by, auth.uid())),
    (SELECT id FROM erp_annexes
      WHERE (NEW.enterprise_id IS NULL
             OR enterprise_id = NEW.enterprise_id
             OR enterprise_id IS NULL)
        AND is_active
      ORDER BY is_principale DESC, created_at
      LIMIT 1)
  );

  -- Okenn annex → kreye syèj la
  IF v_annexe IS NULL THEN
    INSERT INTO erp_annexes (enterprise_id, code, nom, is_principale, created_by)
    VALUES (NEW.enterprise_id, 'PRN', 'Siège Principal', true,
            COALESCE(NEW.created_by, auth.uid()))
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_annexe;
    IF v_annexe IS NULL THEN
      SELECT id INTO v_annexe FROM erp_annexes
       ORDER BY is_principale DESC, created_at LIMIT 1;
    END IF;
  END IF;

  UPDATE erp_annexes
     SET patient_seq = patient_seq + 1
   WHERE id = v_annexe
  RETURNING code, patient_seq INTO v_prefix, v_seq;

  NEW.annexe_id := v_annexe;
  NEW.code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_code ON erp_patients;
CREATE TRIGGER trg_patients_code BEFORE INSERT ON erp_patients
  FOR EACH ROW EXECUTE FUNCTION erp_patients_assign_code();

-- ------------------------------------------------------------
-- 6. RPC — ENREGISTRE YON PASYAN (atòmik)
--    p_data = tout chan fòm la an JSONB; fonksyon an:
--      * verifye moun nan se staff
--      * chwazi annex la (annex itilizatè a; direksyon an ka
--        anrejistre pou nenpòt annex via p_data->>'annexe_id')
--      * jenere kòd la "PREFIX-0001"
--      * mete enterprise_id + created_by
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_register_patient(p_data jsonb DEFAULT '{}')
RETURNS jsonb AS $$
DECLARE
  v_annexe_id uuid;
  v_user_annexe uuid;
  v_prefix text;
  v_seq int;
  v_code text;
  v_eid uuid;
  v_patient_id uuid;
  v_row erp_patients;
BEGIN
  IF NOT erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                            'secretaire','employe']) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;

  -- Chan sistèm yo pa ka pase nan p_data
  p_data := p_data - 'id' - 'code' - 'enterprise_id' - 'created_by'
                  - 'user_id' - 'created_at' - 'updated_at';

  v_eid := erp_get_user_enterprise();
  SELECT annexe_id INTO v_user_annexe FROM erp_users WHERE id = auth.uid();

  -- Non-direksyon: fòse annex pwòp li a (li pa ka chwazi).
  -- Direksyon: ka chwazi nenpòt annex via p_data->>'annexe_id'.
  IF erp_can_manage_users() AND p_data ? 'annexe_id'
     AND NULLIF(p_data->>'annexe_id','') IS NOT NULL THEN
    v_annexe_id := (p_data->>'annexe_id')::uuid;
  ELSE
    v_annexe_id := v_user_annexe;
  END IF;
  p_data := p_data - 'annexe_id';

  -- Fallback: annex prensipal / premye aktif antrepriz la
  IF v_annexe_id IS NULL THEN
    SELECT id INTO v_annexe_id FROM erp_annexes
     WHERE (v_eid IS NULL OR enterprise_id = v_eid OR enterprise_id IS NULL)
       AND is_active
     ORDER BY is_principale DESC, created_at
     LIMIT 1;
  END IF;

  -- Okenn annex poko egziste → kreye syèj la otomatikman
  IF v_annexe_id IS NULL THEN
    INSERT INTO erp_annexes (enterprise_id, code, nom, is_principale, created_by)
    VALUES (v_eid, 'PRN', 'Siège Principal', true, auth.uid())
    RETURNING id INTO v_annexe_id;
  END IF;

  -- Kòd pasyan an — kontè annex la (lock → pa gen doublon)
  UPDATE erp_annexes
     SET patient_seq = patient_seq + 1
   WHERE id = v_annexe_id
  RETURNING code, patient_seq INTO v_prefix, v_seq;
  v_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO erp_patients (enterprise_id, annexe_id, code, created_by)
  VALUES (v_eid, v_annexe_id, v_code, auth.uid())
  RETURNING id INTO v_patient_id;

  -- Ranpli tout chan ki soti nan JSON la (jsonb_populate_record
  -- ignore kle ki pa koresponn ak kolòn yo)
  UPDATE erp_patients p
     SET (nom, prenom, date_naissance, sexe, phone, email, adresse, diagnostic,
          notes, numero_dossier, type_service, photo_url, date_enregistrement,
          personne_responsable, adresse_rue, province, commune, departement,
          localite, etat_civil, carte_identite, envoye_de, envoye_de_autre,
          deja_appareille, cause_invalidite, raison_trauma, date_amputation,
          hopital_amputation, region_accident, lieu_accident, niveau_amputation,
          activite, activite_autre, nombre_enfants, date_evaluation, profession,
          motif_consultation, antecedent_medical, antecedent_familial,
          bilan_cognitif, douleur_localisation, douleur_niveau, douleur_nature,
          douleur_aspect, douleur_sommeil, douleur_sommeil_detail,
          douleur_facteurs_declenchants, douleur_facteurs_calmants,
          douleur_symptomes, etoile_maigne, test_lasegue, autres_tests,
          bilan_fonctionnel, bilan_fonctionnel_commentaire, bilan_musculaire,
          bilans_complementaires, informations_importantes, problemes,
          attentes_patient, objectifs, objectifs_autre, objectifs_court_terme,
          plan_exercices, contre_indication)
     = (SELECT r.nom, r.prenom, r.date_naissance, r.sexe, r.phone, r.email,
               r.adresse, r.diagnostic, r.notes, r.numero_dossier,
               r.type_service, r.photo_url, r.date_enregistrement,
               r.personne_responsable, r.adresse_rue, r.province, r.commune,
               r.departement, r.localite, r.etat_civil, r.carte_identite,
               r.envoye_de, r.envoye_de_autre, r.deja_appareille,
               r.cause_invalidite, r.raison_trauma, r.date_amputation,
               r.hopital_amputation, r.region_accident, r.lieu_accident,
               r.niveau_amputation, r.activite, r.activite_autre,
               r.nombre_enfants, r.date_evaluation, r.profession,
               r.motif_consultation, r.antecedent_medical, r.antecedent_familial,
               r.bilan_cognitif, r.douleur_localisation, r.douleur_niveau,
               r.douleur_nature, r.douleur_aspect, r.douleur_sommeil,
               r.douleur_sommeil_detail, r.douleur_facteurs_declenchants,
               r.douleur_facteurs_calmants, r.douleur_symptomes,
               r.etoile_maigne, r.test_lasegue, r.autres_tests,
               r.bilan_fonctionnel, r.bilan_fonctionnel_commentaire,
               r.bilan_musculaire, r.bilans_complementaires,
               r.informations_importantes, r.problemes, r.attentes_patient,
               r.objectifs, r.objectifs_autre, r.objectifs_court_terme,
               r.plan_exercices, r.contre_indication
          FROM jsonb_populate_record(null::erp_patients, p_data) r)
  WHERE p.id = v_patient_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 7. erp_register_staff — ajoute paramèt annexe
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS erp_register_staff(uuid, text, text, text, text, uuid, text);

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
                    'comptable','responsable_stock','commercial','rh','employe') THEN
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

-- ------------------------------------------------------------
-- 8. MODIL "annexes" + syèj pa defo pou HAITI REH-CARE
-- ------------------------------------------------------------
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
('annexes', 'Annexes', 'Administration',
 'Succursales du centre — codes patients par annexe et affectation du personnel',
 'building-2', '{"view": true, "create": true, "edit": true, "delete": true}')
ON CONFLICT (code) DO NOTHING;

UPDATE erp_enterprise_types
SET features = jsonb_set(
  features, '{modules}',
  COALESCE(features->'modules', '[]'::jsonb) || '"annexes"'::jsonb)
WHERE code = 'physiotherapy'
  AND NOT (features->'modules' ? 'annexes');

-- Syèj prensipal pa defo pou chak antrepriz physiotherapy aktif
INSERT INTO erp_annexes (enterprise_id, code, nom, ville, is_principale, is_active)
SELECT r.id, 'PRN', 'Siège Principal', r.company_city, true, true
FROM erp_enterprise_registrations r
LEFT JOIN erp_enterprise_types t ON t.id = r.enterprise_type_id
WHERE r.statut = 'active' AND t.code = 'physiotherapy'
  AND NOT EXISTS (
    SELECT 1 FROM erp_annexes a WHERE a.enterprise_id = r.id
  );

-- ------------------------------------------------------------
-- 9. PÈMISYON EXECUTE
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION erp_next_patient_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_register_patient(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_register_staff(uuid, text, text, text, text, uuid, text, uuid) TO authenticated;
