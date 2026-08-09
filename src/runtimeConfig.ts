import { Capacitor } from '@capacitor/core';

// `import.meta.env` est injecté par Vite, mais n'existe pas quand les modules
// métier sont importés directement par les tests Node.
const configuredApiBase = String(import.meta.env?.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export const isNativeRuntime = Capacitor.isNativePlatform();
export const nativePlatform = isNativeRuntime ? Capacitor.getPlatform() : 'web';

/**
 * Convertit une route serveur relative en URL absolue uniquement dans l'app
 * native. La version web conserve les requêtes même origine et ses cookies
 * HttpOnly; l'app Android utilise plutôt un jeton de session court en mémoire.
 */
export function apiUrl(path: string): string {
  if (!isNativeRuntime) return path;
  if (!configuredApiBase) {
    throw new Error('VITE_API_BASE_URL doit être configurée pour le build mobile');
  }
  return `${configuredApiBase}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (isNativeRuntime) headers.set('X-Hailite-Client', nativePlatform);

  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: isNativeRuntime ? 'omit' : (init.credentials || 'same-origin')
  });
}

export function publicSiteUrl(path: string): string {
  if (!isNativeRuntime || !configuredApiBase) return path;
  return `${configuredApiBase}${path.startsWith('/') ? path : `/${path}`}`;
}
