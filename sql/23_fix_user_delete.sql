-- 23_fix_user_delete.sql
-- Repare erè "Database error deleting user" nan Supabase Auth.
--
-- Pwoblèm: erp_users.id, erp_employes.id ak ~50 lòt kolòn (created_by,
-- praticien_id, employe_id, sender_id, elatriye) referanse auth.users(id)
-- oswa erp_users(id) SAN ON DELETE — PostgreSQL bloke efasman an.
--
-- Solisyon: rekreye tout kontrant FK ki pointe sou auth.users(id) oswa
-- public.erp_users(id) ak bon aksyon an:
--   CASCADE  → ranje ki pa gen sans san itilizatè a (pwofil, employe,
--              lyen antrepriz, modil, notifikasyon, presans, konje, pèfomans)
--   SET NULL → referans istorik (created_by, medecin_id, sender_id, elatriye)
--
-- NB: nou itilize pg_catalog (pa information_schema) paske auth.users
-- posede pa yon lòt wòl e li pa vizib nan information_schema.
--
-- Fichye a idempotent: ou ka kouri l sou baz ki deja egziste a AK sou
-- nouvo deplwyman an (apre tout lòt fichye yo).

DO $$
DECLARE
  r record;
  v_action text;
  v_ref text;
  v_cascade_tables text[] := ARRAY[
    'erp_users', 'erp_employes', 'erp_user_enterprises', 'erp_user_modules',
    'erp_notifications', 'erp_presences', 'erp_conges', 'erp_performances'
  ];
BEGIN
  FOR r IN
    SELECT con.conname AS constraint_name,
           cl.relname AS table_name,
           a.attname AS column_name,
           a.attnotnull AS notnull,
           ref_ns.nspname AS ref_schema
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_class ref_cl ON ref_cl.oid = con.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1   -- sèlman FK yon sèl kolòn
      AND (
        (ref_ns.nspname = 'auth'   AND ref_cl.relname = 'users')
     OR (ref_ns.nspname = 'public' AND ref_cl.relname = 'erp_users')
      )
  LOOP
    v_action := CASE
      WHEN r.table_name = ANY (v_cascade_tables)
           AND r.column_name IN ('id', 'user_id', 'employe_id') THEN 'CASCADE'
      WHEN r.notnull THEN 'CASCADE'
      ELSE 'SET NULL'
    END;
    v_ref := CASE WHEN r.ref_schema = 'auth' THEN 'auth.users' ELSE 'public.erp_users' END;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE %s',
                   r.table_name, r.constraint_name, r.column_name, v_ref, v_action);
    RAISE NOTICE 'FK %.% ON DELETE %', r.table_name, r.column_name, v_action;
  END LOOP;
END $$;
