-- ---------------------------------------------------------------------------
-- Limitation progressive des tentatives de connexion
-- ---------------------------------------------------------------------------
-- L'ancienne règle : cinq échecs, quinze minutes de blocage, et on recommence.
-- Un NIP à quatre chiffres n'a que dix mille combinaisons; à cinq essais par
-- quart d'heure, cela fait 480 essais par jour — tout l'espace en trois
-- semaines. Le blocage plat ne coûtait presque rien à quelqu'un de patient.
--
-- Il coûtait par contre cher à l'employé honnête : la sanction tombait d'un
-- coup à quinze minutes, au moment de pointer, sur un chantier, sans recours.
--
-- Cette version prend deux paramètres de plus : le nombre d'essais gratuits et
-- l'échelle des durées. Les premiers essais ne coûtent rien, puis la durée
-- monte vite jusqu'à un plafond. Le serveur passe une échelle différente selon
-- qu'il s'agit d'un compte ou d'une adresse IP entière (voir auth.ts) : sur un
-- chantier, toute l'équipe partage le même Wi-Fi, et punir l'adresse aussi
-- vite que le compte bloquerait six personnes pour l'erreur d'une seule.
--
-- Deux corrections importantes au passage :
--
--   • la mémoire du compteur se mesure depuis le DERNIER échec (updated_at) et
--     non depuis le premier. Avec l'ancienne fenêtre de quinze minutes et un
--     blocage de quinze minutes, le compteur retombait à zéro pendant la
--     sanction : l'échelle n'aurait jamais dépassé son premier barreau;
--
--   • le blocage est remis à NULL quand il n'y a pas lieu de bloquer. Sans ça,
--     un vieux blocage expiré restait inscrit dans la ligne.
--
-- L'ancienne fonction à trois paramètres est CONSERVÉE : pendant un
-- déploiement, les deux versions du serveur tournent quelques secondes en même
-- temps, et l'ancienne doit continuer de trouver sa fonction. Elle pourra être
-- retirée une fois le déploiement terminé.
--
-- Migration additive : aucune donnée n'est modifiée, aucune colonne ajoutée.

create or replace function public.record_auth_login_failure(
  p_key_hash text,
  p_window_seconds integer,
  p_free_attempts integer,
  p_ladder_seconds integer[]
)
returns table(failure_count integer, blocked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.auth_login_attempts%rowtype;
  now_ts timestamptz := clock_timestamp();
  ladder_length integer := coalesce(array_length(p_ladder_seconds, 1), 0);
  beyond_free integer;
  block_seconds integer;
begin
  insert into public.auth_login_attempts (key_hash, failure_count, first_failed_at, updated_at)
  values (p_key_hash, 0, now_ts, now_ts)
  on conflict (key_hash) do nothing;

  -- Le verrou de ligne rend l'incrément atomique : deux instances Vercel
  -- concurrentes ne peuvent pas perdre une tentative.
  select * into attempt_row
  from public.auth_login_attempts
  where key_hash = p_key_hash
  for update;

  if attempt_row.updated_at < now_ts - make_interval(secs => p_window_seconds) then
    attempt_row.failure_count := 1;
    attempt_row.first_failed_at := now_ts;
  else
    attempt_row.failure_count := attempt_row.failure_count + 1;
  end if;

  beyond_free := attempt_row.failure_count - p_free_attempts;
  if beyond_free <= 0 or ladder_length = 0 then
    block_seconds := 0;
  else
    -- Le dernier barreau sert de plafond : quelqu'un mis dehors par erreur — ou
    -- visé exprès par un collègue qui veut lui nuire — finit toujours par
    -- rentrer.
    block_seconds := p_ladder_seconds[least(beyond_free, ladder_length)];
  end if;

  attempt_row.blocked_until := case
    when block_seconds > 0 then now_ts + make_interval(secs => block_seconds)
    else null
  end;

  update public.auth_login_attempts attempts
  set failure_count = attempt_row.failure_count,
      first_failed_at = attempt_row.first_failed_at,
      blocked_until = attempt_row.blocked_until,
      updated_at = now_ts
  where attempts.key_hash = p_key_hash;

  return query select attempt_row.failure_count, attempt_row.blocked_until;
end;
$$;

-- Seul le serveur peut appeler cette fonction.
revoke all on function public.record_auth_login_failure(text, integer, integer, integer[])
  from public, anon, authenticated;
grant execute on function public.record_auth_login_failure(text, integer, integer, integer[])
  to service_role;
