-- ============================================================
-- MULTI-ANNEXES + WORKFLOW KLINIK — HAITI REH-CARE
-- Run this AFTER: 15_roles_receptionniste_chauffeur.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
--
-- Sa fichye sa a fè (dapre dokiman règ biznis yo):
--   1. Nouvo wòl: medecin, physiotherapeute, ouvrier, informaticien
--   2. annexe_id sou TOUT tab operasyonèl + backfill + trigger
--      ki mete annex la otomatikman sou chak nouvo insert.
--   3. Izolasyon done pa annex nan RLS (sèl direksyon/admin wè tout).
--   4. Tab workflow: evaluations, atelier_orders, encaissements,
--      reclamations, bons_commande, rapports_mensuels, audit_log.
--   5. Audit trail (journal) sou tab kritik yo.
--   6. RPC: erp_send_monthly_report, erp_transfer_stock,
--      erp_next_doc_number.
--   7. Seed: annex PAP (Port-au-Prince) + LEO (Léogâne),
--      nouvo poste yo, nouvo modil yo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. WÒL — CHECK sou erp_users.role
--    medecin          → doktè / evalyatè klinik
--    physiotherapeute → fizyoterapèt (seyans yo)
--    ouvrier          → teknisyen atelye (fabrikasyon)
--    informaticien    → admin sistèm (aksè global teknik)
-- ------------------------------------------------------------
ALTER TABLE erp_users
  DROP CONSTRAINT IF EXISTS erp_users_role_check;
ALTER TABLE erp_users
  ADD CONSTRAINT erp_users_role_check
  CHECK (role IN ('pdg','directrice','directeur','manager',
                  'secretaire','comptable','responsable_stock',
                  'commercial','rh','employe',
                  'receptionniste','chauffeur',
                  'medecin','physiotherapeute','ouvrier','informaticien'));

-- Enfòmatisyen an jere itilizatè yo tou (admin sistèm)
CREATE OR REPLACE FUNCTION erp_can_manage_users()
RETURNS boolean AS $$
BEGIN
  RETURN erp_get_role() IN ('pdg', 'directrice', 'directeur', 'informaticien');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2. SIPÒ ANNEX — fonksyon edp yo
-- ------------------------------------------------------------
-- Annex itilizatè konekte a
CREATE OR REPLACE FUNCTION erp_my_annexe()
RETURNS uuid AS $$
  SELECT annexe_id FROM erp_users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Direksyon (PDG/DG) — wè tout annex yo
CREATE OR REPLACE FUNCTION erp_is_direction()
RETURNS boolean AS $$
BEGIN
  RETURN erp_get_role() IN ('pdg', 'directrice', 'directeur');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Moun ki gen aksè global sou tout annex yo (direksyon + admin teknik)
CREATE OR REPLACE FUNCTION erp_can_view_all_annexes()
RETURNS boolean AS $$
BEGIN
  RETURN erp_get_role() IN ('pdg', 'directrice', 'directeur', 'informaticien');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Èske itilizatè a ka wè yon liy ki gen annex p_annexe_id?
--   * NULL → done pataje (pa atache a yon annex) → vizib pou tout staff
--   * direksyon/admin → wè tout
--   * lòt → sèlman pwòp annex li
CREATE OR REPLACE FUNCTION erp_annexe_visible(p_annexe_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN p_annexe_id IS NULL
      OR erp_can_view_all_annexes()
      OR p_annexe_id = erp_my_annexe();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: ranpli annexe_id otomatikman sou insert.
-- Lod priyorite: annex pasyan an (si gen patient_id) → annex moun
-- done a konsène (employe_id) → annex kreyatè a → annex prensipal.
CREATE OR REPLACE FUNCTION erp_set_row_annexe()
RETURNS TRIGGER AS $$
DECLARE
  v uuid;
BEGIN
  IF NEW.annexe_id IS NOT NULL THEN RETURN NEW; END IF;

  IF to_jsonb(NEW) ? 'patient_id'
     AND NULLIF(to_jsonb(NEW)->>'patient_id', '') IS NOT NULL THEN
    SELECT annexe_id INTO v FROM erp_patients
     WHERE id = (to_jsonb(NEW)->>'patient_id')::uuid;
    IF v IS NOT NULL THEN NEW.annexe_id := v; RETURN NEW; END IF;
  END IF;

  IF to_jsonb(NEW) ? 'employe_id'
     AND NULLIF(to_jsonb(NEW)->>'employe_id', '') IS NOT NULL THEN
    SELECT annexe_id INTO v FROM erp_users
     WHERE id = (to_jsonb(NEW)->>'employe_id')::uuid;
    IF v IS NOT NULL THEN NEW.annexe_id := v; RETURN NEW; END IF;
  END IF;

  SELECT annexe_id INTO v FROM erp_users
   WHERE id = COALESCE((to_jsonb(NEW)->>'created_by')::uuid, auth.uid());

  IF v IS NULL THEN
    SELECT id INTO v FROM erp_annexes
     WHERE is_active
     ORDER BY is_principale DESC, created_at
     LIMIT 1;
  END IF;

  NEW.annexe_id := v;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 3. annexe_id SOU TOUT TAB OPERASYONÈL YO + BACKFILL
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'erp_patients',            -- deja genyen (14) — IF NOT EXISTS
    'erp_rdv', 'erp_seances', 'erp_protheses', 'erp_ortheses',
    'erp_patient_reevaluations',
    'erp_clients', 'erp_client_suivi',
    'erp_revenus', 'erp_depenses', 'erp_caisse', 'erp_caisse_operations',
    'erp_produits', 'erp_stock_movements',
    'erp_taches',
    'erp_factures', 'erp_facturation_medical', 'erp_ordonnances',
    'erp_pharmacie', 'erp_fournisseurs', 'erp_agenda',
    'erp_annonces', 'erp_site_messages',
    'erp_presences', 'erp_conges', 'erp_performances',
    'erp_activites'
  ];
  v_principal uuid;
