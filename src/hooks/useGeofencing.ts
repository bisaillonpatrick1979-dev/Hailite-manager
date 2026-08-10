import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import useAppStore from '../store';

// Le contournement du géorepérage sert uniquement aux essais visuels locaux.
// Il ne doit jamais devenir un raccourci de pointage pour un utilisateur réel.
export function canUseGeofenceBypass(localTestMode: boolean, role?: string | null): boolean {
  return localTestMode && role === 'admin';
}

// Un chantier est géorepéré dès qu'il porte des coordonnées utilisables.
//
// L'ancien test `!project.latitude || !project.longitude` désactivait le
// géorepérage dès qu'UNE des deux valait 0 — or 0 est une latitude parfaitement
// valide. Un chantier à latitude 0 laissait donc pointer de n'importe où, sans
// le dire.
//
// Le modèle stocke 0 par défaut (`rowToProject` fait `r.latitude || 0`), donc
// le couple exactement (0, 0) reste le seul marqueur possible de « jamais
// saisi » : c'est un point du golfe de Guinée, jamais un chantier de toiture.
// Toute autre combinaison, y compris une seule coordonnée à zéro, est traitée
// comme une position réelle.
export function hasProjectCoordinates(project: { latitude?: number | null; longitude?: number | null }): boolean {
  const { latitude, longitude } = project;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return !(latitude === 0 && longitude === 0);
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
    // 2. Aucun chantier ou aucune coordonnée : le géorepérage ne s'applique pas.
    //    Le test porte sur le TYPE et non sur la valeur : `0` est un nombre
    //    valide (équateur, méridien de Greenwich) mais aussi la valeur que
    //    prennent les chantiers dont les coordonnées n'ont jamais été saisies.
    //    L'ancien test `!project.latitude` désactivait donc le géorepérage sans
    //    le dire dès qu'un chantier avait 0 comme coordonnée.
    if (!project || !hasProjectCoordinates(project)) {
      return { canPunch: true, distance: 0, requiredRadius: 0, msg: 'No GPS coordinate constraints on this project' };
    }

    // 3. If GPS is still checking and we don't have coords yet
    if (isChecking && !coords) {
      return { canPunch: false, isChecking: true, distance: 0, requiredRadius: project.radius, msg: 'Checking location...' };
    }

    // 4. GPS en échec et aucune position : le travail n'est jamais bloqué (un
    //    sous-sol, un toit métallique ou une permission refusée sont des
    //    situations normales de chantier), mais le pointage part « à vérifier »
    //    au lieu de se faire passer pour validé. C'est la gestion qui tranche.
    if (gpsError && !coords) {
      return {
        canPunch: true, distance: 0, requiredRadius: project.radius,
        isFailSafe: true, needsApproval: true,
        msg: `Position indisponible, pointage à faire approuver : ${gpsError}`
      };
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
