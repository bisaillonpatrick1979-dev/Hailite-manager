-- Registre photographique des outils et dossiers préparatoires de vol.
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.tool_assets (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text not null default 'Autre',
  brand text not null default '',
  model text not null default '',
  serial_number text not null default '',
  asset_tag text not null default '',
  purchase_date date,
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  replacement_value numeric(12,2) not null default 0 check (replacement_value >= 0),
  seller text not null default '',
  warranty_expiry date,
  current_location text not null default '',
  assigned_employee_id uuid,
  assigned_employee_name text,
  status text not null default 'in_service'
    check (status in ('in_service','loaned','repair','missing','stolen','retired')),
  notes text not null default '',
  tool_photo text,
  serial_photo text,
  receipt_photo text,
  receipt_file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_theft_reports (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  incident_date date not null,
  incident_time time,
  incident_location text not null,
  circumstances text not null default '',
  discovered_by text not null default '',
  police_service text not null default '',
  police_file_number text not null default '',
  insurer text not null default '',
  insurance_claim_number text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  tool_ids uuid[] not null default '{}',
  tool_snapshots jsonb not null default '[]'::jsonb,
  total_replacement_value numeric(12,2) not null default 0 check (total_replacement_value >= 0),
  status text not null default 'draft'
    check (status in ('draft','reported','insurance_submitted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tool_assets_company_id_idx on public.tool_assets(company_id);
create index if not exists tool_assets_serial_number_idx on public.tool_assets(serial_number);
create index if not exists tool_assets_status_idx on public.tool_assets(company_id, status);
create index if not exists tool_theft_reports_company_id_idx on public.tool_theft_reports(company_id);
create index if not exists tool_theft_reports_incident_date_idx on public.tool_theft_reports(company_id, incident_date desc);

alter table public.tool_assets enable row level security;
alter table public.tool_theft_reports enable row level security;

revoke all on public.tool_assets from anon, authenticated;
revoke all on public.tool_theft_reports from anon, authenticated;
grant select, insert, update, delete on public.tool_assets to service_role;
grant select, insert, update, delete on public.tool_theft_reports to service_role;
