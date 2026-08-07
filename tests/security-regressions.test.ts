import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const hardeningMigration = async () => {
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
  const matches = files.filter((file) => file.endsWith('_harden_auth_and_tenant_isolation.sql'));
  assert.equal(matches.length, 1, 'la migration de durcissement doit être présente une seule fois');
  return source(`supabase/migrations/${matches[0]}`);
};

test('aucun repli de connexion locale ni jeton localStorage ne réapparaît', async () => {
  const [store, apiClient, app, auth, routes] = await Promise.all([
    source('src/store.ts'),
    source('src/apiClient.ts'),
    source('src/App.tsx'),
    source('auth.ts'),
    source('apiRoutes.ts')
  ]);
  assert.doesNotMatch(store, /emp\.nip\s*===\s*nip/);
  assert.doesNotMatch(apiClient, /localStorage\.setItem\(['"]gcp_auth/i);
  assert.doesNotMatch(app, /\{emp\.nip\}/);
  assert.match(auth, /if \(process\.env\.NODE_ENV === 'production'\)/);
  assert.match(routes, /protectedRuntime = supabaseEnabled \|\| process\.env\.NODE_ENV === 'production'/);
});

test('toutes les tables enfants auditées portent company_id', async () => {
  const [db, routes, migration] = await Promise.all([
    source('db.ts'),
    source('apiRoutes.ts'),
    hardeningMigration()
  ]);
  for (const table of [
    'project_tasks', 'project_tools', 'project_assignments', 'supplier_order_items',
    'document_items', 'document_payments', 'weekly_goals'
  ]) {
    assert.match(db, new RegExp(`['"]${table}['"]`), table);
    assert.match(migration, new RegExp(`alter table public\\.${table} add column if not exists company_id uuid`), table);
  }
  assert.match(migration, /foreign key \(project_id, company_id\) references public\.projects\(id, company_id\)/);
  assert.match(migration, /foreign key \(employee_id, company_id\) references public\.app_users\(id, company_id\)/);
  assert.match(migration, /foreign key \(assigned_user_id, company_id\) references public\.app_users\(id, company_id\)/);
  assert.match(routes, /userReferenceBelongsToCompany/);
});

test('la migration hache les NIP et ferme la fonction SECURITY DEFINER publique', async () => {
  const migration = await hardeningMigration();
  assert.match(migration, /extensions\.crypt\(/);
  assert.match(migration, /where access_code_hash ~ '\^\[0-9\]\{4\}\$'/);
  assert.match(migration, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/);
});

test('le remplacement des enfants est transactionnel et conserve les taux des assignations', async () => {
  const migration = await hardeningMigration();
  assert.match(migration, /create or replace function public\.replace_project_children/);
  assert.match(migration, /raise exception 'invalid_task_assignee'/);
  assert.match(migration, /where not exists \([\s\S]*public\.project_assignments existing/);
  assert.doesNotMatch(migration, /delete from public\.project_assignments\s+where company_id/);
});

test('les builds ordinaires ne réécrivent plus les sources', async () => {
  const [packageSource, viteConfig] = await Promise.all([source('package.json'), source('vite.config.ts')]);
  const pkg = JSON.parse(packageSource);
  for (const script of ['dev', 'build', 'build:vercel', 'lint', 'test']) {
    assert.doesNotMatch(pkg.scripts[script], /legacy:materialize|prepare:app|python3 scripts\/apply_/);
  }
  assert.doesNotMatch(viteConfig, /transform\s*\(/);
  assert.doesNotMatch(viteConfig, /localStorage/);
});

test('les workflows échouent réellement et ne publient aucun NIP de production', async () => {
  const [aiWorkflow, onboardingWorkflow] = await Promise.all([
    source('.github/workflows/test-ai-production.yml'),
    source('.github/workflows/test-onboarding-transition.yml')
  ]);
  assert.match(aiWorkflow, /sys\.exit\(1\)/);
  assert.doesNotMatch(aiWorkflow, /test-admin|['"]0000['"]/);
  assert.doesNotMatch(onboardingWorkflow, /\/tmp\/test-onboarding\.mjs/);
  assert.match(onboardingWorkflow, /node scripts\/test-onboarding\.mjs/);
});
