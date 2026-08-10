-- Colonnes attendues par l'application mais absentes du schéma.
--
-- documents.date : le mappeur l'envoie à chaque enregistrement, et Postgres
-- rejetait donc tous les devis, contrats et factures. La table n'avait que
-- created_at, qui est l'horodatage d'insertion, pas la date du document.
alter table public.documents add column if not exists date date;

-- documents.client_name : lu à l'affichage mais jamais écrit ; le nom du
-- client repartait vide à chaque rechargement depuis le nuage.
alter table public.documents add column if not exists client_name text;

-- payroll_entries.local_tax_amount : sans effet là où il n'y a pas de taxe
-- locale, mais aurait bloqué une facture d'employé dans une région qui en a.
alter table public.payroll_entries add column if not exists local_tax_amount numeric;

-- Les documents déjà présents n'ont pas de date : on retombe sur leur création.
update public.documents set date = created_at::date where date is null;
