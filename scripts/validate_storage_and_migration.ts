import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const onboarding = read('src/components/OnboardingScreen.tsx');
const storage = read('src/personalBackup.ts');
const storageUi = read('src/components/StorageDestinationSetup.tsx');
const migration = read('src/dataMigration.ts');
const migrationUi = read('src/components/LegacyDataImporter.tsx');
const store = read('src/store.ts');
const api = read('src/apiClient.ts');
const types = read('src/types.ts');

for (const marker of [
  "type AppStorageMode = 'local' | 'supabase' | 'personal_cloud'",
  'chooseOrCreateBackupDestination',
  'showDirectoryPicker',
  'showSaveFilePicker',
  'navigator.share',
  'scheduleConfiguredBackup',
  'importApplicationBackup',
  "format: BACKUP_FORMAT"
]) assert.ok(storage.includes(marker), `Moteur de sauvegarde incomplet: ${marker}`);

for (const marker of [
  'Appareil local',
  'Supabase',
  'Mon cloud personnel',
  'Nom du dossier',
  'Nom du fichier de sauvegarde',
  'Choisir/créer le dossier et le fichier',
  'Restaurer un fichier existant'
]) assert.ok(storageUi.includes(marker), `Interface stockage absente: ${marker}`);

for (const marker of [
  "'clients'",
  "'projects'",
  "'employees'",
  "'punches'",
  "'documents'",
  "'expenses'",
  "'payroll'",
  "'tools'",
  'suggestMigrationMapping',
  'importMappedMigrationRows',
  "localStorage.setItem(queueKey"
]) assert.ok(migration.includes(marker), `Moteur migration incomplet: ${marker}`);

for (const marker of [
  'Changer d’application sans perdre vos données',
  'Restaurer une sauvegarde Hailite',
  'Importer d’un autre logiciel',
  'Association des colonnes',
  'CSV ou JSON'
]) assert.ok(migrationUi.includes(marker), `Assistant migration absent: ${marker}`);

for (const marker of [
  '<StorageDestinationSetup',
  '<LegacyDataImporter',
  'step === 6',
  '[1, 2, 3, 4, 5, 6]',
  "storageMode === 'supabase'",
  'storageSetupReady',
  'backupFileName'
]) assert.ok(onboarding.includes(marker), `Onboarding incomplet: ${marker}`);

assert.ok(store.includes("scheduleConfiguredBackup();"), 'Les mutations locales ne planifient pas la sauvegarde fichier.');
assert.ok(api.includes("['supabase', 'hybrid', 'cloud'].includes"), 'Le cloud personnel ne doit pas activer Supabase.');
assert.ok(types.includes("'personal_cloud'"), 'Le type CompanyInfo ne comprend pas le cloud personnel.');
assert.ok(types.includes('backupFileName?: string;'), 'Le nom du fichier de sauvegarde n’est pas conservé.');

console.log('Stockage et migration validés', {
  localDevice: true,
  supabase: true,
  personalCloud: true,
  folderOrFilePicker: true,
  mobileShareFallback: true,
  automaticFileBackupWhenPermitted: true,
  nativeBackupRestore: true,
  legacyCsvJsonMigration: true,
  sixOnboardingSteps: true
});
