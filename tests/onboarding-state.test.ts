import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPLIANCE_VERSION } from '../privacyVersions.ts';
import { resolveOnboardingState } from '../src/onboardingState.ts';

test('la première connexion conserve et synchronise un onboarding local terminé', () => {
  const local = {
    name: 'Ma compagnie', logo: 'data:image/png;base64,logo', isOnboarded: true,
    complianceVersion: COMPLIANCE_VERSION
  };
  const remote = { name: 'Hailite Manager', isOnboarded: false, complianceVersion: '' };
  const resolution = resolveOnboardingState(local, true, remote);

  assert.equal(resolution.isOnboarded, true);
  assert.equal(resolution.companyInfo.name, 'Ma compagnie');
  assert.equal(resolution.companyInfo.logo, local.logo);
  assert.equal(resolution.shouldSyncLocalCompletion, true);
});

test('une configuration cloud actuelle est chargée sur un nouvel appareil', () => {
  const remote = {
    name: 'Compagnie cloud', isOnboarded: true, complianceVersion: COMPLIANCE_VERSION
  };
  const resolution = resolveOnboardingState({ name: 'Hailite Manager' }, false, remote);

  assert.equal(resolution.isOnboarded, true);
  assert.equal(resolution.companyInfo.name, 'Compagnie cloud');
  assert.equal(resolution.shouldSyncLocalCompletion, false);
});

test('une ancienne version de conformité redemande légitimement la configuration', () => {
  const stale = { name: 'Ancienne', isOnboarded: true, complianceVersion: '2025.01' };
  const resolution = resolveOnboardingState(stale, true, stale);

  assert.equal(resolution.isOnboarded, false);
  assert.equal(resolution.shouldSyncLocalCompletion, false);
});
