-- ---------------------------------------------------------------------------
-- Compte de révision (Google Play)
-- ---------------------------------------------------------------------------
-- Google exige un profil de démonstration fonctionnel pour examiner une
-- application dont tous les écrans sont derrière un NIP. Sans lui,
-- l'examinateur ne dépasse pas la liste de connexion et refuse la soumission.
--
-- Mais ce profil sort de l'entreprise : le donner à Google avec un rôle
-- d'administrateur ordinaire exposerait les vrais chantiers, les vrais
-- employés et leurs taux horaires à des inconnus. Ce n'est pas acceptable.
--
-- Un compte marqué ici ouvre donc une session normale, puis tombe dans le jeu
-- de données fictives de cinq ans déjà présent dans l'application. Le
-- confinement ne dépend PAS de l'écran : le serveur refuse à ce compte toute
-- route de données d'entreprise (voir reviewAccount.ts). Même un appel direct
-- à l'API avec son jeton ne rapporte rien.
--
-- Nul/faux = compte ordinaire. C'est le cas de tous les comptes existants : la
-- colonne est additive et ne change rien à ce qui fonctionne aujourd'hui.

alter table public.app_users
  add column if not exists is_review_account boolean not null default false;

comment on column public.app_users.is_review_account is
  'Profil de démonstration remis à un examinateur de boutique. Ouvre une '
  'session normale mais ne reçoit AUCUNE donnée d''entreprise du serveur : '
  'l''application lui présente le jeu de données fictives. Faux = compte '
  'ordinaire.';

-- Une échéance sur ce compte ferait échouer la révision le jour où elle tombe,
-- sans que personne ne comprenne pourquoi l'application vient d'être refusée.
-- La base refuse donc la combinaison, plutôt que de compter sur la mémoire de
-- celui qui créera le compte.
alter table public.app_users
  drop constraint if exists app_users_review_account_never_expires;

alter table public.app_users
  add constraint app_users_review_account_never_expires
  check (not is_review_account or access_expires_at is null);

-- Un seul profil de révision par entreprise : deux comptes de démonstration
-- actifs signifieraient qu'on ne sait plus lequel a été remis à la boutique.
create unique index if not exists app_users_single_review_account_idx
  on public.app_users (company_id)
  where is_review_account;
