-- ============================================================
-- LOGIQUE NUMERO DOSSIER (HRC-001162...) & CODE ANNEXE
-- 1. Code patient = préfixe annexe (PAP-0001, LEO-0001...)
-- 2. N° Dossier = série générale HRC (HRC-001162...)
-- 3. Permissions complètes pour Receptionniste & Staff
-- ============================================================

-- 0. Nettoyer les doublons d'annexe éventuels et mettre à jour le code des patients existants
DO $$
DECLARE
  v_annexe_id uuid;
  v_prefix text;
BEGIN
  -- Nettoyer tout conflit avec une annexe 'HRC' temporaire
  IF EXISTS (SELECT 1 FROM erp_annexes WHERE code = 'HRC') AND EXISTS (SELECT 1 FROM erp_annexes WHERE code = 'PAP') THEN
    UPDATE erp_users SET annexe_id = (SELECT id FROM erp_annexes WHERE code = 'PAP' LIMIT 1)
     WHERE annexe_id = (SELECT id FROM erp_annexes WHERE code = 'HRC' LIMIT 1);
    UPDATE erp_patients SET annexe_id = (SELECT id FROM erp_annexes WHERE code = 'PAP' LIMIT 1)
     WHERE annexe_id = (SELECT id FROM erp_annexes WHERE code = 'HRC' LIMIT 1);
    DELETE FROM erp_annexes WHERE code = 'HRC';
  ELSIF EXISTS (SELECT 1 FROM erp_annexes WHERE code = 'HRC') AND NOT EXISTS (SELECT 1 FROM erp_annexes WHERE code = 'PAP') THEN
    UPDATE erp_annexes SET code = 'PAP', nom = 'Siège Principal (Port-au-Prince)' WHERE code = 'HRC';
  END IF;

  -- Sélectionner l'annexe principale
  SELECT id, code INTO v_annexe_id, v_prefix FROM erp_annexes
   WHERE is_active = true
   ORDER BY is_principale DESC, (code = 'PAP') DESC, (code = 'PRN') DESC, created_at
   LIMIT 1;

  IF v_annexe_id IS NOT NULL THEN
    -- Mettre à jour les patients dont le code commence par HRC- vers le préfixe de l'annexe (ex: PAP-0001...)
    WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY
          COALESCE(NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int, 999999),
          date_enregistrement ASC NULLS LAST,
          id ASC
      ) as seq
      FROM erp_patients
      WHERE (annexe_id = v_annexe_id OR annexe_id IS NULL)
        AND (code ILIKE 'HRC-%' OR code IS NULL)
    )
    UPDATE erp_patients p
       SET annexe_id = v_annexe_id,
           code = v_prefix || '-' || lpad(n.seq::text, 4, '0')
      FROM numbered n
     WHERE p.id = n.id;

    -- Ajuster le compteur patient_seq de l'annexe
    UPDATE erp_annexes
       SET patient_seq = GREATEST(
         patient_seq,
         (SELECT COUNT(*) FROM erp_patients WHERE annexe_id = v_annexe_id)
       )
     WHERE id = v_annexe_id;
  END IF;
END $$;

-- 1. Mettre à jour les permissions RLS pour Receptionniste sur annexes et patients
DROP POLICY IF EXISTS "annexes_select" ON erp_annexes;
CREATE POLICY "annexes_select" ON erp_annexes FOR SELECT
  USING (erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                            'secretaire','receptionniste','comptable','responsable_stock',
                            'commercial','rh','employe']));

DROP POLICY IF EXISTS "patients_all_read" ON erp_patients;
CREATE POLICY "patients_all_read" ON erp_patients FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "patients_insert" ON erp_patients;
CREATE POLICY "patients_insert" ON erp_patients FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                     'secretaire','receptionniste','medecin','physiotherapeute','employe'])
);

DROP POLICY IF EXISTS "patients_update" ON erp_patients;
CREATE POLICY "patients_update" ON erp_patients FOR UPDATE USING (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                     'secretaire','receptionniste','medecin','physiotherapeute','employe'])
);

