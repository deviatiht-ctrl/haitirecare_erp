# HAITI REH-CARE — ERP Database Setup Guide

## Important: Follow These Steps in Order

### 1. Create Supabase Project
- Go to [supabase.com](https://supabase.com) and create a new project
- Wait for the project to be fully provisioned (2-3 minutes)

### 2. Get Your Credentials
- Go to Project Settings → API
- Copy your **Project URL** and **anon public key**
- Update `assets/js/supabase.js` (ERP) and `site/assets/site.js` (site public) with these values:
  ```javascript
  const SUPABASE_URL = 'YOUR_PROJECT_URL';  // e.g., https://xxx.supabase.co
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  ```
  **IMPORTANT:** Do NOT include `/rest/v1/` in the URL. Just use the base project URL.

### 3. Create the Direction User (CRITICAL STEP)
Before running any SQL files, you MUST create the direction user:

1. Go to Authentication → Users in Supabase dashboard
2. Click "Add user" → "Create new user"
3. Enter the direction email: `haitirecareerp@gmail.com`
4. Set a secure password
5. Click "Create user"

### 4. Run SQL Files in Order
Open the SQL Editor in Supabase and run these files **in this exact order**:

1. **01_schema.sql** - Creates all database tables and triggers
2. **02_rls.sql** - Sets up Row Level Security policies
3. **03_storage.sql** - Creates storage buckets (produits, reçus, documents, avatars, **logo**)
4. **04_roles.sql** - Job positions, roles and user-management functions
5. **05_seed.sql** - (Optional) Adds sample data for testing
6. **06_enterprise_registration.sql** - Enterprise tables, custom modules, user-enterprise links
7. **09_fixes.sql** - Fixes (roles check, sectorial modules)
8. **10_haiti_rehcare.sql** - HAITI REH-CARE enterprise + clinical tables (patients, rdv, séances, prothèses, orthèses) + seed
9. **11_portal.sql** - Public portal: patient accounts, annonces (achat/vente), staff creation fix, logo storage policies
10. **12_cleanup.sql** - (OPTIONNEL) Retire les objets CVisual d'une base existante. Le système fonctionne sans ce fichier.

### 5. Verify the Setup
After running all SQL files:

1. Check the `erp_users` table - you should see the direction user with `role = 'pdg'`
2. Check the `erp_postes` table - clinical positions (Physiothérapeute, Médecin Référent, etc.)
3. Check the `erp_settings` table - HAITI REH-CARE company settings
4. Check `erp_enterprise_registrations` - one active enterprise: HAITI REH-CARE

### 6. Test the Login
1. Open `index.html` in your browser
2. Login with the direction email and password you created
3. You should be redirected to the dashboard

## Database Schema Overview

### Core Tables
- **erp_settings** - Company information, logo (`logo_url`) and settings
- **erp_postes** - Job positions and permissions
- **erp_users** - User profiles (extends auth.users)
- **erp_user_enterprises** - User ↔ enterprise links
- **erp_enterprise_registrations** - Registered enterprise (HAITI REH-CARE)
- **erp_modules / erp_user_modules** - Dynamic module system

### Clinical (Physiothérapie)
- **erp_patients** - Patient records (`user_id` links to the public site account)
- **erp_services** - Care services & pricing (public catalog)
- **erp_rdv** - Appointments (online booking enabled)
- **erp_seances** - Treatment sessions
- **erp_protheses / erp_ortheses** - Prosthesis/orthosis tracking

### Public Website (site/)
- **erp_annonces** - Classified ads: buy/sell prostheses & orthopedic equipment (moderated in ERP)
- Public RPCs: `erp_public_enterprise`, `erp_public_catalog`, `erp_portal_register_patient`, `erp_portal_staff`, `erp_my_patient_id`

### Stock Management
- **erp_produits** - Product catalog (`is_public` = visible on the site)
- **erp_stock_movements** - Stock entry/exit records

### Client Management
- **erp_clients** - Client information
- **erp_client_suivi** - Client interactions history

### Finance
- **erp_revenus** - Revenue records
- **erp_depenses** - Expense records
- **erp_caisse** - Daily cash register
- **erp_caisse_operations** - Cash operations

### HR
- **erp_employes** - Employee extended info
- **erp_presences** - Attendance records
- **erp_conges** - Leave requests
- **erp_performances** - Performance reviews

### Tasks & Communication
- **erp_taches** - Task management
- **erp_messages** - Internal + patient↔staff messaging
- **erp_notifications** - User notifications
- **erp_activites** - Activity log

## Security Features

### Row Level Security (RLS)
All tables have RLS enabled with policies based on user roles:
- **PDG / Direction** - Full access to everything
- **Secrétaire** - Patients, rdv, tasks, reports (read/write)
- **Comptable** - Finances, clients, reports (read/write)
- **Responsable Stock** - Stock management, reports
- **RH** - HR management, tasks, reports
- **Employé / Praticien** - Own tasks, own patients (praticien_id), sessions
- **Patient (site)** - Own record, own appointments, own annonces, messaging

## Creating Staff Members

From the ERP: **Utilisateurs → Ajouter un utilisateur**.

The page calls `erp_register_staff` (RPC) which creates the `erp_users`
profile, links the user to the enterprise and creates the `erp_employes`
record in one call — the new employee shows up immediately in the ERP.

## Common Issues

### "Invalid API key" Error
- Make sure you copied the correct credentials from Supabase
- Check that you're using the base project URL (without `/rest/v1/`)

### Employee created in Supabase but not visible in the ERP
- Make sure `11_portal.sql` was run (it provides `erp_register_staff`)
- The user creation flow uses a temporary auth client so the admin
  session is preserved — the profile is then created via the RPC.

### "Permission denied" Errors
- Make sure RLS is enabled (02_rls.sql was run successfully)
- Check that the user has the correct role assigned

## Storage Buckets

- **erp-produits** - Product images (public)
- **erp-recus** - Receipts (private)
- **erp-documents** - General documents (private)
- **erp-avatars** - User avatars (public)
- **erp-settings** - Company **logo** (public, managed in Paramètres → Entreprise)

## Public Website (site/)

The `site/` folder contains the public patient-facing website:
- `index.html` - Home
- `soins.html` - Services & pricing
- `materiel.html` - Orthopedic equipment catalog
- `rendez-vous.html` - Online booking (creates a patient account)
- `annonces.html` - Marketplace (buy/sell prostheses & equipment)
- `compte.html` - Patient account: appointments + chat with the médecin référent
- `contact.html` - Contact page

Website management (appointments, annonces moderation, patient messages)
is done inside the ERP: module **Site Web**.
