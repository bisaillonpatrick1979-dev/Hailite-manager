-- Sécurité de chantier : causeries et analyses de risques.
-- L'OH&S de l'Alberta exige une évaluation des dangers propre au chantier avant
-- le début des travaux. Ce qui donne sa valeur au document n'est pas la liste
-- des dangers, c'est la signature des travailleurs présents — conservée dans
-- « attendees » avec l'horodatage de chaque signature.
--
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.safety_records (
  id              uuid primary key,
  company_id      uuid not null references public.companies(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  type            text not null default 'toolbox'
                  check (type in ('toolbox', 'hazard')),
  date            date not null,
  topic           text not null,
  hazards         jsonb,
  controls        text,
  weather         text,
  notes           text,
  -- [{ employeeId, employeeName, signature, signedAt }]
  attendees       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text
);

-- Consultations les plus fréquentes : les fiches d'un chantier, et le registre
-- de la compagnie sur une période donnée (inspection, appel d'offres).
create index if not exists safety_records_project_idx
  on public.safety_records (project_id, date desc);
create index if not exists safety_records_company_idx
  on public.safety_records (company_id, date desc);

alter table public.safety_records enable row level security;
revoke all on public.safety_records from anon, authenticated;
