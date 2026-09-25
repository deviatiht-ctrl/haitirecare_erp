-- Enterprise Registration System
-- Run this after: 05_seed.sql

-- Enterprise types
CREATE TABLE erp_enterprise_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  features jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert enterprise types — HAITI REH-CARE (physiothérapie)
INSERT INTO erp_enterprise_types (code, name, description, icon, features) VALUES
('physiotherapy', 'Centre de Physiothérapie',
 'Physiothérapie, massothérapie, orthèses, prothèses et matériel orthopédique',
 'activity',
 '{"modules": ["patients","rdv","seances","services","protheses","ortheses","materiel_orthopedique","stock","catalogue","ventes","caisse","facturation","finances","employes","presences","taches","messages","rapports","annonces","siteweb","users","parametres"], "interface": "medical"}'),
('default', 'Entreprise Générale', 'Type d''entreprise par défaut', 'building',
 '{"modules": ["clients", "stock", "employes", "finances", "rapports"], "interface": "default"}')
ON CONFLICT (code) DO NOTHING;

-- Enterprise registrations
CREATE TABLE erp_enterprise_registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  company_email text NOT NULL,
  company_phone text,
  company_address text,
  company_city text,
  company_country text DEFAULT 'Haïti',
  company_rc text,
  company_ifu text,
  company_website text,
  enterprise_type_id uuid REFERENCES erp_enterprise_types(id),
  secteur text,
  nombre_employes int,
  description text,
  
  -- PDG/Directrice information
  pdg_first_name text NOT NULL,
  pdg_last_name text NOT NULL,
  pdg_email text NOT NULL,
  pdg_phone text,
  pdg_position text DEFAULT 'PDG',
  
  -- Registration status
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_revision', 'approuve', 'refuse', 'active', 'suspendu')),
  
  -- Subscription/Features
  subscription_plan text DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'standard', 'premium')),
  features_unlocked jsonb DEFAULT '{}',
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_email)
);

-- Enterprise settings (extended from existing erp_settings)
ALTER TABLE erp_settings ADD COLUMN IF NOT EXISTS enterprise_id uuid REFERENCES erp_enterprise_registrations(id);
ALTER TABLE erp_settings ADD COLUMN IF NOT EXISTS is_enterprise_active boolean DEFAULT false;
ALTER TABLE erp_settings ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
ALTER TABLE erp_settings ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE erp_settings ADD COLUMN IF NOT EXISTS features_enabled jsonb DEFAULT '{}';

-- User-enterprise relationship
CREATE TABLE erp_user_enterprises (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  role_in_enterprise text DEFAULT 'employe' CHECK (role_in_enterprise IN ('pdg', 'directeur', 'manager', 'employe')),
  is_primary boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(user_id, enterprise_id)
);

-- Auto update trigger for enterprise registrations
CREATE TRIGGER trg_enterprise_registrations BEFORE UPDATE ON erp_enterprise_registrations
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();

-- Enable RLS on new tables
ALTER TABLE erp_enterprise_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_enterprise_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_user_enterprises ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Enterprise types: everyone reads
CREATE POLICY "enterprise_types_read" ON erp_enterprise_types FOR SELECT USING (true);

-- Enterprise registrations:
-- - Public can register (INSERT)
-- - Enterprises can see their own
CREATE POLICY "enterprise_registrations_insert" ON erp_enterprise_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "enterprise_registrations_own" ON erp_enterprise_registrations FOR SELECT
  USING (EXISTS (SELECT 1 FROM erp_user_enterprises WHERE user_id = auth.uid() AND enterprise_id = erp_enterprise_registrations.id));

-- User-enterprises: users can see their own, PDG/Direction manage all
CREATE POLICY "user_enterprises_own" ON erp_user_enterprises FOR ALL
  USING (user_id = auth.uid());
CREATE POLICY "user_enterprises_manage" ON erp_user_enterprises FOR ALL
  USING (erp_can_manage_users());

-- Helper function to get user's enterprise
CREATE OR REPLACE FUNCTION erp_get_user_enterprise()
RETURNS uuid AS $$
BEGIN
  RETURN (SELECT enterprise_id FROM erp_user_enterprises WHERE user_id = auth.uid() AND is_primary = true LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Custom roles per enterprise
CREATE TABLE IF NOT EXISTS erp_custom_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  name text NOT NULL,
  description text,
  modules jsonb DEFAULT '{}',
  permissions jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(enterprise_id, name)
);

-- User module assignments (overrides default role permissions)
CREATE TABLE IF NOT EXISTS erp_user_modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  module_code text,
  permissions jsonb DEFAULT '{}',
  is_enabled boolean DEFAULT true,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_code)
);

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

