import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routes = read('apiRoutes.ts');

/** Découpe une route pour n'éprouver qu'elle : le fichier en contient des dizaines. */
function routeBody(start: string, end: string): string {
  const from = routes.indexOf(start);
  assert.ok(from > 0, `route introuvable : ${start}`);
  const to = routes.indexOf(end, from);
  assert.ok(to > from, `fin de route introuvable : ${end}`);
  return routes.slice(from, to);
}

// ---------------------------------------------------------------------------
// PUT /api/db/:table — la ligne existante fait foi
// ---------------------------------------------------------------------------
// enforceOwnRow ne regarde que le corps de la requête. Un employé qui
// réutilisait l'identifiant du pointage d'un collègue, en y écrivant son
// propre employee_id, passait le contrôle et écrasait la ligne de l'autre.

const put = routeBody("app.put('/api/db/:table'", "app.patch('/api/db/:table/:id'");

test('le PUT lit la ligne existante en entier', () => {
  // Avec select(idColumn), il était impossible de savoir à qui la ligne
  // appartenait : il n'y avait que l'identifiant dans la réponse.
  assert.match(put, /\.select\('\*'\)\.eq\(idColumn, idValue\)/,
    'la ligne existante doit être lue en entier');
  assert.ok(!/\.select\(idColumn\)\.eq\(idColumn, idValue\)/.test(put),
    'plus de lecture limitée au seul identifiant');
});

test('le PUT compare le propriétaire ENREGISTRÉ, pas celui de la requête', () => {
  assert.match(put, /existing && WRITE_OWN_ONLY\.has\(table\)/,
    'la vérification doit porter sur la ligne existante');
  assert.match(put, /String\(\(existing as any\)\[ownerCol\] \|\| ''\) !== auth\.userId/);
  assert.match(put, /Écriture limitée à vos propres enregistrements/);
});

test('le PUT vérifie le chantier de la ligne existante', () => {
  assert.match(put, /existing && \(existing as any\)\.project_id[\s\S]{0,120}hasProjectAccess/,
    'le chantier vérifié doit être celui de la ligne, pas celui que la requête prétend');
});

test('guardWorkerWrite reçoit la ligne existante, plus jamais null', () => {
  // Certaines règles n'interdisent une valeur que lorsqu'elle CHANGE : sans la
  // ligne de référence, elles ne pouvaient pas s'appliquer.
  assert.match(put, /guardWorkerWrite\(table, payload, \(existing as Record<string, unknown>\) \|\| null\)/);
  assert.ok(!/guardWorkerWrite\(table, payload, null\)/.test(put),
    'l’appel avec null doit avoir disparu');
});

