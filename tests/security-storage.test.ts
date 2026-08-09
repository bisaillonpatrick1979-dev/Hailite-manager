import assert from 'node:assert/strict';
import test from 'node:test';
import { browserStorageValue, isSafeStorageKey, sanitizeCompanyPreferences } from '../src/securityStorage.ts';

test('les données métier et la session ne peuvent pas être persistées', () => {
  for (const key of ['gcp_employees', 'gcp_projects', 'gcp_clients', 'gcp_payrollPayments', 'gcp_activeEmployee']) {
    assert.equal(browserStorageValue(key, [{ secret: true }]).allowed, false, key);
  }
});

test('les préférences de compagnie excluent banque, courriel et identifiants fiscaux', () => {
  const safe = sanitizeCompanyPreferences({
    name: 'Hailite', currency: 'CAD', bankDetails: { account: '123' },
    email: 'private@example.test', gstNumber: 'secret'
  });
  assert.deepEqual(safe, { name: 'Hailite', currency: 'CAD' });
});

test('la progression de formation survit, sans ouvrir la porte aux données métier', () => {
  // Des étapes de tutoriel cochées ne contiennent ni donnée personnelle ni
  // donnée d'entreprise : elles doivent tenir d'une session à l'autre, sinon la
  // formation redemande de tout refaire à chaque reconnexion.
  assert.equal(browserStorageValue('gcp_help_progress_28dedef5', ['first-login']).allowed, true);
  assert.equal(isSafeStorageKey('gcp_help_progress_abc'), true);

  // Le préfixe ne doit pas devenir une échappatoire pour le reste.
  assert.equal(isSafeStorageKey('gcp_help_progress'), false);
  assert.equal(isSafeStorageKey('gcp_employees'), false);
  assert.equal(browserStorageValue('gcp_punchSessions', [{ rate: 42 }]).allowed, false);
});
