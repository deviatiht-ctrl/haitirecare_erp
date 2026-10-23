-- Roles and Initial PDG Setup
-- Run this after: 03_storage.sql
-- NOTE: PDG users are created through enterprise registration, not hardcoded here

-- Enterprise job positions (with permissions) - Dynamic templates
INSERT INTO erp_postes (name, department, description, permissions) VALUES
('PDG', 'Direction', 'Président Directeur Général — accès total', '{"all": true}'),
('Directrice', 'Direction', 'Directrice — accès complet entreprise', '{"all": true}'),
('Directeur', 'Direction', 'Directeur — accès complet entreprise', '{"all": true}'),
('Secrétaire', 'Administration', 'Gestion administrative et clientèle', '{"clients": true, "taches": true, "rapports": true, "messages": true, "agenda": true}'),
('Comptable', 'Finance', 'Gestion comptable et financière', '{"finances": true, "clients": true, "rapports": true, "factures": true, "caisse": true}'),
('Responsable Stock', 'Logistique', 'Gestion de l''inventaire et des mouvements de stock', '{"stock": true, "rapports": true, "fournisseurs": true}'),
('Commercial', 'Ventes', 'Prospection et gestion des clients', '{"clients": true, "stock_read": true, "taches": true, "rapports": true, "ventes": true, "catalogue": true}'),
('Responsable RH', 'Ressources Humaines', 'Gestion du personnel et des performances', '{"rh": true, "taches": true, "rapports": true, "employes": true}'),
('Community Manager', 'Marketing', 'Gestion des réseaux sociaux et communication', '{"clients": true, "messages": true, "rapports": true, "catalogue": true, "ventes": true}'),
('Employé', 'Général', 'Accès de base — tâches et présences personnelles', '{"taches_own": true, "presences_own": true}');

-- Available modules for customization
CREATE TABLE IF NOT EXISTS erp_modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  icon text,
  default_permissions jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert available modules
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
('dashboard', 'Dashboard', 'Principal', 'Vue d''ensemble de l''entreprise', 'layout-dashboard', '{"view": true}'),
('clients', 'Clients', 'Principal', 'Gestion de la clientèle', 'users', '{"view": true, "create": true, "edit": true, "delete": false}'),
('stock', 'Stock', 'Principal', 'Gestion des stocks et inventaire', 'package', '{"view": true, "create": true, "edit": true, "delete": false}'),
('catalogue', 'Catalogue', 'Principal', 'Gestion du catalogue produits', 'shopping-bag', '{"view": true, "create": true, "edit": true, "delete": false}'),
('finances', 'Finances', 'Principal', 'Gestion financière et comptabilité', 'dollar-sign', '{"view": true, "create": true, "edit": true, "delete": false}'),
('caisse', 'Caisse', 'Principal', 'Gestion de la caisse journalière', 'cash', '{"view": true, "create": true, "edit": true}'),
('ventes', 'Ventes', 'Principal', 'Gestion des ventes et commandes', 'shopping-cart', '{"view": true, "create": true, "edit": true}'),
('rh', 'Ressources Humaines', 'Principal', 'Gestion du personnel', 'users', '{"view": true, "create": true, "edit": true}'),
('employes', 'Employés', 'RH', 'Gestion des employés', 'user', '{"view": true, "create": true, "edit": true}'),
('presences', 'Présences', 'RH', 'Suivi des présences', 'clock', '{"view": true, "create": true}'),
('conges', 'Congés', 'RH', 'Gestion des congés', 'calendar', '{"view": true, "create": true, "edit": true}'),
('taches', 'Tâches', 'Principal', 'Gestion des tâches et projets', 'check-square', '{"view": true, "create": true, "edit": true}'),
('rapports', 'Rapports', 'Principal', 'Rapports et analyses', 'bar-chart-3', '{"view": true, "export": true}'),
('messages', 'Messages', 'Communication', 'Messagerie interne', 'message-square', '{"view": true, "create": true}'),
('agenda', 'Agenda', 'Communication', 'Gestion de l''agenda', 'calendar', '{"view": true, "create": true, "edit": true}'),
('fournisseurs', 'Fournisseurs', 'Stock', 'Gestion des fournisseurs', 'truck', '{"view": true, "create": true, "edit": true}'),
('factures', 'Factures', 'Finances', 'Gestion des factures', 'file-text', '{"view": true, "create": true, "edit": true}'),
('parametres', 'Paramètres', 'Système', 'Paramètres de l''entreprise', 'settings', '{"view": true, "edit": true}');

