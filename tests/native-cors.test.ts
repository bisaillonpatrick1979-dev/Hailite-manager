import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { NATIVE_APP_ORIGINS, registerSecurityMiddleware } from '../securityMiddleware';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Démarre le serveur sur un port libre et renvoie son adresse de base.
async function startServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  registerSecurityMiddleware(app);
  app.all('/api/ping', (_req, res) => { res.json({ ok: true }); });
  app.get('/secret.txt', (_req, res) => { res.send('contenu du site'); });

  const server = await new Promise<any>(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve()))
  };
}

test('aucune réponse CORS n’autorise les requêtes porteuses de cookies', async () => {
  const { base, close } = await startServer();
  try {
    for (const origin of NATIVE_APP_ORIGINS) {
      for (const method of ['GET', 'OPTIONS', 'POST']) {
        const res = await fetch(`${base}/api/ping`, { method, headers: { Origin: origin } });
        assert.equal(
          res.headers.get('access-control-allow-credentials'),
          null,
          `${method} depuis ${origin} ne doit jamais autoriser les identifiants`
        );
        assert.equal(res.headers.get('access-control-allow-origin'), origin, `${method} depuis ${origin}`);
      }
    }
  } finally {
    await close();
  }
});

test('les origines inconnues ne reçoivent aucun en-tête CORS', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/ping`, { headers: { Origin: 'https://exemple-hostile.test' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  } finally {
    await close();
  }
});

test('le partage entre origines ne dépasse pas /api/', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/secret.txt`, { headers: { Origin: 'https://localhost' } });
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      null,
      'le reste du site ne doit pas être lisible depuis une autre origine'
    );
  } finally {
    await close();
  }
});

test('l’origine native du serveur correspond au schéma épinglé de Capacitor', async () => {
  const capacitor = await source('capacitor.config.ts');
  // Si androidScheme change, l'application Android perd son accès à l'API.
  assert.match(capacitor, /androidScheme:\s*'https'/);
  assert.ok(NATIVE_APP_ORIGINS.has('https://localhost'), 'origine Android');
  assert.ok(NATIVE_APP_ORIGINS.has('capacitor://localhost'), 'origine iOS');
});

test('le limiteur de débit est monté avant la réponse CORS', async () => {
  const middleware = await source('securityMiddleware.ts');
  assert.ok(
    middleware.indexOf('rateLimit({') < middleware.indexOf("Access-Control-Allow-Origin"),
    'sinon un flot de requêtes OPTIONS échapperait au comptage'
  );
});

test('les règles R8 conservent le pont Capacitor du build de release', async () => {
  const [rules, gradle] = await Promise.all([
    source('android/app/proguard-rules.pro'),
    source('android/app/build.gradle')
  ]);
  // Ces règles ne sont indispensables que parce que la release est minifiée.
  assert.match(gradle, /minifyEnabled true/);
  assert.match(rules, /-keep class com\.getcapacitor\.\*\* \{ \*; \}/);
  assert.match(rules, /-keep class \* extends com\.getcapacitor\.Plugin/);
  assert.match(rules, /@android\.webkit\.JavascriptInterface <methods>;/);
});

test('l’adresse du serveur mobile n’est déclarée qu’à un seul endroit', async () => {
  const [html, workflow, envMobile] = await Promise.all([
    source('index.html'),
    source('.github/workflows/android.yml'),
    source('.env.mobile')
  ]);
  assert.match(envMobile, /VITE_API_BASE_URL="https:\/\/[^"]+"/);
  assert.doesNotMatch(html, /connect-src[^;]*https:\/\/[a-z0-9.-]+/i);
  assert.doesNotMatch(workflow, /VITE_API_BASE_URL:/);
});