DROP POLICY IF EXISTS "demandes_update" ON erp_patient_demandes;
CREATE POLICY "demandes_update" ON erp_patient_demandes FOR UPDATE USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','comptable','medecin','physiotherapeute'])
) WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','comptable','medecin','physiotherapeute'])
);

-- 2. Mettre à jour la fonction erp_register_patient (avec receptionniste)
CREATE OR REPLACE FUNCTION erp_register_patient(p_data jsonb DEFAULT '{}')
RETURNS jsonb AS $$
DECLARE
  v_annexe_id uuid;
  v_user_annexe uuid;
  v_prefix text;
  v_seq int;
  v_code text;
  v_dossier text;
  v_eid uuid;
  v_patient_id uuid;
  v_row erp_patients;
BEGIN
  IF NOT erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                            'secretaire','receptionniste','employe']) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;

  v_eid := erp_get_user_enterprise();
  SELECT annexe_id INTO v_user_annexe FROM erp_users WHERE id = auth.uid();

  -- Choix de l'annexe
  IF erp_can_manage_users() AND p_data ? 'annexe_id'
     AND NULLIF(p_data->>'annexe_id','') IS NOT NULL THEN
    v_annexe_id := (p_data->>'annexe_id')::uuid;
  ELSE
    v_annexe_id := v_user_annexe;
  END IF;

  IF v_annexe_id IS NULL THEN
    SELECT id INTO v_annexe_id FROM erp_annexes
     WHERE (v_eid IS NULL OR enterprise_id = v_eid OR enterprise_id IS NULL)
       AND is_active
     ORDER BY is_principale DESC, created_at
     LIMIT 1;
  END IF;

  -- A. Code patient : préfixe de l'annexe (ex: PAP-0001, LEO-0001)
  IF p_data ? 'code' AND NULLIF(trim(p_data->>'code'), '') IS NOT NULL THEN
    v_code := trim(p_data->>'code');
  ELSE
    UPDATE erp_annexes
       SET patient_seq = patient_seq + 1
     WHERE id = v_annexe_id
    RETURNING code, patient_seq INTO v_prefix, v_seq;
    v_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  END IF;

  -- B. Numéro de dossier : série générale HRC (HRC-001162...)
  IF p_data ? 'numero_dossier' AND NULLIF(trim(p_data->>'numero_dossier'), '') IS NOT NULL THEN
    v_dossier := trim(p_data->>'numero_dossier');
  ELSE
    SELECT 'HRC-' || lpad((
      COALESCE(
        MAX(NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int),
        1161
      ) + 1
    )::text, 6, '0') INTO v_dossier
    FROM erp_patients
    WHERE numero_dossier ILIKE 'HRC-%'
      AND NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int < 2000;

    IF v_dossier IS NULL THEN
      v_dossier := 'HRC-001162';
    END IF;
  END IF;

  -- Nettoyer p_data des champs système
  p_data := p_data - 'id' - 'code' - 'numero_dossier' - 'enterprise_id'
                  - 'annexe_id' - 'created_by' - 'user_id' - 'created_at' - 'updated_at';

  INSERT INTO erp_patients (enterprise_id, annexe_id, code, numero_dossier, created_by)
  VALUES (v_eid, v_annexe_id, v_code, v_dossier, auth.uid())
  RETURNING id INTO v_patient_id;

  UPDATE erp_patients p
     SET (nom, prenom, date_naissance, sexe, phone, email, adresse, diagnostic,
          notes, type_service, photo_url, date_enregistrement,
          personne_responsable, adresse_rue, province, commune, departement,
          localite, etat_civil, carte_identite, envoye_de, envoye_de_autre,
          deja_appareille, cause_invalidite, raison_trauma, date_amputation,
          hopital_amputation, region_accident, lieu_accident, niveau_amputation,
          activite, activite_autre, nombre_enfants, date_evaluation, profession,
          motif_consultation, antecedent_medical, antecedent_familial,
          recommandations, medecin_traitant, prescripteur, reference,
          informations_importantes, bilan_cognitif, douleur_localisation,
          douleur_niveau, douleur_sommeil, douleur_sommeil_detail,
          douleur_facteurs_declenchants, douleur_facteurs_calmants,
          douleur_nature, douleur_aspect, douleur_symptomes,
          etoile_maigne, bilan_fonctionnel, bilans_complementaires,
          problemes, objectifs, objectifs_autre, objectifs_court_terme,
          plan_exercices, contre_indication, statut, is_active) =
         (SELECT
            x.nom, x.prenom, x.date_naissance, x.sexe, x.phone, x.email, x.adresse, x.diagnostic,
            x.notes, x.type_service, x.photo_url, COALESCE(x.date_enregistrement, CURRENT_DATE),
            x.personne_responsable, x.adresse_rue, x.province, x.commune, x.departement,
            x.localite, x.etat_civil, x.carte_identite, x.envoye_de, x.envoye_de_autre,
            x.deja_appareille, x.cause_invalidite, x.raison_trauma, x.date_amputation,
            x.hopital_amputation, x.region_accident, x.lieu_accident, x.niveau_amputation,
            x.activite, x.activite_autre, x.nombre_enfants, x.date_evaluation, x.profession,
            x.motif_consultation, x.antecedent_medical, x.antecedent_familial,
            x.recommandations, x.medecin_traitant, x.prescripteur, x.reference,
            x.informations_importantes, x.bilan_cognitif, x.douleur_localisation,
            x.douleur_niveau, x.douleur_sommeil, x.douleur_sommeil_detail,
            x.douleur_facteurs_declenchants, x.douleur_facteurs_calmants,
            x.douleur_nature, x.douleur_aspect, x.douleur_symptomes,
            x.etoile_maigne, x.bilan_fonctionnel, x.bilans_complementaires,
            x.problemes, x.objectifs, x.objectifs_autre, x.objectifs_court_terme,
            x.plan_exercices, x.contre_indication, 'actif', true
            FROM jsonb_populate_record(null::erp_patients, p_data) x)
   WHERE p.id = v_patient_id
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row)::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger pour tout INSERT direct dans erp_patients (SECURITY DEFINER pour permettre la màj du compteur par la réceptionniste)
CREATE OR REPLACE FUNCTION erp_patients_assign_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_annexe uuid;
  v_prefix text;
  v_seq int;
