import assert from 'node:assert/strict';
import test from 'node:test';
import { hasLocationNotice, requestForegroundPosition, type LocationDriver } from '../src/location';
import { USER_PRIVACY_NOTICE_VERSION } from '../privacyVersions';

function fixture() {
  const calls: string[] = [];
  const driver: LocationDriver = {
    checkPermissions: async () => { calls.push('check'); return { location: 'prompt' }; },
    requestPermissions: async () => { calls.push('prompt'); return { location: 'granted' }; },
    getCurrentPosition: async () => { calls.push('position'); return { coords: { latitude: 45.5, longitude: -73.6 } }; }
  };
  return { calls, driver };
}

test('a missing or obsolete workforce notice cannot initiate any location access', async () => {
  const f = fixture();
  for (const employee of [null, { privacyNoticeVersion: '2026.08', locationNoticeAcknowledgedAt: '2026-08-01' },
    { privacyNoticeVersion: USER_PRIVACY_NOTICE_VERSION }]) {
    await assert.rejects(requestForegroundPosition(() => hasLocationNotice(employee), f.driver), { code: 'cancelled' });
  }
  assert.deepEqual(f.calls, []);
  assert.equal(hasLocationNotice({ privacyNoticeVersion: USER_PRIVACY_NOTICE_VERSION, locationNoticeAcknowledgedAt: '2026-09-09' }), true);
});

test('logging out during a permission check prevents the native prompt', async () => {
  const f = fixture();
  let allowed = true;
  f.driver.checkPermissions = async () => { allowed = false; return { location: 'prompt' }; };
  await assert.rejects(requestForegroundPosition(() => allowed, f.driver), { code: 'cancelled' });
  assert.deepEqual(f.calls, []);
});

test('withdrawing consent during the native permission prompt prevents GPS access', async () => {
  const f = fixture();
  let allowed = true;
  f.driver.requestPermissions = async () => { allowed = false; return { location: 'granted' }; };
  await assert.rejects(requestForegroundPosition(() => allowed, f.driver), { code: 'cancelled' });
  assert.deepEqual(f.calls, ['check']);
});

test('denied location never reads GPS, while coarse permission avoids another prompt', async () => {
  const f = fixture();
  f.driver.requestPermissions = async () => ({ location: 'denied', coarseLocation: 'denied' });
  await assert.rejects(requestForegroundPosition(() => true, f.driver), { code: 'denied' });
  assert.deepEqual(f.calls, ['check']);
  f.driver.checkPermissions = async () => ({ location: 'denied', coarseLocation: 'granted' });
  assert.deepEqual(await requestForegroundPosition(() => true, f.driver), { latitude: 45.5, longitude: -73.6 });
  assert.deepEqual(f.calls, ['check', 'position']);
});

test('a location arriving after a shared-device user change is discarded', async () => {
  const f = fixture();
  let allowed = true;
  f.driver.getCurrentPosition = async () => { allowed = false; return { coords: { latitude: 45.5, longitude: -73.6 } }; };
  await assert.rejects(requestForegroundPosition(() => allowed, f.driver), { code: 'cancelled' });
});

test('unusable fixes and GPS timeouts cannot be mistaken for a current location', async () => {
  const f = fixture();
  f.driver.getCurrentPosition = async () => ({ coords: { latitude: 100, longitude: -73.6 } });
  await assert.rejects(requestForegroundPosition(() => true, f.driver), { code: 'unavailable' });
  f.driver.getCurrentPosition = async () => { throw { code: 'timeout' }; };
  await assert.rejects(requestForegroundPosition(() => true, f.driver), { code: 'timeout' });
});
