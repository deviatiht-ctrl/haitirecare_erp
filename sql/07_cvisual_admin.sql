-- CVisual Admin System
-- Run this after: 06_enterprise_registration.sql

-- CVisual admin configuration
-- IMPORTANT: Replace with your actual CVisual admin email
DO $$
DECLARE
  cvisual_admin_email text := 'admin@cvisual.org';  -- CHANGE THIS TO YOUR CVISUAL ADMIN EMAIL
  auth_user_id uuid;
  existing_admin_id uuid;
BEGIN
  -- Get user ID from auth.users
  SELECT id INTO auth_user_id FROM auth.users WHERE email = cvisual_admin_email;
  
  IF auth_user_id IS NULL THEN
    RAISE NOTICE 'CVisual admin user % does not exist in auth.users. Please create the user first in Supabase Dashboard → Authentication → Users', cvisual_admin_email;
  ELSE
    -- Check if admin already exists in erp_cvisual_admins
    SELECT id INTO existing_admin_id FROM erp_cvisual_admins WHERE user_id = auth_user_id;
    
    IF existing_admin_id IS NULL THEN
      -- Insert as super admin
      INSERT INTO erp_cvisual_admins (user_id, admin_level, permissions, can_verify_enterprises, can_unlock_features)
      VALUES (
        auth_user_id,
        'super',
        '{"all": true, "verify_enterprises": true, "unlock_features": true, "manage_subscriptions": true, "view_analytics": true}',
        true,
        true
      );
      
      RAISE NOTICE 'CVisual super admin created for %', cvisual_admin_email;
    ELSE
      RAISE NOTICE 'CVisual admin % already exists', cvisual_admin_email;
    END IF;
  END IF;
END $$;

-- Function to check if user is CVisual admin
CREATE OR REPLACE FUNCTION erp_is_cvisual_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM erp_cvisual_admins 
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get CVisual admin level
CREATE OR REPLACE FUNCTION erp_get_cvisual_admin_level()
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT admin_level FROM erp_cvisual_admins 
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if CVisual admin can verify enterprises
CREATE OR REPLACE FUNCTION erp_can_verify_enterprises()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM erp_cvisual_admins 
    WHERE user_id = auth.uid() 
    AND is_active = true 
    AND can_verify_enterprises = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if CVisual admin can unlock features
CREATE OR REPLACE FUNCTION erp_can_unlock_features()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM erp_cvisual_admins 
    WHERE user_id = auth.uid() 
    AND is_active = true 
    AND can_unlock_features = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify enterprise (CVisual admin only)
