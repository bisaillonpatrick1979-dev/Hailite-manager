-- Ordres de changement : les extras constatés en cours de chantier.
-- Contreplaqué pourri, solin supplémentaire, ventilation non prévue — sans
-- trace signée, le travail est fait mais personne ne l'a approuvé.
--
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.change_orders (
  id               uuid primary key,
  company_id       uuid not null references public.companies(id) on delete cascade,
  project_id       uuid not null references public.projects(id) on delete cascade,
  number           text not null default '',
  description      text not null,
  reason           text,
  amount           numeric(12,2) not null default 0 check (amount >= 0),
  photo_url        text,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'refused', 'invoiced')),
  created_at       timestamptz not null default now(),
  created_by       uuid,
  created_by_name  text,
  client_name      text,
  client_signature text,
  signed_at        timestamptz
);

-- Consultation la plus fréquente : les extras d'un chantier, du plus récent au
-- plus ancien ; et le suivi des extras en attente de signature.
create index if not exists change_orders_project_idx
  on public.change_orders (project_id, created_at desc);
create index if not exists change_orders_status_idx
  on public.change_orders (company_id, status);

alter table public.change_orders enable row level security;
revoke all on public.change_orders from anon, authenticated;