BEGIN
  -- A. Code patient
  IF NEW.code IS NULL THEN
    v_annexe := COALESCE(
      NEW.annexe_id,
      (SELECT annexe_id FROM erp_users WHERE id = COALESCE(NEW.created_by, auth.uid())),
      (SELECT id FROM erp_annexes WHERE is_active ORDER BY is_principale DESC, created_at LIMIT 1)
    );

    IF v_annexe IS NOT NULL THEN
      UPDATE erp_annexes
         SET patient_seq = patient_seq + 1
       WHERE id = v_annexe
      RETURNING code, patient_seq INTO v_prefix, v_seq;

      NEW.annexe_id := v_annexe;
      NEW.code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
    END IF;
  END IF;

  -- B. Numéro de dossier HRC-001162...
  IF NEW.numero_dossier IS NULL THEN
    SELECT 'HRC-' || lpad((
      COALESCE(
        MAX(NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int),
        1161
      ) + 1
    )::text, 6, '0') INTO NEW.numero_dossier
    FROM erp_patients
    WHERE numero_dossier ILIKE 'HRC-%'
      AND NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int < 2000;

    IF NEW.numero_dossier IS NULL THEN
      NEW.numero_dossier := 'HRC-001162';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_code ON erp_patients;
CREATE TRIGGER trg_patients_code BEFORE INSERT ON erp_patients
  FOR EACH ROW EXECUTE FUNCTION erp_patients_assign_code();

-- 3. Vérification du prochain numéro de dossier
SELECT
  'HRC-' || lpad((
    COALESCE(MAX(NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int), 1161) + 1
  )::text, 6, '0') AS prochain_numero_dossier_hrc
FROM erp_patients
WHERE numero_dossier ILIKE 'HRC-%'
  AND NULLIF(regexp_replace(numero_dossier, '[^0-9]', '', 'g'), '')::int < 2000;
