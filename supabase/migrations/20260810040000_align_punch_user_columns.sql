-- ---------------------------------------------------------------------------
-- Pointages : réconcilier « user_id » et « employee_id »
-- ---------------------------------------------------------------------------
-- La table punches porte deux colonnes pour la même personne : user_id, du
-- schéma d'origine et déclarée NOT NULL, et employee_id, ajoutée ensuite et
-- devenue celle que toute l'application lit et filtre (OWNER_COLUMN,
-- applyReadScope, rowToPunch). Le client n'écrivant que la seconde, chaque
-- insertion était rejetée :
--
--   null value in column "user_id" of relation "punches"
--   violates not-null constraint
--
-- L'employé voyait « Sauvegarde nuage échouée — vérifiez la connexion » alors
-- que le réseau n'y était pour rien, et aucun pointage n'atteignait la base.
--
-- Le serveur remplit désormais les deux colonnes (voir alignLegacyUserColumns
-- dans apiRoutes.ts). Ce déclencheur ferme la porte pour de bon : il garantit
-- l'égalité des deux colonnes quel que soit l'écrivain — ancienne version du
-- client encore ouverte sur un téléphone, import, ou intervention manuelle.

create or replace function public.punches_align_user_columns()
returns trigger
language plpgsql
as $$
begin
  -- On ne fabrique jamais de valeur : on recopie seulement celle qui existe.
  if new.user_id is null then
    new.user_id := new.employee_id;
  elsif new.employee_id is null then
    new.employee_id := new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists punches_align_user_columns on public.punches;

create trigger punches_align_user_columns
  before insert or update on public.punches
  for each row
  execute function public.punches_align_user_columns();

-- Lignes déjà présentes : remettre les deux colonnes d'accord.
update public.punches set employee_id = user_id where employee_id is null;
update public.punches set user_id = employee_id where user_id is null;
