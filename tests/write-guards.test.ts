import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  guardWorkerWrite, MANAGER_OWNED_COLUMNS, IMMUTABLE_OWNER_COLUMNS, WORKER_ALLOWED_STATUS
} from '../writeGuards';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// L'attaque : un employé approuve son propre pointage
// ---------------------------------------------------------------------------

test('un employé ne peut pas approuver son propre pointage', () => {
  // Sans ce garde, un appel direct à l'API suffisait : la matrice de
  // permissions autorise l'employé à écrire SA ligne, et rien ne limitait les
  // colonnes.
  const existing = { approval_status: 'pending', approved_by: null, employee_id: 'moi' };
  const payload: Record<string, unknown> = {
    approval_status: 'approved',
    approved_by: 'moi',
    approved_by_name: 'Moi-même',
    approved_at: '2026-09-09T12:00:00Z',
    total_worked_hours: 8
  };
  const result = guardWorkerWrite('punches', payload, existing);

  assert.equal(payload.approval_status, undefined, 'l’approbation ne doit pas passer');
  assert.equal(payload.approved_by, undefined);
  assert.equal(payload.approved_at, undefined);
  assert.equal(payload.total_worked_hours, 8, 'les heures restent écrites par le terrain');
  assert.ok(result.attempted.includes('approval_status'), 'la tentative doit être signalée');
});

test('un employé ne peut pas effacer le refus de géorepérage', () => {
  // Le serveur calcule within_geofence au pointage. Le réécrire ensuite
  // annulerait la règle sans laisser de trace.
  const existing = { within_geofence: false, latitude: null, longitude: null };
  const payload: Record<string, unknown> = { within_geofence: true, latitude: 51.04, longitude: -114.07 };
  const result = guardWorkerWrite('punches', payload, existing);

  assert.deepEqual(Object.keys(payload), [], 'aucune de ces colonnes ne doit passer');
  assert.equal(result.attempted.length, 3);
});

test('un pointage ne change pas de titulaire', () => {
  const payload: Record<string, unknown> = { employee_id: 'un-collegue', notes: 'ok' };
  guardWorkerWrite('punches', payload, { employee_id: 'moi' });
  assert.equal(payload.employee_id, undefined, 'le rattachement est intouchable');
  assert.equal(payload.notes, 'ok', 'le reste passe normalement');
});

test('un employé ne peut pas déclarer sa propre facture payée', () => {
  const payload: Record<string, unknown> = { status: 'paid' };
  const result = guardWorkerWrite('payroll_entries', payload, { status: 'pending' });
  assert.deepEqual(result.rejected, { column: 'status', value: 'paid' },
    'le passage à « payé » appartient à la gestion');
});

test('un employé peut envoyer sa facture', () => {
  // Le geste légitime : brouillon → envoyée. Il ne doit pas être bloqué.
  const payload: Record<string, unknown> = { status: 'pending' };
  const result = guardWorkerWrite('payroll_entries', payload, { status: 'draft' });
  assert.equal(result.rejected, undefined);
  assert.equal(payload.status, 'pending');
});

// ---------------------------------------------------------------------------
// Ne pas casser le travail honnête
// ---------------------------------------------------------------------------

test('le renvoi de la ligne à l’identique n’est pas une tentative', () => {
  // `punchToRow` réexpédie la ligne entière à chaque synchronisation. Sans
  // cette distinction, chaque fin de quart aurait produit une fausse alerte.
  const existing = {
    approval_status: 'pending', approved_by: null, approved_by_name: null,
    approved_at: null, corrections: null, within_geofence: true,
    latitude: 51.04, longitude: -114.07, employee_id: 'moi'
  };
  const payload: Record<string, unknown> = { ...existing, total_worked_hours: 8, revenue: 320 };
  const result = guardWorkerWrite('punches', payload, existing);

  assert.deepEqual(result.attempted, [], 'aucune valeur ne change : rien à signaler');
  assert.equal(payload.total_worked_hours, 8, 'la fin de quart passe toujours');
  assert.equal(payload.revenue, 320);
});

