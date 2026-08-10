-- Validation administrative des pointages.
--
-- Un pointage erroné (oubli de punch out, mauvais chantier) n'était pas
-- corrigeable : ni l'employé ni l'administrateur ne pouvaient rectifier les
-- heures. Ces colonnes portent l'état de vérification du bureau et la piste
-- d'audit des corrections, exigée pour la paie et pour vendre l'application.
--
-- approval_status : 'pending' (fermé, pas encore vérifié), 'corrected'
--                   (heures rectifiées par la gestion), 'approved' (vérifié).
-- corrections     : journal JSON [{at, byId, byName, field, before, after, note}]
alter table punches
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by uuid,
  add column if not exists approved_by_name text,
  add column if not exists approved_at timestamptz,
  add column if not exists corrections jsonb;

-- Les pointages antérieurs à la validation sont traités comme non vérifiés.
update punches set approval_status = 'pending' where approval_status is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'punches_approval_status_check'
  ) then
    alter table punches
      add constraint punches_approval_status_check
      check (approval_status in ('pending', 'corrected', 'approved'));
  end if;
end $$;

create index if not exists punches_approval_status_idx on punches (approval_status);