-- Custom roles per enterprise (moved to 06_enterprise_registration.sql to avoid dependency issues)
-- NOTE: These tables are created in 06_enterprise_registration.sql
-- erp_custom_roles, erp_user_modules

-- Functions that depend on enterprise tables are moved to 06_enterprise_registration.sql
-- erp_create_custom_role, erp_assign_modules_to_user, erp_get_user_permissions, erp_get_enterprise_modules

-- Function to check if user can manage users (PDG only)
CREATE OR REPLACE FUNCTION erp_can_manage_users()
RETURNS boolean AS $$
BEGIN
  RETURN erp_get_role() IN ('pdg', 'directrice', 'directeur');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create user with role (can only be called by PDG/Directeur)
CREATE OR REPLACE FUNCTION erp_create_user_with_role(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_poste_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  new_user_id uuid;
  existing_user_id uuid;
BEGIN
  -- Check if caller has permission
  IF NOT erp_can_manage_users() THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can create users';
  END IF;
  
  -- Check if role is valid
  IF p_role NOT IN ('pdg', 'directrice', 'directeur', 'secretaire', 'comptable', 'responsable_stock', 'commercial', 'rh', 'employe') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO existing_user_id FROM auth.users WHERE email = p_email;
  
  IF existing_user_id IS NOT NULL THEN
    -- Update existing user
    UPDATE erp_users
    SET 
      first_name = p_first_name,
      last_name = p_last_name,
      role = p_role,
      poste_id = p_poste_id,
      is_active = true,
      updated_at = now()
    WHERE id = existing_user_id;
    
    RETURN existing_user_id;
  ELSE
    -- Create new auth user (this requires Supabase client-side signup)
    -- For now, we'll return NULL and expect the auth user to be created first
    RAISE EXCEPTION 'User must be created in auth.users first. Please create user via Supabase Auth then call this function.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign role to existing auth user
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
  -- Check if caller has permission
  IF NOT erp_can_manage_users() THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can assign roles';
  END IF;
  
  -- Check if role is valid
  IF p_role NOT IN ('pdg', 'directrice', 'directeur', 'secretaire', 'comptable', 'responsable_stock', 'commercial', 'rh', 'employe') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  
  -- Get user ID from auth.users
  SELECT id INTO auth_user_id FROM auth.users WHERE email = p_email;
  
  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'User % does not exist in auth.users', p_email;
  END IF;
  
  -- Check if profile already exists
  SELECT id INTO existing_profile_id FROM erp_users WHERE id = auth_user_id;
  
  IF existing_profile_id IS NOT NULL THEN
    -- Update existing profile
    UPDATE erp_users
    SET 
      first_name = p_first_name,
      last_name = p_last_name,
      role = p_role,
      poste_id = p_poste_id,
      is_active = true,
      updated_at = now()
    WHERE id = auth_user_id;
  ELSE
    -- Create new profile
    INSERT INTO erp_users (id, email, first_name, last_name, role, poste_id, is_active)
    VALUES (
      auth_user_id,
      p_email,
      p_first_name,
      p_last_name,
      p_role,
      p_poste_id,
      true
    );
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to allow PDG/Directeur to manage users
DROP POLICY IF EXISTS "erp_users_pdg" ON erp_users;
CREATE POLICY "erp_users_pdg" ON erp_users FOR ALL
  USING (erp_can_manage_users());

-- Add policy for PDG to insert users
CREATE POLICY "erp_users_pdg_insert" ON erp_users FOR INSERT
  WITH CHECK (erp_can_manage_users());