BEGIN
  SELECT id INTO v_principal FROM erp_annexes
   WHERE is_active
   ORDER BY is_principale DESC, created_at
   LIMIT 1;

  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS annexe_id uuid REFERENCES erp_annexes(id)', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(annexe_id)',
      'idx_' || replace(t, 'erp_', '') || '_annexe', t);

    -- Trigger ki ranpli annex la sou insert (pa sou tab ki gen
    -- lojik pwòp yo: erp_patients gen trg_patients_code deja)
    IF t <> 'erp_patients' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_annexe ON %I',
                     replace(t, 'erp_', ''), t);
      EXECUTE format(
        'CREATE TRIGGER trg_%s_annexe BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe()',
        replace(t, 'erp_', ''), t);
    END IF;
  END LOOP;

  -- Backfill: annex kreyatè a → annex pasyan an → annex prensipal
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;

    -- a) Tab ki gen patient_id: swiv annex pasyan an
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = t AND column_name = 'patient_id') THEN
      EXECUTE format(
        'UPDATE %I r SET annexe_id = p.annexe_id
           FROM erp_patients p
          WHERE r.patient_id = p.id AND r.annexe_id IS NULL
            AND p.annexe_id IS NOT NULL', t);
    END IF;

    -- b) Tab ki gen employe_id: swiv annex anplwaye a
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = t AND column_name = 'employe_id') THEN
      EXECUTE format(
        'UPDATE %I r SET annexe_id = u.annexe_id
           FROM erp_users u
          WHERE r.employe_id = u.id AND r.annexe_id IS NULL
            AND u.annexe_id IS NOT NULL', t);
    END IF;

    -- c) Tab ki gen created_by: swiv annex kreyatè a
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = t AND column_name = 'created_by') THEN
      EXECUTE format(
        'UPDATE %I r SET annexe_id = u.annexe_id
           FROM erp_users u
          WHERE r.created_by = u.id AND r.annexe_id IS NULL
            AND u.annexe_id IS NOT NULL', t);
    END IF;

    -- d) Rès yo → annex prensipal (pa NULL pou izolasyon nèt)
    IF v_principal IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET annexe_id = $1 WHERE annexe_id IS NULL', t)
        USING v_principal;
    END IF;
  END LOOP;
END $$;

-- erp_caisse: yon cais pa jou PA ANNEX (pa youn pa jou total)
ALTER TABLE erp_caisse
  DROP CONSTRAINT IF EXISTS erp_caisse_date_caisse_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_caisse_date_annexe
  ON erp_caisse (date_caisse, COALESCE(annexe_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Kolòn siplemantè
ALTER TABLE erp_caisse_operations
  ADD COLUMN IF NOT EXISTS mode_paiement text
  CHECK (mode_paiement IN ('cash','moncash','cheque','virement','autre'));
ALTER TABLE erp_caisse_operations
  ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE erp_stock_movements
  ADD COLUMN IF NOT EXISTS annexe_destination_id uuid REFERENCES erp_annexes(id);
ALTER TABLE erp_patients
  ADD COLUMN IF NOT EXISTS workflow_step text DEFAULT 'accueil'
  CHECK (workflow_step IN ('accueil','attente_evaluation','en_physio',
                           'en_atelier','a_encaisser','cloture'));
ALTER TABLE erp_annexes
  ADD COLUMN IF NOT EXISTS doc_seq int DEFAULT 0;   -- kontè reçu/fakti pa annex

-- ------------------------------------------------------------
-- 4. NOUVO TAB WORKFLOW
-- ------------------------------------------------------------
-- 4a. Evalyasyon medikal → oryantasyon (physio / atelier / suivi)
CREATE TABLE IF NOT EXISTS erp_evaluations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),
  patient_id uuid NOT NULL REFERENCES erp_patients(id) ON DELETE CASCADE,
  rdv_id uuid REFERENCES erp_rdv(id) ON DELETE SET NULL,
  medecin_id uuid REFERENCES erp_users(id),
  date_evaluation date NOT NULL DEFAULT CURRENT_DATE,
  motif text,
  rapport text,
  orientation text NOT NULL DEFAULT 'suivi'
    CHECK (orientation IN ('physio','atelier','suivi','aucune')),
  plan_traitement text,
  nb_seances_prevues int,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_evaluations_ts ON erp_evaluations;
CREATE TRIGGER trg_evaluations_ts BEFORE UPDATE ON erp_evaluations
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_evaluations_annexe ON erp_evaluations;
CREATE TRIGGER trg_evaluations_annexe BEFORE INSERT ON erp_evaluations
  FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe();

-- 4b. Lòd fabrikasyon atelye (fich teknik aparèy)
CREATE TABLE IF NOT EXISTS erp_atelier_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),
  numero text,
  patient_id uuid REFERENCES erp_patients(id) ON DELETE SET NULL,
  evaluation_id uuid REFERENCES erp_evaluations(id) ON DELETE SET NULL,
  type_appareil text NOT NULL DEFAULT 'orthese'
    CHECK (type_appareil IN ('prothese','orthese','support','autre')),
  description text,
  fiche_technique jsonb DEFAULT '{}',   -- mezi, materyo, detay
  priorite text DEFAULT 'normale'
    CHECK (priorite IN ('basse','normale','haute','urgente')),
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','en_cours','pret','livre','annule')),
  technicien_id uuid REFERENCES erp_users(id),
  date_commande date NOT NULL DEFAULT CURRENT_DATE,
  date_livraison_prevue date,
  date_livraison date,
  cout numeric DEFAULT 0,
  devise text DEFAULT 'HTG',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Nimewo lòd otomatik: CODEANNEX-AT-0001
CREATE OR REPLACE FUNCTION erp_atelier_assign_numero()
RETURNS TRIGGER AS $$
DECLARE v_prefix text; v_seq int;
BEGIN
  IF NEW.numero IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.annexe_id IS NOT NULL THEN
    UPDATE erp_annexes SET doc_seq = doc_seq + 1
     WHERE id = NEW.annexe_id
    RETURNING code, doc_seq INTO v_prefix, v_seq;
  ELSE
    v_prefix := 'AT'; v_seq := floor(random() * 9000 + 1000)::int;
  END IF;
  NEW.numero := v_prefix || '-AT-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atelier_ts ON erp_atelier_orders;
CREATE TRIGGER trg_atelier_ts BEFORE UPDATE ON erp_atelier_orders
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_atelier_annexe ON erp_atelier_orders;
CREATE TRIGGER trg_atelier_annexe BEFORE INSERT ON erp_atelier_orders
  FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe();
DROP TRIGGER IF EXISTS trg_atelier_numero ON erp_atelier_orders;
CREATE TRIGGER trg_atelier_numero BEFORE INSERT ON erp_atelier_orders
  FOR EACH ROW EXECUTE FUNCTION erp_atelier_assign_numero();

