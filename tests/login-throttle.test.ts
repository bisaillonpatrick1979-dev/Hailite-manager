import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { loginBlockSeconds, throttleProfileFor, type ThrottleProfile } from '../auth';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const compte = throttleProfileFor('1.2.3.4|un-compte');
const adresse = throttleProfileFor('1.2.3.4|*');

// ---------------------------------------------------------------------------
// Ce que l'échelle doit faire
// ---------------------------------------------------------------------------
// Un NIP à quatre chiffres n'a que dix mille combinaisons. L'ancienne règle —
// cinq échecs puis quinze minutes, en boucle — laissait 480 essais par jour,
// soit tout l'espace en trois semaines. Et elle sanctionnait d'un coup
// l'employé qui se trompe cinq fois, au moment de pointer.

test('les premiers essais ne coûtent rien', () => {
  // Se tromper deux ou trois fois quand on a deux NIP en tête, c'est ordinaire.
  for (let essai = 1; essai <= compte.freeAttempts; essai += 1) {
    assert.equal(loginBlockSeconds(essai, compte), 0, `essai ${essai}`);
  }
});

test('la durée monte à chaque échec supplémentaire', () => {
  const durees = [];
  for (let essai = compte.freeAttempts + 1; essai <= compte.freeAttempts + compte.ladderSeconds.length; essai += 1) {
    durees.push(loginBlockSeconds(essai, compte));
  }
  assert.deepEqual(durees, compte.ladderSeconds);
  for (let i = 1; i < durees.length; i += 1) {
    assert.ok(durees[i] > durees[i - 1], 'chaque barreau doit être plus long que le précédent');
  }
});

test('le dernier barreau sert de plafond', () => {
  // Quelqu'un mis dehors par erreur — ou visé exprès par un collègue qui veut
  // lui nuire — doit toujours finir par rentrer.
  const plafond = compte.ladderSeconds[compte.ladderSeconds.length - 1];
  for (const essai of [20, 100, 10_000]) {
    assert.equal(loginBlockSeconds(essai, compte), plafond, `après ${essai} échecs`);
  }
});

test('un compteur absurde ne produit pas de blocage absurde', () => {
  for (const essai of [0, -1, -999, 0.5]) {
    assert.equal(loginBlockSeconds(essai, compte), 0, `pour ${essai}`);
  }
});

test('une échelle vide ne bloque jamais', () => {
  const sansEchelle: ThrottleProfile = { freeAttempts: 2, ladderSeconds: [], windowSeconds: 60 };
  assert.equal(loginBlockSeconds(50, sansEchelle), 0);
});

// ---------------------------------------------------------------------------
// Ne pas punir le chantier pour l'erreur d'une seule personne
// ---------------------------------------------------------------------------

test('la clé « ip|* » vise l’adresse, les autres visent un compte', () => {
  assert.equal(throttleProfileFor('1.2.3.4|*'), adresse);
  assert.equal(throttleProfileFor('1.2.3.4|un-compte'), compte);
  assert.equal(throttleProfileFor('noip|abc'), compte);
});

test('l’adresse partagée est nettement plus tolérante que le compte', () => {
  // Sur un chantier, toute l'équipe sort par le même Wi-Fi : punir l'adresse
  // aussi vite que le compte bloquerait six personnes pour l'erreur d'une.
  assert.ok(adresse.freeAttempts > compte.freeAttempts * 2,
    'il faut de la marge pour une équipe entière');
  assert.equal(loginBlockSeconds(compte.freeAttempts + 1, adresse), 0,
    'le premier blocage d’un compte ne doit pas bloquer toute l’adresse');
});

test('l’adresse pardonne vite, le compte se souvient longtemps', () => {
  // La mémoire de l'adresse est courte parce qu'une connexion réussie ne
  // l'efface pas : sans oubli, les erreurs d'une équipe s'accumuleraient sans
  // rien pour les effacer. Celle du compte est longue pour que l'échelle
  // s'accumule contre quelqu'un de patient.
  assert.ok(adresse.windowSeconds < compte.windowSeconds);
});