test('une facture renvoyée telle quelle n’est pas refusée', () => {
  // Une facture déjà payée que le client réexpédie ne doit pas provoquer un
  // refus : la valeur ne change pas.
  const payload: Record<string, unknown> = { status: 'paid', amount: 320 };
  const result = guardWorkerWrite('payroll_entries', payload, { status: 'paid' });
  assert.equal(result.rejected, undefined);
});

test('une table sans colonnes réservées passe intacte', () => {
  const payload: Record<string, unknown> = { anything: 1, status: 'paid' };
  const result = guardWorkerWrite('expenses', payload, null);
  assert.deepEqual(result.removed, []);
  assert.equal(payload.status, 'paid');
});

test('les objets sont comparés par valeur, pas par référence', () => {
  const existing = { corrections: [{ at: '2026-09-01', field: 'endTime' }] };
  const payload: Record<string, unknown> = { corrections: [{ at: '2026-09-01', field: 'endTime' }] };
  const result = guardWorkerWrite('punches', payload, existing);
  assert.deepEqual(result.attempted, [], 'un journal identique n’est pas une tentative');
});

test('null et absent décrivent la même chose', () => {
  const result = guardWorkerWrite('punches', { approved_by: null }, { approved_by: undefined });
  assert.deepEqual(result.attempted, []);
});

// ---------------------------------------------------------------------------
// Le garde est réellement branché
// ---------------------------------------------------------------------------
const routes = read('apiRoutes.ts');

test('la mise à jour générique passe par le garde', () => {
  assert.match(routes, /guardWorkerWrite\(table, payload, existing as Record<string, unknown>\)/,
    'PATCH doit filtrer le corps avant d’écrire');
});

test('l’insertion générique passe aussi par le garde', () => {
  // Sinon il suffirait de créer un pointage déjà approuvé.
  assert.match(routes, /guardWorkerWrite\(table, payload, null\)/,
    'POST doit filtrer le corps avant d’écrire');
});

test('le garde ne s’applique qu’aux rôles non gestionnaires', () => {
  // La gestion doit pouvoir approuver, corriger et payer : c'est son rôle.
  assert.match(routes, /if \(!isManager\(auth\.role\)\) \{\s*\n\s*const guard = guardWorkerWrite/,
    'la gestion garde la main');
});

test('une tentative réelle laisse une trace d’audit', () => {
  assert.match(routes, /logAudit\(auth, 'write_blocked_columns'/,
    'une élévation tentée doit être journalisée');
});

test('les colonnes protégées couvrent l’approbation et le géorepérage', () => {
  for (const column of ['approval_status', 'approved_by', 'approved_at', 'corrections',
                        'within_geofence', 'latitude', 'longitude']) {
    assert.ok(MANAGER_OWNED_COLUMNS.punches.includes(column), `${column} doit être réservée`);
  }
  assert.deepEqual(WORKER_ALLOWED_STATUS.payroll_entries, ['draft', 'pending']);
});

test('le rattachement est libre à la création, figé ensuite', () => {
  // À la création il est obligatoire — c'est par lui que le serveur vérifie que
  // la ligne appartient à son auteur. Le figer aussi à l'insertion rendrait
  // tout pointage impossible.
  assert.ok(IMMUTABLE_OWNER_COLUMNS.punches.includes('employee_id'));
  const insertion: Record<string, unknown> = { employee_id: 'moi', start_time: 'x' };
  guardWorkerWrite('punches', insertion, null);
  assert.equal(insertion.employee_id, 'moi', 'la création garde le titulaire');

  const miseAJour: Record<string, unknown> = { employee_id: 'un-collegue' };
  guardWorkerWrite('punches', miseAJour, { employee_id: 'moi' });
  assert.equal(miseAJour.employee_id, undefined, 'la mise à jour le fige');
});
