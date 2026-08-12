import assert from 'node:assert/strict';
import { test } from 'node:test';

// La politique de stockage lit le mode dans localStorage. On lui en fournit un
// en mémoire pour éprouver les deux modes dans le même processus.
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  keys() { return Array.from(this.map.keys()); }
}

const storage = new MemoryStorage();
(globalThis as any).localStorage = storage;

const {
  browserStorageValue, purgeLegacySensitiveStorage,
  readStoragePersistence, stripNeverStoredFields
} = await import('../src/securityStorage');

function setMode(mode: string | null) {
  storage.clear();
  if (mode) storage.setItem('gcp_companyInfo', JSON.stringify({ name: 'Hailite', dataStorageMode: mode }));
}

// ---------------------------------------------------------------------------
// Quel mode est en vigueur
// ---------------------------------------------------------------------------

test('le nuage personnel et le mode local sont des modes hors serveur', () => {
  setMode('local');
  assert.equal(readStoragePersistence(), 'offline');
  setMode('personal_cloud');
  assert.equal(readStoragePersistence(), 'offline');
});

test('devant l’inconnu, on répond « serveur » — le choix le plus restrictif', () => {
  setMode('supabase');
  assert.equal(readStoragePersistence(), 'server');
  setMode(null);
  assert.equal(readStoragePersistence(), 'server', 'première ouverture');
  setMode('n’importe quoi');
  assert.equal(readStoragePersistence(), 'server');
  storage.clear();
  storage.setItem('gcp_companyInfo', 'ceci n’est pas du JSON');
  assert.equal(readStoragePersistence(), 'server', 'préférence abîmée');
});

// ---------------------------------------------------------------------------
// Ce qui a le droit d'être écrit
// ---------------------------------------------------------------------------

test('en mode serveur, les données d’affaires restent refusées', () => {
  setMode('supabase');
  for (const key of ['gcp_employees', 'gcp_projects', 'gcp_punchSessions', 'gcp_documents']) {
    assert.equal(browserStorageValue(key, [{ id: 'x' }]).allowed, false, key);
  }
  assert.equal(browserStorageValue('gcp_currentLanguage', 'FR').allowed, true);
});

test('hors serveur, les données d’affaires sont conservées : l’appareil EST la base', () => {
  setMode('personal_cloud');
  for (const key of ['gcp_employees', 'gcp_projects', 'gcp_punchSessions', 'gcp_documents']) {
    assert.equal(browserStorageValue(key, [{ id: 'x' }]).allowed, true, key);
  }
});

test('le NIP en clair n’est écrit dans aucun mode', () => {
  setMode('personal_cloud');
  const verdict = browserStorageValue('gcp_employees', [
    { id: 'e1', name: 'Léa', nip: '4821', accessCodeHash: 'pbkdf2-sha256$210000$sel$empreinte' }
  ]);
  const employees = verdict.value as Array<Record<string, unknown>>;
  assert.equal(employees[0].nip, '');
  assert.equal(employees[0].accessCodeHash, 'pbkdf2-sha256$210000$sel$empreinte',
    'l’empreinte, elle, doit rester : sans elle personne ne peut plus se connecter');
});

test('les jetons de session ne sont écrits dans aucun mode', () => {
  for (const mode of ['supabase', 'personal_cloud', 'local']) {
    setMode(mode);
    for (const key of ['gcp_authToken', 'gcp_auth_token', 'gcp_ai_token', 'gcp_activeEmployee']) {
      assert.equal(browserStorageValue(key, 'jeton').allowed, false, `${key} en mode ${mode}`);
    }
  }
});

test('une clé étrangère à l’application est refusée même hors serveur', () => {
  setMode('local');
  assert.equal(browserStorageValue('autre_chose', 'valeur').allowed, false);
});

test('le tout premier enregistrement de la fiche de compagnie n’est pas tronqué', () => {
  // À cet instant, rien n'est encore persisté : le mode doit être lu dans la
  // valeur qu'on écrit, sinon le client qui vient de choisir son nuage perdrait
  // ses coordonnées bancaires au premier enregistrement.
  storage.clear();
  const verdict = browserStorageValue('gcp_companyInfo', {
    name: 'Hailite', dataStorageMode: 'personal_cloud', bankAccount: '12345'
  });
  assert.equal((verdict.value as any).bankAccount, '12345');

  storage.clear();
  const serveur = browserStorageValue('gcp_companyInfo', {
    name: 'Hailite', dataStorageMode: 'supabase', bankAccount: '12345'
  });
  assert.equal((serveur.value as any).bankAccount, undefined, 'en mode serveur, la banque reste au serveur');
});

// ---------------------------------------------------------------------------
// La purge au démarrage
// ---------------------------------------------------------------------------

test('en mode serveur, la purge efface toujours les données d’affaires', () => {
  setMode('supabase');
  storage.setItem('gcp_employees', JSON.stringify([{ id: 'e1' }]));
  storage.setItem('gcp_projects', JSON.stringify([{ id: 'c1' }]));
  storage.setItem('gcp_currentLanguage', JSON.stringify('FR'));
  purgeLegacySensitiveStorage(false);
  assert.equal(storage.getItem('gcp_employees'), null);
  assert.equal(storage.getItem('gcp_projects'), null);
  assert.equal(storage.getItem('gcp_currentLanguage'), JSON.stringify('FR'));
});

test('hors serveur, la purge ne détruit plus l’entreprise du client', () => {
  setMode('personal_cloud');
  storage.setItem('gcp_employees', JSON.stringify([{ id: 'e1', name: 'Léa', nip: '4821' }]));
  storage.setItem('gcp_projects', JSON.stringify([{ id: 'c1', name: '335 Grégoire' }]));
  storage.setItem('gcp_authToken', JSON.stringify('jeton'));

  purgeLegacySensitiveStorage(false);

  assert.equal(JSON.parse(storage.getItem('gcp_projects')!)[0].name, '335 Grégoire');
  assert.equal(JSON.parse(storage.getItem('gcp_employees')!)[0].nip, '',
    'un NIP qui traînait est vidé au passage');
  assert.equal(storage.getItem('gcp_authToken'), null, 'le jeton part toujours');
});

test('la purge ne change pas d’avis en cours de route', () => {
  // Le mode est porté par gcp_companyInfo. Si la purge le relisait après
  // l'avoir modifié, elle pourrait basculer en mode serveur au milieu du
  // parcours et effacer ce qu'elle venait de décider de garder.
  setMode('local');
  storage.setItem('gcp_employees', JSON.stringify([{ id: 'e1' }]));
  storage.setItem('gcp_projects', JSON.stringify([{ id: 'c1' }]));
  storage.setItem('gcp_documents', JSON.stringify([{ id: 'd1' }]));
  purgeLegacySensitiveStorage(false);
  assert.deepEqual(
    storage.keys().sort(),
    ['gcp_companyInfo', 'gcp_documents', 'gcp_employees', 'gcp_projects']
  );
});

test('le profil de test local n’est pas touché par la politique', () => {
  setMode('supabase');
  assert.equal(browserStorageValue('gcp_employees', [{ id: 'e1', nip: '1234' }], true).allowed, true);
});

test('le retrait de champs ne touche que les ensembles concernés', () => {
  const projects = [{ id: 'c1', name: 'Chantier' }];
  assert.equal(stripNeverStoredFields('gcp_projects', projects), projects);
  assert.equal(stripNeverStoredFields('gcp_employees', 'pas un tableau'), 'pas un tableau');
});
