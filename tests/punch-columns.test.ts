import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile(new URL('../apiRoutes.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/apiClient.ts', import.meta.url), 'utf8');

test('le pointage renseigne les deux colonnes héritées', () => {
  // punches.user_id est NOT NULL dans le schéma, mais le client n'écrit que
  // employee_id : chaque insertion était rejetée par Postgres et l'employé
  // voyait « Sauvegarde nuage échouée — vérifiez la connexion ».
  assert.match(routes, /function alignLegacyUserColumns/);
  assert.match(routes, /payload\.user_id = employee;/);
  assert.match(routes, /payload\.employee_id = employee;/);
});

test('l’alignement est appliqué à la création, à l’upsert et à la modification', () => {
  const calls = routes.match(/alignLegacyUserColumns\(table, payload\);/g) || [];
  assert.equal(calls.length, 3, 'POST, PUT et PATCH');
});

test('aucune valeur n’est inventée quand la personne est absente', () => {
  const fn = routes.slice(routes.indexOf('function alignLegacyUserColumns'), routes.indexOf('function alignLegacyUserColumns') + 500);
  assert.match(fn, /if \(employee === null\) return;/);
});

test('seule la table des pointages est concernée', () => {
  const fn = routes.slice(routes.indexOf('function alignLegacyUserColumns'), routes.indexOf('function alignLegacyUserColumns') + 500);
  assert.match(fn, /if \(table !== 'punches'\) return;/);
});

test('le client continue d’écrire employee_id, source de vérité de l’application', () => {
  const mapper = client.slice(client.indexOf('export function punchToRow'), client.indexOf('export function punchToRow') + 700);
  assert.match(mapper, /employee_id: p\.employeeId/);
});

test('une migration verrouille l’égalité des deux colonnes côté base', async () => {
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
  const migration = files.find(f => f.endsWith('_align_punch_user_columns.sql'));
  assert.ok(migration, 'migration absente');
  const sql = await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8');
  assert.match(sql, /create trigger punches_align_user_columns/);
  assert.match(sql, /before insert or update on public\.punches/);
});