-- 4c. Ankesman / resi / devi / fakti proforma (caisse)
CREATE TABLE IF NOT EXISTS erp_encaissements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),
  numero text,
  patient_id uuid REFERENCES erp_patients(id) ON DELETE SET NULL,
  client_id uuid REFERENCES erp_clients(id) ON DELETE SET NULL,
  patient_nom text,
  type_document text NOT NULL DEFAULT 'recu'
    CHECK (type_document IN ('recu','devis','facture','proforma')),
  montant numeric NOT NULL DEFAULT 0,
  devise text DEFAULT 'HTG',
  mode_paiement text CHECK (mode_paiement IN ('cash','moncash','cheque','virement')),
  reference text,                       -- nº chèk, ref MonCash, elatriye
  motif text,                           -- konsiltasyon, seyans, aparèy, matyèl…
  statut text DEFAULT 'paye'
    CHECK (statut IN ('paye','en_attente','annule')),
  date_doc date NOT NULL DEFAULT CURRENT_DATE,
  caisse_id uuid REFERENCES erp_caisse(id) ON DELETE SET NULL,
  atelier_order_id uuid REFERENCES erp_atelier_orders(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Nimewo dokiman otomatik: CODEANNEX-<L>-0001 (R=reçu, D=devis, F=facture, P=proforma)
CREATE OR REPLACE FUNCTION erp_encaissement_assign_numero()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix text; v_seq int; v_letter text;
BEGIN
  IF NEW.numero IS NOT NULL THEN RETURN NEW; END IF;
  v_letter := CASE NEW.type_document
    WHEN 'devis' THEN 'D' WHEN 'facture' THEN 'F'
    WHEN 'proforma' THEN 'P' ELSE 'R' END;
  IF NEW.annexe_id IS NOT NULL THEN
    UPDATE erp_annexes SET doc_seq = doc_seq + 1
     WHERE id = NEW.annexe_id
    RETURNING code, doc_seq INTO v_prefix, v_seq;
  ELSE
    v_prefix := 'DOC'; v_seq := floor(random() * 9000 + 1000)::int;
  END IF;
  NEW.numero := v_prefix || '-' || v_letter || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_encaissements_annexe ON erp_encaissements;
CREATE TRIGGER trg_encaissements_annexe BEFORE INSERT ON erp_encaissements
  FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe();
DROP TRIGGER IF EXISTS trg_encaissements_numero ON erp_encaissements;
CREATE TRIGGER trg_encaissements_numero BEFORE INSERT ON erp_encaissements
  FOR EACH ROW EXECUTE FUNCTION erp_encaissement_assign_numero();

-- 4d. Sèvis kliyan — reklamasyon & satisfaksyon
CREATE TABLE IF NOT EXISTS erp_reclamations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),
  patient_id uuid REFERENCES erp_patients(id) ON DELETE SET NULL,
  patient_nom text,
  canal text DEFAULT 'accueil'
    CHECK (canal IN ('accueil','telephone','email','site','autre')),
  sujet text NOT NULL,
  description text,
  statut text DEFAULT 'ouverte'
    CHECK (statut IN ('ouverte','en_cours','resolue','fermee')),
  satisfaction int CHECK (satisfaction BETWEEN 1 AND 5),
  resolution text,
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_reclamations_ts ON erp_reclamations;
CREATE TRIGGER trg_reclamations_ts BEFORE UPDATE ON erp_reclamations
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_reclamations_annexe ON erp_reclamations;
CREATE TRIGGER trg_reclamations_annexe BEFORE INSERT ON erp_reclamations
  FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe();

-- 4e. Acha & aprovizyònman — bon kòmand founisè
CREATE TABLE IF NOT EXISTS erp_bons_commande (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),
  numero text,
  fournisseur_id uuid REFERENCES erp_fournisseurs(id) ON DELETE SET NULL,
  fournisseur_nom text,
  date_commande date NOT NULL DEFAULT CURRENT_DATE,
  statut text DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon','envoye','partiel','recu','annule')),
  items jsonb DEFAULT '[]',             -- [{designation, quantite, prix_unitaire, produit_id?}]
  total numeric DEFAULT 0,
  notes text,
  recu_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION erp_bc_assign_numero()
RETURNS TRIGGER AS $$
DECLARE v_prefix text; v_seq int;
BEGIN
  IF NEW.numero IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.annexe_id IS NOT NULL THEN
    UPDATE erp_annexes SET doc_seq = doc_seq + 1
     WHERE id = NEW.annexe_id
    RETURNING code, doc_seq INTO v_prefix, v_seq;
  ELSE
    v_prefix := 'BC'; v_seq := floor(random() * 9000 + 1000)::int;
  END IF;
  NEW.numero := v_prefix || '-BC-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bc_ts ON erp_bons_commande;
CREATE TRIGGER trg_bc_ts BEFORE UPDATE ON erp_bons_commande
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_bc_annexe ON erp_bons_commande;
CREATE TRIGGER trg_bc_annexe BEFORE INSERT ON erp_bons_commande
  FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe();
DROP TRIGGER IF EXISTS trg_bc_numero ON erp_bons_commande;
CREATE TRIGGER trg_bc_numero BEFORE INSERT ON erp_bons_commande
  FOR EACH ROW EXECUTE FUNCTION erp_bc_assign_numero();

-- 4f. Rapò manyèl voye bay direksyon
CREATE TABLE IF NOT EXISTS erp_rapports_mensuels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  annexe_id uuid REFERENCES erp_annexes(id),
  module text NOT NULL,                 -- secretariat, comptabilite, stock, clinique, atelier…
  periode text NOT NULL,                -- 'YYYY-MM'
  titre text NOT NULL,
  data jsonb DEFAULT '{}',              -- rezime + liy rapò a
  sent_by uuid REFERENCES erp_users(id),
  sent_by_nom text,
  sent_at timestamptz DEFAULT now(),
  is_consolide boolean DEFAULT false,   -- rapò konsolidasyon direksyon
  created_at timestamptz DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_rappmens_annexe ON erp_rapports_mensuels;
CREATE TRIGGER trg_rappmens_annexe BEFORE INSERT ON erp_rapports_mensuels
  FOR EACH ROW EXECUTE FUNCTION erp_set_row_annexe();

-- 4g. JONAL ODIT (audit trail)
CREATE TABLE IF NOT EXISTS erp_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  annexe_id uuid REFERENCES erp_annexes(id),
  user_id uuid,
  user_nom text,
  action text NOT NULL,                 -- INSERT | UPDATE | DELETE
  table_name text NOT NULL,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON erp_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table ON erp_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_annexe ON erp_audit_log(annexe_id);

CREATE OR REPLACE FUNCTION erp_audit_row()
RETURNS TRIGGER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rec uuid;
  v_annexe uuid;
  v_nom text;
