-- =============================================================================
-- Hailite Manager — schéma complet de la base de données
-- =============================================================================
-- À exécuter UNE SEULE FOIS, dans l'éditeur SQL de Supabase, sur un projet
-- neuf. C'est la première chose à faire : sans ces tables, le serveur démarre
-- mais aucune donnée ne peut être lue ni écrite.
--
-- Ordre d'installation complet :
--   1. supabase/schema.sql        ← ce fichier (structure)
--   2. supabase/provision.sql     ← votre compagnie et votre premier accès
--   3. supabase_security.sql      ← journal d'audit et verrouillage RLS
--   4. supabase/migrations/*.sql  ← seulement si vous mettez à jour une base
--                                   installée avant cette version
--
-- Tout est écrit en « if not exists » : réexécuter ce fichier ne détruit rien
-- et ne modifie aucune donnée existante. Il peut donc être relancé sans
-- crainte si une exécution a été interrompue.
--
-- Ce que ce fichier ne fait PAS : il ne crée aucune compagnie, aucun compte et
-- aucun mot de passe. Voir provision.sql pour ça.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto sert à chiffrer le NIP du premier compte administrateur dans
-- provision.sql. Sur Supabase elle est déjà installée dans le schéma
-- « extensions »; les deux lignes ci-dessous ne font rien si c'est déjà le cas.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- 1) TABLES
-- =============================================================================
-- Les clés étrangères sont ajoutées plus bas, en section 3, pour que l'ordre de
-- création des tables n'ait aucune importance.

-- --- La compagnie ------------------------------------------------------------
-- Une seule ligne par déploiement. Un client = un serveur = une compagnie.
create table if not exists public.companies (
  id uuid default gen_random_uuid() not null,
  name text not null,
  country text default 'Canada'::text not null,
  region text not null,
  currency text default 'CAD'::text not null,
  tax_name text default 'GST'::text not null,
  tax_rate numeric default 5 not null,
  unit_system text default 'imperial'::text not null,
  created_at timestamp with time zone default now() not null,
  address text,
  phone text,
  email text,
  gst_number text,
  qst_number text,
  wcb_number text,
  bn_number text,
  construction_license_number text,
  logo text,
  interac_email text,
  bank_name text,
  bank_transit text,
  bank_institution text,
  bank_account text,
  geofencing_enabled boolean default true,
  vacation_rate numeric default 0.04,
  legal_minimum_wage numeric,
  voice_reminder_volume integer default 50,
  voice_reminder_schedule text,
  payment_terms text,
  default_late_interest_pct numeric,
  default_warranty_years integer,
  default_clause_change_order text,
  default_clause_resiliation text,
  payroll_vacation_rate numeric,
  payroll_health_insurance numeric,
  payroll_dental_insurance numeric,
  payroll_life_insurance numeric,
  payroll_ltd numeric,
  payroll_rrsp numeric,
  payroll_eap numeric,
  payroll_custom1_name text,
  payroll_custom1_amount numeric,
  payroll_custom2_name text,
  payroll_custom2_amount numeric,
  is_onboarded boolean default false,
  tax_rate1 numeric,
  tax_rate2 numeric,
  tax_rate1_name text,
  tax_rate2_name text,
  payment_deposit_pct numeric default 25,
  payment_mid_pct numeric default 25,
  payment_final_pct numeric default 50,
  ai_provider text,
  -- Conservée pour compatibilité, mais laissée vide : les clés IA vivent
  -- exclusivement dans les variables d'environnement du serveur.
  ai_api_key text,
  date_locale text,
  data_storage_mode text default 'hybrid'::text not null,
  cloud_sync_consent boolean default true not null,
  cloud_region text default 'ca-central-1'::text not null,
  privacy_policy_version text,
  privacy_policy_accepted_at timestamp with time zone,
  privacy_contact_email text,
  privacy_officer_name text,
  retention_months integer default 84 not null,
  employee_data_basis_confirmed boolean default false not null,
  location_data_notice_confirmed boolean default false not null,
  cross_border_transfer_acknowledged_at timestamp with time zone,
  tax_confirmed_at timestamp with time zone,
  tax_disclaimer_accepted_at timestamp with time zone,
  local_tax_rate numeric default 0 not null,
  compliance_version text,
  processor_terms_accepted_at timestamp with time zone,
  personal_cloud_provider text,
  backup_folder_name text,
  backup_file_name text,
  backup_connection_method text,
  personal_backup_connected boolean default false not null,
  personal_backup_automatic boolean default false not null,
  last_personal_backup_at timestamp with time zone,
  constraint companies_pkey primary key (id),
  constraint companies_personal_cloud_provider_check check (
    personal_cloud_provider is null or personal_cloud_provider = any (array[
      'google_drive'::text, 'onedrive'::text, 'dropbox'::text, 'icloud_drive'::text,
      'samsung_cloud'::text, 'device_folder'::text, 'other'::text])),
  constraint companies_backup_connection_method_check check (
    backup_connection_method is null or backup_connection_method = any (array[
      'directory_handle'::text, 'file_handle'::text, 'system_export'::text]))
);

-- --- Les personnes -----------------------------------------------------------
-- access_code_hash contient un NIP chiffré (bcrypt). Le NIP en clair n'est
-- jamais stocké, jamais journalisé et jamais transmis à un modèle d'IA.
create table if not exists public.app_users (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  full_name text not null,
  avatar_initials text not null,
  role text not null,
  access_code_hash text not null,
  pay_mode text default 'hourly'::text not null,
  pay_rate numeric default 0 not null,
  failed_attempts integer default 0 not null,
  locked_until timestamp with time zone,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  worker_type text,
  as_number text,
  phone text,
  address text,
  hire_date date,
  avatar text,
  level integer default 1,
  xp integer default 0,
  contract_renewal_date date,
  vacation_rate_override numeric,
  email text,
  city text,
  province text,
  postal_code text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  business_name text,
  gst_number text,
  sin text,
  employee_province text,
  pay_frequency text,
  pay_period_start date,
  annual_salary numeric,
  credentials jsonb default '[]'::jsonb not null,
  business_logo text,
  privacy_notice_version text,
  privacy_notice_acknowledged_at timestamp with time zone,
  location_notice_acknowledged_at timestamp with time zone,
  constraint app_users_pkey primary key (id)
);

-- --- Journal d'audit ---------------------------------------------------------
-- Également créé par supabase_security.sql; répété ici pour qu'une base montée
-- à partir de ce seul fichier soit déjà complète.
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() not null,
  at timestamp with time zone default now() not null,
  user_id uuid,
  user_name text,
  role text,
  company_id uuid,
  action text not null,
  target text not null,
  target_id text,
  details jsonb,
  constraint audit_logs_pkey primary key (id)
);

-- --- Limitation des tentatives de connexion ----------------------------------
-- Le compteur vit en base et non en mémoire : sur Vercel, chaque requête peut
-- atterrir sur une instance différente, un compteur en mémoire ne freinerait
-- donc personne.
create table if not exists public.auth_login_attempts (
  key_hash text not null,
  failure_count integer default 0 not null,
  first_failed_at timestamp with time zone default now() not null,
  blocked_until timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint auth_login_attempts_pkey primary key (key_hash),
  constraint auth_login_attempts_failure_count_check check (failure_count >= 0)
);

-- --- Clients et chantiers ----------------------------------------------------
create table if not exists public.clients (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  phone text,
  address text,
  created_at timestamp with time zone default now() not null,
  company text,
  email text,
  constraint clients_pkey primary key (id)
);

create table if not exists public.projects (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  client_id uuid,
  name text not null,
  address text,
  region text,
  status text default 'active'::text not null,
  contract_amount numeric default 0 not null,
  progress_percent numeric default 0 not null,
  geofence_radius_feet numeric default 300 not null,
  latitude numeric,
  longitude numeric,
  created_at timestamp with time zone default now() not null,
  client_name text,
  radius numeric default 100,
  constraint projects_pkey primary key (id)
);

create table if not exists public.project_assignments (
  id uuid default gen_random_uuid() not null,
  project_id uuid not null,
  user_id uuid not null,
  pay_mode text default 'hourly'::text not null,
  rate numeric default 0 not null,
  created_at timestamp with time zone default now(),
  company_id uuid not null,
  constraint project_assignments_pkey primary key (id)
);

create table if not exists public.project_tasks (
  id uuid default gen_random_uuid() not null,
  project_id uuid not null,
  assigned_user_id uuid,
  title text not null,
  section text,
  status text default 'todo'::text not null,
  photo_required boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  priority text default 'normal'::text,
  company_id uuid not null,
  constraint project_tasks_pkey primary key (id)
);

create table if not exists public.project_tools (
  id uuid default gen_random_uuid() not null,
  project_id uuid,
  name text,
  brought boolean default false,
  created_at timestamp with time zone default now(),
  company_id uuid not null,
  constraint project_tools_pkey primary key (id)
);

create table if not exists public.project_photos (
  id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  phase text default 'during'::text not null,
  image_url text not null,
  caption text,
  taken_at timestamp with time zone default now() not null,
  taken_by uuid,
  taken_by_name text,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone default now() not null,
  constraint project_photos_pkey primary key (id),
  constraint project_photos_phase_check check (
    phase = any (array['before'::text, 'during'::text, 'after'::text]))
);

-- --- Pointage ----------------------------------------------------------------
-- user_id et employee_id désignent la même personne : deux générations de code
-- qui coexistent. Un déclencheur (section 5) recopie l'une sur l'autre pour
-- qu'aucune écriture ne laisse la moitié du couple vide.
create table if not exists public.punches (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  project_id uuid,
  user_id uuid not null,
  status text default 'off'::text not null,
  punch_in_at timestamp with time zone,
  punch_out_at timestamp with time zone,
  break_minutes numeric default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  employee_id uuid,
  employee_name text,
  project_name text,
  pay_mode text,
  rate numeric,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  paused_at timestamp with time zone,
  total_pause_minutes integer default 0,
  within_geofence boolean default true,
  attempted_outside_geofence boolean default false,
  outside_details text,
  revenue numeric default 0,
  total_worked_hours numeric,
  surface_materials jsonb,
  approval_status text default 'pending'::text not null,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamp with time zone,
  corrections jsonb,
  latitude double precision,
  longitude double precision,
  constraint punches_pkey primary key (id),
  constraint punches_approval_status_check check (
    approval_status = any (array['pending'::text, 'corrected'::text, 'approved'::text]))
);

create table if not exists public.production_entries (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  project_id uuid,
  user_id uuid not null,
  entry_date date default CURRENT_DATE not null,
  quantity numeric default 0 not null,
  unit text default 'sqft'::text not null,
  hours numeric default 0 not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  punch_id uuid,
  material_name text,
  unit_price numeric,
  emoji text,
  constraint production_entries_pkey primary key (id)
);

create table if not exists public.shift_assignments (
  id uuid not null,
  company_id uuid not null,
  date date not null,
  project_id uuid not null,
  employee_id uuid not null,
  employee_name text,
  note text,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  created_by_name text,
  constraint shift_assignments_pkey primary key (id),
  constraint shift_assignments_one_per_day unique (employee_id, date)
);

-- --- Documents (soumissions, contrats, factures) -----------------------------
create table if not exists public.documents (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  project_id uuid,
  client_id uuid,
  created_by uuid,
  kind text not null,
  document_number text not null,
  subtotal numeric default 0 not null,
  discount numeric default 0 not null,
  advance numeric default 0 not null,
  tax_rate numeric default 0 not null,
  tax_amount numeric default 0 not null,
  total numeric default 0 not null,
  status text default 'brouillon'::text not null,
  signature_name text,
  signature_data text,
  signed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  client_email text,
  client_phone text,
  client_address text,
  site_address text,
  due_date date,
  ref_quote text,
  ref_contract text,
  is_simple_layout boolean default true,
  discount_pct numeric default 0,
  holdback_pct numeric default 0,
  holdback_amount numeric default 0,
  deposit_amount numeric default 0,
  balance_due numeric default 0,
  accepted_payments text[],
  late_interest_pct numeric default 2,
  deposit_pct numeric default 25,
  payment_mid_pct numeric default 25,
  payment_final_pct numeric default 50,
  work_start_date date,
  work_end_date date,
  quote_valid_days integer default 30,
  permit_by text,
  warranty_years integer default 2,
  has_insurance boolean default true,
  subcontract_authorized boolean default true,
  subcontractor_name text,
  subcontractor_phone text,
  subcontractor_license text,
  contract_object text,
  clause_change_order text,
  clause_resiliation text,
  clause_warranty_details text,
  owner_name text,
  owner_signature text,
  client_signature text,
  date date,
  client_name text,
  constraint documents_pkey primary key (id)
);

create table if not exists public.document_items (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  description text default ''::text not null,
  quantity numeric default 1 not null,
  unit text default 'unite'::text not null,
  unit_price numeric default 0 not null,
  sort_order integer default 0 not null,
  line_type text default 'simple'::text,
  total numeric,
  cladding_type text,
  brand text,
  thickness text,
  qty_sqft numeric,
  supplier text,
  task text,
  estimated_hours numeric,
  rate numeric,
  is_flat_rate boolean default false,
  company_name text,
  phone text,
  work_type text,
  amount numeric,
  company_id uuid not null,
  constraint document_items_pkey primary key (id)
);

create table if not exists public.document_payments (
  id uuid default gen_random_uuid() not null,
  document_id uuid,
  date date,
  amount numeric,
  method text,
  notes text,
  created_at timestamp with time zone default now(),
  company_id uuid not null,
  constraint document_payments_pkey primary key (id)
);

create table if not exists public.change_orders (
  id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  number text default ''::text not null,
  description text not null,
  reason text,
  amount numeric(12,2) default 0 not null,
  photo_url text,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  created_by_name text,
  client_name text,
  client_signature text,
  signed_at timestamp with time zone,
  constraint change_orders_pkey primary key (id),
  constraint change_orders_amount_check check (amount >= 0::numeric),
  constraint change_orders_status_check check (
    status = any (array['pending'::text, 'approved'::text, 'refused'::text, 'invoiced'::text]))
);

-- --- Argent : catalogue, dépenses, paie --------------------------------------
create table if not exists public.catalog_items (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  unit text default 'pi2'::text not null,
  price numeric default 0 not null,
  taxable boolean default true not null,
  created_at timestamp with time zone default now() not null,
  emoji text,
  price_per_sqft numeric,
  supplier_price numeric,
  client_price numeric,
  supplier_id uuid,
  unit_note text,
  image_url text,
  image_alt text,
  constraint catalog_items_pkey primary key (id)
);

create table if not exists public.expenses (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  provider text,
  category text,
  project_id text,
  amount numeric,
  tax numeric default 0,
  date date,
  notes text,
  created_at timestamp with time zone default now(),
  photo_url text,
  submitted_by uuid,
  submitted_by_name text,
  constraint expenses_pkey primary key (id)
);

create table if not exists public.payroll_entries (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  user_id uuid not null,
  period_start date default CURRENT_DATE not null,
  period_end date default CURRENT_DATE not null,
  hours numeric default 0 not null,
  rate numeric default 0 not null,
  advance numeric default 0 not null,
  total numeric default 0 not null,
  status text default 'brouillon'::text not null,
  created_at timestamp with time zone default now() not null,
  employee_name text,
  invoice_number text,
  date date,
  session_ids uuid[],
  amount numeric,
  gst_amount numeric,
  qst_amount numeric,
  total_with_taxes numeric,
  notes text,
  tax_included boolean default false,
  employee_signature text,
  employee_signed_at timestamp with time zone,
  currency text,
  tax_rate1 numeric,
  tax_rate2 numeric,
  local_tax_rate numeric,
  tax_rate1_name text,
  tax_rate2_name text,
  issuer_name text,
  issuer_address text,
  issuer_tax_number text,
  issuer_logo text,
  recipient_name text,
  local_tax_amount numeric,
  constraint payroll_entries_pkey primary key (id)
);

-- worker_type_at_payment fige la nature du travailleur au moment du versement :
-- sans elle, l'historique fiscal se réécrit tout seul quand un sous-traitant
-- devient salarié. Nulle pour les versements antérieurs à cette colonne.
create table if not exists public.payroll_payments (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  employee_id uuid,
  employee_name text,
  project_id uuid,
  period text,
  amount numeric,
  status text default 'draft'::text,
  date date,
  hours numeric,
  created_at timestamp with time zone default now(),
  worker_type_at_payment text,
  constraint payroll_payments_pkey primary key (id)
);

-- --- Fournisseurs et inventaire ----------------------------------------------
create table if not exists public.suppliers (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  name text,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_at timestamp with time zone default now(),
  constraint suppliers_pkey primary key (id)
);

create table if not exists public.supplier_orders (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  supplier_name text,
  date date,
  status text default 'ordered'::text,
  total_amount numeric default 0,
  created_at timestamp with time zone default now(),
  constraint supplier_orders_pkey primary key (id)
);

create table if not exists public.supplier_order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid,
  name text,
  quantity numeric,
  price numeric,
  company_id uuid not null,
  constraint supplier_order_items_pkey primary key (id)
);

create table if not exists public.inventory_items (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  owner text,
  status text default 'available'::text not null,
  value numeric default 0 not null,
  created_at timestamp with time zone default now() not null,
  quantity numeric default 0,
  unit text,
  emoji text,
  min_threshold numeric default 0,
  constraint inventory_items_pkey primary key (id)
);

-- --- Outils et vols ----------------------------------------------------------
create table if not exists public.tool_assets (
  id uuid not null,
  company_id uuid not null,
  name text not null,
  category text default 'Autre'::text not null,
  brand text default ''::text not null,
  model text default ''::text not null,
  serial_number text default ''::text not null,
  asset_tag text default ''::text not null,
  purchase_date date,
  purchase_price numeric(12,2) default 0 not null,
  replacement_value numeric(12,2) default 0 not null,
  seller text default ''::text not null,
  warranty_expiry date,
  current_location text default ''::text not null,
  assigned_employee_id uuid,
  assigned_employee_name text,
  status text default 'in_service'::text not null,
  notes text default ''::text not null,
  tool_photo text,
  serial_photo text,
  receipt_photo text,
  receipt_file_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tool_assets_pkey primary key (id),
  constraint tool_assets_purchase_price_check check (purchase_price >= 0::numeric),
  constraint tool_assets_replacement_value_check check (replacement_value >= 0::numeric),
  constraint tool_assets_status_check check (status = any (array[
    'in_service'::text, 'loaned'::text, 'repair'::text, 'missing'::text,
    'stolen'::text, 'retired'::text]))
);

create table if not exists public.tool_theft_reports (
  id uuid not null,
  company_id uuid not null,
  incident_date date not null,
  incident_time time without time zone,
  incident_location text not null,
  circumstances text default ''::text not null,
  discovered_by text default ''::text not null,
  police_service text default ''::text not null,
  police_file_number text default ''::text not null,
  insurer text default ''::text not null,
  insurance_claim_number text default ''::text not null,
  contact_name text default ''::text not null,
  contact_phone text default ''::text not null,
  contact_email text default ''::text not null,
  tool_ids uuid[] default '{}'::uuid[] not null,
  tool_snapshots jsonb default '[]'::jsonb not null,
  total_replacement_value numeric(12,2) default 0 not null,
  status text default 'draft'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tool_theft_reports_pkey primary key (id),
  constraint tool_theft_reports_total_replacement_value_check check (total_replacement_value >= 0::numeric),
  constraint tool_theft_reports_status_check check (status = any (array[
    'draft'::text, 'reported'::text, 'insurance_submitted'::text, 'closed'::text]))
);

-- --- Assurance, prospects, sécurité ------------------------------------------
create table if not exists public.insurance_claims (
  id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  insurer text not null,
  claim_number text default ''::text not null,
  policy_number text,
  loss_type text default 'hail'::text not null,
  loss_date date,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  deductible numeric(12,2),
  acv numeric(12,2),
  rcv numeric(12,2),
  supplement_amount numeric(12,2),
  approved_amount numeric(12,2),
  status text default 'open'::text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  created_by_name text,
  constraint insurance_claims_pkey primary key (id),
  constraint insurance_claims_deductible_check check (deductible is null or deductible >= 0::numeric),
  constraint insurance_claims_acv_check check (acv is null or acv >= 0::numeric),
  constraint insurance_claims_rcv_check check (rcv is null or rcv >= 0::numeric),
  constraint insurance_claims_supplement_amount_check check (supplement_amount is null or supplement_amount >= 0::numeric),
  constraint insurance_claims_approved_amount_check check (approved_amount is null or approved_amount >= 0::numeric),
  constraint insurance_claims_loss_type_check check (loss_type = any (array[
    'hail'::text, 'wind'::text, 'water'::text, 'fire'::text, 'other'::text])),
  constraint insurance_claims_status_check check (status = any (array[
    'open'::text, 'submitted'::text, 'approved'::text, 'partial'::text,
    'denied'::text, 'closed'::text]))
);

create table if not exists public.leads (
  id uuid not null,
  company_id uuid not null,
  name text not null,
  phone text,
  email text,
  address text,
  source text default 'other'::text not null,
  status text default 'new'::text not null,
  estimated_value numeric(12,2),
  next_follow_up date,
  notes text,
  lost_reason text,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  created_by_name text,
  converted_client_id uuid,
  converted_project_id uuid,
  constraint leads_pkey primary key (id),
  constraint leads_estimated_value_check check (estimated_value is null or estimated_value >= 0::numeric),
  constraint leads_source_check check (source = any (array[
    'referral'::text, 'phone'::text, 'website'::text, 'door'::text,
    'repeat'::text, 'insurance'::text, 'other'::text])),
  constraint leads_status_check check (status = any (array[
    'new'::text, 'contacted'::text, 'inspection'::text, 'quoted'::text,
    'won'::text, 'lost'::text]))
);

create table if not exists public.safety_records (
  id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  type text default 'toolbox'::text not null,
  date date not null,
  topic text not null,
  hazards jsonb,
  controls text,
  weather text,
  notes text,
  attendees jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  created_by_name text,
  constraint safety_records_pkey primary key (id),
  constraint safety_records_type_check check (type = any (array['toolbox'::text, 'hazard'::text]))
);

-- --- Ressources humaines et motivation ---------------------------------------
create table if not exists public.hr_alerts (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  type text,
  title text,
  message text,
  date date default CURRENT_DATE,
  employee_id uuid,
  employee_name text,
  resolved boolean default false,
  created_at timestamp with time zone default now(),
  constraint hr_alerts_pkey primary key (id)
);

create table if not exists public.motivation_teams (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  name text,
  member_ids uuid[],
  color text,
  active boolean default true,
  created_at timestamp with time zone default now(),
  leader_id uuid,
  project_ids uuid[],
  constraint motivation_teams_pkey primary key (id)
);

create table if not exists public.motivation_goals (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  title text,
  scope text,
  metric text,
  target numeric,
  current numeric default 0,
  start_date date,
  end_date date,
  team_id uuid,
  employee_id uuid,
  reward_type text,
  reward_title text,
  reward_description text,
  status text default 'active'::text,
  created_at timestamp with time zone default now(),
  constraint motivation_goals_pkey primary key (id)
);

-- Une ligne par employé : la clé primaire est employee_id, pas id.
create table if not exists public.weekly_goals (
  employee_id uuid not null,
  target_amount numeric default 0,
  current_amount numeric default 0,
  week_start date,
  xp_points integer default 0,
  level integer default 1,
  streak integer default 0,
  last_punch_date date,
  company_id uuid not null,
  constraint weekly_goals_pkey primary key (employee_id)
);

-- =============================================================================
-- 2) INDEX UNIQUES COMPOSITES
-- =============================================================================
-- Ils permettent les clés étrangères sur (id, company_id) de la section 3 :
-- une ligne enfant ne peut pas pointer vers un parent d'une AUTRE compagnie.
-- C'est la barrière qui empêche techniquement une fuite entre entreprises,
-- même en cas de bogue dans le serveur.
create unique index if not exists app_users_id_company_uidx on public.app_users (id, company_id);
create unique index if not exists projects_id_company_uidx on public.projects (id, company_id);
create unique index if not exists documents_id_company_uidx on public.documents (id, company_id);
create unique index if not exists supplier_orders_id_company_uidx on public.supplier_orders (id, company_id);

-- =============================================================================
-- 3) CLÉS ÉTRANGÈRES
-- =============================================================================
-- Ajoutées après coup et une par une : « if not exists » n'existe pas pour les
-- contraintes, on vérifie donc leur présence avant de les créer, afin que le
-- fichier reste réexécutable.
do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('app_users', 'app_users_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('clients', 'clients_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('projects', 'projects_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('catalog_items', 'catalog_items_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('documents', 'documents_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('expenses', 'expenses_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('hr_alerts', 'hr_alerts_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('inventory_items', 'inventory_items_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('motivation_goals', 'motivation_goals_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('motivation_teams', 'motivation_teams_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('payroll_entries', 'payroll_entries_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('payroll_payments', 'payroll_payments_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('production_entries', 'production_entries_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('punches', 'punches_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('supplier_orders', 'supplier_orders_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),
      ('suppliers', 'suppliers_company_id_fkey', 'foreign key (company_id) references public.companies(id)'),

      ('change_orders', 'change_orders_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('change_orders', 'change_orders_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('document_items', 'document_items_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('document_items', 'document_items_document_id_fkey', 'foreign key (document_id) references public.documents(id) on delete cascade'),
      ('document_items', 'document_items_document_company_fkey', 'foreign key (document_id, company_id) references public.documents(id, company_id) on delete cascade'),
      ('document_payments', 'document_payments_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('document_payments', 'document_payments_document_id_fkey', 'foreign key (document_id) references public.documents(id) on delete cascade'),
      ('document_payments', 'document_payments_document_company_fkey', 'foreign key (document_id, company_id) references public.documents(id, company_id) on delete cascade'),
      ('insurance_claims', 'insurance_claims_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('insurance_claims', 'insurance_claims_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('leads', 'leads_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('project_assignments', 'project_assignments_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('project_assignments', 'project_assignments_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('project_assignments', 'project_assignments_project_company_fkey', 'foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade'),
      ('project_assignments', 'project_assignments_user_cascade_fkey', 'foreign key (user_id) references public.app_users(id) on delete cascade'),
      ('project_assignments', 'project_assignments_user_company_fkey', 'foreign key (user_id, company_id) references public.app_users(id, company_id) on delete cascade'),
      ('project_photos', 'project_photos_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('project_photos', 'project_photos_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('project_tasks', 'project_tasks_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('project_tasks', 'project_tasks_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('project_tasks', 'project_tasks_project_company_fkey', 'foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade'),
      ('project_tasks', 'project_tasks_assignee_company_fkey', 'foreign key (assigned_user_id, company_id) references public.app_users(id, company_id) on delete set null (assigned_user_id)'),
      ('project_tools', 'project_tools_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('project_tools', 'project_tools_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('project_tools', 'project_tools_project_company_fkey', 'foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade'),
      ('safety_records', 'safety_records_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('safety_records', 'safety_records_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('shift_assignments', 'shift_assignments_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('shift_assignments', 'shift_assignments_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('supplier_order_items', 'supplier_order_items_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('supplier_order_items', 'supplier_order_items_order_id_fkey', 'foreign key (order_id) references public.supplier_orders(id) on delete cascade'),
      ('supplier_order_items', 'supplier_order_items_order_company_fkey', 'foreign key (order_id, company_id) references public.supplier_orders(id, company_id) on delete cascade'),
      ('tool_assets', 'tool_assets_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('tool_theft_reports', 'tool_theft_reports_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('weekly_goals', 'weekly_goals_company_id_fkey', 'foreign key (company_id) references public.companies(id) on delete cascade'),
      ('weekly_goals', 'weekly_goals_employee_cascade_fkey', 'foreign key (employee_id) references public.app_users(id) on delete cascade'),
      ('weekly_goals', 'weekly_goals_employee_company_fkey', 'foreign key (employee_id, company_id) references public.app_users(id, company_id) on delete cascade')
    ) as t(tbl, name, definition)
  loop
    if not exists (
      select 1 from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = fk.tbl and con.conname = fk.name
    ) then
      execute format('alter table public.%I add constraint %I %s', fk.tbl, fk.name, fk.definition);
    end if;
  end loop;
end $$;

-- =============================================================================
-- 4) INDEX DE PERFORMANCE
-- =============================================================================
create index if not exists audit_logs_at_idx on public.audit_logs (at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);
create index if not exists audit_logs_target_idx on public.audit_logs (target, action);
create index if not exists auth_login_attempts_blocked_idx on public.auth_login_attempts (blocked_until) where blocked_until is not null;

create index if not exists change_orders_project_idx on public.change_orders (project_id, created_at desc);
create index if not exists change_orders_status_idx on public.change_orders (company_id, status);

create index if not exists document_items_company_id_idx on public.document_items (company_id);
create index if not exists document_items_company_document_idx on public.document_items (company_id, document_id);
create index if not exists document_payments_company_id_idx on public.document_payments (company_id);
create index if not exists document_payments_company_document_idx on public.document_payments (company_id, document_id);

create index if not exists insurance_claims_project_idx on public.insurance_claims (project_id, created_at desc);
create index if not exists insurance_claims_status_idx on public.insurance_claims (company_id, status);

create index if not exists leads_status_idx on public.leads (company_id, status, created_at desc);
create index if not exists leads_follow_up_idx on public.leads (company_id, next_follow_up) where next_follow_up is not null;

create index if not exists project_assignments_company_id_idx on public.project_assignments (company_id);
create unique index if not exists project_assignments_company_project_user_uidx on public.project_assignments (company_id, project_id, user_id);
create index if not exists project_assignments_company_user_project_idx on public.project_assignments (company_id, user_id, project_id);

create index if not exists project_photos_company_idx on public.project_photos (company_id, taken_at desc);
create index if not exists project_photos_project_idx on public.project_photos (project_id, phase, taken_at desc);

create index if not exists project_tasks_company_id_idx on public.project_tasks (company_id);
create index if not exists project_tasks_company_project_idx on public.project_tasks (company_id, project_id);
create index if not exists project_tools_company_id_idx on public.project_tools (company_id);
create index if not exists project_tools_company_project_idx on public.project_tools (company_id, project_id);

create index if not exists punches_approval_status_idx on public.punches (approval_status);

create index if not exists safety_records_company_idx on public.safety_records (company_id, date desc);
create index if not exists safety_records_project_idx on public.safety_records (project_id, date desc);
create index if not exists shift_assignments_day_idx on public.shift_assignments (company_id, date);
create index if not exists shift_assignments_employee_idx on public.shift_assignments (employee_id, date);

create index if not exists supplier_order_items_company_id_idx on public.supplier_order_items (company_id);
create index if not exists supplier_order_items_company_order_idx on public.supplier_order_items (company_id, order_id);

create index if not exists tool_assets_company_id_idx on public.tool_assets (company_id);
create index if not exists tool_assets_serial_number_idx on public.tool_assets (serial_number);
create index if not exists tool_assets_status_idx on public.tool_assets (company_id, status);
create index if not exists tool_theft_reports_company_id_idx on public.tool_theft_reports (company_id);
create index if not exists tool_theft_reports_incident_date_idx on public.tool_theft_reports (company_id, incident_date desc);

create index if not exists weekly_goals_company_id_idx on public.weekly_goals (company_id);
create index if not exists weekly_goals_company_employee_idx on public.weekly_goals (company_id, employee_id);

-- =============================================================================
-- 5) DÉCLENCHEUR DE POINTAGE
-- =============================================================================
-- search_path épinglé : une fonction dont le chemin de recherche est libre
-- résout ses noms d'objets selon celui de l'appelant.
create or replace function public.punches_align_user_columns()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- On ne fabrique jamais de valeur : on recopie seulement celle qui existe.
  if new.user_id is null then
    new.user_id := new.employee_id;
  elsif new.employee_id is null then
    new.employee_id := new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists punches_align_user_columns on public.punches;
create trigger punches_align_user_columns
  before insert or update on public.punches
  for each row execute function public.punches_align_user_columns();

-- =============================================================================
-- 6) VERROUILLAGE (RLS)
-- =============================================================================
-- L'application n'accède à la base QUE par le serveur, avec la clé secrète qui
-- contourne RLS. Activer RLS sans aucune politique bloque donc tout accès
-- direct : si la clé publique fuitait un jour dans un navigateur, elle ne
-- donnerait accès à rien.
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'app_users', 'audit_logs', 'auth_login_attempts', 'projects',
    'project_tools', 'project_assignments', 'project_tasks', 'project_photos',
    'punches', 'production_entries', 'shift_assignments', 'catalog_items',
    'suppliers', 'inventory_items', 'supplier_orders', 'supplier_order_items',
    'clients', 'documents', 'document_items', 'document_payments',
    'change_orders', 'payroll_entries', 'payroll_payments', 'expenses',
    'weekly_goals', 'motivation_teams', 'motivation_goals', 'hr_alerts',
    'tool_assets', 'tool_theft_reports', 'insurance_claims', 'leads',
    'safety_records'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- =============================================================================
-- Terminé. Prochaine étape : supabase/provision.sql
-- =============================================================================
