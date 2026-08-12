-- =============================================================================
-- Hailite Manager — création de votre compagnie et de votre premier accès
-- =============================================================================
-- À exécuter APRÈS supabase/schema.sql, une seule fois, dans l'éditeur SQL de
-- Supabase.
--
-- Ce fichier crée deux choses, et rien d'autre :
--   • la fiche de votre entreprise;
--   • votre compte administrateur, avec le NIP que VOUS choisissez.
--
-- ----------------------------------------------------------------------------
-- CE QU'IL FAUT MODIFIER AVANT D'EXÉCUTER
-- ----------------------------------------------------------------------------
-- Remplacez les six valeurs du bloc « À REMPLIR » ci-dessous. Tout le reste se
-- fait tout seul.
--
-- Le NIP n'est jamais enregistré tel quel : Postgres le chiffre (bcrypt) au
-- moment de l'insertion, et seule l'empreinte chiffrée est conservée. Personne
-- — pas même vous en relisant la table — ne peut le retrouver ensuite. Si vous
-- l'oubliez, il faudra en réenregistrer un nouveau (voir la fin du fichier).
--
-- Choisissez un NIP d'au moins 4 chiffres, différent de 0000 et de 1234.
-- ============================================================================

do $$
declare
  -- ------------------------- À REMPLIR -------------------------------------
  v_company_name   text := 'Mon Entreprise Inc.';       -- nom légal
  v_country        text := 'Canada';                    -- 'Canada' ou 'United States'
  v_region         text := 'Alberta';                   -- province ou état
  v_currency       text := 'CAD';                       -- 'CAD' ou 'USD'
  v_admin_name     text := 'Prénom Nom';                -- votre nom
  v_admin_pin      text := '4821';                      -- VOTRE NIP — changez-le
  -- --------------------------------------------------------------------------

  v_company_id uuid;
  v_user_id uuid;
begin
  if v_admin_pin in ('0000', '1234', '1111') or length(v_admin_pin) < 4 then
    raise exception 'Choisissez un NIP d''au moins 4 chiffres qui ne soit pas 0000, 1111 ni 1234.';
  end if;

  -- On refuse de créer une deuxième compagnie : ce déploiement en sert une
  -- seule. Deux compagnies dans la même base rendraient les routes publiques
  -- ambiguës, et l'application refuserait de démarrer sans DEFAULT_COMPANY_ID.
  if exists (select 1 from public.companies) then
    raise exception 'Une compagnie existe déjà dans cette base. Ce fichier ne doit être exécuté qu''une seule fois.';
  end if;

  insert into public.companies (name, country, region, currency, tax_name, tax_rate, unit_system)
  values (
    v_company_name, v_country, v_region, v_currency,
    case when v_country = 'Canada' then 'GST' else 'Sales Tax' end,
    case when v_country = 'Canada' then 5 else 0 end,
    'imperial'
  )
  returning id into v_company_id;

  insert into public.app_users (
    company_id, full_name, avatar_initials, role, access_code_hash,
    pay_mode, pay_rate, is_active
  )
  values (
    v_company_id,
    v_admin_name,
    upper(left(regexp_replace(v_admin_name, '[^[:alpha:]]', '', 'g'), 2)),
    'admin',
    -- bcrypt, 10 tours : exactement le format que le serveur sait vérifier.
    extensions.crypt(v_admin_pin, extensions.gen_salt('bf', 10)),
    'hourly', 0, true
  )
  returning id into v_user_id;

  raise notice '--------------------------------------------------------------';
  raise notice 'Compagnie créée.';
  raise notice 'DEFAULT_COMPANY_ID = %', v_company_id;
  raise notice 'Copiez cette valeur dans les variables d''environnement Vercel.';
  raise notice 'Connectez-vous ensuite avec « % » et votre NIP.', v_admin_name;
  raise notice '--------------------------------------------------------------';
end $$;

-- ----------------------------------------------------------------------------
-- Retrouver votre DEFAULT_COMPANY_ID plus tard
-- ----------------------------------------------------------------------------
-- Si le message ci-dessus a défilé trop vite :
--
--   select id, name from public.companies;
--
-- ----------------------------------------------------------------------------
-- Changer un NIP oublié
-- ----------------------------------------------------------------------------
-- Remplacez le nom et le nouveau NIP, puis exécutez seulement ces deux lignes :
--
--   update public.app_users
--      set access_code_hash = extensions.crypt('NOUVEAU_NIP', extensions.gen_salt('bf', 10)),
--          failed_attempts = 0, locked_until = null
--    where full_name = 'Prénom Nom';
--
-- ----------------------------------------------------------------------------
-- Ajouter un employé ou un sous-traitant
-- ----------------------------------------------------------------------------
-- Ce n'est pas nécessaire ici : une fois connecté, l'application permet de le
-- faire à l'écran, avec le NIP que la personne choisit elle-même.
-- =============================================================================