BEGIN
  v_rec := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'id')::uuid END,
    CASE WHEN TG_OP <> 'DELETE' THEN (to_jsonb(NEW)->>'id')::uuid END
  );
  v_annexe := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'annexe_id')::uuid END,
    CASE WHEN TG_OP <> 'DELETE' THEN (to_jsonb(NEW)->>'annexe_id')::uuid END,
    (SELECT annexe_id FROM erp_users WHERE id = v_user)
  );
  SELECT trim(first_name || ' ' || coalesce(last_name,'')) INTO v_nom
    FROM erp_users WHERE id = v_user;

  INSERT INTO erp_audit_log (user_id, user_nom, action, table_name,
                             record_id, old_data, new_data, annexe_id)
  VALUES (v_user, v_nom, TG_OP, TG_TABLE_NAME, v_rec,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
          v_annexe);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit trigger sou tab kritik yo
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'erp_patients','erp_rdv','erp_seances','erp_evaluations',
    'erp_atelier_orders','erp_encaissements','erp_revenus','erp_depenses',
    'erp_caisse','erp_caisse_operations','erp_produits','erp_stock_movements',
    'erp_factures','erp_facturation_medical','erp_bons_commande',
    'erp_reclamations','erp_users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_audit ON %I',
                   replace(t, 'erp_', ''), t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION erp_audit_row()',
      replace(t, 'erp_', ''), t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5. RLS — IZOLASYON PA ANNEX (sekirite multi-tenant)
--    Chak policy = wòl ki otorize AND erp_annexe_visible(annexe_id)
--    Direksyon + enfòmatisyen: erp_can_view_all_annexes → wè tout.
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'erp_evaluations','erp_atelier_orders','erp_encaissements',
    'erp_reclamations','erp_bons_commande','erp_rapports_mensuels',
    'erp_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ===== Pasyan =====
DROP POLICY IF EXISTS "patients_select" ON erp_patients;
CREATE POLICY "patients_select" ON erp_patients FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    praticien_id = auth.uid() OR created_by = auth.uid() OR user_id = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute','ouvrier',
                          'comptable','rh','employe','informaticien']))
);
DROP POLICY IF EXISTS "patients_insert" ON erp_patients;
CREATE POLICY "patients_insert" ON erp_patients FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute','employe'])
);
DROP POLICY IF EXISTS "patients_update" ON erp_patients;
CREATE POLICY "patients_update" ON erp_patients FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    praticien_id = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute']))
);
DROP POLICY IF EXISTS "patients_delete" ON erp_patients;
CREATE POLICY "patients_delete" ON erp_patients FOR DELETE USING (erp_is_pdg());

-- ===== Randevou =====
DROP POLICY IF EXISTS "rdv_staff" ON erp_rdv;
CREATE POLICY "rdv_staff" ON erp_rdv FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    praticien_id = auth.uid() OR created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute','comptable',
                          'employe','informaticien']))
);
DROP POLICY IF EXISTS "rdv_staff_update" ON erp_rdv;
CREATE POLICY "rdv_staff_update" ON erp_rdv FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    praticien_id = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin']))
);
DROP POLICY IF EXISTS "rdv_staff_insert" ON erp_rdv;
CREATE POLICY "rdv_staff_insert" ON erp_rdv FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute','employe'])
);
-- (rdv_public_insert rete — rezèvasyon sou sit piblik la)

-- ===== Seyans =====
DROP POLICY IF EXISTS "seances_select" ON erp_seances;
CREATE POLICY "seances_select" ON erp_seances FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    praticien_id = auth.uid() OR created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute','employe',
                          'informaticien']))
);
DROP POLICY IF EXISTS "seances_insert" ON erp_seances;
CREATE POLICY "seances_insert" ON erp_seances FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute','employe'])
);
DROP POLICY IF EXISTS "seances_update" ON erp_seances;
CREATE POLICY "seances_update" ON erp_seances FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    praticien_id = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','physiotherapeute']))
);
DROP POLICY IF EXISTS "seances_delete" ON erp_seances;
CREATE POLICY "seances_delete" ON erp_seances FOR DELETE USING (erp_is_pdg());

-- ===== Protèz / Otèz =====
DROP POLICY IF EXISTS "protheses_select" ON erp_protheses;
CREATE POLICY "protheses_select" ON erp_protheses FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute','ouvrier',
                          'employe','informaticien']))
);
DROP POLICY IF EXISTS "protheses_write" ON erp_protheses;
CREATE POLICY "protheses_write" ON erp_protheses FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'medecin','physiotherapeute','ouvrier','employe'])
);
DROP POLICY IF EXISTS "protheses_update" ON erp_protheses;
CREATE POLICY "protheses_update" ON erp_protheses FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'medecin','physiotherapeute','ouvrier','employe']))
);
DROP POLICY IF EXISTS "protheses_delete" ON erp_protheses;
CREATE POLICY "protheses_delete" ON erp_protheses FOR DELETE USING (erp_is_pdg());

DROP POLICY IF EXISTS "ortheses_select" ON erp_ortheses;
CREATE POLICY "ortheses_select" ON erp_ortheses FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute','ouvrier',
                          'employe','informaticien']))
);
DROP POLICY IF EXISTS "ortheses_write" ON erp_ortheses;
CREATE POLICY "ortheses_write" ON erp_ortheses FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'medecin','physiotherapeute','ouvrier','employe'])
);
DROP POLICY IF EXISTS "ortheses_update" ON erp_ortheses;
CREATE POLICY "ortheses_update" ON erp_ortheses FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'medecin','physiotherapeute','ouvrier','employe']))
);
DROP POLICY IF EXISTS "ortheses_delete" ON erp_ortheses;
CREATE POLICY "ortheses_delete" ON erp_ortheses FOR DELETE USING (erp_is_pdg());

-- ===== Reevalidasyon =====
DROP POLICY IF EXISTS "reeval_select" ON erp_patient_reevaluations;
CREATE POLICY "reeval_select" ON erp_patient_reevaluations FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute','employe',
                          'comptable','rh','informaticien']))
);
DROP POLICY IF EXISTS "reeval_insert" ON erp_patient_reevaluations;
CREATE POLICY "reeval_insert" ON erp_patient_reevaluations FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste','medecin','physiotherapeute','employe'])
);
DROP POLICY IF EXISTS "reeval_update" ON erp_patient_reevaluations;
CREATE POLICY "reeval_update" ON erp_patient_reevaluations FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','medecin','physiotherapeute']))
);
DROP POLICY IF EXISTS "reeval_delete" ON erp_patient_reevaluations;
CREATE POLICY "reeval_delete" ON erp_patient_reevaluations FOR DELETE USING (erp_is_pdg());

