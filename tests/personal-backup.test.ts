import assert from 'node:assert/strict';
import { test } from 'node:test';

// Le module lit localStorage au chargement. On installe un stockage en mémoire
// avant de l'importer, pour éprouver l'aller-retour complet sans navigateur.
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
(globalThis as any).window = { localStorage: storage };

const {
  buildApplicationBackup, decideRestoreScope, importApplicationBackup,
  registerBackupSnapshotProvider, restorableEntries, sanitizeRestoredValue
} = await import('../src/personalBackup');

function seedBusiness() {
  storage.clear();
  storage.setItem('gcp_personalBackupConfig', JSON.stringify({
    mode: 'personal_cloud', provider: 'google_drive', folderName: 'Hailite',
    fileName: 'sauvegarde.json', connected: true, automatic: true
  }));
  storage.setItem('gcp_employees', JSON.stringify([
    { id: 'e1', name: 'Léa Tremblay', nip: '', workerType: 'contractor', hourlyRate: 42 }
  ]));
  storage.setItem('gcp_projects', JSON.stringify([{ id: 'c1', name: '335 Grégoire' }]));
  storage.setItem('gcp_punchSessions', JSON.stringify([{ id: 'p1', employeeId: 'e1', revenue: 336 }]));
  storage.setItem('gcp_documents', JSON.stringify([{ id: 'd1', number: 'FAC-0001', total: 352.8 }]));
  storage.setItem('gcp_currentLanguage', JSON.stringify('FR'));
  storage.setItem('gcp_authToken', JSON.stringify('jeton-de-session'));
}

const asFile = (payload: unknown) => ({
  size: 1000,
  text: async () => JSON.stringify(payload)
}) as unknown as File;

// ---------------------------------------------------------------------------
// Ce que le fichier contient réellement
// ---------------------------------------------------------------------------
// En fonctionnement réel, les données d'affaires ne sont JAMAIS dans le
// stockage du navigateur : securityStorage les refuse et une purge les efface
// au démarrage. Les cas suivants reproduisent cette situation — un stockage qui
// ne contient que des préférences — pour vérifier que le fichier déposé sur le
// nuage du client contient malgré tout son entreprise.

function seedPreferencesOnly() {
  storage.clear();
  storage.setItem('gcp_personalBackupConfig', JSON.stringify({
    mode: 'personal_cloud', provider: 'google_drive', folderName: 'Hailite',
    fileName: 'sauvegarde.json', connected: true, automatic: true
  }));
  storage.setItem('gcp_currentLanguage', JSON.stringify('FR'));
  storage.setItem('gcp_currentTheme', JSON.stringify('quantum'));
}

test('la sauvegarde contient l’entreprise même quand le navigateur ne garde que les préférences', () => {
  seedPreferencesOnly();
  registerBackupSnapshotProvider(() => ({
    gcp_employees: [{ id: 'e1', name: 'Léa Tremblay', nip: '4821', hourlyRate: 42 }],
    gcp_projects: [{ id: 'c1', name: '335 Grégoire' }],
    gcp_punchSessions: [{ id: 'p1', employeeId: 'e1', revenue: 336 }],
    gcp_documents: [{ id: 'd1', number: 'FAC-0001', total: 352.8 }]
  }));

  const data = buildApplicationBackup().data as Record<string, any>;
  registerBackupSnapshotProvider(null);

  assert.equal(data.gcp_projects[0].name, '335 Grégoire');
  assert.equal(data.gcp_punchSessions[0].revenue, 336);
  assert.equal(data.gcp_documents[0].number, 'FAC-0001');
  assert.equal(data.gcp_currentLanguage, 'FR', 'les préférences restent du stockage local');
});

test('le NIP est vidé avant de partir chez un hébergeur tiers', () => {
  seedPreferencesOnly();
  registerBackupSnapshotProvider(() => ({
    gcp_employees: [{ id: 'e1', name: 'Léa Tremblay', nip: '4821', hourlyRate: 42 }]
  }));

  const data = buildApplicationBackup().data as Record<string, any>;
  registerBackupSnapshotProvider(null);

  assert.equal(data.gcp_employees[0].nip, '', 'un code d’accès ne quitte jamais l’appareil');
  assert.equal(data.gcp_employees[0].hourlyRate, 42, 'le reste de la fiche part bien');
});

test('la destination de sauvegarde et les jetons ne partent pas, même fournis par le magasin', () => {
  seedPreferencesOnly();
  registerBackupSnapshotProvider(() => ({
    gcp_authToken: 'jeton',
    gcp_personalBackupConfig: { mode: 'local' },
    gcp_projects: [{ id: 'c1' }]
  }));

  const data = buildApplicationBackup().data as Record<string, any>;
  registerBackupSnapshotProvider(null);

  assert.equal(data.gcp_authToken, undefined);
  assert.equal(data.gcp_personalBackupConfig, undefined);
  assert.equal(data.gcp_projects.length, 1);
});

// ---------------------------------------------------------------------------
// La promesse : ce qui sort doit pouvoir revenir
// ---------------------------------------------------------------------------

test('un aller-retour complet rend l’entreprise, pas seulement les préférences', async () => {
  seedBusiness();
  const backup = buildApplicationBackup();

  // Téléphone perdu : l'appareil est vierge, donc en mode « local » par défaut.
  storage.clear();
  const result = await importApplicationBackup(asFile(backup));

  assert.equal(result.ok, true);
  assert.equal(result.scope, 'full');
  assert.deepEqual(JSON.parse(storage.getItem('gcp_employees')!), [
    { id: 'e1', name: 'Léa Tremblay', nip: '', workerType: 'contractor', hourlyRate: 42 }
  ]);
  assert.equal(JSON.parse(storage.getItem('gcp_projects')!)[0].name, '335 Grégoire');
  assert.equal(JSON.parse(storage.getItem('gcp_punchSessions')!)[0].revenue, 336);
  assert.equal(JSON.parse(storage.getItem('gcp_documents')!)[0].number, 'FAC-0001');
  assert.equal(JSON.parse(storage.getItem('gcp_currentLanguage')!), 'FR');
});

