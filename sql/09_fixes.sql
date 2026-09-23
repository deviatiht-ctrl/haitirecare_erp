-- ============================================================
-- FIXES — Sistèm modilè dinamik
-- Run this AFTER: 08_seed_cvisual.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm
-- ============================================================

-- ------------------------------------------------------------
-- 1. erp_cvisual_admins.is_active — kolòn sa a itilize nan
--    erp_is_cvisual_admin() (07_cvisual_admin.sql) men li pa t
--    janm kreye nan 06. San li, RPC la toujou fè erè.
-- ------------------------------------------------------------
ALTER TABLE erp_cvisual_admins
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ------------------------------------------------------------
-- 2. nombre_employes — formulaire register.html voye yon
--    plaj ("1-10", "11-50", "201+"), kolòn lan te int.
-- ------------------------------------------------------------
ALTER TABLE erp_enterprise_registrations
  ALTER COLUMN nombre_employes TYPE text;

-- ------------------------------------------------------------
-- 3. erp_users.role — fonksyon yo (erp_can_manage_users, etc.)
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
-- 4. Modil espesifik pou chak tip entreprise
--    Kòd sa yo soti nan erp_enterprise_types.features.modules.
--    Yo pèmèt sidebar la afiche non/ikòn kòrèk, epi module.html
--    jenere paj la sou demann pou modil ki pa gen fichye fizik.
-- ------------------------------------------------------------
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
-- Hôpital / Clinique
('patients', 'Patients', 'Médical', 'Dossiers et suivi des patients', 'heart-pulse', '{"view": true, "create": true, "edit": true}'),
('rdv', 'Rendez-vous', 'Médical', 'Planification des rendez-vous et consultations', 'calendar-clock', '{"view": true, "create": true, "edit": true}'),
('ordonnances', 'Ordonnances', 'Médical', 'Prescriptions médicales', 'file-text', '{"view": true, "create": true}'),
('facturation_medical', 'Facturation Médicale', 'Médical', 'Facturation des actes et soins', 'receipt', '{"view": true, "create": true}'),
('pharmacie', 'Pharmacie', 'Médical', 'Stock de médicaments et matériel médical', 'pill', '{"view": true, "create": true, "edit": true}'),
-- Restaurant / Café
('commandes', 'Commandes', 'Restauration', 'Gestion des commandes en cours', 'shopping-cart', '{"view": true, "create": true, "edit": true}'),
('menu', 'Menu', 'Restauration', 'Carte, plats et tarifs', 'utensils', '{"view": true, "create": true, "edit": true}'),
('reservations', 'Réservations', 'Restauration', 'Réservations de tables', 'calendar-check', '{"view": true, "create": true, "edit": true}'),
-- Construction / BTP
('projets', 'Projets', 'Projets', 'Suivi des projets et livrables', 'folder-kanban', '{"view": true, "create": true, "edit": true}'),
('chantiers', 'Chantiers', 'Projets', 'Suivi des chantiers', 'hard-hat', '{"view": true, "create": true, "edit": true}'),
('materiel', 'Matériel', 'Logistique', 'Gestion du matériel et équipements', 'wrench', '{"view": true, "create": true, "edit": true}'),
-- Éducation
('etudiants', 'Élèves & Étudiants', 'Éducation', 'Dossiers des élèves', 'graduation-cap', '{"view": true, "create": true, "edit": true}'),
('classes', 'Classes', 'Éducation', 'Gestion des classes et groupes', 'users', '{"view": true, "create": true, "edit": true}'),
('emploi_du_temps', 'Emploi du temps', 'Éducation', 'Planification des cours', 'calendar', '{"view": true, "create": true, "edit": true}'),
('notes', 'Notes & Bulletins', 'Éducation', 'Notes et évaluations', 'clipboard-list', '{"view": true, "create": true, "edit": true}'),
-- Logistique / Transport
('flotte', 'Flotte', 'Logistique', 'Gestion des véhicules', 'truck', '{"view": true, "create": true, "edit": true}'),
('livraisons', 'Livraisons', 'Logistique', 'Suivi des livraisons', 'package-check', '{"view": true, "create": true, "edit": true}'),
('chauffeurs', 'Chauffeurs', 'Logistique', 'Gestion des chauffeurs', 'user', '{"view": true, "create": true, "edit": true}'),
('itineraire', 'Itinéraires', 'Logistique', 'Planification des routes', 'map', '{"view": true, "create": true, "edit": true}'),
-- Industrie / Production
('production', 'Production', 'Industrie', 'Ordres et suivi de production', 'factory', '{"view": true, "create": true, "edit": true}'),
('maintenance', 'Maintenance', 'Industrie', 'Maintenance des équipements', 'wrench', '{"view": true, "create": true, "edit": true}'),
('qualite', 'Qualité', 'Industrie', 'Contrôle qualité', 'check-circle', '{"view": true, "create": true, "edit": true}'),
-- Facturation générique (services, construction, éducation...)
('facturation', 'Facturation', 'Finances', 'Factures et devis', 'receipt', '{"view": true, "create": true, "edit": true}')
ON CONFLICT (code) DO NOTHING;
