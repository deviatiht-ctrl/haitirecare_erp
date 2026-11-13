-- 25_offline_access.sql
-- Aksè hors-ligne: PIN anplwaye + senkronizasyon aparèy.
--
-- PDG/Direksyon mete yon PIN pou chak anplwaye; anplwaye a konekte
-- sou paj login la san entènèt. PDG ka revoke aksè a nenpòt lè —
-- revokasyon an pwopaje sou aparèy la pwochen fwa li gen entènèt.
--
-- Hash la se sha256(pin || ':' || user_id) — menm kalkil la fèt
-- nan navigatè a (Web Crypto) pou verifye lokalman.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE erp_users
  ADD COLUMN IF NOT EXISTS offline_pin_hash text,
  ADD COLUMN IF NOT EXISTS offline_access_enabled boolean DEFAULT false;

-- PDG/Direksyon mete PIN hors-ligne pou yon anplwaye
CREATE OR REPLACE FUNCTION erp_set_offline_pin(p_user_id uuid, p_pin text)
RETURNS jsonb AS $$
BEGIN
  IF NOT COALESCE(erp_can_manage_users(), false) THEN
    RAISE EXCEPTION 'Permission denied: only PDG/Direction can set offline PIN';
  END IF;
  IF p_pin IS NULL OR length(btrim(p_pin)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PIN trop court (minimum 4 caractères)');
  END IF;
  UPDATE erp_users
     SET offline_pin_hash = encode(digest(btrim(p_pin) || ':' || p_user_id::text, 'sha256'), 'hex'),
         offline_access_enabled = true
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Utilisateur introuvable');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PDG/Direksyon retire aksè hors-ligne yon anplwaye
CREATE OR REPLACE FUNCTION erp_revoke_offline_access(p_user_id uuid)
RETURNS jsonb AS $$
BEGIN
  IF NOT COALESCE(erp_can_manage_users(), false) THEN
    RAISE EXCEPTION 'Permission denied: only PDG/Direction can revoke offline access';
  END IF;
  UPDATE erp_users SET offline_access_enabled = false WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Utilisateur introuvable');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lis anplwaye yo pou kach aparèy la (verifikasyon PIN lokal).
-- SECURITY DEFINER: RLS "erp_users_own" pa pèmèt staff li lòt liy yo.
-- Retounen sèlman staff menm antrepriz ak moun ki rele a.
CREATE OR REPLACE FUNCTION erp_list_offline_users()
RETURNS TABLE (
  id uuid, email text, first_name text, last_name text, role text,
  poste_id uuid, annexe_id uuid, is_active boolean,
  offline_pin_hash text, offline_access_enabled boolean,
  poste_permissions jsonb, user_modules jsonb
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM erp_users u WHERE u.id = auth.uid() AND u.is_active) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email, u.first_name, u.last_name, u.role,
         u.poste_id, u.annexe_id, u.is_active,
         u.offline_pin_hash, u.offline_access_enabled,
         p.permissions,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'module_code', m.module_code,
             'permissions', m.permissions,
             'is_enabled', m.is_enabled))
           FROM erp_user_modules m WHERE m.user_id = u.id
         ), '[]'::jsonb)
    FROM erp_users u
    LEFT JOIN erp_postes p ON p.id = u.poste_id
   WHERE u.id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM erp_user_enterprises a
         JOIN erp_user_enterprises b ON b.enterprise_id = a.enterprise_id
        WHERE a.user_id = u.id AND b.user_id = auth.uid()
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
