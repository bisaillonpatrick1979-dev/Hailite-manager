import assert from 'node:assert/strict';
import test from 'node:test';
import { browserStorageValue, sanitizeCompanyPreferences } from '../src/securityStorage.ts';

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
