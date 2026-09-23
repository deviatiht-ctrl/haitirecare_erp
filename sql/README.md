# ERP Database Setup Guide

## Important: Follow These Steps in Order

### 1. Create Supabase Project
- Go to [supabase.com](https://supabase.com) and create a new project
- Wait for the project to be fully provisioned (2-3 minutes)

### 2. Get Your Credentials
- Go to Project Settings → API
- Copy your **Project URL** and **anon public key**
- Update `assets/js/supabase.js` with these values:
  ```javascript
  const SUPABASE_URL = 'YOUR_PROJECT_URL';  // e.g., https://xxx.supabase.co
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  ```
  **IMPORTANT:** Do NOT include `/rest/v1/` in the URL. Just use the base project URL.

### 3. Create the PDG User (CRITICAL STEP)
Before running any SQL files, you MUST create the PDG user:

1. Go to Authentication → Users in Supabase dashboard
2. Click "Add user" → "Create new user"
3. Enter the PDG email (e.g., `pdg@entreprise.com`)
4. Set a secure password
5. Click "Create user"

### 4. Update the PDG Email in SQL
Open `sql/04_roles.sql` and change line 10:
```sql
WHERE email = 'pdg@entreprise.com'
```
Replace `pdg@entreprise.com` with the actual email you created in step 3.

### 5. Run SQL Files in Order
Open the SQL Editor in Supabase and run these files **in this exact order**:

1. **01_schema.sql** - Creates all database tables and triggers
2. **02_rls.sql** - Sets up Row Level Security policies
3. **03_storage.sql** - Creates storage buckets for file uploads
4. **04_roles.sql** - Assigns PDG role and creates job positions
5. **05_seed.sql** - (Optional) Adds sample data for testing

### 6. Verify the Setup
After running all SQL files:

1. Check the `erp_users` table - you should see the PDG user with `role = 'pdg'`
2. Check the `erp_postes` table - you should see 7 job positions
3. Check the `erp_settings` table - should have default company settings

### 7. Test the Login
1. Open `index.html` in your browser
2. Login with the PDG email and password you created
3. You should be redirected to the PDG dashboard

## Database Schema Overview

### Core Tables
- **erp_settings** - Company information and settings
- **erp_postes** - Job positions and permissions
- **erp_users** - User profiles (extends auth.users)

### Stock Management
- **erp_produits** - Product catalog
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

### Tasks
- **erp_taches** - Task management

### System
- **erp_notifications** - User notifications
- **erp_activites** - Activity log

## Security Features

### Row Level Security (RLS)
All tables have RLS enabled with policies based on user roles:
- **PDG** - Full access to everything
- **Secrétaire** - Clients, tasks, reports (read/write)
- **Comptable** - Finances, clients, reports (read/write)
- **Responsable Stock** - Stock management, reports
- **Commercial** - Clients, stock (read), tasks
- **RH** - HR management, tasks, reports
- **Employé** - Own tasks, own attendance, own leave requests

### Triggers
- Auto-update `updated_at` timestamps
- Auto-update stock quantity on stock movements

## Common Issues

### "Invalid API key" Error
- Make sure you copied the correct credentials from Supabase
- Check that you're using the base project URL (without `/rest/v1/`)

### "User not found" Error
- Make sure you created the PDG user in Supabase Auth BEFORE running 04_roles.sql
- Verify the email in 04_roles.sql matches exactly

### "Permission denied" Errors
- Make sure RLS is enabled (02_rls.sql was run successfully)
- Check that the user has the correct role assigned

### SQL Errors
- Run files in the exact order: 01 → 02 → 03 → 04 → 05
- Check Supabase SQL Editor for error messages
- Make sure all previous files completed successfully before running the next

## Storage Buckets

Created buckets:
- **erp-produits** - Product images (public)
- **erp-recus** - Receipts (private)
- **erp-documents** - General documents (private)
- **erp-avatars** - User avatars (public)
- **erp-settings** - Company logo/settings (public)

## Next Steps

After database setup:
1. Replace the placeholder logo in `assets/img/logo-placeholder.svg`
2. Create additional users via the PDG dashboard
3. Add your actual company settings in the Settings module
4. Start adding products, clients, and other data