-- ===== Evalyasyon medikal =====
DROP POLICY IF EXISTS "evaluations_select" ON erp_evaluations;
CREATE POLICY "evaluations_select" ON erp_evaluations FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    medecin_id = auth.uid() OR created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'medecin','physiotherapeute','informaticien']))
);
DROP POLICY IF EXISTS "evaluations_insert" ON erp_evaluations;
CREATE POLICY "evaluations_insert" ON erp_evaluations FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','medecin',
                         'physiotherapeute'])
);
DROP POLICY IF EXISTS "evaluations_update" ON erp_evaluations;
CREATE POLICY "evaluations_update" ON erp_evaluations FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    medecin_id = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','medecin']))
);
DROP POLICY IF EXISTS "evaluations_delete" ON erp_evaluations;
CREATE POLICY "evaluations_delete" ON erp_evaluations FOR DELETE USING (erp_is_pdg());

-- ===== Atelye (lòd fabrikasyon) =====
DROP POLICY IF EXISTS "atelier_select" ON erp_atelier_orders;
CREATE POLICY "atelier_select" ON erp_atelier_orders FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    technicien_id = auth.uid() OR created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','ouvrier',
                          'medecin','secretaire','receptionniste','comptable',
                          'informaticien']))
);
DROP POLICY IF EXISTS "atelier_insert" ON erp_atelier_orders;
CREATE POLICY "atelier_insert" ON erp_atelier_orders FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','medecin',
                         'ouvrier','secretaire'])
);
DROP POLICY IF EXISTS "atelier_update" ON erp_atelier_orders;
CREATE POLICY "atelier_update" ON erp_atelier_orders FOR UPDATE USING (
  erp_annexe_visible(annexe_id) AND (
    technicien_id = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','ouvrier']))
);
DROP POLICY IF EXISTS "atelier_delete" ON erp_atelier_orders;
CREATE POLICY "atelier_delete" ON erp_atelier_orders FOR DELETE USING (erp_is_pdg());

-- ===== Ankesman (caisse) =====
DROP POLICY IF EXISTS "encaissements_select" ON erp_encaissements;
CREATE POLICY "encaissements_select" ON erp_encaissements FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','comptable',
                          'secretaire','informaticien']))
);
DROP POLICY IF EXISTS "encaissements_insert" ON erp_encaissements;
CREATE POLICY "encaissements_insert" ON erp_encaissements FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','comptable',
                         'secretaire','receptionniste'])
);
DROP POLICY IF EXISTS "encaissements_update" ON erp_encaissements;
CREATE POLICY "encaissements_update" ON erp_encaissements FOR UPDATE USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','comptable'])
);
DROP POLICY IF EXISTS "encaissements_delete" ON erp_encaissements;
CREATE POLICY "encaissements_delete" ON erp_encaissements FOR DELETE USING (erp_is_pdg());

-- ===== Reklamasyon / sèvis kliyan =====
DROP POLICY IF EXISTS "reclamations_select" ON erp_reclamations;
CREATE POLICY "reclamations_select" ON erp_reclamations FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                          'receptionniste','informaticien']))
);
DROP POLICY IF EXISTS "reclamations_write" ON erp_reclamations;
CREATE POLICY "reclamations_write" ON erp_reclamations FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste'])
);
DROP POLICY IF EXISTS "reclamations_update" ON erp_reclamations;
CREATE POLICY "reclamations_update" ON erp_reclamations FOR UPDATE USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                         'receptionniste'])
);
DROP POLICY IF EXISTS "reclamations_delete" ON erp_reclamations;
CREATE POLICY "reclamations_delete" ON erp_reclamations FOR DELETE USING (erp_is_pdg());

-- ===== Bon kòmand (acha) =====
DROP POLICY IF EXISTS "bc_select" ON erp_bons_commande;
CREATE POLICY "bc_select" ON erp_bons_commande FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                          'responsable_stock','comptable','informaticien']))
);
DROP POLICY IF EXISTS "bc_write" ON erp_bons_commande;
CREATE POLICY "bc_write" ON erp_bons_commande FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','responsable_stock'])
);
DROP POLICY IF EXISTS "bc_update" ON erp_bons_commande;
CREATE POLICY "bc_update" ON erp_bons_commande FOR UPDATE USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','responsable_stock'])
);
DROP POLICY IF EXISTS "bc_delete" ON erp_bons_commande;
CREATE POLICY "bc_delete" ON erp_bons_commande FOR DELETE USING (erp_is_pdg());

-- ===== Rapò manyèl =====
DROP POLICY IF EXISTS "rappmens_select" ON erp_rapports_mensuels;
CREATE POLICY "rappmens_select" ON erp_rapports_mensuels FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    sent_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','informaticien']))
);
DROP POLICY IF EXISTS "rappmens_insert" ON erp_rapports_mensuels;
CREATE POLICY "rappmens_insert" ON erp_rapports_mensuels FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id) AND auth.uid() IS NOT NULL
);
DROP POLICY IF EXISTS "rappmens_delete" ON erp_rapports_mensuels;
CREATE POLICY "rappmens_delete" ON erp_rapports_mensuels FOR DELETE USING (erp_is_pdg());

-- ===== Jonal odit — direksyon + admin sèlman =====
DROP POLICY IF EXISTS "audit_select" ON erp_audit_log;
CREATE POLICY "audit_select" ON erp_audit_log FOR SELECT USING (
  erp_can_view_all_annexes() OR erp_is_direction()
);
-- Insert fèt pa trigger la (SECURITY DEFINER) — pa gen policy insert piblik.

-- ===== Finans ki te egziste deja: mete filtè annex =====
DROP POLICY IF EXISTS "erp_revenus_manage" ON erp_revenus;
CREATE POLICY "erp_revenus_manage" ON erp_revenus FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']));
DROP POLICY IF EXISTS "erp_revenus_read" ON erp_revenus;
CREATE POLICY "erp_revenus_read" ON erp_revenus FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['manager','informaticien','secretaire']));

DROP POLICY IF EXISTS "erp_depenses_manage" ON erp_depenses;
CREATE POLICY "erp_depenses_manage" ON erp_depenses FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']));
DROP POLICY IF EXISTS "erp_depenses_read" ON erp_depenses;
CREATE POLICY "erp_depenses_read" ON erp_depenses FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['manager','informaticien']));

DROP POLICY IF EXISTS "erp_caisse_manage" ON erp_caisse;
CREATE POLICY "erp_caisse_manage" ON erp_caisse FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']));
DROP POLICY IF EXISTS "erp_caisse_read" ON erp_caisse;
CREATE POLICY "erp_caisse_read" ON erp_caisse FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['manager','informaticien']));

