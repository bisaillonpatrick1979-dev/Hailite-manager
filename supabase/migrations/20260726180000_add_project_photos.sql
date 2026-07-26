-- Photos de chantier : dossier avant / pendant / après.
-- Sert de preuve d'état initial et d'exécution (réclamation d'assurance,
-- litige avec un client) et de matériel de vente.
--
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.project_photos (
  id            uuid primary key,
  company_id    uuid not null references public.companies(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  phase         text not null default 'during'
                check (phase in ('before', 'during', 'after')),
  image_url     text not null,
  caption       text,
  taken_at      timestamptz not null default now(),
  taken_by      uuid,
  taken_by_name text,
  latitude      double precision,
  longitude     double precision,
  created_at    timestamptz not null default now()
);

-- Consultation la plus fréquente : le dossier d'un chantier, du plus récent au
-- plus ancien, filtré par phase.
create index if not exists project_photos_project_idx
  on public.project_photos (project_id, phase, taken_at desc);
create index if not exists project_photos_company_idx
  on public.project_photos (company_id, taken_at desc);

alter table public.project_photos enable row level security;
revoke all on public.project_photos from anon, authenticated;
