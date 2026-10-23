-- ============================================================
-- RESET & IMPORT STOCK COMPLET — HAITI REH-CARE
-- Efface tout l'ancien stock (mouvements + produits) et insère
-- les 143 articles exactement comme dans la liste fournie
-- (Catégorie, Nom du Produit, Description, Stock Initial/Actuel).
-- ============================================================

BEGIN;

-- S'assurer que la colonne is_public existe
ALTER TABLE erp_produits
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- S'assurer que la lecture des produits actifs est autorisée pour tous les utilisateurs
DROP POLICY IF EXISTS "produits_public" ON erp_produits;
CREATE POLICY "produits_public" ON erp_produits FOR SELECT
  USING (is_active = true);

-- 1. Effacer tous les mouvements de stock et tous les produits existants
DELETE FROM erp_stock_movements;
DELETE FROM erp_produits;

-- 2. Insérer toute la nouvelle liste de stock (143 articles)
INSERT INTO erp_produits (code, categorie, designation, description, quantite, quantite_min, prix_achat, prix_vente, unite, is_active, is_public)
VALUES
  -- Page 2
  ('STK-001', 'Adapteurs', 'adapteur pin metal',                  NULL,                    16,    0, 0, 0, 'pièce', true, true),
  ('STK-002', 'Adapteurs', 'adapteur pin plastic',                NULL,                    8,     0, 0, 0, 'pièce', true, true),
  ('STK-003', 'Adapteurs', 'Adapteurs Double Head',               NULL,                    64,    0, 0, 0, 'pièce', true, true),
  ('STK-004', NULL,        'adaptor transfer moral',              NULL,                    17,    0, 0, 0, 'pièce', true, true),
  ('STK-005', 'Pieds',     'arms adaptor 3pieds',                 NULL,                    17,    0, 0, 0, 'pièce', true, true),
  ('STK-006', 'Pieds',     'arms adaptor 4pieds',                 NULL,                    6,     0, 0, 0, 'pièce', true, true),
  ('STK-007', NULL,        'Bande plâtré 10cm',                   NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-008', NULL,        'Bande plâtré 15cm',                   NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-009', NULL,        'Barre d''articulation',               NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-010', NULL,        'Bidon colle Ciment',                  NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-011', NULL,        'Bidon d''huile bébé',                 NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-012', NULL,        'Bidon Eau oxygénée',                  NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-013', NULL,        'Bleue de méthylène',                  NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-014', NULL,        'Boite Cartable',                      NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-015', NULL,        'Boite gant',                          NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-016', NULL,        'Bonnet moignon',                      NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-017', NULL,        'Boucles ceinture',                    NULL,                    181,   0, 0, 0, 'pièce', true, true),
  ('STK-018', NULL,        'boucles en plastiques',               NULL,                    10,    0, 0, 0, 'pièce', true, true),
  ('STK-019', NULL,        'Boucles parachutes',                  NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-020', NULL,        'Boucles simples',                     NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-021', NULL,        'Butter',                              NULL,                    18,    0, 0, 0, 'pièce', true, true),
  ('STK-022', NULL,        'Caisse Bande plâtré',                 NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-023', NULL,        'Canne anglaise',                      NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-024', NULL,        'Ceinture prothèse',                   NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-025', NULL,        'cheville',                            NULL,                    12,    0, 0, 0, 'pièce', true, true),
  ('STK-026', 'Adapteurs', 'conector adaptor Mal Rotator',        NULL,                    114,   0, 0, 0, 'pièce', true, true),
  ('STK-027', NULL,        'Confort Gel',                         NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-028', 'Adapteurs', 'Connector Pyramide M. Fe',            NULL,                    120,   0, 0, 0, 'pièce', true, true),
  ('STK-029', 'Adapteurs', 'connector socket male',               NULL,                    60,    0, 0, 0, 'pièce', true, true),
  ('STK-030', 'Adapteurs', 'Crochet',                             NULL,                    33,    0, 0, 0, 'pièce', true, true),
  ('STK-031', 'Adapteurs', 'Double adaptor (ended)',              NULL,                    28,    0, 0, 0, 'pièce', true, true),
  ('STK-032', NULL,        'Double slive systeme thread Pyramid', NULL,                    54,    0, 0, 0, 'pièce', true, true),
  ('STK-033', NULL,        'Easy skin cover',                     NULL,                    18,    0, 0, 0, 'pièce', true, true),
  ('STK-034', NULL,        'Easy skin cover en boîte',            NULL,                    7,     0, 0, 0, 'pièce', true, true),
  ('STK-035', NULL,        'Écrou',                               NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-036', NULL,        'Élément d''emballage',                NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-037', NULL,        'encre d''emboiture',                  NULL,                    24,    0, 0, 0, 'pièce', true, true),
  ('STK-038', NULL,        'encre d''emboiture noir',             NULL,                    42,    0, 0, 0, 'pièce', true, true),
  ('STK-039', NULL,        'Feuille EVA beige',                   NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-040', NULL,        'Feuille EVA marron',                  NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-041', NULL,        'Feuille Polypropylène',               NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-042', NULL,        'feuilles polypropylène',              NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-043', NULL,        'Gel inside',                          NULL,                    10,    0, 0, 0, 'pièce', true, true),
  ('STK-044', NULL,        'Gel liner Box',                       NULL,                    60,    0, 0, 0, 'pièce', true, true),
  ('STK-045', 'Manchons',  'Gel Locking Liner',                   NULL,                    7,     0, 0, 0, 'pièce', true, true),
  ('STK-046', NULL,        'Genou',                               NULL,                    99,    0, 0, 0, 'pièce', true, true),
  ('STK-047', NULL,        'Genou blocable',                      NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-048', NULL,        'Genouillère',                         NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-049', NULL,        'Hair Fresh',                          NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-050', NULL,        'Lame carbone #18',                    NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-051', NULL,        'Lame carbone #23',                    NULL,                    4,     0, 0, 0, 'pièce', true, true),
  ('STK-052', NULL,        'Lame carbone #24',                    NULL,                    5,     0, 0, 0, 'pièce', true, true),
  ('STK-053', NULL,        'Lame carbone #25',                    NULL,                    10,    0, 0, 0, 'pièce', true, true),
  ('STK-054', NULL,        'Lame carbone #26',                    NULL,                    11,    0, 0, 0, 'pièce', true, true),
  ('STK-055', NULL,        'Lame carbone #27',                    NULL,                    16,    0, 0, 0, 'pièce', true, true),
  ('STK-056', NULL,        'Lame carbone #28',                    NULL,                    16,    0, 0, 0, 'pièce', true, true),
  ('STK-057', NULL,        'Lame carbone #29',                    NULL,                    4,     0, 0, 0, 'pièce', true, true),
  ('STK-058', NULL,        'Lame carbone #30',                    NULL,                    6,     0, 0, 0, 'pièce', true, true),
  ('STK-059', NULL,        'Lame carbone #31',                    NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-060', NULL,        'Lame carbone sans numero',            NULL,                    79,    0, 0, 0, 'pièce', true, true),
  ('STK-061', NULL,        'Lame scie à métaux',                  NULL,                    0,     0, 0, 0, 'pièce', true, true),

  -- Page 3
  ('STK-062', NULL,        'Maillots',                            NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-063', 'Adapteurs', 'Ofset plate fornhead angle base',     NULL,                    29,    0, 0, 0, 'pièce', true, true),
  ('STK-064', NULL,        'Pédiatrie Knee',                      NULL,                    18,    0, 0, 0, 'pièce', true, true),
  ('STK-065', NULL,        'Pied droite #11',                     NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-066', NULL,        'Pied droite #14',                     NULL,                    3,     0, 0, 0, 'pièce', true, true),
  ('STK-067', NULL,        'Pied droite #15',                     NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-068', NULL,        'Pied droite #18',                     NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-069', NULL,        'Pied droite #20',                     NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-070', NULL,        'Pied droite #22',                     NULL,                    3,     0, 0, 0, 'pièce', true, true),
  ('STK-071', NULL,        'Pied droite #23',                     NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-072', NULL,        'Pied droite #24',                     NULL,                    4,     0, 0, 0, 'pièce', true, true),
  ('STK-073', NULL,        'Pied droite #25',                     NULL,                    10,    0, 0, 0, 'pièce', true, true),
  ('STK-074', NULL,        'Pied droite #26',                     NULL,                    9,     0, 0, 0, 'pièce', true, true),
  ('STK-075', NULL,        'Pied droite #27',                     NULL,                    5,     0, 0, 0, 'pièce', true, true),
  ('STK-076', NULL,        'Pied droite #28',                     NULL,                    2,     0, 0, 0, 'pièce', true, true),
  ('STK-077', NULL,        'Pied droite #29',                     NULL,                    5,     0, 0, 0, 'pièce', true, true),
  ('STK-078', NULL,        'Pied Gauche #20',                     NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-079', NULL,        'Pied Gauche #22',                     NULL,                    5,     0, 0, 0, 'pièce', true, true),
  ('STK-080', NULL,        'Pied Gauche #23',                     NULL,                    2,     0, 0, 0, 'pièce', true, true),
  ('STK-081', NULL,        'Pied Gauche #24',                     NULL,                    5,     0, 0, 0, 'pièce', true, true),
  ('STK-082', NULL,        'Pied Gauche #25',                     NULL,                    7,     0, 0, 0, 'pièce', true, true),
  ('STK-083', NULL,        'Pied Gauche #26',                     NULL,                    11,    0, 0, 0, 'pièce', true, true),
  ('STK-084', NULL,        'Pied Gauche #27',                     NULL,                    12,    0, 0, 0, 'pièce', true, true),
  ('STK-085', NULL,        'Pied Gauche #28',                     NULL,                    6,     0, 0, 0, 'pièce', true, true),
  ('STK-086', NULL,        'Pied Gauche #29',                     NULL,                    7,     0, 0, 0, 'pièce', true, true),
  ('STK-087', NULL,        'pin',                                 NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-088', NULL,        'Pinces à Rivet',                      NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-089', NULL,        'polypropylène blanc',                 NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-090', NULL,        'Pommade Vaseline',                    NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-091', NULL,        'PVA grand',                           NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-092', NULL,        'Rappon',                              NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-093', NULL,        'Rivet Aluminium 20mm/3mm',            NULL,                    33,    0, 0, 0, 'pièce', true, true),
  ('STK-094', NULL,        'Rivet en cuivre',                     NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-095', NULL,        'Rivet tibulaire',                     NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-096', NULL,        'Rondelle',                            NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-097', 'Adapteurs', 'Rondelle Space plate',                NULL,                    64,    0, 0, 0, 'pièce', true, true),
  ('STK-098', NULL,        'Rouleau coton',                       NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-099', NULL,        'Rouleau papier à l''aise',            NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-100', NULL,        'Rouleau sablé fin',                   NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-101', NULL,        'Rouleau sablé Gros',                  NULL,                    1,     0, 0, 0, 'pièce', true, true),
  ('STK-102', NULL,        'Rouleau velcro femelle',              NULL,                    15,    0, 0, 0, 'pièce', true, true),
  ('STK-103', NULL,        'Rouleau velcro mal',                  NULL,                    16,    0, 0, 0, 'pièce', true, true),
  ('STK-104', NULL,        'sablé fin',                           NULL,                    1200,  0, 0, 0, 'pièce', true, true),
  ('STK-105', NULL,        'sablé Gros',                          NULL,                    1600,  0, 0, 0, 'pièce', true, true),
  ('STK-106', NULL,        'Sac plâtre',                          NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-107', NULL,        'sangle',                              NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-108', NULL,        'sangle noir',                         NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-109', NULL,        'Sangles pré fabriqué',                NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-110', NULL,        'Shell gauche',                        NULL,                    5,     0, 0, 0, 'pièce', true, true),
  ('STK-111', NULL,        'Shell droite',                        NULL,                    13,    0, 0, 0, 'pièce', true, true),
  ('STK-112', NULL,        'Shell droite',                        NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-113', NULL,        'shinker',                             NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-114', 'Manchons',  'Silicon Liner',                       'Standard',              94,    0, 0, 0, 'pièce', true, true),
  ('STK-115', NULL,        'Silicon Liner',                       NULL,                    101,   0, 0, 0, 'pièce', true, true),
  ('STK-116', NULL,        'Silicon Liner avec Pin female',       NULL,                    49,    0, 0, 0, 'pièce', true, true),
  ('STK-117', NULL,        'Silicon Liner avec Pin male',         NULL,                    6,     0, 0, 0, 'pièce', true, true),
  ('STK-118', NULL,        'Silicon Liner avec sil',              NULL,                    15,    0, 0, 0, 'pièce', true, true),
  ('STK-119', NULL,        'Silicon Liner fin',                   NULL,                    8,     0, 0, 0, 'pièce', true, true),
  ('STK-120', NULL,        'Silicon Liner petit',                 NULL,                    20,    0, 0, 0, 'pièce', true, true),
  ('STK-121', NULL,        'Silicone spray',                      NULL,                    3,     0, 0, 0, 'pièce', true, true),
  ('STK-122', NULL,        'Sleeve',                              NULL,                    18,    0, 0, 0, 'pièce', true, true),

  -- Page 4
  ('STK-123', NULL,        'sleeve en boîte',                     NULL,                    2,     0, 0, 0, 'pièce', true, true),
  ('STK-124', 'Adapteurs', 'Socket adapter',                      'Connect avec Aramidal', 246,   0, 0, 0, 'pièce', true, true),
  ('STK-125', 'Adapteurs', 'socket adapter female',               'Ou adapter Pieds',      60,    0, 0, 0, 'pièce', true, true),
  ('STK-126', 'Adapteurs', 'socket adapter with receiver',        NULL,                    141,   0, 0, 0, 'pièce', true, true),
  ('STK-127', 'Adapteurs', 'Socket adaptor avec pin',             NULL,                    17,    0, 0, 0, 'pièce', true, true),
  ('STK-128', 'Adapteurs', 'socket adaptor pin',                  NULL,                    27,    0, 0, 0, 'pièce', true, true),
  ('STK-129', 'Adapteurs', 'socket adaptor sans pin',             NULL,                    63,    0, 0, 0, 'pièce', true, true),
  ('STK-130', NULL,        'support main(splint)',                NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-131', NULL,        'Tape',                                NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-132', NULL,        'Tongue depressor',                    NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-133', 'Adapteurs', 'Tube Adapter Male',                   NULL,                    9,     0, 0, 0, 'pièce', true, true),
  ('STK-134', 'Adapteurs', 'Tube adaptor enfant',                 NULL,                    43,    0, 0, 0, 'pièce', true, true),
  ('STK-135', NULL,        'Tube clamp adaptor',                  NULL,                    93,    0, 0, 0, 'pièce', true, true),
  ('STK-136', NULL,        'Tuile',                               NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-137', NULL,        'Valve',                               NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-138', NULL,        'velcro femelle',                      NULL,                    15000, 0, 0, 0, 'pièce', true, true),
  ('STK-139', NULL,        'velcro mal',                          NULL,                    16000, 0, 0, 0, 'pièce', true, true),
  ('STK-140', NULL,        'Vice étoile',                         NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-141', NULL,        'Vices plat',                          NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-142', NULL,        'woker',                               NULL,                    0,     0, 0, 0, 'pièce', true, true),
  ('STK-143', NULL,        'Lame carbone #22',                    NULL,                    1,     0, 0, 0, 'pièce', true, true);

-- 3. Rendre le stock visible dans toutes les annexes (annexe_id = NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'erp_produits' AND column_name = 'annexe_id'
  ) THEN
    EXECUTE 'UPDATE erp_produits SET annexe_id = NULL';
  END IF;
END $$;

COMMIT;

-- Vérification du nombre d'articles insérés
SELECT COUNT(*) AS total_articles_en_stock FROM erp_produits;
