alter table public.companies
  add column if not exists date_locale text,
  add column if not exists data_storage_mode text not null default 'hybrid',
  add column if not exists cloud_sync_consent boolean not null default true,
  add column if not exists cloud_region text not null default 'ca-central-1',
  add column if not exists privacy_policy_version text,
  add column if not exists privacy_policy_accepted_at timestamptz,
  add column if not exists privacy_contact_email text,
  add column if not exists privacy_officer_name text,
  add column if not exists retention_months integer not null default 84,
  add column if not exists employee_data_basis_confirmed boolean not null default false,
  add column if not exists location_data_notice_confirmed boolean not null default false,
  add column if not exists cross_border_transfer_acknowledged_at timestamptz,
  add column if not exists tax_confirmed_at timestamptz,
  add column if not exists tax_disclaimer_accepted_at timestamptz,
  add column if not exists local_tax_rate numeric not null default 0,
  add column if not exists compliance_version text,
  add column if not exists processor_terms_accepted_at timestamptz;

alter table public.app_users
  add column if not exists business_logo text,
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_notice_acknowledged_at timestamptz,
  add column if not exists location_notice_acknowledged_at timestamptz;

alter table public.payroll_entries
  add column if not exists currency text,
  add column if not exists tax_rate1 numeric,
  add column if not exists tax_rate2 numeric,
  add column if not exists local_tax_rate numeric,
  add column if not exists local_tax_amount numeric,
  add column if not exists tax_rate1_name text,
  add column if not exists tax_rate2_name text,
  add column if not exists issuer_name text,
  add column if not exists issuer_address text,
  add column if not exists issuer_tax_number text,
  add column if not exists issuer_logo text,
  add column if not exists recipient_name text;
