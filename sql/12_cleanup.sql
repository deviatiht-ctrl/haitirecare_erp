-- ============================================================
-- NETTOYAGE CVISUAL — OPSYONÈL
-- ============================================================
-- ⚠️  OU PA OBLIJE EGZEKITE FICHYE SA A.
--     ERP HAITI REH-CARE ak sit piblik la mache san li.
--     Egzekite l SÈLMAN si w vle retire objets CVisual yo
--     (tab, fonksyon, policy, kolòn) nan baz de done a.
--
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
-- ============================================================

DROP POLICY IF EXISTS "enterprise_registrations_cvisual" ON erp_enterprise_registrations;
DROP POLICY IF EXISTS "enterprise_types_cvisual" ON erp_enterprise_types;
DROP POLICY IF EXISTS "feature_requests_cvisual" ON erp_feature_requests;
DROP POLICY IF EXISTS "feature_requests_create" ON erp_feature_requests;
DROP POLICY IF EXISTS "feature_requests_own" ON erp_feature_requests;
DROP POLICY IF EXISTS "cvisual_admins_own" ON erp_cvisual_admins;
DROP POLICY IF EXISTS "cvisual_admins_insert" ON erp_cvisual_admins;

DROP VIEW IF EXISTS erp_cvisual_dashboard_view;
DROP TABLE IF EXISTS erp_feature_requests;
DROP TABLE IF EXISTS erp_cvisual_admins;

DROP FUNCTION IF EXISTS erp_is_cvisual_admin();
DROP FUNCTION IF EXISTS erp_get_cvisual_admin_level();
DROP FUNCTION IF EXISTS erp_can_verify_enterprises();
DROP FUNCTION IF EXISTS erp_can_unlock_features();
DROP FUNCTION IF EXISTS erp_verify_enterprise(uuid, boolean, text);
DROP FUNCTION IF EXISTS erp_unlock_feature_for_enterprise(uuid, text, text);
DROP FUNCTION IF EXISTS erp_process_feature_request(uuid, boolean, text);
DROP FUNCTION IF EXISTS erp_get_all_enterprises();
DROP FUNCTION IF EXISTS erp_get_pending_enterprises();

ALTER TABLE erp_enterprise_registrations
  DROP COLUMN IF EXISTS cvisual_verified,
  DROP COLUMN IF EXISTS cvisual_verified_by,
  DROP COLUMN IF EXISTS cvisual_verified_at,
  DROP COLUMN IF EXISTS cvisual_notes;
