import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  COMPANY_DATA_PREFIXES, REVIEW_ACCOUNT_ALLOWED, isCompanyDataPath, reviewAccountMayCall
} from '../reviewAccount';

process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
const auth = await import('../auth.ts');

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Ce qui doit rester fermé
// ---------------------------------------------------------------------------

test('le profil de révision n’atteint aucune donnée d’entreprise', () => {
  // Ces chemins sont ceux par lesquels l'entreprise sort du serveur. Chacun
  // rendrait visibles à un inconnu les vrais chantiers, les vrais employés ou
  // leurs taux horaires.
  for (const path of [
    '/api/db/punches',
    '/api/db/app_users',
    '/api/db/payroll_entries/42',
    '/api/hydrate',
    '/api/files/project-photo/7',
    '/api/projects/12/children',
    '/api/credentials',
    '/api/chat'
  ]) {
    assert.equal(reviewAccountMayCall(path), false, `${path} doit être refusé`);
  }
});

test('une route de données ajoutée demain est couverte d’office', () => {
  // On raisonne par préfixe justement pour cela : l'oubli jouerait autrement
  // en faveur de la fuite.
  assert.equal(reviewAccountMayCall('/api/db/une_table_inventee'), false);
  assert.equal(reviewAccountMayCall('/api/files/quelque-chose/plus-loin'), false);
});

test('la chaîne de requête ne sert pas de contournement', () => {
  assert.equal(reviewAccountMayCall('/api/db/punches?select=*'), false);
  assert.equal(reviewAccountMayCall('/api/hydrate?force=1'), false);
});

test('la barre oblique finale ne sert pas de contournement', () => {
  assert.equal(reviewAccountMayCall('/api/hydrate/'), false);
  assert.equal(reviewAccountMayCall('/api/db/'), false);
});

// ---------------------------------------------------------------------------
// Ce qui doit rester ouvert
// ---------------------------------------------------------------------------

test('le profil de révision garde de quoi tenir une session', () => {
  // Sans ces routes, l'examinateur ne pourrait ni ouvrir sa session, ni
  // accepter les avis qu'on lui présente : l'application paraîtrait cassée.
  for (const path of REVIEW_ACCOUNT_ALLOWED) {
    assert.equal(reviewAccountMayCall(path), true, `${path} doit rester ouvert`);
  }
  assert.equal(reviewAccountMayCall('/api/auth/login'), true);
  assert.equal(reviewAccountMayCall('/api/bootstrap'), true);
  assert.equal(reviewAccountMayCall('/api/auth/directory'), true);
});

test('un chemin voisin n’est pas confondu avec un préfixe', () => {
  // « /api/dbexport » n'est pas sous « /api/db ». Sans frontière de segment,
  // un préfixe couvrirait des routes qu'il ne désigne pas — et surtout, on
  // croirait couvert un chemin qui ne l'est pas.
  assert.equal(isCompanyDataPath('/api/dbexport'), false);
  assert.equal(isCompanyDataPath('/api/db'), true);
  assert.equal(isCompanyDataPath('/api/db/punches'), true);
});

test('la liste ouverte ne perce jamais le confinement', () => {
  // Garde-fou sur l'avenir : ajouter une route à la liste ouverte alors
  // qu'elle sert des données rouvrirait la porte en silence.
  for (const path of REVIEW_ACCOUNT_ALLOWED) {
    assert.equal(isCompanyDataPath(path), false,
      `${path} est ouvert alors qu'il sert des données`);
  }
});

