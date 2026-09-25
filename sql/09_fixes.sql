-- ============================================================
-- FIXES — Sistèm modilè dinamik
-- Run this AFTER: 06_enterprise_registration.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm
-- ============================================================

-- ------------------------------------------------------------
-- 1. nombre_employes — fòmilè enskripsyon an voye yon
--    plaj ("1-10", "11-50", "201+"), kolòn lan te int.
-- ------------------------------------------------------------
ALTER TABLE erp_enterprise_registrations
  ALTER COLUMN nombre_employes TYPE text;

-- ------------------------------------------------------------
-- 2. erp_users.role — fonksyon yo (erp_can_manage_users, etc.)
--    itilize 'directrice', 'directeur', 'manager' men CHECK la
--    pa te pèmèt yo.
-- ------------------------------------------------------------
ALTER TABLE erp_users
  DROP CONSTRAINT IF EXISTS erp_users_role_check;
ALTER TABLE erp_users
  ADD CONSTRAINT erp_users_role_check
  CHECK (role IN ('pdg','directrice','directeur','manager',
                  'secretaire','comptable','responsable_stock',
                  'commercial','rh','employe'));

-- ------------------------------------------------------------
-- 3. Modil espesifik pou chak tip entreprise
--    Kòd sa yo soti nan erp_enterprise_types.features.modules.
--    Yo pèmèt sidebar la afiche non/ikòn kòrèk, epi module.html
--    jenere paj la sou demann pou modil ki pa gen fichye fizik.
-- ------------------------------------------------------------
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
-- Clinique / Physiothérapie (HAITI REH-CARE)
('patients', 'Patients', 'Clinique', 'Dossiers et suivi des patients', 'heart-pulse', '{"view": true, "create": true, "edit": true}'),
('rdv', 'Rendez-vous', 'Clinique', 'Planification des rendez-vous et consultations', 'calendar-clock', '{"view": true, "create": true, "edit": true}'),
('seances', 'Séances de soin', 'Clinique', 'Séances de physiothérapie et suivi', 'activity', '{"view": true, "create": true, "edit": true}'),
('ordonnances', 'Ordonnances', 'Clinique', 'Prescriptions médicales', 'file-text', '{"view": true, "create": true}'),
('services', 'Services & Tarifs', 'Gestion', 'Catalogue des soins et tarifs', 'clipboard-list', '{"view": true, "create": true, "edit": true}'),
('protheses', 'Prothèses', 'Clinique', 'Suivi des prothèses en cours', 'bone', '{"view": true, "create": true, "edit": true}'),
('ortheses', 'Orthèses', 'Clinique', 'Suivi des orthèses en cours', 'footprints', '{"view": true, "create": true, "edit": true}'),
('materiel_orthopedique', 'Matériel Orthopédique', 'Gestion', 'Stock et vente de matériel orthopédique', 'package-plus', '{"view": true, "create": true, "edit": true}'),
('facturation_medical', 'Facturation Médicale', 'Finances', 'Facturation des actes et soins', 'receipt', '{"view": true, "create": true}'),
('facturation', 'Facturation', 'Finances', 'Factures et devis', 'receipt', '{"view": true, "create": true, "edit": true}')
ON CONFLICT (code) DO NOTHING;

-- Retire les modules d'autres secteurs (le catalogue ne sert que Recare)
DELETE FROM erp_modules
WHERE code IN ('commandes','menu','reservations','projets','chantiers','materiel',
               'etudiants','classes','emploi_du_temps','notes','flotte','livraisons',
               'chauffeurs','itineraire','production','maintenance','qualite','pharmacie');
