-- ============================================================
-- INITIALISER LE CODE PATIENT AUTOMATIQUE (SERIE HRC-001162...)
-- A executer dans Supabase SQL Editor
-- ============================================================

-- 1. Mettre a jour l'annexe du Siege Principal avec code 'HRC' et sequence 1161
UPDATE erp_annexes
   SET code = 'HRC',
       nom = 'Siège Principal (HAITI REH-CARE)',
       patient_seq = 1161,
       is_principale = true
 WHERE is_principale = true
    OR code IN ('PAP', 'PRN', 'HRC')
    OR id IN (SELECT annexe_id FROM erp_patients WHERE annexe_id IS NOT NULL LIMIT 1);

-- 2. Mettre a jour la fonction erp_register_patient pour numerotation automatique 6 chiffres
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

  -- Code manuel optionnel si fourni
  IF p_data ? 'code' AND NULLIF(trim(p_data->>'code'), '') IS NOT NULL THEN
    v_code := trim(p_data->>'code');
  ELSIF p_data ? 'numero_dossier' AND NULLIF(trim(p_data->>'numero_dossier'), '') IS NOT NULL THEN
    v_code := trim(p_data->>'numero_dossier');
  END IF;

  p_data := p_data - 'id' - 'code' - 'enterprise_id' - 'created_by'
                  - 'user_id' - 'created_at' - 'updated_at';

  v_eid := erp_get_user_enterprise();
  SELECT annexe_id INTO v_user_annexe FROM erp_users WHERE id = auth.uid();

  IF erp_can_manage_users() AND p_data ? 'annexe_id'
     AND NULLIF(p_data->>'annexe_id','') IS NOT NULL THEN
    v_annexe_id := (p_data->>'annexe_id')::uuid;
  ELSE
    v_annexe_id := v_user_annexe;
  END IF;
  p_data := p_data - 'annexe_id';

  IF v_annexe_id IS NULL THEN
    SELECT id INTO v_annexe_id FROM erp_annexes
     WHERE (v_eid IS NULL OR enterprise_id = v_eid OR enterprise_id IS NULL)
       AND is_active
     ORDER BY (code = 'HRC') DESC, is_principale DESC, created_at
     LIMIT 1;
  END IF;

  IF v_annexe_id IS NULL THEN
    INSERT INTO erp_annexes (enterprise_id, code, nom, is_principale, created_by, patient_seq)
    VALUES (v_eid, 'HRC', 'Siège Principal', true, auth.uid(), 1161)
    RETURNING id INTO v_annexe_id;
  END IF;

  -- Numerotation automatique : incremente patient_seq et produit HRC-001162, etc.
  IF v_code IS NULL THEN
    UPDATE erp_annexes
       SET patient_seq = patient_seq + 1
     WHERE id = v_annexe_id
    RETURNING code, patient_seq INTO v_prefix, v_seq;
    v_code := v_prefix || '-' || lpad(v_seq::text, CASE WHEN v_prefix = 'HRC' THEN 6 ELSE 4 END, '0');
  END IF;

  INSERT INTO erp_patients (enterprise_id, annexe_id, code, numero_dossier, created_by)
  VALUES (v_eid, v_annexe_id, v_code, COALESCE(p_data->>'numero_dossier', v_code), auth.uid())
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

-- 3. Trigger pour tout INSERT direct dans erp_patients
CREATE OR REPLACE FUNCTION erp_patients_assign_code()
RETURNS TRIGGER AS $$
DECLARE
  v_annexe uuid;
  v_prefix text;
  v_seq int;
BEGIN
  IF NEW.code IS NOT NULL THEN RETURN NEW; END IF;

  v_annexe := COALESCE(
    NEW.annexe_id,
    (SELECT annexe_id FROM erp_users WHERE id = COALESCE(NEW.created_by, auth.uid())),
    (SELECT id FROM erp_annexes WHERE is_active ORDER BY (code = 'HRC') DESC, is_principale DESC, created_at LIMIT 1)
  );

  IF v_annexe IS NULL THEN
    INSERT INTO erp_annexes (enterprise_id, code, nom, is_principale, created_by, patient_seq)
    VALUES (NEW.enterprise_id, 'HRC', 'Siège Principal', true, COALESCE(NEW.created_by, auth.uid()), 1161)
    RETURNING id INTO v_annexe;
  END IF;

  UPDATE erp_annexes
     SET patient_seq = patient_seq + 1
   WHERE id = v_annexe
  RETURNING code, patient_seq INTO v_prefix, v_seq;

  NEW.annexe_id := v_annexe;
  NEW.code := v_prefix || '-' || lpad(v_seq::text, CASE WHEN v_prefix = 'HRC' THEN 6 ELSE 4 END, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_code ON erp_patients;
CREATE TRIGGER trg_patients_code BEFORE INSERT ON erp_patients
  FOR EACH ROW EXECUTE FUNCTION erp_patients_assign_code();

-- 4. Verification immediate
SELECT
  code AS code_annexe,
  nom AS nom_annexe,
  patient_seq AS sequence_actuelle,
  code || '-' || lpad((patient_seq + 1)::text, 6, '0') AS prochain_patient_code
FROM erp_annexes
WHERE code = 'HRC' OR is_principale = true;