test('la mémoire dépasse toujours le plus long blocage', () => {
  // Sinon le compteur retomberait PENDANT la sanction et l'échelle ne
  // monterait jamais — c'était le défaut de l'ancienne règle, quinze minutes
  // de fenêtre pour quinze minutes de blocage.
  for (const profil of [compte, adresse]) {
    const plafond = profil.ladderSeconds[profil.ladderSeconds.length - 1];
    assert.ok(profil.windowSeconds > plafond,
      `mémoire ${profil.windowSeconds} s contre un blocage de ${plafond} s`);
  }
});

// ---------------------------------------------------------------------------
// Ce que ça coûte à quelqu'un qui cherche un NIP au hasard
// ---------------------------------------------------------------------------

test('l’échelle rend la force brute déraisonnable', () => {
  // Essais possibles en 24 h depuis une adresse, contre un compte donné :
  // les gratuits, puis un essai par blocage jusqu'à épuiser la journée.
  const JOUR = 24 * 3600;
  let ecoule = 0;
  let essais = compte.freeAttempts;
  while (true) {
    const attente = loginBlockSeconds(essais + 1, compte);
    if (ecoule + attente > JOUR) break;
    ecoule += attente;
    essais += 1;
  }

  // L'ancienne règle : 5 essais par quart d'heure, soit 480 par jour.
  assert.ok(essais < 60, `au plus une soixantaine d’essais par jour, obtenu ${essais}`);

  // Dix mille combinaisons à ce rythme : plusieurs mois, contre trois semaines
  // avant. Le NIP à quatre chiffres reste faible — c'est le délai qui le rend
  // coûteux, pas le secret lui-même.
  assert.ok(10_000 / essais > 150, 'il doit falloir des mois, pas des semaines');
});

// ---------------------------------------------------------------------------
// Le branchement : c'est la base qui tranche, pas la mémoire d'une instance
// ---------------------------------------------------------------------------

test('le verdict vient de blocked_until, et de lui seul', () => {
  // Deux règles concurrentes — un blocage ET un seuil de compteur — pouvaient
  // se contredire. La fonction SQL applique l'échelle atomiquement; le serveur
  // se contente de lire sa décision.
  const auth = read('auth.ts');
  assert.match(auth, /const blockedUntil = data\.blocked_until[\s\S]{0,120}return blockedUntil > Date\.now\(\);/);
  assert.ok(!auth.includes('LOGIN_MAX_ATTEMPTS'), 'le seuil fixe n’a plus de raison d’être');
});

test('le serveur passe son échelle à la fonction SQL', () => {
  const auth = read('auth.ts');
  assert.match(auth, /p_free_attempts: profile\.freeAttempts/);
  assert.match(auth, /p_ladder_seconds: profile\.ladderSeconds/);
  assert.match(auth, /p_window_seconds: profile\.windowSeconds/);
});

test('une connexion réussie efface la sanction du compte', () => {
  // L'échelle ne doit jamais punir quelqu'un qui a fini par entrer.
  const routes = read('apiRoutes.ts');
  assert.match(routes, /await clearLoginFailures\(throttleKey\);/);
});

test('la migration mesure le silence depuis le DERNIER échec', () => {
  // Depuis le premier, le compteur retombait pendant la sanction.
  const sql = read('supabase/migrations/20260920230000_progressive_login_throttle.sql');
  assert.match(sql, /attempt_row\.updated_at < now_ts - make_interval\(secs => p_window_seconds\)/);
  assert.match(sql, /p_ladder_seconds\[least\(beyond_free, ladder_length\)\]/, 'le plafond doit tenir');
  assert.match(sql, /else null\s*\n\s*end;/, 'un blocage expiré doit être effacé, pas laissé en place');
  assert.match(sql, /for update/, 'l’incrément doit rester atomique entre instances');
});

test('l’ancienne fonction survit au déploiement', () => {
  // Pendant un déploiement, les deux versions du serveur tournent quelques
  // secondes ensemble : retirer l'ancienne signature ferait échouer la
  // limitation de l'ancienne, en silence.
  const sql = read('supabase/migrations/20260920230000_progressive_login_throttle.sql');
  assert.doesNotMatch(sql, /drop function[\s\S]*record_auth_login_failure\(text, integer, integer\)/i);
});
