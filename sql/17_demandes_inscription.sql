-- ============================================================
-- DEMANDES D'INSCRIPTION EN LIGNE — HAITI REH-CARE
-- Run this AFTER: 16_multibranch.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
--
-- Sa fichye sa a fè:
--   1. Tab "erp_patient_demandes" — fòm pasyan ranpli sou
--      sit piblik la (site/inscription.html) via lyen/QR code.
--   2. RPC piblik "erp_public_demande_patient" — insert san
--      koneksyon (anon), whitelist chan yo + anti-doublon.
--   3. RLS: sekretè/resepsyonis/direksyon li + trete demand yo
--      (menm wòl + vizibilite annex ke erp_patients).
--   4. Realtime: sekretè a wè demand la rive otomatikman nan
--      modil Patients la.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TAB DEMANDES
--    payload = tout chan fòm la (menm non kolòn erp_patients yo —
--    kidonk sekretè a ka konvèti l an dosye nan yon sèl klik).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_patient_demandes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),   -- NULL = tout annex (lyen san ?a=)
  nom text NOT NULL,
  prenom text,
  phone text,
  email text,
  payload jsonb DEFAULT '{}',
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','traite','rejete')),
  patient_id uuid REFERENCES erp_patients(id), -- dosye kreye apre validasyon
  traite_par uuid REFERENCES auth.users(id),
  traite_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demandes_statut ON erp_patient_demandes(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_annexe ON erp_patient_demandes(annexe_id);
CREATE INDEX IF NOT EXISTS idx_demandes_created ON erp_patient_demandes(created_at DESC);

-- ------------------------------------------------------------
-- 2. RLS
--    * Okenn INSERT policy: sèl RPC SECURITY DEFINER anba a
--      (propriyetè a bypase RLS) ka ekri — piblik la pa ka
--      manyen statut/patient_id, epi pèsonèl la pa bezwen
--      kreye demand manyèlman.
--    * SELECT/UPDATE: menm wòl + menm izolasyon annex ke pasyan yo
--      (annexe_id NULL = vizib pou tout staff).
-- ------------------------------------------------------------
ALTER TABLE erp_patient_demandes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demandes_select" ON erp_patient_demandes;
CREATE POLICY "demandes_select" ON erp_patient_demandes FOR SELECT USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute','comptable',
                         'employe','informaticien'])
);

DROP POLICY IF EXISTS "demandes_update" ON erp_patient_demandes;
CREATE POLICY "demandes_update" ON erp_patient_demandes FOR UPDATE USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute'])
) WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute'])
);

DROP POLICY IF EXISTS "demandes_delete" ON erp_patient_demandes;
CREATE POLICY "demandes_delete" ON erp_patient_demandes FOR DELETE USING (erp_is_pdg());

-- ------------------------------------------------------------
-- 3. RPC PIBLIK — SOUMÈT YON DEMAND (san koneksyon)
--    Rele pa site/inscription.html ak kle anon lan.
--      * whitelist kle yo (menm kolòn erp_patients yo)
--      * oblige nom
--      * rezoud antrepriz la (physiotherapy an premye)
--      * rezoud annex pa kòd (?a=PAP / ?a=LEO) — sinon NULL
--      * anti-doublon: menm telefòn oswa menm non+prénom
--        "en_attente" nan dènye 15 minit → retounen liy la
--        ki deja egziste a (pa kreye doublon)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_public_demande_patient(
  p_data jsonb DEFAULT '{}',
  p_annexe_code text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_eid uuid;
  v_annexe uuid;
  v_id uuid;
  v_payload jsonb;
BEGIN
  -- Kenbe sèlman kle ki koresponn ak kolòn dosye pasyan an
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_payload
    FROM jsonb_each(COALESCE(p_data, '{}'::jsonb))
   WHERE key = ANY(ARRAY[
     'nom','prenom','date_naissance','sexe','phone','email','adresse',
     'diagnostic','notes','numero_dossier','type_service',
     'personne_responsable','adresse_rue','province','commune',
     'departement','localite','etat_civil','carte_identite',
     'envoye_de','envoye_de_autre','deja_appareille',
     'cause_invalidite','raison_trauma','date_amputation',
     'hopital_amputation','region_accident','lieu_accident',
     'niveau_amputation','activite','activite_autre','nombre_enfants',
     'profession','motif_consultation','antecedent_medical',
     'antecedent_familial','douleur_localisation','douleur_niveau',
     'douleur_nature','douleur_aspect','douleur_sommeil',
     'douleur_sommeil_detail','douleur_facteurs_declenchants',
     'douleur_facteurs_calmants','douleur_symptomes','problemes',
     'attentes_patient','objectifs','objectifs_autre',
     'objectifs_court_terme','bilans_complementaires'
   ]);

  IF NULLIF(btrim(COALESCE(v_payload->>'nom','')), '') IS NULL THEN
    RAISE EXCEPTION 'Le nom du patient est obligatoire';
  END IF;

  -- Antrepriz aktif la (menm lod ke erp_public_enterprise)
  SELECT r.id INTO v_eid
    FROM erp_enterprise_registrations r
    LEFT JOIN erp_enterprise_types t ON t.id = r.enterprise_type_id
   WHERE r.statut = 'active'
   ORDER BY CASE WHEN t.code = 'physiotherapy' THEN 0 ELSE 1 END,
            r.created_at
   LIMIT 1;

  -- Annex chwazi nan lyen an (?a=CODE) — sinon NULL = tout staff
  IF NULLIF(btrim(COALESCE(p_annexe_code, '')), '') IS NOT NULL THEN
    SELECT a.id INTO v_annexe
      FROM erp_annexes a
     WHERE upper(a.code) = upper(btrim(p_annexe_code))
       AND a.is_active
       AND (v_eid IS NULL OR a.enterprise_id = v_eid OR a.enterprise_id IS NULL)
     LIMIT 1;
  END IF;

  -- Anti-doublon lejè (spam / double-tap sou "Envoyer")
  IF NULLIF(COALESCE(v_payload->>'phone',''), '') IS NOT NULL THEN
    SELECT id INTO v_id FROM erp_patient_demandes
     WHERE statut = 'en_attente'
       AND phone = v_payload->>'phone'
       AND created_at > now() - interval '15 minutes'
     LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM erp_patient_demandes
     WHERE statut = 'en_attente'
       AND lower(nom) = lower(v_payload->>'nom')
       AND lower(COALESCE(prenom,'')) = lower(COALESCE(v_payload->>'prenom',''))
       AND created_at > now() - interval '15 minutes'
     LIMIT 1;
  END IF;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO erp_patient_demandes
    (enterprise_id, annexe_id, nom, prenom, phone, email, payload)
  VALUES (
    v_eid,
    v_annexe,
    btrim(v_payload->>'nom'),
    NULLIF(btrim(COALESCE(v_payload->>'prenom','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'phone','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'email','')), ''),
    v_payload
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. PÈMISYON EXECUTE
--    anon: sit piblik la soumèt fòm lan san koneksyon.
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION erp_public_demande_patient(jsonb, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. REALTIME — sekretè a wè demand la rive otomatikman
--    (si piblikasyon an pa egziste sou pwojè a, blòk la pase
--    an silans — ERP la kontinye mache san realtime).
-- ------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE erp_patient_demandes;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
