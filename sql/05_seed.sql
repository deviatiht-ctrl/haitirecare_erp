-- Sample Data for Demo
-- Run this after: 04_roles.sql

-- Sample products for demo
INSERT INTO erp_produits (code, designation, categorie, quantite, quantite_min, prix_achat, prix_vente, unite)
VALUES
('ART-001', 'Ordinateur Portable Dell', 'Informatique', 5, 2, 800, 1200, 'pièce'),
('ART-002', 'Écran 24 pouces', 'Informatique', 8, 3, 200, 350, 'pièce'),
('ART-003', 'Clavier sans fil', 'Accessoires', 15, 5, 25, 55, 'pièce'),
('ART-004', 'Ramette de papier A4', 'Fournitures', 3, 10, 8, 15, 'ramette'),
('ART-005', 'Stylo bille (boîte)', 'Fournitures', 20, 5, 3, 7, 'boîte');

-- Sample clients
INSERT INTO erp_clients (nom, prenom, email, phone, type)
VALUES
('Entreprise ABC', null, 'contact@abc.ht', '+509 3700-0001', 'entreprise'),
('Dupont', 'Jean', 'jean.dupont@email.com', '+509 3700-0002', 'particulier'),
('Société XYZ', null, 'info@xyz.ht', '+509 3700-0003', 'entreprise');