DROP POLICY IF EXISTS "erp_caisse_ops_manage" ON erp_caisse_operations;
CREATE POLICY "erp_caisse_ops_manage" ON erp_caisse_operations FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','comptable']));
DROP POLICY IF EXISTS "erp_caisse_ops_read" ON erp_caisse_operations;
CREATE POLICY "erp_caisse_ops_read" ON erp_caisse_operations FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['manager','informaticien']));

-- ===== Stock =====
DROP POLICY IF EXISTS "erp_produits_manage" ON erp_produits;
CREATE POLICY "erp_produits_manage" ON erp_produits FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock']));
DROP POLICY IF EXISTS "erp_produits_read" ON erp_produits;
CREATE POLICY "erp_produits_read" ON erp_produits FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock',
                                'commercial','secretaire','receptionniste','manager',
                                'ouvrier','informaticien','comptable']));

DROP POLICY IF EXISTS "erp_movements_manage" ON erp_stock_movements;
CREATE POLICY "erp_movements_manage" ON erp_stock_movements FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock']));
-- Tout staff ka anrejistre yon prélèvement/consommation (motif obligatwa)
DROP POLICY IF EXISTS "erp_movements_insert" ON erp_stock_movements;
CREATE POLICY "erp_movements_insert" ON erp_stock_movements FOR INSERT
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock',
                                'commercial','secretaire','receptionniste','manager',
                                'ouvrier','informaticien','comptable','medecin',
                                'physiotherapeute','rh','employe']));
DROP POLICY IF EXISTS "erp_movements_read" ON erp_stock_movements;
CREATE POLICY "erp_movements_read" ON erp_stock_movements FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','responsable_stock',
                                'commercial','manager','informaticien','ouvrier']));

-- ===== Kliyan =====
DROP POLICY IF EXISTS "erp_clients_manage" ON erp_clients;
CREATE POLICY "erp_clients_manage" ON erp_clients FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','secretaire',
                                'receptionniste','commercial','comptable','manager']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','secretaire',
                                'receptionniste','commercial','comptable','manager']));
DROP POLICY IF EXISTS "erp_clients_read" ON erp_clients;
CREATE POLICY "erp_clients_read" ON erp_clients FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['informaticien','rh','employe']));

DROP POLICY IF EXISTS "erp_suivi_manage" ON erp_client_suivi;
CREATE POLICY "erp_suivi_manage" ON erp_client_suivi FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','secretaire',
                                'receptionniste','commercial','manager']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','secretaire',
                                'receptionniste','commercial','manager']));

-- ===== Tach =====
DROP POLICY IF EXISTS "erp_taches_pdg" ON erp_taches;
CREATE POLICY "erp_taches_pdg" ON erp_taches FOR ALL
  USING (erp_can_view_all_annexes() OR erp_has_role(ARRAY['manager']))
  WITH CHECK (erp_can_view_all_annexes() OR erp_has_role(ARRAY['manager']));
DROP POLICY IF EXISTS "erp_taches_own" ON erp_taches;
CREATE POLICY "erp_taches_own" ON erp_taches FOR SELECT
  USING (erp_annexe_visible(annexe_id)
         AND (assigne_a = auth.uid() OR assigne_par = auth.uid()));
DROP POLICY IF EXISTS "erp_taches_create" ON erp_taches;
CREATE POLICY "erp_taches_create" ON erp_taches FOR INSERT
  WITH CHECK (erp_annexe_visible(annexe_id) AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_taches_update_own" ON erp_taches;
CREATE POLICY "erp_taches_update_own" ON erp_taches FOR UPDATE
  USING (erp_annexe_visible(annexe_id)
         AND (assigne_a = auth.uid() OR assigne_par = auth.uid()
              OR erp_can_view_all_annexes()));

-- ===== Tab jenerik 13 (fakti, founisè, elatriye) =====
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['erp_pharmacie','erp_fournisseurs','erp_factures',
                         'erp_facturation_medical','erp_ordonnances','erp_agenda'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format($p$CREATE POLICY "%s_select" ON %I FOR SELECT USING (
      erp_annexe_visible(annexe_id) AND (
        created_by = auth.uid()
        OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                              'receptionniste','comptable','responsable_stock',
                              'commercial','rh','employe','medecin',
                              'physiotherapeute','informaticien']))
    )$p$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
    EXECUTE format($p$CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (
      erp_annexe_visible(annexe_id)
      AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                             'receptionniste','comptable','responsable_stock',
                             'commercial','employe','medecin','physiotherapeute'])
    )$p$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
    EXECUTE format($p$CREATE POLICY "%s_update" ON %I FOR UPDATE USING (
      erp_annexe_visible(annexe_id) AND (
        created_by = auth.uid()
        OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire',
                              'comptable','responsable_stock','medecin']))
    )$p$, t, t);
  END LOOP;
END $$;

-- ===== RH =====
DROP POLICY IF EXISTS "erp_presences_manage" ON erp_presences;
CREATE POLICY "erp_presences_manage" ON erp_presences FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','rh','manager']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','rh','manager']));

DROP POLICY IF EXISTS "erp_conges_manage" ON erp_conges;
CREATE POLICY "erp_conges_manage" ON erp_conges FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','rh','manager']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','rh','manager']));

DROP POLICY IF EXISTS "erp_perf_manage" ON erp_performances;
CREATE POLICY "erp_perf_manage" ON erp_performances FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','rh','manager']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','rh','manager']));

-- ===== Itilizatè: staff wè kolèg menm annex + direksyon =====
DROP POLICY IF EXISTS "erp_users_own" ON erp_users;
CREATE POLICY "erp_users_own" ON erp_users FOR SELECT
  USING (id = auth.uid()
         OR erp_can_view_all_annexes()
         OR (is_active = true AND (
              annexe_id = erp_my_annexe()
              OR annexe_id IS NULL
              OR role IN ('pdg','directrice','directeur'))));

-- ===== Aktivite (journal kote chak moun wè sa li fè) =====
ALTER TABLE erp_activites ADD COLUMN IF NOT EXISTS annexe_id uuid REFERENCES erp_annexes(id);

-- ===== Anons & mesaj sit (piblik pa chanje — staff jere pa annex) =====
DROP POLICY IF EXISTS "annonces_staff" ON erp_annonces;
CREATE POLICY "annonces_staff" ON erp_annonces FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                                'secretaire','receptionniste','informaticien']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                                'secretaire','receptionniste','informaticien']));
DROP POLICY IF EXISTS "site_messages_staff" ON erp_site_messages;
CREATE POLICY "site_messages_staff" ON erp_site_messages FOR ALL
  USING (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                                'secretaire','receptionniste','informaticien']))
  WITH CHECK (erp_annexe_visible(annexe_id)
         AND erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                                'secretaire','receptionniste','informaticien']));

