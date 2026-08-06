-- Prospects : le parcours avant le devis.
-- Appel entrant → contacté → inspection → soumission → vendu ou perdu.
-- Le motif de perte est conservé : c'est la seule donnée qui permet
-- d'améliorer le taux de conversion.
--
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.leads (
  id                   uuid primary key,
  company_id           uuid not null references public.companies(id) on delete cascade,
  name                 text not null,
  phone                text,
  email                text,
  address              text,
  source               text not null default 'other'
                       check (source in ('referral', 'phone', 'website', 'door', 'repeat', 'insurance', 'other')),
  status               text not null default 'new'
                       check (status in ('new', 'contacted', 'inspection', 'quoted', 'won', 'lost')),
  estimated_value      numeric(12,2) check (estimated_value is null or estimated_value >= 0),
  next_follow_up       date,
  notes                text,
  lost_reason          text,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  created_by_name      text,
  converted_client_id  uuid,
  converted_project_id uuid
);

-- Consultations les plus fréquentes : le pipeline par étape, et les relances
-- dont la date est dépassée.
create index if not exists leads_status_idx
  on public.leads (company_id, status, created_at desc);
create index if not exists leads_follow_up_idx
  on public.leads (company_id, next_follow_up)
  where next_follow_up is not null;

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;
