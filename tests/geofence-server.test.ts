import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasProjectCoordinates, calculateDistance } from '../src/hooks/useGeofencing';

// ---------------------------------------------------------------------------
// Le bug « latitude 0 »
// ---------------------------------------------------------------------------
test('une latitude de 0 ne désactive plus le géorepérage', () => {
  // L'ancien test `!project.latitude || !project.longitude` rendait le
  // géorepérage inopérant dès qu'une coordonnée valait 0, sans le signaler.
  assert.equal(hasProjectCoordinates({ latitude: 0, longitude: -114.07 }), true);
  assert.equal(hasProjectCoordinates({ latitude: 51.05, longitude: 0 }), true);
});

test('un chantier sans coordonnées saisies reste hors géorepérage', () => {
  // (0, 0) est le seul marqueur possible de « jamais saisi » : rowToProject
  // remplace les valeurs absentes par 0.
  assert.equal(hasProjectCoordinates({ latitude: 0, longitude: 0 }), false);
  assert.equal(hasProjectCoordinates({ latitude: undefined, longitude: undefined }), false);
  assert.equal(hasProjectCoordinates({ latitude: null, longitude: null }), false);
  assert.equal(hasProjectCoordinates({ latitude: Number.NaN, longitude: 12 }), false);
});

test('la distance orthodromique reste juste sur de courtes portées', () => {
  // Deux points distants d'environ 1 km à Calgary.
  const metres = calculateDistance(51.0447, -114.0719, 51.0537, -114.0719);
  assert.ok(metres > 950 && metres < 1050, `distance inattendue : ${metres} m`);
  assert.equal(calculateDistance(51.0447, -114.0719, 51.0447, -114.0719), 0);
});

// ---------------------------------------------------------------------------
// La règle vit maintenant sur le serveur
// ---------------------------------------------------------------------------
const serveur = readFileSync(new URL('../apiRoutes.ts', import.meta.url), 'utf8');

test('le serveur vérifie lui-même le géorepérage à l’insertion d’un pointage', () => {
  assert.match(serveur, /if \(table === 'punches'\) \{\s*\n\s*const verdict = await enforcePunchGeofence/,
    'l’insertion d’un pointage doit passer par la vérification serveur');
  assert.match(serveur, /return res\.status\(403\)\.json\(\{ error: verdict\.error \}\)/,
    'un pointage hors zone doit être refusé, pas seulement journalisé');
});

test('le serveur ne fait jamais confiance au drapeau envoyé par le navigateur', () => {
  const debut = serveur.indexOf('export async function enforcePunchGeofence');
  const fin = serveur.indexOf('async function hasProjectAccess');
  const corps = serveur.slice(debut, fin);
  assert.ok(debut !== -1 && fin > debut, 'enforcePunchGeofence introuvable');
  // Le drapeau est réécrit par le serveur dans les deux issues possibles.
  assert.match(corps, /payload\.within_geofence = false/, 'position absente : conformité refusée');
  assert.match(corps, /payload\.within_geofence = true/, 'position validée : conformité réécrite');
  assert.match(corps, /payload\.approval_status = 'pending'/,
    'sans position, le pointage doit partir en attente d’approbation');
});

test('un pointage sans position n’est pas bloqué mais part à approuver', () => {
  const debut = serveur.indexOf('export async function enforcePunchGeofence');
  const corps = serveur.slice(debut, serveur.indexOf('async function hasProjectAccess'));
  const sansPosition = corps.indexOf('if (!hasPosition)');
  const retourOk = corps.indexOf('return { ok: true };', sansPosition);
  assert.ok(sansPosition !== -1, 'le cas « position indisponible » doit être traité');
  assert.ok(retourOk > sansPosition, 'le travail ne doit jamais être bloqué faute de GPS');
});

test('le refus hors zone est journalisé pour l’audit', () => {
  assert.match(serveur, /logAudit\(auth, 'punch\.geofence_refused'/,
    'une tentative hors zone doit laisser une trace d’audit');
});

test('la gestion peut saisir un pointage sans contrainte de position', () => {
  const debut = serveur.indexOf('export async function enforcePunchGeofence');
  const corps = serveur.slice(debut, serveur.indexOf('async function hasProjectAccess'));
  assert.match(corps, /if \(isManager\(auth\.role\)\) return \{ ok: true \};/,
    'une correction administrative ne doit pas être refusée pour cause de position');
});
