-- ---------------------------------------------------------------------------
-- Épingler le chemin de recherche du déclencheur de pointage
-- ---------------------------------------------------------------------------
-- L'analyseur de sécurité de Supabase signale « function search_path mutable »
-- sur punches_align_user_columns. Une fonction dont le search_path n'est pas
-- fixé résout ses noms d'objets selon le chemin de l'appelant : quelqu'un
-- capable de créer une table dans un schéma placé plus tôt dans ce chemin
-- pourrait détourner ce que la fonction manipule.
--
-- Le risque est faible ici — la fonction ne fait que recopier une colonne sur
-- l'autre et personne d'autre que le serveur n'écrit dans la base — mais c'est
-- le genre d'avertissement qu'un acheteur ou un auditeur regarde, et le
-- corriger ne coûte rien.
--
-- La fonction est recréée à l'identique, avec le chemin épinglé. Le déclencheur
-- existant continue de pointer dessus : aucune interruption d'écriture.

create or replace function public.punches_align_user_columns()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
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