-- Insert available modules (with conflict handling)
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
('parametres', 'Paramètres', 'Système', 'Paramètres de l''entreprise', 'settings', '{"view": true, "edit": true}')
ON CONFLICT (code) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE erp_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_user_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_modules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for modules (everyone can read, PDG can manage)
CREATE POLICY "modules_read" ON erp_modules FOR SELECT USING (true);
CREATE POLICY "modules_pdg" ON erp_modules FOR ALL USING (erp_can_manage_users());

-- RLS Policies for custom roles (enterprise-specific)
CREATE POLICY "custom_roles_enterprise" ON erp_custom_roles FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM erp_user_enterprises WHERE user_id = auth.uid()
    ) OR erp_can_manage_users()
  );

-- RLS Policies for user modules (user can see own, PDG can manage all)
CREATE POLICY "user_modules_own" ON erp_user_modules FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_modules_pdg" ON erp_user_modules FOR ALL USING (erp_can_manage_users());

-- Function to create custom role for enterprise
CREATE OR REPLACE FUNCTION erp_create_custom_role(
  p_enterprise_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_modules jsonb DEFAULT '{}',
  p_permissions jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  new_role_id uuid;
BEGIN
  -- Check if caller has permission
  IF NOT erp_can_manage_users() THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can create custom roles';
  END IF;
  
  -- Verify enterprise belongs to caller
  IF NOT EXISTS (
    SELECT 1 FROM erp_user_enterprises 
    WHERE user_id = auth.uid() 
    AND enterprise_id = p_enterprise_id
    AND role_in_enterprise IN ('pdg', 'directrice', 'directeur')
  ) THEN
    RAISE EXCEPTION 'You do not have permission for this enterprise';
  END IF;
  
  -- Create custom role
  INSERT INTO erp_custom_roles (enterprise_id, name, description, modules, permissions, created_by)
  VALUES (p_enterprise_id, p_name, p_description, p_modules, p_permissions, auth.uid())
  RETURNING id INTO new_role_id;
  
  RETURN new_role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign modules to user
CREATE OR REPLACE FUNCTION erp_assign_modules_to_user(
  p_user_id uuid,
  p_module_assignments jsonb
)
RETURNS boolean AS $$
DECLARE
  module_record json;
  module_code text;
  module_permissions jsonb;
BEGIN
  -- Check if caller has permission
  IF NOT erp_can_manage_users() THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can assign modules';
  END IF;
  
  -- Clear existing module assignments for user
  DELETE FROM erp_user_modules WHERE user_id = p_user_id;
  
  -- Insert new module assignments
  FOR module_record IN SELECT * FROM jsonb_array_elements(p_module_assignments) LOOP
    module_code := module_record->>'module_code';
    module_permissions := module_record->'permissions';
    
    INSERT INTO erp_user_modules (user_id, module_code, permissions, assigned_by)
    VALUES (p_user_id, module_code, module_permissions, auth.uid());
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's effective permissions (custom + role-based)
CREATE OR REPLACE FUNCTION erp_get_user_permissions(p_user_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  target_user_id uuid := COALESCE(p_user_id, auth.uid());
  user_role text;
  user_poste_id uuid;
  user_enterprise_id uuid;
  role_permissions jsonb;
  custom_module_permissions jsonb;
  effective_permissions jsonb;
BEGIN
  -- Get user's basic role and poste
  SELECT role, poste_id INTO user_role, user_poste_id
  FROM erp_users WHERE id = target_user_id;
  
  -- Get user's enterprise
  SELECT enterprise_id INTO user_enterprise_id
  FROM erp_user_enterprises WHERE user_id = target_user_id AND is_primary = true;
  
  -- Get default role permissions from poste
  IF user_poste_id IS NOT NULL THEN
    SELECT permissions INTO role_permissions
    FROM erp_postes WHERE id = user_poste_id;
  END IF;
  
  -- Get custom module permissions
  SELECT jsonb_object_agg(module_code, permissions) INTO custom_module_permissions
  FROM erp_user_modules WHERE user_id = target_user_id AND is_enabled = true;
  
  -- Merge permissions (custom overrides default)
  effective_permissions := COALESCE(role_permissions, '{}'::jsonb);
  effective_permissions := effective_permissions || COALESCE(custom_module_permissions, '{}'::jsonb);
  
  RETURN effective_permissions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available modules for enterprise
CREATE OR REPLACE FUNCTION erp_get_enterprise_modules(p_enterprise_id uuid)
RETURNS TABLE (
  module_code text,
  module_name text,
  category text,
  description text,
  icon text,
  default_permissions jsonb
) AS $$
BEGIN
  -- Return all active modules
  RETURN QUERY
  SELECT 
    code as module_code,
    name as module_name,
    category,
    description,
    icon,
    default_permissions
  FROM erp_modules
  WHERE is_active = true
  ORDER BY category, name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
