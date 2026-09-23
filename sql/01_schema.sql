-- ERP Database Schema
-- Run this first: 01_schema.sql

-- Company settings
CREATE TABLE erp_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text DEFAULT 'Mon Entreprise',
  company_email text,
  company_phone text,
  company_website text,
  company_address text,
  company_city text,
  company_country text,
  company_rc text,
  company_ifu text,
  default_currency text DEFAULT 'HTG',
  logo_url text,
  sector text,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO erp_settings (company_name, default_currency) VALUES ('Mon Entreprise', 'HTG');

-- Job positions
CREATE TABLE erp_postes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  department text,
  description text,
  permissions jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- User profiles (extends auth.users)
CREATE TABLE erp_users (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  first_name text,
  last_name text,
  email text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'employe'
    CHECK (role IN ('pdg','secretaire','comptable',
                   'responsable_stock','commercial','rh','employe')),
  poste_id uuid REFERENCES erp_postes(id),
  avatar_url text,
  is_active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stock / Products
CREATE TABLE erp_produits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE,
  designation text NOT NULL,
  categorie text,
  fournisseur text,
  quantite numeric DEFAULT 0,
  quantite_min numeric DEFAULT 0,
  prix_achat numeric DEFAULT 0,
  prix_vente numeric DEFAULT 0,
  unite text DEFAULT 'pièce',
  description text,
  image_url text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stock movements
CREATE TABLE erp_stock_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  produit_id uuid REFERENCES erp_produits(id),
  type text NOT NULL CHECK (type IN ('entree','sortie')),
  quantite numeric NOT NULL,
  prix_unitaire numeric,
  fournisseur text,
  client_id uuid,
  motif text,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Clients
CREATE TABLE erp_clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nom text NOT NULL,
  prenom text,
  company text,
  email text,
  phone text,
  address text,
  type text DEFAULT 'particulier' CHECK (type IN ('particulier','entreprise')),
  notes text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Client interactions (suivi)
CREATE TABLE erp_client_suivi (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES erp_clients(id),
  type text CHECK (type IN ('appel','email','reunion','autre')),
  notes text,
  next_action text,
  next_action_date date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Finances - revenues
CREATE TABLE erp_revenus (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date_transaction date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  categorie text,
  client_id uuid REFERENCES erp_clients(id),
  montant numeric NOT NULL,
  devise text DEFAULT 'HTG',
  recu_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Finances - expenses
CREATE TABLE erp_depenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date_transaction date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  categorie text,
  montant numeric NOT NULL,
  devise text DEFAULT 'HTG',
  recu_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Daily cash register
CREATE TABLE erp_caisse (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date_caisse date UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  solde_ouverture numeric DEFAULT 0,
  solde_fermeture numeric,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE erp_caisse_operations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  caisse_id uuid REFERENCES erp_caisse(id),
  type text CHECK (type IN ('entree','sortie')),
  description text,
  montant numeric NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- HR - Employees extended info
CREATE TABLE erp_employes (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  date_embauche date,
  type_contrat text,
  salaire_base numeric,
  cnss_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  conges_restants int DEFAULT 15,
  created_at timestamptz DEFAULT now()
);

-- Attendance
CREATE TABLE erp_presences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id uuid REFERENCES auth.users(id),
  date_presence date NOT NULL DEFAULT CURRENT_DATE,
  heure_arrivee time,
  heure_depart time,
  statut text DEFAULT 'present'
    CHECK (statut IN ('present','absent','retard','conge','ferie')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(employe_id, date_presence)
);

-- Leave requests
CREATE TABLE erp_conges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id uuid REFERENCES auth.users(id),
  type_conge text,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  nb_jours int,
  motif text,
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','approuve','refuse')),
  commentaire_rh text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Performance reviews
CREATE TABLE erp_performances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id uuid REFERENCES auth.users(id),
  periode text NOT NULL,
  score int CHECK (score BETWEEN 0 AND 100),
  objectifs_atteints boolean DEFAULT false,
  commentaire text,
  evaluateur_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Tasks
CREATE TABLE erp_taches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titre text NOT NULL,
  description text,
  assigne_a uuid REFERENCES auth.users(id),
  assigne_par uuid REFERENCES auth.users(id),
  priorite text DEFAULT 'moyenne'
    CHECK (priorite IN ('haute','moyenne','basse')),
  statut text DEFAULT 'a_faire'
    CHECK (statut IN ('a_faire','en_cours','en_revision','termine')),
  module_tag text,
  echeance date,
  fichier_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE erp_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  titre text NOT NULL,
  message text,
  type text DEFAULT 'info'
    CHECK (type IN ('info','success','warning','danger')),
  is_read boolean DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

-- Activity log
CREATE TABLE erp_activites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  module text,
  details text,
  created_at timestamptz DEFAULT now()
);

-- Messages/Communication
CREATE TABLE erp_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid REFERENCES auth.users(id),
  recipient_id uuid REFERENCES auth.users(id),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Auto update triggers
CREATE OR REPLACE FUNCTION erp_update_ts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_erp_users BEFORE UPDATE ON erp_users
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
CREATE TRIGGER trg_erp_produits BEFORE UPDATE ON erp_produits
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
CREATE TRIGGER trg_erp_clients BEFORE UPDATE ON erp_clients
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
CREATE TRIGGER trg_erp_taches BEFORE UPDATE ON erp_taches
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
CREATE TRIGGER trg_erp_conges BEFORE UPDATE ON erp_conges
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();

-- Stock quantity auto-update on movement
CREATE OR REPLACE FUNCTION update_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'entree' THEN
    UPDATE erp_produits SET quantite = quantite + NEW.quantite
    WHERE id = NEW.produit_id;
  ELSIF NEW.type = 'sortie' THEN
    UPDATE erp_produits SET quantite = quantite - NEW.quantite
    WHERE id = NEW.produit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement
AFTER INSERT ON erp_stock_movements
FOR EACH ROW EXECUTE FUNCTION update_stock_on_movement();