test('le jeton de session ne part pas dans la sauvegarde et ne revient jamais', async () => {
  seedBusiness();
  const backup = buildApplicationBackup();
  assert.equal((backup.data as Record<string, unknown>).gcp_authToken, undefined,
    'un jeton ne doit pas être écrit dans un fichier déposé sur un nuage');

  // Même trafiqué à la main, il ne doit pas être réinjecté.
  (backup.data as Record<string, unknown>).gcp_authToken = 'jeton-injecté';
  storage.clear();
  await importApplicationBackup(asFile(backup));
  assert.equal(storage.getItem('gcp_authToken'), null);
});

test('la destination de sauvegarde de l’appareil n’est jamais écrasée par un fichier', async () => {
  seedBusiness();
  const backup = buildApplicationBackup();
  storage.clear();
  storage.setItem('gcp_personalBackupConfig', JSON.stringify({
    mode: 'local', provider: 'device_folder', folderName: 'Ici', fileName: 'ici.json',
    connected: false, automatic: false
  }));
  await importApplicationBackup(asFile(backup));
  assert.equal(JSON.parse(storage.getItem('gcp_personalBackupConfig')!).folderName, 'Ici');
});

// ---------------------------------------------------------------------------
// Jusqu'où va la restauration
// ---------------------------------------------------------------------------

test('hors serveur des deux côtés, la restauration est complète', () => {
  assert.equal(decideRestoreScope('local', 'local'), 'full');
  assert.equal(decideRestoreScope('personal_cloud', 'local'), 'full');
  assert.equal(decideRestoreScope('local', 'personal_cloud'), 'full');
  assert.equal(decideRestoreScope('personal_cloud', 'personal_cloud'), 'full');
});

test('dès qu’un serveur est en jeu, on ne réinjecte que les préférences', () => {
  // Le serveur fait autorité : réinjecter localement créerait une copie
  // fantôme qui diverge en silence.
  assert.equal(decideRestoreScope('supabase', 'local'), 'preferences_only');
  assert.equal(decideRestoreScope('local', 'supabase'), 'preferences_only');
  assert.equal(decideRestoreScope('supabase', 'supabase'), 'preferences_only');
});

test('un mode inconnu ou absent est traité comme un serveur, jamais l’inverse', () => {
  // Devant l'incertitude, on refuse d'écraser des données plutôt que de risquer
  // de le faire à tort.
  assert.equal(decideRestoreScope(undefined, 'local'), 'preferences_only');
  assert.equal(decideRestoreScope('n’importe quoi', 'local'), 'preferences_only');
});

test('une sauvegarde de serveur restaurée sur un appareil local ne touche pas aux données', async () => {
  seedBusiness();
  const backup = buildApplicationBackup();
  (backup.storage as Record<string, unknown>).mode = 'supabase';

  storage.clear();
  storage.setItem('gcp_projects', JSON.stringify([{ id: 'existant', name: 'À ne pas écraser' }]));
  const result = await importApplicationBackup(asFile(backup));

  assert.equal(result.scope, 'preferences_only');
  assert.equal(JSON.parse(storage.getItem('gcp_projects')!)[0].name, 'À ne pas écraser');
  assert.match(result.message, /reconnectez-vous/);
});

// ---------------------------------------------------------------------------
// Garde-fous
// ---------------------------------------------------------------------------

test('un NIP glissé dans un fichier est vidé à la restauration', () => {
  const cleaned = sanitizeRestoredValue('gcp_employees', [
    { id: 'e1', name: 'Léa', nip: '4821' },
    { id: 'e2', name: 'Marc', nip: '0000' }
  ]) as Array<Record<string, unknown>>;
  assert.equal(cleaned[0].nip, '');
  assert.equal(cleaned[1].nip, '');
  assert.equal(cleaned[0].name, 'Léa', 'le reste de la fiche est intact');
});

test('les autres ensembles ne sont pas altérés', () => {
  const projects = [{ id: 'c1', name: 'Chantier' }];
  assert.equal(sanitizeRestoredValue('gcp_projects', projects), projects);
  assert.equal(sanitizeRestoredValue('gcp_employees', 'pas un tableau'), 'pas un tableau');
});

test('une clé étrangère au format de l’application est ignorée', () => {
  const entries = restorableEntries({
    gcp_projects: [1],
    autre_chose: 'ignoré',
    '__proto__': 'malveillant'
  } as Record<string, unknown>, 'full');
  assert.deepEqual(entries.map(([key]) => key), ['gcp_projects']);
});

test('un fichier qui n’est pas une sauvegarde est refusé sans rien toucher', async () => {
  seedBusiness();
  const avant = storage.getItem('gcp_projects');
  const result = await importApplicationBackup(asFile({ format: 'autre-chose', data: { gcp_projects: [] } }));
  assert.equal(result.ok, false);
  assert.equal(storage.getItem('gcp_projects'), avant);
});

test('un fichier trop lourd est refusé avant même d’être lu', async () => {
  const result = await importApplicationBackup({
    size: 31 * 1024 * 1024,
    text: async () => { throw new Error('ne doit pas être lu'); }
  } as unknown as File);
  assert.equal(result.ok, false);
  assert.match(result.message, /30 Mo/);
});
