import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import useAppStore from '../store';

// Le contournement du géorepérage sert uniquement aux essais visuels locaux.
// Il ne doit jamais devenir un raccourci de pointage pour un utilisateur réel.
export function canUseGeofenceBypass(localTestMode: boolean, role?: string | null): boolean {
  return localTestMode && role === 'admin';
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // returns distance in meters
}

export function useGeofencing() {
  const companyInfo = useAppStore(state => state.companyInfo);
  const projects = useAppStore(state => state.projects);
  const activeEmployee = useAppStore(state => state.activeEmployee);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkLocation = useCallback(() => {
    setIsChecking(true);
    setGpsError(null);

    const acceptPosition = (latitude: number, longitude: number) => {
      setCoords({ latitude, longitude });
      setGpsError(null);
      setIsChecking(false);
    };

    const rejectPosition = (error: { code?: number | string; message?: string }) => {
      // Un refus de permission ou un signal indisponible est un état prévu sur
      // mobile, pas une erreur d'application. L'interface affiche le résultat.
      console.warn('GPS indisponible', { code: error.code, message: error.message });
      const code = String(error.code || '').toLowerCase();
      const message = String(error.message || '').toLowerCase();
      let msg = 'Unknown GPS Error';
      if (code === '1' || code.includes('denied') || message.includes('denied')) {
        msg = 'Permission denied by user';
      } else if (code === '2' || code.includes('unavailable') || message.includes('unavailable')) {
        msg = 'Position unavailable';
      } else if (code === '3' || code.includes('timeout') || message.includes('timeout')) {
        msg = 'GPS query timed out';
      }
      // Une ancienne position ne doit jamais être réutilisée après l'échec
      // d'un rafraîchissement : elle pourrait provenir d'un autre chantier.
      setCoords(null);
      setGpsError(msg);
      setIsChecking(false);
    };

    if (Capacitor.isNativePlatform()) {
      void (async () => {
        try {
          let permission = await Geolocation.checkPermissions();
          if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
            permission = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
          }
          if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
            rejectPosition({ code: 'denied', message: 'Location permission denied' });
            return;
          }
          const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
          acceptPosition(position.coords.latitude, position.coords.longitude);
        } catch (error: any) {
          rejectPosition({ code: error?.code, message: error?.message });
        }
      })();
      return;
    }

    if (!navigator.geolocation) {
      rejectPosition({ code: 'unavailable', message: 'Geolocation is not supported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        acceptPosition(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        rejectPosition({ code: error.code, message: error.message });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (companyInfo.geofencingEnabled && activeEmployee?.locationNoticeAcknowledgedAt) {
      checkLocation();
    }
  }, [companyInfo.geofencingEnabled, activeEmployee?.locationNoticeAcknowledgedAt, checkLocation]);

  // Evaluates punchability on a certain project
  const evaluateProjectGeofence = useCallback((projectId: string) => {
    // 1. If global geofencing is off, you can punch in
    if (!companyInfo.geofencingEnabled) {
      return { canPunch: true, distance: 0, requiredRadius: 0, msg: 'Geofencing disabled globally' };
    }

    const project = projects.find((p) => p.id === projectId);
    // 2. If no project or no valid coordinates defined, allow punch (fail-safe)
    if (!project || !project.latitude || !project.longitude) {
      return { canPunch: true, distance: 0, requiredRadius: 0, msg: 'No GPS coordinate constraints on this project' };
    }

    // 3. If GPS is still checking and we don't have coords yet
    if (isChecking && !coords) {
      return { canPunch: false, isChecking: true, distance: 0, requiredRadius: project.radius, msg: 'Checking location...' };
    }

    // 4. If GPS error occurred and we have NO coords
    if (gpsError && !coords) {
      // Fail-safe: if GPS fails or permissions are blocked, we don't block work but warning is appropriate.
      // However user requested: "GPS non disponible sur l'appareil (fail-safe : on laisse passer)"
      return { canPunch: true, distance: 0, requiredRadius: project.radius, isFailSafe: true, msg: `Fail-safe passes: ${gpsError}` };
    }

    if (!coords) {
      return { canPunch: false, isChecking: true, distance: 0, requiredRadius: project.radius, msg: 'Acquiring GPS lock...' };
    }

    const dist = calculateDistance(
      coords.latitude,
      coords.longitude,
      project.latitude,
      project.longitude
    );

    const isInside = dist <= project.radius;

    return {
      canPunch: isInside,
      distance: dist,
      requiredRadius: project.radius,
      msg: isInside 
        ? `Within range (${dist}m out of max ${project.radius}m)` 
        : `Outside range (${dist}m out of max ${project.radius}m)`
    };
  }, [coords, gpsError, isChecking, companyInfo.geofencingEnabled, projects]);

  return {
    coords,
    gpsError,
    isChecking,
    checkLocation,
    evaluateProjectGeofence,
  };
}