CREATE OR REPLACE FUNCTION erp_verify_enterprise(
  p_enterprise_id uuid,
  p_approved boolean,
  p_notes text DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  -- Check if caller is CVisual admin with verification permission
  IF NOT erp_can_verify_enterprises() THEN
    RAISE EXCEPTION 'Permission denied: Only CVisual admins can verify enterprises';
  END IF;
  
  -- Update enterprise status
  UPDATE erp_enterprise_registrations
  SET 
    statut = CASE WHEN p_approved THEN 'approuve' ELSE 'refuse' END,
    cvisual_verified = p_approved,
    cvisual_verified_by = auth.uid(),
    cvisual_verified_at = now(),
    cvisual_notes = p_notes,
    updated_at = now()
  WHERE id = p_enterprise_id;
  
  -- If approved, activate the enterprise
  IF p_approved THEN
    UPDATE erp_settings
    SET 
      is_enterprise_active = true,
      subscription_status = 'trial',
      trial_ends_at = now() + INTERVAL '14 days',
      updated_at = now()
    WHERE enterprise_id = p_enterprise_id;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock feature for enterprise (CVisual admin only)
CREATE OR REPLACE FUNCTION erp_unlock_feature_for_enterprise(
  p_enterprise_id uuid,
  p_feature_code text,
  p_notes text DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  -- Check if caller is CVisual admin with feature unlock permission
  IF NOT erp_can_unlock_features() THEN
    RAISE EXCEPTION 'Permission denied: Only CVisual admins can unlock features';
  END IF;
  
  -- Update enterprise features
  UPDATE erp_enterprise_registrations
  SET 
    features_unlocked = features_unlocked || jsonb_build_object(p_feature_code, true),
    updated_at = now()
  WHERE id = p_enterprise_id;
  
  -- Also update in erp_settings
  UPDATE erp_settings
  SET 
    features_enabled = features_enabled || jsonb_build_object(p_feature_code, true),
    updated_at = now()
  WHERE enterprise_id = p_enterprise_id;
  
  -- Log the feature unlock
  INSERT INTO erp_feature_requests (enterprise_id, feature_code, request_type, statut, processed_by, notes)
  VALUES (p_enterprise_id, p_feature_code, 'unlock', 'approuve', auth.uid(), p_notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process feature request (CVisual admin only)
CREATE OR REPLACE FUNCTION erp_process_feature_request(
  p_request_id uuid,
  p_approved boolean,
  p_notes text DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  -- Check if caller is CVisual admin
  IF NOT erp_is_cvisual_admin() THEN
    RAISE EXCEPTION 'Permission denied: Only CVisual admins can process feature requests';
  END IF;
  
  -- Get request details
  DECLARE
    v_enterprise_id uuid;
    v_feature_code text;
  BEGIN
    SELECT enterprise_id, feature_code INTO v_enterprise_id, v_feature_code
    FROM erp_feature_requests
    WHERE id = p_request_id;
    
    IF v_enterprise_id IS NULL THEN
      RAISE EXCEPTION 'Feature request not found';
    END IF;
  END;
  
  -- Update request status
  UPDATE erp_feature_requests
  SET 
    statut = CASE WHEN p_approved THEN 'approuve' ELSE 'refuse' END,
    processed_by = auth.uid(),
    processed_at = now(),
    notes = p_notes
  WHERE id = p_request_id;
  
  -- If approved, unlock the feature
  IF p_approved THEN
    PERFORM erp_unlock_feature_for_enterprise(v_enterprise_id, v_feature_code, p_notes);
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all enterprises for CVisual admin
CREATE OR REPLACE FUNCTION erp_get_all_enterprises()
RETURNS TABLE (
  id uuid,
  company_name text,
  company_email text,
  enterprise_type_code text,
  statut text,
  cvisual_verified boolean,
  created_at timestamptz
) AS $$
BEGIN
  -- Only CVisual admins can call this
  IF NOT erp_is_cvisual_admin() THEN
    RAISE EXCEPTION 'Permission denied: Only CVisual admins can view all enterprises';
  END IF;
  
  RETURN QUERY
  SELECT 
    er.id,
    er.company_name,
    er.company_email,
    et.code as enterprise_type_code,
    er.statut,
    er.cvisual_verified,
    er.created_at
  FROM erp_enterprise_registrations er
  LEFT JOIN erp_enterprise_types et ON er.enterprise_type_id = et.id
  ORDER BY er.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending enterprises for verification
CREATE OR REPLACE FUNCTION erp_get_pending_enterprises()
RETURNS TABLE (
  id uuid,
  company_name text,
  company_email text,
  pdg_first_name text,
  pdg_last_name text,
  pdg_email text,
  enterprise_type_code text,
  created_at timestamptz
) AS $$
BEGIN
  -- Only CVisual admins with verification permission can call this
  IF NOT erp_can_verify_enterprises() THEN
    RAISE EXCEPTION 'Permission denied: Only CVisual admins can view pending enterprises';
  END IF;
  
  RETURN QUERY
  SELECT 
    er.id,
    er.company_name,
    er.company_email,
    er.pdg_first_name,
    er.pdg_last_name,
    er.pdg_email,
    et.code as enterprise_type_code,
    er.created_at
  FROM erp_enterprise_registrations er
  LEFT JOIN erp_enterprise_types et ON er.enterprise_type_id = et.id
  WHERE er.statut = 'en_attente'
  ORDER BY er.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies for CVisual admin functions
-- Allow CVisual admins to view all enterprise registrations
DROP POLICY IF EXISTS "enterprise_registrations_cvisual" ON erp_enterprise_registrations;
CREATE POLICY "enterprise_registrations_cvisual" ON erp_enterprise_registrations FOR ALL
  USING (erp_is_cvisual_admin());

-- Allow CVisual admins to manage feature requests
DROP POLICY IF EXISTS "feature_requests_cvisual" ON erp_feature_requests;
CREATE POLICY "feature_requests_cvisual" ON erp_feature_requests FOR ALL
  USING (erp_is_cvisual_admin());

-- Add policy for CVisual admins to view enterprise types
CREATE POLICY "enterprise_types_cvisual" ON erp_enterprise_types FOR SELECT
  USING (erp_is_cvisual_admin());

-- Grant execute permissions on CVisual functions to authenticated users
GRANT EXECUTE ON FUNCTION erp_is_cvisual_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_get_cvisual_admin_level() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_can_verify_enterprises() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_can_unlock_features() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_verify_enterprise(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_unlock_feature_for_enterprise(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_process_feature_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_get_all_enterprises() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_get_pending_enterprises() TO authenticated;

-- Create view for CVisual admin dashboard
CREATE OR REPLACE VIEW erp_cvisual_dashboard_view AS
SELECT 
  (SELECT COUNT(*) FROM erp_enterprise_registrations) as total_enterprises,
  (SELECT COUNT(*) FROM erp_enterprise_registrations WHERE statut = 'en_attente') as pending_enterprises,
  (SELECT COUNT(*) FROM erp_enterprise_registrations WHERE statut = 'approuve') as approved_enterprises,
  (SELECT COUNT(*) FROM erp_enterprise_registrations WHERE statut = 'refuse') as rejected_enterprises,
  (SELECT COUNT(*) FROM erp_feature_requests WHERE statut = 'en_attente') as pending_feature_requests,
  (SELECT COUNT(*) FROM erp_feature_requests WHERE statut = 'approuve') as approved_features;

-- Grant select on view to CVisual admins
GRANT SELECT ON erp_cvisual_dashboard_view TO authenticated;
