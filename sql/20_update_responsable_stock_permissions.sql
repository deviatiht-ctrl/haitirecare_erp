-- ============================================================
-- NETTOYAGE PERMISSIONS RESPONSABLE STOCK / MAGASIN
-- Retire : catalogue, services, pharmacie
-- ============================================================

-- 1. Nettoyer les permissions dans la table erp_postes
UPDATE erp_postes
SET permissions = (
  permissions - 'catalogue' - 'services' - 'pharmacie'
)
WHERE name IN ('Responsable Stock', 'Responsable Magasin', 'Gestionnaire Stock & Achats')
   OR name ILIKE '%stock%';

-- 2. Supprimer les modules spécifiques assignés aux utilisateurs responsable_stock si présents
DELETE FROM erp_user_modules
WHERE module_code IN ('catalogue', 'services', 'pharmacie')
  AND user_id IN (
    SELECT id FROM erp_users WHERE role = 'responsable_stock'
  );

-- 3. Vérification des permissions actuelles des postes de stock
SELECT name, department, permissions
FROM erp_postes
WHERE name IN ('Responsable Stock', 'Responsable Magasin', 'Gestionnaire Stock & Achats')
   OR name ILIKE '%stock%';
