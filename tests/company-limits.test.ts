import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MAX_COMPANY_USERS } from '../companyLimits';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Le plafond de recherche à la connexion
// ---------------------------------------------------------------------------
// La référence envoyée par l'annuaire est une empreinte HMAC : elle ne se
// renverse pas, il faut recalculer celle de chaque candidat pour trouver le
// bon. La recherche est donc bornée — et la borne était de 250, en silence.
// Un employé hors des 250 premières lignes recevait « NIP incorrect » alors
// que son NIP était juste.

test('le plafond couvre une vraie entreprise', () => {
  assert.ok(MAX_COMPANY_USERS >= 1000, 'un millier de comptes actifs au minimum');
});

test('la recherche de connexion demande une ligne de plus que le plafond', () => {
  // Sans cette ligne supplémentaire, impossible de distinguer « exactement le
  // plafond » de « tronqué ».
  const auth = read('auth.ts');
  assert.match(auth, /\.limit\(MAX_COMPANY_USERS \+ 1\)/);
  assert.ok(!auth.includes('.limit(250)'), 'plus aucun plafond écrit en dur');
});

test('un plafond atteint ne se déguise pas en NIP incorrect', () => {
  // C'est le cœur de la correction : une limite atteinte est un problème
  // d'exploitation, pas une faute de l'employé. Répondre « NIP incorrect »
  // l'enverrait refaire son NIP pour rien — ce qui est exactement arrivé.
  const auth = read('auth.ts');
  const guard = /if \(!user && \(users \|\| \[\]\)\.length > MAX_COMPANY_USERS\) \{[\s\S]*?return \{ ok: false, reason: 'unavailable' \};[\s\S]*?\}/;
  assert.match(auth, guard, 'le dépassement doit renvoyer « unavailable »');

  // Et il doit être vérifié AVANT le rejet générique, sinon il ne sert à rien.
  const guardAt = auth.search(guard);
  const genericRejectAt = auth.indexOf("if (error || !user) return { ok: false, reason: 'invalid' };");
  assert.ok(guardAt > 0 && genericRejectAt > guardAt, 'le garde-fou doit passer avant le rejet générique');
});

test('l’annuaire et la connexion s’arrêtent au même endroit', () => {
  // Un compte absent de l'annuaire ne peut pas être choisi à l'écran de
  // connexion : les deux listes doivent avoir la même portée.
  const routes = read('apiRoutes.ts');
  assert.match(routes, /\.limit\(MAX_COMPANY_USERS\)/);
});

test('le dépassement laisse une trace exploitable', () => {
  const auth = read('auth.ts');
  assert.match(auth, /console\.error\([\s\S]*?MAX_COMPANY_USERS/, 'un dépassement silencieux ne se répare jamais');
});
