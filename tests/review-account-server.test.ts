import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

// Le confinement doit tenir sur un serveur qui tourne, pas seulement dans une
// fonction pure. Ce test monte les VRAIES routes, forge un jeton de révision
// signé par le vrai secret, et vérifie que rien ne sort.
//
// Aucune base n'est configurée ici, et c'est volontaire : si le garde laissait
// passer, la requête irait plus loin et échouerait sur l'absence de Supabase
// (503). Un 503 au lieu d'un 403 signalerait donc que le confinement n'a PAS
// été appliqué — l'échec est visible dans les deux sens.
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';

const { signSession } = await import('../auth.ts');
const { registerApiRoutes } = await import('../apiRoutes.ts');

async function startServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerApiRoutes(app);
  const server = await new Promise<any>(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve()))
  };
}

const jetonRevision = signSession({
  userId: 'examinateur', companyId: 'c1', role: 'admin',
  name: 'Révision boutique', isReviewAccount: true
}).token;

const jetonOrdinaire = signSession({
  userId: 'patrick', companyId: 'c1', role: 'admin', name: 'Patrick'
}).token;

const CHEMINS_DE_DONNEES = [
  ['GET', '/api/hydrate'],
  ['GET', '/api/db/punches'],
  ['GET', '/api/db/app_users'],
  ['POST', '/api/db/punches'],
  ['PATCH', '/api/db/punches/1'],
  ['DELETE', '/api/db/punches/1'],
  ['GET', '/api/files/project-photo/1'],
  ['POST', '/api/credentials'],
  ['POST', '/api/chat']
] as const;

test('avec son jeton, le profil de révision ne tire aucune donnée du serveur', async () => {
  const { base, close } = await startServer();
  try {
    for (const [method, path] of CHEMINS_DE_DONNEES) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${jetonRevision}`, 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({})
      });
      const corps = await res.json().catch(() => ({}));
      assert.equal(res.status, 403, `${method} ${path} doit être refusé (reçu ${res.status})`);
      assert.equal((corps as { code?: string }).code, 'REVIEW_ACCOUNT_SANDBOX',
        `${method} ${path} doit être refusé PAR LE CONFINEMENT, pas par autre chose`);
    }
  } finally {
    await close();
  }
});

test('le même appel avec un compte ordinaire n’est pas confiné', async () => {
  // Contre-épreuve : sans elle, un serveur qui refuserait tout le monde
  // passerait le test précédent sans rien protéger du tout.
  const { base, close } = await startServer();
  try {
    for (const [method, path] of CHEMINS_DE_DONNEES) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${jetonOrdinaire}`, 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({})
      });
      const corps = await res.json().catch(() => ({}));
      assert.notEqual((corps as { code?: string }).code, 'REVIEW_ACCOUNT_SANDBOX',
        `${method} ${path} ne doit pas confiner un compte ordinaire`);
    }
  } finally {
    await close();
  }
});

test('le profil de révision garde de quoi tenir sa session', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/auth/session`, {
      headers: { Authorization: `Bearer ${jetonRevision}` }
    });
    assert.equal(res.status, 200, 'relire sa session doit rester possible');
    const corps = await res.json() as { user?: { name?: string } };
    assert.equal(corps.user?.name, 'Révision boutique');

    const sortie = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jetonRevision}` }
    });
    assert.equal(sortie.status, 204, 'fermer sa session doit rester possible');
  } finally {
    await close();
  }
});

test('sans jeton de révision, rien ne change pour l’annuaire public', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/auth/directory`);
    assert.notEqual(res.status, 403, 'l’écran de connexion doit rester accessible');
  } finally {
    await close();
  }
});
