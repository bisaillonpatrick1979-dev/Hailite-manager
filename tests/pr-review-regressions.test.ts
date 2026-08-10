import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MAX_COMPANY_USERS, MAX_PROJECT_ASSIGNMENTS } from '../src/projectLimits';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('l’assignation par défaut et la connexion acceptent la même taille d’équipe', async () => {
  assert.equal(MAX_PROJECT_ASSIGNMENTS, MAX_COMPANY_USERS);
  assert.ok(MAX_COMPANY_USERS > 250);
  const [routes, auth] = await Promise.all([source('apiRoutes.ts'), source('auth.ts')]);
  assert.match(routes, /\.limit\(MAX_COMPANY_USERS\)/);
  assert.match(routes, /assignments\.length > MAX_PROJECT_ASSIGNMENTS/);
  assert.match(auth, /\.limit\(MAX_COMPANY_USERS\)/);
});

test('la progression d’aide est séparée par rôle et version de parcours', async () => {
  const help = await source('src/components/UserHelpCenter.tsx');
  assert.match(help, /gcp_help_progress_\$\{employeeId\}_\$\{role\}_v\$\{HELP_CHECKLIST_VERSION\}/);
});

test('le diagnostic IA vérifie les secrets avant de chercher un profil', async () => {
  const workflow = await source('.github/workflows/test-ai-production.yml');
  const credentialsCheck = workflow.indexOf("elif not result['credentialsConfigured']:");
  const directoryCheck = workflow.indexOf('elif not selected:');
  assert.ok(credentialsCheck >= 0);
  assert.ok(directoryCheck > credentialsCheck);
  assert.match(workflow, /len\(pin\) == 4 and pin\.isdigit\(\)/);
  assert.match(workflow, /AI_TEST_PIN doit contenir exactement quatre chiffres/);
});

test('le type de travailleur est conservé dans chaque versement de paie', async () => {
  const [types, client, app, migration] = await Promise.all([
    source('src/types.ts'),
    source('src/apiClient.ts'),
    source('src/App.tsx'),
    source('supabase/migrations/20260809233000_snapshot_payroll_worker_type.sql')
  ]);
  assert.match(types, /workerTypeAtPayment\?: 'salaried' \| 'contractor'/);
  assert.match(client, /worker_type_at_payment: p\.workerTypeAtPayment \|\| null/);
  assert.match(client, /r\.worker_type_at_payment === 'salaried'/);
  assert.equal((app.match(/workerTypeAtPayment:/g) || []).length, 2);
  assert.match(migration, /add column if not exists worker_type_at_payment text/);
  assert.match(migration, /worker_type_at_payment in \('salaried', 'contractor'\)/);
});
