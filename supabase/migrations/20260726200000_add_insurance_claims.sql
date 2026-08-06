-- Réclamations d'assurance : grêle, vent, dégât d'eau.
-- À Calgary, la grêle représente une part importante du revenu en toiture.
--
-- Les montants sont distincts et ne doivent pas être mélangés :
--   rcv  valeur à neuf, acv  valeur au jour du sinistre,
--   dépréciation récupérable = rcv − acv (versée après exécution des travaux).
--
-- Les accès directs anon/authenticated sont révoqués : l'application passe par
-- l'API serveur authentifiée, qui utilise la clé service_role et applique sa
-- matrice de permissions par rôle et par company_id.

create table if not exists public.insurance_claims (
  id                uuid primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  insurer           text not null,
  claim_number      text not null default '',
  policy_number     text,
  loss_type         text not null default 'hail'
                    check (loss_type in ('hail', 'wind', 'water', 'fire', 'other')),
  loss_date         date,
  adjuster_name     text,
  adjuster_phone    text,
  adjuster_email    text,
  deductible        numeric(12,2) check (deductible is null or deductible >= 0),
  acv               numeric(12,2) check (acv is null or acv >= 0),
  rcv               numeric(12,2) check (rcv is null or rcv >= 0),
  supplement_amount numeric(12,2) check (supplement_amount is null or supplement_amount >= 0),
  approved_amount   numeric(12,2) check (approved_amount is null or approved_amount >= 0),
  status            text not null default 'open'
                    check (status in ('open', 'submitted', 'approved', 'partial', 'denied', 'closed')),
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  created_by_name   text
);

-- Consultations les plus fréquentes : les réclamations d'un chantier, et le
-- suivi des dossiers encore ouverts pour la compagnie.
create index if not exists insurance_claims_project_idx
  on public.insurance_claims (project_id, created_at desc);
create index if not exists insurance_claims_status_idx
  on public.insurance_claims (company_id, status);

alter table public.insurance_claims enable row level security;
revoke all on public.insurance_claims from anon, authenticated;
