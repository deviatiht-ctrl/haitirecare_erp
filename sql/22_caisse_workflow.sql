-- ==============================================================
-- 22_caisse_workflow.sql
-- Politik RLS ak akse pou workflow kès / kontabilite:
-- - Receptionis ka kreye demann ankesman (konsiltasyon oswa acha)
-- - Kontab ak direksyon ka wè, valide epi modifye ankesman yo
-- ==============================================================

-- 1. encaissements_select: mete receptionniste ladan l pou l ka wè sa li voye nan kès
DROP POLICY IF EXISTS "encaissements_select" ON erp_encaissements;
CREATE POLICY "encaissements_select" ON erp_encaissements FOR SELECT USING (
  erp_annexe_visible(annexe_id) AND (
    created_by = auth.uid()
    OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','comptable',
                          'secretaire','receptionniste','informaticien']))
);

-- 2. encaissements_insert: pemet receptionniste, secretaire, comptable, direction
DROP POLICY IF EXISTS "encaissements_insert" ON erp_encaissements;
CREATE POLICY "encaissements_insert" ON erp_encaissements FOR INSERT WITH CHECK (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','comptable',
                         'secretaire','receptionniste'])
);

-- 3. encaissements_update: kontab, manager ak direksyon ka valide / modifye
DROP POLICY IF EXISTS "encaissements_update" ON erp_encaissements;
CREATE POLICY "encaissements_update" ON erp_encaissements FOR UPDATE USING (
  erp_annexe_visible(annexe_id)
  AND erp_has_role(ARRAY['pdg','directrice','directeur','manager','comptable'])
);