-- ------------------------------------------------------------
-- 6. RPC — VALIDASYON WÒL METE AJOU (nouvo wòl yo)
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
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur/Admin can create staff';
  END IF;

  IF p_role NOT IN ('pdg','directrice','directeur','manager','secretaire',
                    'comptable','responsable_stock','commercial','rh','employe',
                    'receptionniste','chauffeur',
                    'medecin','physiotherapeute','ouvrier','informaticien') THEN
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
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur/Admin can assign roles';
  END IF;

  IF p_role NOT IN ('pdg','directrice','directeur','manager','secretaire',
                    'comptable','responsable_stock','commercial','rh','employe',
                    'receptionniste','chauffeur',
                    'medecin','physiotherapeute','ouvrier','informaticien') THEN
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
-- 7. RPC — RAPÒ MANYÈL → DIREKSYON
--    Anrejistre rapò a epi kreye yon notifikasyon pou chak manm
--    direksyon an (tablo de bòd PDG/DG). Voye imel la mande yon
--    Edge Function/SMTP — dokiman PDF a rete disponib nan rapò a.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_send_monthly_report(
  p_module text,
  p_periode text,
  p_titre text,
  p_data jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_nom text;
  v_annexe uuid;
  v_annexe_nom text;
  r record;
BEGIN
  SELECT trim(first_name || ' ' || coalesce(last_name,'')), annexe_id
    INTO v_nom, v_annexe
    FROM erp_users WHERE id = auth.uid();
  SELECT nom INTO v_annexe_nom FROM erp_annexes WHERE id = v_annexe;

  INSERT INTO erp_rapports_mensuels (annexe_id, module, periode, titre,
                                   data, sent_by, sent_by_nom)
  VALUES (v_annexe, p_module, p_periode, p_titre, p_data, auth.uid(), v_nom)
  RETURNING id INTO v_id;

  -- Notifie tout direksyon an
  FOR r IN
    SELECT id FROM erp_users
     WHERE is_active AND role IN ('pdg','directrice','directeur')
  LOOP
    INSERT INTO erp_notifications (user_id, titre, message, type, link)
    VALUES (r.id,
            'Rapport mensuel — ' || coalesce(v_annexe_nom,'Annexe'),
            v_nom || ' a envoyé le rapport "' || p_titre || '" (' || p_periode || ').',
            'info',
            '/module.html?m=rapports_mensuels');
  END LOOP;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 8. RPC — TRANSFÈ STOCK ANT ANNEX
--    Sòti nan annex sous la → antre nan annex destinasyon an.
--    Si pwodwi a pa egziste nan destinasyon an, li kreye (menm kòd).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_transfer_stock(
  p_produit_id uuid,
  p_quantite numeric,
  p_dest_annexe_id uuid,
  p_motif text DEFAULT 'Transfert entre annexes'
)
RETURNS jsonb AS $$
DECLARE
  v_src erp_produits;
  v_dest_id uuid;
  v_my_annexe uuid;
BEGIN
  IF NOT erp_has_role(ARRAY['pdg','directrice','directeur','manager',
                            'responsable_stock']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_my_annexe := erp_my_annexe();

  SELECT * INTO v_src FROM erp_produits WHERE id = p_produit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
  IF v_src.annexe_id IS DISTINCT FROM v_my_annexe
     AND NOT erp_can_view_all_annexes() THEN
    RAISE EXCEPTION 'Ce produit appartient à une autre annexe';
  END IF;
  IF p_dest_annexe_id IS NULL OR p_dest_annexe_id = v_src.annexe_id THEN
    RAISE EXCEPTION 'Annexe de destination invalide';
  END IF;
  IF COALESCE(v_src.quantite, 0) < p_quantite THEN
    RAISE EXCEPTION 'Stock insuffisant (disponible: %)', v_src.quantite;
  END IF;

  -- Mouvman sòti (trigger update_stock_on_movement mete kantite ajou)
  INSERT INTO erp_stock_movements
    (produit_id, type, quantite, prix_unitaire, motif, reference,
     annexe_id, annexe_destination_id, notes, created_by)
  VALUES
    (p_produit_id, 'sortie', p_quantite, v_src.prix_achat, p_motif,
     'TRANSFERT', v_src.annexe_id, p_dest_annexe_id,
     'Transfert sortant vers annexe', auth.uid());

  -- Jwenn oswa kreye pwodwi a nan annex destinasyon an (matche sou kòd)
  SELECT id INTO v_dest_id FROM erp_produits
   WHERE annexe_id = p_dest_annexe_id
     AND code IS NOT NULL AND code = v_src.code
   LIMIT 1;

  IF v_dest_id IS NULL THEN
    INSERT INTO erp_produits
      (code, designation, categorie, fournisseur, quantite, quantite_min,
       prix_achat, prix_vente, unite, description, image_url, is_active,
       annexe_id, created_by)
    VALUES
      (v_src.code || '-' || (SELECT code FROM erp_annexes WHERE id = p_dest_annexe_id),
       v_src.designation, v_src.categorie, v_src.fournisseur, 0,
       v_src.quantite_min, v_src.prix_achat, v_src.prix_vente, v_src.unite,
       v_src.description, v_src.image_url, true, p_dest_annexe_id, auth.uid())
    RETURNING id INTO v_dest_id;
  END IF;

  INSERT INTO erp_stock_movements
    (produit_id, type, quantite, prix_unitaire, motif, reference,
     annexe_id, notes, created_by)
  VALUES
    (v_dest_id, 'entree', p_quantite, v_src.prix_achat, p_motif,
     'TRANSFERT', p_dest_annexe_id,
     'Transfert entrant depuis annexe', auth.uid());

  RETURN jsonb_build_object('ok', true, 'dest_produit_id', v_dest_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 9. SEED — ANNEX PAP + LEO, POSTE, MODIL
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eid uuid;
BEGIN
  SELECT id INTO v_eid FROM erp_enterprise_registrations
   WHERE lower(company_email) = 'haitirecareerp@gmail.com'
   LIMIT 1;

  IF v_eid IS NOT NULL THEN
    -- Annexe Port-au-Prince (prensipal)
    INSERT INTO erp_annexes (enterprise_id, code, nom, ville, is_principale, is_active)
    SELECT v_eid, 'PAP', 'Annexe Port-au-Prince', 'Port-au-Prince', true, true
    WHERE NOT EXISTS (
      SELECT 1 FROM erp_annexes WHERE enterprise_id = v_eid AND code = 'PAP');

    -- Annexe Léogâne
    INSERT INTO erp_annexes (enterprise_id, code, nom, ville, is_principale, is_active)
    SELECT v_eid, 'LEO', 'Annexe Léogâne', 'Léogâne', false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM erp_annexes WHERE enterprise_id = v_eid AND code = 'LEO');

    -- Make sèlman PAP se prensipal
    UPDATE erp_annexes SET is_principale = (code = 'PAP')
     WHERE enterprise_id = v_eid;

    -- Li ki te 'PRN' (syèj jenerik) → fason li rete men dezaktive si PAP egziste
    UPDATE erp_annexes SET is_active = false, is_principale = false
     WHERE enterprise_id = v_eid AND code = 'PRN'
       AND EXISTS (SELECT 1 FROM erp_annexes WHERE enterprise_id = v_eid AND code = 'PAP')
       AND NOT EXISTS (SELECT 1 FROM erp_users u WHERE u.annexe_id = erp_annexes.id)
       AND NOT EXISTS (SELECT 1 FROM erp_patients p WHERE p.annexe_id = erp_annexes.id);
  END IF;
END $$;

-- Poste ki koresponn ak nouvo wòl yo
INSERT INTO erp_postes (name, department, description, permissions)
SELECT v.name, v.department, v.description, v.permissions::jsonb
FROM (VALUES
  ('Informaticien / Admin', 'Système',
   'Administration technique, utilisateurs, droits et journaux d''audit',
   '{"all": true}'),
  ('Médecin', 'Médical',
   'Consultations, évaluations cliniques et orientation des patients',
   '{"patients":true,"rdv":true,"consultations":true,"evaluations":true,"seances":true,"ordonnances":true,"protheses":true,"ortheses":true,"atelier":true,"rapports":true,"messages":true,"agenda":true}'),
  ('Physiothérapeute', 'Clinique',
   'File de soins, séances de physiothérapie et notes d''évolution',
   '{"patients":true,"rdv":true,"seances":true,"physio":true,"services":true,"taches":true,"rapports":true,"messages":true}'),
  ('Technicien Atelier', 'Atelier',
   'Fiches techniques, fabrication des appareillages et statuts de commande',
   '{"atelier":true,"protheses":true,"ortheses":true,"stock_read":true,"patients":true,"taches":true,"rapports":true,"messages":true}'),
  ('Caissier / Comptable', 'Finances',
   'Encaissements, caisse, devis, factures proforma et clôtures',
   '{"caisse":true,"encaissements":true,"finances":true,"factures":true,"facturation":true,"clients":true,"patients":true,"services":true,"rapports":true,"rapports_mensuels":true,"messages":true}'),
  ('Secrétaire / Réceptionniste', 'Accueil',
   'Accueil, dossiers patients, carnet de rendez-vous et service client',
   '{"patients":true,"clients":true,"rdv":true,"seances":true,"agenda":true,"service_client":true,"taches":true,"rapports":true,"rapports_mensuels":true,"messages":true}'),
  ('Gestionnaire Stock & Achats', 'Logistique',
   'Inventaire, mouvements de stock, fournisseurs et bons de commande',
   '{"stock":true,"fournisseurs":true,"achats":true,"materiel_orthopedique":true,"ventes":true,"rapports":true,"rapports_mensuels":true,"messages":true}')
) AS v(name, department, description, permissions)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_postes p WHERE p.name = v.name
);

-- Mete ajou poste ki deja egziste yo ak nouvo modil yo
UPDATE erp_postes SET permissions = permissions || '{"achats":true,"rapports_mensuels":true}'::jsonb
 WHERE name IN ('Responsable Stock', 'Responsable Magasin');
UPDATE erp_postes SET permissions = permissions || '{"encaissements":true,"rapports_mensuels":true}'::jsonb
 WHERE name IN ('Comptable', 'Caissier');
UPDATE erp_postes SET permissions = permissions || '{"service_client":true,"rapports_mensuels":true,"patients":true,"rdv":true}'::jsonb
 WHERE name IN ('Secrétaire', 'Réceptionniste');

-- Modil yo (pou module.html + sidebar)
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
('consultations',    'Consultations & Évaluations', 'Clinique',
 'File d''attente du médecin, rapports d''évaluation et orientation des patients', 'stethoscope', '{"view": true, "create": true, "edit": true}'),
('atelier',          'Atelier — Fabrication',       'Clinique',
 'Fiches techniques et ordres de fabrication (prothèses, orthèses, supports)', 'hammer', '{"view": true, "create": true, "edit": true}'),
('encaissements',    'Encaissements',               'Gestion',
 'Encaissements, reçus, devis et factures proforma — modes de paiement', 'banknote', '{"view": true, "create": true}'),
('service_client',   'Service Client & Suivi',      'Communication',
 'Réclamations, enquêtes de satisfaction et relances patients', 'heart-handshake', '{"view": true, "create": true, "edit": true}'),
('achats',           'Achats & Fournisseurs',       'Gestion',
 'Bons de commande fournisseurs et réceptions', 'shopping-basket', '{"view": true, "create": true, "edit": true}'),
('rapports_mensuels','Rapports Mensuels',           'Rapports',
 'Rapport mensuel par poste — export PDF/Excel et envoi à la Direction', 'file-bar-chart', '{"view": true, "export": true}'),
('audit',            'Journal d''audit',            'Administration',
 'Traçabilité des actions critiques (créations, modifications, suppressions)', 'shield-check', '{"view": true}')
ON CONFLICT (code) DO NOTHING;

-- Ajoute nouvo modil yo nan tip antrepriz physiotherapy
UPDATE erp_enterprise_types
SET features = jsonb_set(
  features, '{modules}',
  COALESCE(features->'modules', '[]'::jsonb)
    || '["consultations","atelier","encaissements","service_client","achats","rapports_mensuels","audit"]'::jsonb)
WHERE code = 'physiotherapy'
  AND NOT (features->'modules' ? 'consultations');

-- Retire doublon nan lis modil yo si yo te deja la
UPDATE erp_enterprise_types t
SET features = jsonb_set(features, '{modules}', (
  SELECT jsonb_agg(DISTINCT m) FROM jsonb_array_elements_text(features->'modules') m))
WHERE code = 'physiotherapy';

-- ------------------------------------------------------------
-- 10. PÈMISYON
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION erp_send_monthly_report(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_transfer_stock(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_register_staff(uuid, text, text, text, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_assign_role_to_user(text, text, text, text, uuid) TO authenticated;
