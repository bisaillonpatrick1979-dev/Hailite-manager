-- Planification des équipes : qui va sur quel chantier, quel jour.
-- Le pointage dit où les gens étaient ; ces affectations disent où ils doivent
-- être. Un employé ne peut avoir qu'une affectation par jour — la contrainte
-- d'unicité l'impose côté base, en plus du remplacement automatique côté
-- application.
--
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.shift_assignments (
  id              uuid primary key,
  company_id      uuid not null references public.companies(id) on delete cascade,
  date            date not null,
  project_id      uuid not null references public.projects(id) on delete cascade,
  employee_id     uuid not null,
  employee_name   text,
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text,
  constraint shift_assignments_one_per_day unique (employee_id, date)
);

-- Consultations les plus fréquentes : la journée complète pour l'administration,
-- et l'horaire personnel d'un employé.
create index if not exists shift_assignments_day_idx
  on public.shift_assignments (company_id, date);
create index if not exists shift_assignments_employee_idx
  on public.shift_assignments (employee_id, date);

alter table public.shift_assignments enable row level security;
revoke all on public.shift_assignments from anon, authenticated;
