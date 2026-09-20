import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { openTasksRefusal } from '../src/invoiceCompliance';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routes = read('apiRoutes.ts');

function routeBody(start: string, end: string): string {
  const from = routes.indexOf(start);
  assert.ok(from > 0, `route introuvable : ${start}`);
  const to = routes.indexOf(end, from);
  assert.ok(to > from, `fin de route introuvable : ${end}`);
  return routes.slice(from, to);
}

// ---------------------------------------------------------------------------
// Le refus, formulé une seule fois pour les deux côtés
// ---------------------------------------------------------------------------
// La règle « une facture ne part pas tant qu'une tâche reste ouverte »
// n'existait que dans le navigateur. Le serveur acceptait tout : writeGuards
// autorise explicitement un travailleur à poser « pending » sur sa facture, et
// rien ne regardait les tâches. La porte était décorative pour qui appelait
// l'API directement — c'est-à-dire pour qui aurait intérêt à la contourner.

test('aucune tâche ouverte ne produit aucun refus', () => {
  assert.equal(openTasksRefusal(0), null);
  assert.equal(openTasksRefusal(-3), null, 'un compte absurde ne bloque pas');
  assert.equal(openTasksRefusal(Number.NaN), null);
});

test('le refus s’accorde en nombre', () => {
  assert.match(openTasksRefusal(1)!, /^Une tâche reste/);
  assert.match(openTasksRefusal(4)!, /^4 tâches restent/);
  assert.match(openTasksRefusal(1, 'EN')!, /^One task is still open/);
  assert.match(openTasksRefusal(4, 'EN')!, /^4 tasks are still open/);
});

test('le refus dit quoi faire, pas seulement que c’est refusé', () => {
  // Un message qui annonce un blocage sans dire comment le lever envoie la
  // personne demander à quelqu'un d'autre.
  assert.match(openTasksRefusal(2)!, /Cochez-les avant d’envoyer la facture/);
  assert.match(openTasksRefusal(2, 'EN')!, /Check them off before sending/);
});

test('le serveur emploie exactement ce message', () => {
  // Sans ce partage, le navigateur et l'API finiraient par dire deux choses
  // différentes à la même personne — et c'est l'API qui gagne, donc
  // l'explication affichée serait la fausse.
  assert.match(routes, /import \{ openTasksRefusal \} from '\.\/src\/invoiceCompliance\.js'/);
  assert.match(routes, /return openTasksRefusal\(verdict\.openTaskCount\);/);
});

// ---------------------------------------------------------------------------
// Ce que le serveur va chercher
// ---------------------------------------------------------------------------

test('la vérification remonte pointages → chantiers → tâches ouvertes', () => {
  assert.match(routes, /from\('punches'\)[\s\S]{0,140}\.select\('project_id'\)[\s\S]{0,140}\.in\('id', ids\)/);
  assert.match(routes, /from\('project_tasks'\)[\s\S]{0,200}\.in\('project_id', projectIds\)[\s\S]{0,140}\.neq\('status', 'done'\)/,
    'toute tâche dont le statut n’est pas « done » compte comme ouverte');
});

test('les deux lectures restent enfermées dans la compagnie du jeton', () => {
  // Un identifiant de pointage emprunté à une autre compagnie ne doit rien
  // révéler, pas même par la différence entre « bloqué » et « permis ».
  const bloc = routes.slice(
    routes.indexOf('async function invoiceBlockedByOpenTasks'),
    routes.indexOf('async function invoiceComplianceRefusal')
  );
  assert.equal((bloc.match(/\.eq\('company_id', auth\.companyId\)/g) || []).length, 2,
    'les deux requêtes doivent être filtrées par compagnie');
});

test('les identifiants fournis par le client sont filtrés avant la requête', () => {
  assert.match(routes, /const UUID_RE = /);
  assert.match(routes, /\.filter\(value => UUID_RE\.test\(value\)\)/);
});

test('une facture sans pointage ne bloque rien', () => {
  // Elle ne couvre aucun chantier : il n'y a rien à cocher. C'est le même
  // choix que le calcul du navigateur.
  assert.match(routes, /if \(ids\.length === 0 \|\| !supabase\) return \{ blocked: false/);
  assert.match(routes, /if \(projectIds\.length === 0\) return \{ blocked: false/,
    'un chantier supprimé ne doit pas piéger le travailleur');
});

// ---------------------------------------------------------------------------
// Qui est visé, et sur quels chemins
// ---------------------------------------------------------------------------

test('seule une facture en cours d’envoi est examinée', () => {
  assert.match(routes, /if \(table !== 'payroll_entries'\) return null;/);
  assert.match(routes, /if \(String\(payload\.status \|\| ''\) !== 'pending'\) return null;/);
});

test('la gestion garde la main', () => {
  // Une tâche peut devenir impossible — matériau discontinué, client qui
  // change d'idée — et quelqu'un doit pouvoir trancher.
  assert.match(routes, /if \(isManager\(auth\.role\)\) return null;/);
});

test('les trois chemins d’écriture sont couverts', () => {
  for (const [nom, debut, fin] of [
    ['POST', "app.post('/api/db/:table'", "app.put('/api/db/:table'"],
    ['PUT', "app.put('/api/db/:table'", "app.patch('/api/db/:table/:id'"],
    ['PATCH', "app.patch('/api/db/:table/:id'", "app.delete('/api/db/:table/:id'"]
  ] as const) {
    const corps = routeBody(debut, fin);
    assert.match(corps, /invoiceComplianceRefusal\(/, `${nom} doit vérifier la conformité`);
    assert.match(corps, /res\.status\(409\)[\s\S]{0,120}OPEN_TASKS/, `${nom} doit refuser en 409`);
    assert.match(corps, /logAudit\(auth, 'invoice_blocked_open_tasks'/, `${nom} doit journaliser le refus`);
  }
});

test('le PATCH lit les pointages de la facture, sinon le garde ne verrait rien', () => {
  // C'est le chemin normal d'envoi : le corps ne contient souvent que
  // « status ». Sans session_ids dans la lecture, la vérification n'aurait
  // aucun chantier à examiner et laisserait tout passer — en silence.
  const patch = routeBody("app.patch('/api/db/:table/:id'", "app.delete('/api/db/:table/:id'");
  assert.match(patch, /table === 'payroll_entries' \? \['session_ids', 'status'\] : \[\]/);
  assert.match(patch, /invoiceComplianceRefusal\(\s*\n?\s*table, auth, payload, \(existing as any\)\?\.session_ids/);
});

test('le corps prime sur la ligne existante quand il fournit les pointages', () => {
  assert.match(routes, /payload\.session_ids !== undefined \? payload\.session_ids : existingSessionIds/);
});
