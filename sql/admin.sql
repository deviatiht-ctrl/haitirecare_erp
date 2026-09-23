-- Admin (PDG) Association Script
-- Use this script AFTER you have created the user in the Supabase Dashboard
-- (Supabase Dashboard -> Authentication -> Users -> Add User)

DO $$
DECLARE
  admin_email text := 'laurorejeanclarens9@gmail.com'; -- <-- PUT YOUR ADMIN EMAIL HERE
  auth_user_id uuid;
  existing_profile_id uuid;
BEGIN
  -- 1. Get the user ID from auth.users (which you created via the Supabase Dashboard UI)
  SELECT id INTO auth_user_id FROM auth.users WHERE email = admin_email;
  
  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email "%" not found in Supabase auth.users. Please create the user first in your Supabase Dashboard UI!', admin_email;
  END IF;
  
  -- 2. Check if the user already exists in erp_users profile table
  SELECT id INTO existing_profile_id FROM erp_users WHERE email = admin_email;
  
  IF existing_profile_id IS NOT NULL THEN
    -- Update existing profile to PDG
    UPDATE erp_users
    SET role = 'pdg', is_active = true
    WHERE id = auth_user_id;
    
    RAISE NOTICE 'User % already exists in erp_users. Successfully updated role to PDG.', admin_email;
  ELSE
    -- Insert new profile as PDG
    INSERT INTO erp_users (id, email, first_name, last_name, role, is_active)
    VALUES (
      auth_user_id,
      admin_email,
      'Laurore',
      'Jean-Clarens',
      'pdg',
      true
    );
    
    RAISE NOTICE 'Successfully created PDG profile in erp_users for %.', admin_email;
  END IF;
END $$;
