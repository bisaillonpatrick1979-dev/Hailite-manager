-- ---------------------------------------------------------------------------
-- Accès à durée limitée
-- ---------------------------------------------------------------------------
-- Pour montrer l'application à quelqu'un — un acheteur potentiel, un
-- sous-traitant de passage, un employé temporaire — sans avoir à se souvenir de
-- lui retirer l'accès plus tard. Passé la date, le compte ne peut plus ouvrir
-- de session et disparaît de la liste de connexion.
--
-- Nul = accès permanent. C'est le cas de tous les comptes existants : la
-- colonne est additive et ne change rien à ce qui fonctionne aujourd'hui.
--
-- La date fait foi côté serveur (voir verifyCredentials dans auth.ts). Le jeton
-- de session est en plus raccourci pour ne jamais survivre à l'accès : sans
-- cela, quelqu'un connecté juste avant l'échéance garderait la main quatre
-- heures de plus.

alter table public.app_users
  add column if not exists access_expires_at timestamptz;

comment on column public.app_users.access_expires_at is
  'Fin d''un accès à durée limitée. Nul = accès permanent. '
  'Passé cette date, la connexion est refusée et le profil est retiré de '
  'l''annuaire public.';

-- La connexion et l'annuaire filtrent sur cette colonne à chaque appel.
create index if not exists app_users_access_expires_at_idx
  on public.app_users (access_expires_at)
  where access_expires_at is not null;
