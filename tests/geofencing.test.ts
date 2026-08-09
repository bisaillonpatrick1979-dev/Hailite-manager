import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateDistance, canUseGeofenceBypass } from '../src/hooks/useGeofencing.ts';

test('le bypass GPS reste réservé à un administrateur en mode test local', () => {
  assert.equal(canUseGeofenceBypass(false, 'admin'), false);
  assert.equal(canUseGeofenceBypass(true, 'employee'), false);
  assert.equal(canUseGeofenceBypass(true, 'secretary'), false);
  assert.equal(canUseGeofenceBypass(true, 'admin'), true);
});

test('le calcul de distance GPS reste cohérent en mètres', () => {
  assert.equal(calculateDistance(51.0447, -114.0719, 51.0447, -114.0719), 0);
  const nearbyDistance = calculateDistance(51.0447, -114.0719, 51.0456, -114.0719);
  assert.ok(nearbyDistance >= 95 && nearbyDistance <= 105);
});

test('le pointage de production ne peut pas utiliser le bypass de démonstration', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(!validation\.canPunch && !geofencingBypassActive\)/);
  assert.match(app, /\{geofencingBypassAllowed && \(/);
  assert.match(app, /withinGeofence: geofencingBypassActive \|\| !gpsFailSafeUsed/);
  assert.doesNotMatch(app, /if \(!validation\.canPunch && !geofencingBypass\)/);
});
