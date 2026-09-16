import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { USER_PRIVACY_NOTICE_VERSION } from '../privacyVersions';

export type ForegroundPosition = { latitude: number; longitude: number };
type Permission = { location: string; coarseLocation?: string };
export interface LocationDriver {
  checkPermissions(): Promise<Permission>;
  requestPermissions(): Promise<Permission>;
  getCurrentPosition(): Promise<{ coords: ForegroundPosition }>;
}

export function hasLocationNotice(employee: {
  privacyNoticeVersion?: string; locationNoticeAcknowledgedAt?: string;
} | null | undefined): boolean {
  return employee?.privacyNoticeVersion === USER_PRIVACY_NOTICE_VERSION
    && !!employee.locationNoticeAcknowledgedAt;
}

const nativeDriver: LocationDriver = {
  checkPermissions: () => Geolocation.checkPermissions(),
  requestPermissions: () => Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] }),
  getCurrentPosition: () => Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
};

const browserDriver: LocationDriver = {
  // The browser itself requests permission during getCurrentPosition.
  checkPermissions: async () => ({ location: 'granted' }),
  requestPermissions: async () => ({ location: 'granted' }),
  getCurrentPosition: () => new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ code: 'unavailable', message: 'Geolocation is not supported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 8000, maximumAge: 0
    });
  })
};

// Called only by explicit user actions. Recheck consent and identity between
// asynchronous steps so a logout/revocation cannot trigger a later prompt or
// attach another worker's position to the next record on a shared device.
export async function requestForegroundPosition(
  isStillAllowed: () => boolean,
  driver: LocationDriver = Capacitor.isNativePlatform() ? nativeDriver : browserDriver
): Promise<ForegroundPosition> {
  const assertAllowed = () => {
    if (!isStillAllowed()) throw { code: 'cancelled', message: 'Location request no longer authorized' };
  };
  const granted = (permission: Permission) =>
    permission.location === 'granted' || permission.coarseLocation === 'granted';
  assertAllowed();
  let permission = await driver.checkPermissions();
  assertAllowed();
  if (!granted(permission)) {
    permission = await driver.requestPermissions();
    assertAllowed();
  }
  if (!granted(permission)) throw { code: 'denied', message: 'Location permission denied' };
  const position = await driver.getCurrentPosition();
  assertAllowed();
  const { latitude, longitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw { code: 'unavailable', message: 'Invalid location' };
  }
  return { latitude, longitude };
}