test('le PUT journalise ses refus avec l’identifiant visé', () => {
  // L'audit inscrivait `null` : la trace ne permettait pas de savoir quelle
  // ligne quelqu'un avait tenté d'écraser.
  assert.match(put, /logAudit\(auth, 'write_rejected_value', table, String\(idValue\)/);
  assert.match(put, /logAudit\(auth, 'write_blocked_columns', table, String\(idValue\)/);
});

test('l’ordre tient : on lit avant de décider', () => {
  const lectureAt = put.indexOf("select('*')");
  const gardeAt = put.indexOf('guardWorkerWrite');
  const proprietaireAt = put.indexOf('WRITE_OWN_ONLY.has(table)');
  assert.ok(lectureAt > 0 && gardeAt > lectureAt, 'le garde-fou doit suivre la lecture');
  assert.ok(proprietaireAt > lectureAt, 'la vérification de propriété doit suivre la lecture');
});

// ---------------------------------------------------------------------------
// GET /api/hydrate — trier avant de plafonner, et dire qu'on a coupé
// ---------------------------------------------------------------------------

const hydrate = routeBody("app.get('/api/hydrate'", "app.get('/api/db/:table'");

test('hydrate trie les plus récentes en premier', () => {
  // Sans ORDER BY, Postgres rend les lignes qu'il veut : une entreprise au-delà
  // du plafond pouvait perdre ses pointages récents en silence.
  assert.match(hydrate, /orderNewestFirst\(query, table\)/);
  assert.match(routes, /function orderNewestFirst/);
  assert.match(routes, /\.order\('created_at', \{ ascending: false \}\)/);
});

test('les tables sans created_at sont exclues du tri', () => {
  // Les trier sur une colonne absente ferait échouer la requête en entier.
  for (const table of ['audit_logs', 'auth_login_attempts', 'document_items',
                       'supplier_order_items', 'weekly_goals']) {
    assert.ok(
      new RegExp(`TABLES_WITHOUT_CREATED_AT[\\s\\S]{0,260}'${table}'`).test(routes),
      `${table} doit être exclue du tri`
    );
  }
});

test('hydrate demande une ligne de plus que le plafond', () => {
  // Seule façon de distinguer « exactement le plafond » de « il en manque ».
  assert.match(hydrate, /\.limit\(tableLimit \+ 1\)/);
  assert.match(hydrate, /rows\.slice\(0, tableLimit\)/, 'la ligne témoin ne doit pas être envoyée');
});

test('hydrate signale les tables tronquées', () => {
  assert.match(hydrate, /rows\.length > tableLimit/);
  assert.match(hydrate, /truncatedTables\.push\(table\)/);
  assert.match(hydrate, /console\.warn\(/, 'un dépassement silencieux ne se répare jamais');
  assert.match(hydrate, /results\.truncatedTables = truncatedTables/);
});

test('la liste paginée trie avant de découper la fenêtre', () => {
  // Sans tri, deux pages successives peuvent se chevaucher ou sauter des lignes.
  const liste = routeBody("app.get('/api/db/:table'", "app.get('/api/files/project-photo/:id'");
  assert.match(liste, /orderNewestFirst\(query, table\)\.range\(offset, offset \+ limit - 1\)/);
});

test('le client avertit quand la réponse a été coupée', () => {
  // Une liste incomplète qui a l'air complète mène quelqu'un à facturer d'après
  // des chiffres qui ne sont pas les bons.
  const client = read('src/apiClient.ts');
  assert.match(client, /truncatedTables/);
  assert.match(client, /notifySync\(\{[\s\S]{0,200}status: 'error'/,
    'l’avertissement doit être visible à l’écran, pas seulement en console');
});

// ---------------------------------------------------------------------------
// POST /api/chat — message validé, débit plafonné
// ---------------------------------------------------------------------------

const chat = routeBody("app.post('/api/chat'", "app.post('/api/db/:table'");

test('le corps absent ne fait plus planter la route', () => {
  assert.match(chat, /= req\.body \|\| \{\};/);
});

test('le message est validé avant de partir chez le fournisseur', () => {
  assert.match(chat, /typeof message !== 'string' \|\| message\.trim\(\)\.length === 0/);
  assert.match(chat, /res\.status\(400\)[\s\S]{0,140}MESSAGE_REQUIRED/);
  assert.match(chat, /message\.length > MAX_CHAT_MESSAGE_LENGTH/);
  assert.match(chat, /res\.status\(400\)[\s\S]{0,180}MESSAGE_TOO_LONG/);
  assert.match(routes, /const MAX_CHAT_MESSAGE_LENGTH = 8000;/);
});

test('le débit est plafonné par utilisateur, sinon par adresse', () => {
  assert.match(chat, /req\.auth\?\.userId \|\| req\.ip/);
  assert.match(chat, /chatRateLimited\(rateKey\)/);
  assert.match(chat, /res\.status\(429\)[\s\S]{0,180}RATE_LIMITED/);
  assert.match(routes, /const CHAT_RATE_LIMIT = 20;/);
  assert.match(routes, /const CHAT_RATE_WINDOW_MS = 60_000;/);
});

test('le plafond passe avant la validation', () => {
  // Sinon un flot de requêtes malformées coûterait du travail serveur sans
  // jamais être freiné.
  const plafondAt = chat.indexOf('chatRateLimited(rateKey)');
  const validationAt = chat.indexOf("typeof message !== 'string'");
  assert.ok(plafondAt > 0 && validationAt > plafondAt);
});

test('le compteur de débit ne peut pas enfler sans fin', () => {
  assert.match(routes, /const CHAT_RATE_MAX_KEYS = 5000;/);
  assert.match(routes, /chatRateBuckets\.size > CHAT_RATE_MAX_KEYS/);
  assert.match(routes, /chatRateBuckets\.clear\(\)/);
});

// ---------------------------------------------------------------------------
// Consigne système — plus aucun nom de client codé en dur
// ---------------------------------------------------------------------------

test('l’assistant n’appelle plus chaque client « Hailite Xteriors »', () => {
  // Les commentaires expliquent justement la correction et citent l'ancien
  // nom : c'est le TEXTE envoyé au modèle qu'on éprouve, pas ce qui l'entoure.
  const instruction = routes
    .slice(
      routes.indexOf('function buildSystemInstruction'),
      routes.indexOf('// Outils (function calling)')
    )
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
  assert.ok(!instruction.includes('Hailite Xteriors'),
    'le nom d’un seul client ne doit pas être imposé aux autres');
  assert.ok(!instruction.includes('Gestion Chantier Pro'),
    'ce nom d’application n’existe plus');
  assert.match(instruction, /Hailite Manager/);
  assert.match(instruction, /\$\{business\}/, 'le nom doit venir de la fiche de compagnie');
  assert.match(routes, /async function resolveCompanyName/);
});
