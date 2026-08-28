import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { accessExpiryMs } from '../auth';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Lecture de la date
// ---------------------------------------------------------------------------

test('un accès sans date est permanent', () => {
  // Tous les comptes existants sont dans ce cas : la colonne est additive.
  assert.equal(accessExpiryMs(null), null);
  assert.equal(accessExpiryMs(undefined), null);
  assert.equal(accessExpiryMs(''), null);
});

test('une date valide est lue en millisecondes', () => {
  assert.equal(accessExpiryMs('2026-08-19T00:00:00Z'), Date.parse('2026-08-19T00:00:00Z'));
});

test('une date illisible ne verrouille personne dehors', () => {
  // Une valeur corrompue en base ne doit pas priver quelqu'un de son accès sans
  // explication : on retombe sur « permanent », le cas sûr.
  assert.equal(accessExpiryMs('pas une date'), null);
  assert.equal(accessExpiryMs({}), null);
});

// ---------------------------------------------------------------------------
// La règle vit sur le serveur
// ---------------------------------------------------------------------------
const auth = read('auth.ts');
const routes = read('apiRoutes.ts');

test('la connexion refuse un accès arrivé à échéance', () => {
  assert.match(auth, /if \(expiresAt !== null && expiresAt <= Date\.now\(\)\) \{\s*\n\s*return \{ ok: false, reason: 'expired' \};/,
    'verifyCredentials doit refuser un accès échu');
});

test('le refus survient avant la vérification du NIP', () => {
  // Inutile de faire travailler bcrypt pour un accès terminé, et la réponse ne
  // doit pas dépendre du NIP fourni.
  const expiryGuard = auth.indexOf("reason: 'expired'");
  const pinCheck = auth.indexOf('const verified = await verifyPin(nip, stored);');
  assert.ok(expiryGuard > 0 && pinCheck > expiryGuard,
    'le contrôle d’échéance doit précéder la vérification du NIP');
});

test('la date est bien lue depuis la base', () => {
  assert.match(auth, /access_expires_at/, 'la colonne doit être sélectionnée');
});

test('un jeton ne survit jamais à l’accès qu’il représente', () => {
  // Sans ce plafond, quelqu'un connecté juste avant l'échéance garderait la
  // main quatre heures de plus, et refuser la connexion suivante ne servirait
  // à rien.
  assert.match(auth, /Math\.min\(SESSION_TTL_SECONDS, Math\.floor\(ctx\.accessExpiresAt \/ 1000\) - now\)/,
    'signSession doit plafonner la durée du jeton');
  assert.match(auth, /const exp = now \+ Math\.max\(0, ttlLimit\);/,
    'une échéance déjà passée ne doit pas produire une durée négative');
});

test('un accès échu disparaît de la liste de connexion', () => {
  // Proposer un profil qui ne peut plus ouvrir de session égarerait la personne.
  assert.match(routes, /const expiry = accessExpiryMs\(u\.access_expires_at\);\s*\n\s*return expiry === null \|\| expiry > Date\.now\(\);/,
    'l’annuaire doit filtrer les accès échus');
});

test('le refus est distingué d’un mauvais NIP', () => {
  // Répondre « NIP incorrect » enverrait la personne refaire son code sans fin.
  assert.match(routes, /code: 'ACCESS_EXPIRED'/);
  assert.match(routes, /logAudit\(null, 'login_expired', 'auth'\)/,
    'un accès refusé pour échéance doit laisser une trace');
});

test('le client traduit le refus en message honnête', () => {
  const client = read('src/apiClient.ts');
  assert.match(client, /if \(res\.status === 403\) return \{ status: 'expired' \};/);
  const store = read('src/store.ts');
  assert.match(store, /accès temporaire est arrivé à échéance/,
    'le message doit nommer la vraie cause');
});

// ---------------------------------------------------------------------------
// Aller-retour avec la base
// ---------------------------------------------------------------------------

test('la date fait l’aller-retour entre l’application et la base', () => {
  const client = read('src/apiClient.ts');
  assert.match(client, /access_expires_at: e\.accessExpiresAt \|\| null/, 'écriture');
  assert.match(client, /accessExpiresAt: r\.access_expires_at \|\| undefined/, 'lecture');
});

test('la migration crée une colonne nullable, sans toucher aux comptes existants', () => {
  const sql = read('supabase/migrations/20260812090000_add_access_expiry.sql');
  // La déclaration de colonne elle-même ne doit porter aucune contrainte :
  // l'index partiel plus bas contient bien « is not null », mais c'est un
  // prédicat d'index, pas une contrainte sur les lignes.
  assert.match(sql, /add column if not exists access_expires_at timestamptz\s*;/,
    'la colonne doit être déclarée nullable et sans valeur par défaut');
  assert.doesNotMatch(sql, /^\s*update /im, 'aucun compte existant ne doit être modifié');
  assert.doesNotMatch(sql, /alter column access_expires_at set not null/i);
});
