-- ============================================================
-- SUPPORT CODE PATIENT MANUEL & REFERENCE
-- Permet de saisir manuellement le code patient (code / numero_dossier)
-- sans forcer le code automatique PREFIX-0001
-- ============================================================

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

  -- Kòd manyèl si itilizatè a te tape l
  IF p_data ? 'code' AND NULLIF(trim(p_data->>'code'), '') IS NOT NULL THEN
    v_code := trim(p_data->>'code');
  ELSIF p_data ? 'numero_dossier' AND NULLIF(trim(p_data->>'numero_dossier'), '') IS NOT NULL THEN
    v_code := trim(p_data->>'numero_dossier');
  END IF;

  -- Chan sistèm yo pa ka pase nan p_data
  p_data := p_data - 'id' - 'code' - 'enterprise_id' - 'created_by'
                  - 'user_id' - 'created_at' - 'updated_at';

  v_eid := erp_get_user_enterprise();
  SELECT annexe_id INTO v_user_annexe FROM erp_users WHERE id = auth.uid();

  -- Non-direksyon: fòse annex li a. Direksyon: ka chwazi annex via p_data->>'annexe_id'.
  IF erp_can_manage_users() AND p_data ? 'annexe_id'
     AND NULLIF(p_data->>'annexe_id','') IS NOT NULL THEN
    v_annexe_id := (p_data->>'annexe_id')::uuid;
  ELSE
    v_annexe_id := v_user_annexe;
  END IF;
  p_data := p_data - 'annexe_id';

  -- Fallback: annex prensipal / premye aktif
  IF v_annexe_id IS NULL THEN
    SELECT id INTO v_annexe_id FROM erp_annexes
     WHERE (v_eid IS NULL OR enterprise_id = v_eid OR enterprise_id IS NULL)
       AND is_active
     ORDER BY is_principale DESC, created_at
     LIMIT 1;
  END IF;

  -- Syèj prensipal
  IF v_annexe_id IS NULL THEN
    INSERT INTO erp_annexes (enterprise_id, code, nom, is_principale, created_by)
    VALUES (v_eid, 'PAP', 'Siège Principal', true, auth.uid())
    RETURNING id INTO v_annexe_id;
  END IF;

  -- Si pa gen kòd manyèl, jenere l otomatikman
  IF v_code IS NULL THEN
    UPDATE erp_annexes
       SET patient_seq = patient_seq + 1
     WHERE id = v_annexe_id
    RETURNING code, patient_seq INTO v_prefix, v_seq;
    v_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
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