test('les préfixes couvrent bien les routes de données existantes', () => {
  const routes = read('apiRoutes.ts');
  // Toute route déclarée dans le serveur qui n'est ni publique ni une route de
  // session doit tomber sous un préfixe. Ce test relit le serveur plutôt que
  // de faire confiance à une liste écrite à la main.
  const declared = [...routes.matchAll(/app\.(?:get|post|put|patch|delete)\('(\/api\/[^']+)'/g)]
    .map(match => match[1].replace(/:[^/]+/g, 'x'));
  const publiques = ['/api/auth/login', '/api/auth/logout', '/api/auth/session',
    '/api/auth/directory', '/api/auth/privacy-notice', '/api/ai/status'];
  const oubliees = declared.filter(path => !publiques.includes(path) && !isCompanyDataPath(path));
  assert.deepEqual(oubliees, [], `routes de données hors des préfixes : ${oubliees.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Le confinement voyage dans le jeton signé
// ---------------------------------------------------------------------------

test('le jeton porte le confinement, et le relit à l’identique', () => {
  // Le déduire du client reviendrait à le laisser décider s'il doit être
  // confiné; le relire en base coûterait une requête par requête.
  const { token } = auth.signSession({
    userId: 'u1', companyId: 'c1', role: 'admin', name: 'Révision', isReviewAccount: true
  });
  assert.equal(auth.verifySession(token)?.isReviewAccount, true);
});

test('un compte ordinaire n’est jamais confiné par accident', () => {
  const { token } = auth.signSession({ userId: 'u2', companyId: 'c1', role: 'admin', name: 'Patrick' });
  assert.equal(auth.verifySession(token)?.isReviewAccount, false);
});

test('le confinement ne se retire pas en bricolant le jeton', () => {
  const { token } = auth.signSession({
    userId: 'u1', companyId: 'c1', role: 'admin', name: 'Révision', isReviewAccount: true
  });
  const [header, payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  delete decoded.rev;
  const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
  assert.equal(auth.verifySession(`${header}.${forged}.${signature}`), null,
    'un jeton dont on a retiré le confinement ne doit plus valider');
});

// ---------------------------------------------------------------------------
// Le garde est réellement branché
// ---------------------------------------------------------------------------
const routes = read('apiRoutes.ts');

test('le garde lit la session lui-même', () => {
  // Sinon il dépendrait de l'ordre des intergiciels et d'une route qui exige
  // ou non une session — deux choses qui changent sans qu'on y pense.
  assert.match(routes, /const auth = req\.auth \|\| extractAuth\(req\)/);
  assert.match(routes, /if \(!auth\?\.isReviewAccount\) return next\(\)/);
});

test('le garde précède toute route de données', () => {
  const garde = routes.indexOf('reviewAccountMayCall(req.path)');
  assert.ok(garde > 0, 'le garde doit exister');
  for (const route of ["app.post('/api/credentials'", "app.get('/api/hydrate'",
                       "app.get('/api/db/:table'", "app.post('/api/chat'"]) {
    assert.ok(routes.indexOf(route) > garde, `${route} doit être déclarée après le garde`);
  }
});

test('un refus laisse une trace d’audit', () => {
  assert.match(routes, /logAudit\(auth, 'review_account_blocked'/);
});

test('la connexion annonce le confinement au client', () => {
  assert.match(routes, /isReviewAccount: ctx\.isReviewAccount === true/);
});

test('le confinement est lu en base à la connexion', () => {
  const authSource = read('auth.ts');
  assert.match(authSource, /is_review_account/,
    'verifyCredentials doit lire la colonne');
  assert.match(authSource, /isReviewAccount: \(user as \{ is_review_account\?: boolean \}\)\.is_review_account === true/);
});

// ---------------------------------------------------------------------------
// Côté client : une application qui fonctionne, sans l'entreprise
// ---------------------------------------------------------------------------

test('la connexion d’un profil de révision ouvre le jeu fictif', () => {
  const store = read('src/store.ts');
  const depart = store.indexOf('if (server.user.isReviewAccount)');
  assert.ok(depart > 0, 'la connexion doit distinguer le profil de révision');

  const separateur = store.indexOf('} else {', depart);
  assert.ok(separateur > depart, 'les deux chemins doivent être séparés');
  const brancheRevision = store.slice(depart, separateur);

  assert.match(brancheRevision, /activateDemoSandbox\(\)/,
    'le profil de révision doit basculer sur le jeu fictif');
  assert.doesNotMatch(brancheRevision, /hydrateCloud\(\)/,
    'un profil de révision ne doit jamais charger l’entreprise');
  // Coupé avant la construction du jeu fictif, qui est asynchrone : sinon la
  // synchronisation lancée au montage part pendant ce temps.
  assert.match(brancheRevision, /setDemoSandboxIsolation\(true\)/,
    'la coupure doit précéder la construction du jeu fictif');
});

test('le mode démo s’ouvre au profil de révision quel que soit son rôle', () => {
  // Un compte de révision créé avec un autre rôle ouvrirait sinon une
  // application vide, et la soumission serait refusée sans explication.
  const store = read('src/store.ts');
  assert.match(store, /state\.activeEmployee\.isReviewAccount === true/);
});

// ---------------------------------------------------------------------------
// La base
// ---------------------------------------------------------------------------
const migration = read('supabase/migrations/20260910090000_add_review_account.sql');

test('la colonne est additive : les comptes existants ne bougent pas', () => {
  assert.match(migration, /add column if not exists is_review_account boolean not null default false/);
});

test('la base refuse un profil de révision qui expire', () => {
  // C'est l'erreur qui coûterait le plus cher : la révision échouerait le jour
  // où l'échéance tombe, sans que personne ne fasse le lien.
  assert.match(migration, /check \(not is_review_account or access_expires_at is null\)/);
});

test('un seul profil de révision par entreprise', () => {
  assert.match(migration, /create unique index if not exists app_users_single_review_account_idx/);
  assert.match(migration, /where is_review_account/);
});
