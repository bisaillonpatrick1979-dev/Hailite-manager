-- ---------------------------------------------------------------------------
-- Créer le profil de démonstration remis à Google Play
-- ---------------------------------------------------------------------------
-- À exécuter UNE FOIS dans l'éditeur SQL de Supabase, sur la base de
-- PRODUCTION — c'est celle que l'examinateur atteindra depuis l'application
-- publiée. La migration 20260910090000_add_review_account.sql doit avoir été
-- appliquée avant.
--
-- Ce que ce compte voit : le jeu de données fictives de cinq ans intégré à
-- l'application. Rien de l'entreprise. Le serveur lui refuse toutes les routes
-- de données (voir reviewAccount.ts), donc même un appel direct à l'API avec
-- son jeton ne rapporte rien. Vos chantiers, vos employés et leurs taux
-- horaires restent invisibles.
--
-- AVANT D'EXÉCUTER, changez le NIP ci-dessous. N'utilisez jamais un NIP qui
-- sert déjà à quelqu'un : celui-ci part chez un inconnu, et il est écrit en
-- clair dans le formulaire « App access » de la console Google Play.

-- 1. Choisissez le NIP à remettre à Google (quatre chiffres).
--    Remplacez 4242 par autre chose que la valeur d'exemple.
\set nip_de_revision '4242'

-- 2. Le nom tel qu'il apparaîtra dans la liste de connexion, visible de
--    quiconque ouvre le lien. Un nom explicite évite qu'on le prenne pour un
--    employé et qu'on l'efface par erreur.
\set nom_de_revision 'Démonstration Google Play'

insert into public.app_users (
  company_id,
  full_name,
  avatar_initials,
  role,
  access_code_hash,
  is_active,
  is_review_account,
  access_expires_at
)
select
  c.id,
  :'nom_de_revision',
  'GP',
  -- Rôle administrateur : l'examinateur doit pouvoir parcourir toute
  -- l'application, sinon il ne peut pas juger ce qu'il examine. Le confinement
  -- ne vient pas du rôle, il vient de is_review_account.
  'admin',
  -- bcrypt, coût 12 — le même format que les NIP créés par l'application.
  -- Le NIP en clair n'est jamais stocké.
  crypt(:'nip_de_revision', gen_salt('bf', 12)),
  true,
  true,
  -- Jamais d'échéance : la révision échouerait le jour où elle tombe, et
  -- personne ne ferait le lien. La base refuse d'ailleurs la combinaison.
  null
from public.companies c
-- Sécurité : ne rien créer s'il en existe déjà un. Deux profils de
-- démonstration actifs, et on ne saurait plus lequel a été remis à la boutique.
where not exists (
  select 1 from public.app_users u
  where u.company_id = c.id and u.is_review_account
);

-- 3. Vérification. Doit renvoyer exactement une ligne, sans échéance.
select full_name, role, is_active, is_review_account, access_expires_at
from public.app_users
where is_review_account;

-- ---------------------------------------------------------------------------
-- Pour retirer l'accès après la publication
-- ---------------------------------------------------------------------------
-- Google peut réexaminer l'application à chaque mise à jour : gardez ce compte
-- tant que l'application est publiée. Pour le désactiver malgré tout :
--
--   update public.app_users set is_active = false where is_review_account;
--
-- Pour changer son NIP :
--
--   update public.app_users
--   set access_code_hash = crypt('NOUVEAU', gen_salt('bf', 12))
--   where is_review_account;
