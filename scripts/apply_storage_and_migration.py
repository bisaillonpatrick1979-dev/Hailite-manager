from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# TYPES — choix explicite et configuration du fichier personnel.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'types.ts'
text = path.read_text(encoding='utf-8')
text = text.replace(
    "  dataStorageMode?: 'local' | 'hybrid' | 'cloud';",
    "  dataStorageMode?: 'local' | 'supabase' | 'personal_cloud' | 'hybrid' | 'cloud';"
)
if 'personalCloudProvider?:' not in text:
    anchor = "  cloudRegion?: string;\n"
    addition = anchor + """  personalCloudProvider?: 'google_drive' | 'onedrive' | 'dropbox' | 'icloud_drive' | 'samsung_cloud' | 'device_folder' | 'other';
  backupFolderName?: string;
  backupFileName?: string;
  backupConnectionMethod?: 'directory_handle' | 'file_handle' | 'system_export';
  personalBackupConnected?: boolean;
  personalBackupAutomatic?: boolean;
  lastPersonalBackupAt?: string;
"""
    text = replace_once(text, anchor, addition, 'champs cloud personnel')
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# API CLIENT — seul Supabase active l’API cloud de l’application.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')
text = text.replace(
    "return company?.dataStorageMode !== 'local';",
    "return ['supabase', 'hybrid', 'cloud'].includes(company?.dataStorageMode);"
)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# STORE — chaque mutation locale planifie aussi la sauvegarde fichier.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')
if "from './personalBackup'" not in text:
    text = replace_once(
        text,
        "import { create } from 'zustand';\n",
        "import { create } from 'zustand';\nimport { scheduleConfiguredBackup } from './personalBackup';\n",
        'import sauvegarde personnelle'
    )
old_save = """const saveState = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Failed to save state to localStorage', err);
  }
};
"""
new_save = """const saveState = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // Les écritures restent immédiatement locales. Lorsque le propriétaire a
    // autorisé un fichier personnel, une sauvegarde différée regroupe les
    // changements sans ralentir chaque bouton de l’application.
    scheduleConfiguredBackup();
  } catch (err) {
    console.error('Failed to save state to localStorage', err);
  }
};
"""
if old_save in text:
    text = text.replace(old_save, new_save, 1)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# ONBOARDING — stockage en étape 4, migration facultative en étape 5.
# Le script de correction du scroll est exécuté avant celui-ci.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'components' / 'OnboardingScreen.tsx'
text = path.read_text(encoding='utf-8')

if "./StorageDestinationSetup" not in text:
    text = replace_once(
        text,
        "import CompanyLogo from './CompanyLogo';\n",
        "import CompanyLogo from './CompanyLogo';\nimport StorageDestinationSetup from './StorageDestinationSetup';\nimport LegacyDataImporter from './LegacyDataImporter';\nimport { savePersonalBackupConfig, type AppStorageMode, type BackupConnectionMethod, type PersonalCloudProvider } from '../personalBackup';\n",
        'imports stockage et migration'
    )

text = text.replace("type StorageMode = 'local' | 'hybrid' | 'cloud';\n\n", '')

old_state = "  const [storageMode, setStorageMode] = useState<StorageMode>(companyInfo.dataStorageMode || 'hybrid');\n"
new_state = """  const initialStorageMode: AppStorageMode = companyInfo.dataStorageMode === 'local'
    ? 'local'
    : companyInfo.dataStorageMode === 'personal_cloud'
      ? 'personal_cloud'
      : 'supabase';
  const [storageMode, setStorageMode] = useState<AppStorageMode>(initialStorageMode);
  const [personalCloudProvider, setPersonalCloudProvider] = useState<PersonalCloudProvider>(companyInfo.personalCloudProvider || 'google_drive');
  const [backupFolderName, setBackupFolderName] = useState(companyInfo.backupFolderName || 'Hailite Manager');
  const [backupFileName, setBackupFileName] = useState(companyInfo.backupFileName || 'hailite-manager-backup.json');
  const [backupConnectionMethod, setBackupConnectionMethod] = useState<BackupConnectionMethod | undefined>(companyInfo.backupConnectionMethod);
  const [storageSetupReady, setStorageSetupReady] = useState(initialStorageMode === 'supabase' || Boolean(companyInfo.personalBackupConnected));
  const [migrationImportedCount, setMigrationImportedCount] = useState(0);
"""
text = replace_once(text, old_state, new_state, 'états destination stockage')

text = text.replace(
    "    if (step === 4) return privacyAccepted && employeeBasisConfirmed && locationNoticeConfirmed && (!needsCrossBorderAcknowledgement || crossBorderAccepted);\n",
    "    if (step === 4) return storageSetupReady && privacyAccepted && employeeBasisConfirmed && locationNoticeConfirmed && (!needsCrossBorderAcknowledgement || crossBorderAccepted);\n"
)

text = text.replace(
    "    const cloudAllowed = storageMode !== 'local';\n    setCloudSyncAllowed(cloudAllowed);\n",
    """    const cloudAllowed = storageMode === 'supabase';
    setCloudSyncAllowed(cloudAllowed);
    savePersonalBackupConfig({
      mode: storageMode,
      provider: personalCloudProvider,
      folderName: backupFolderName.trim() || 'Hailite Manager',
      fileName: backupFileName,
      connectionMethod: backupConnectionMethod,
      connected: storageMode !== 'supabase' && storageSetupReady,
      automatic: storageMode !== 'supabase' && storageSetupReady && backupConnectionMethod !== 'system_export'
    });
"""
)

text = text.replace(
    "      cloudRegion: CLOUD_REGION,\n",
    """      cloudRegion: storageMode === 'supabase' ? CLOUD_REGION : undefined,
      personalCloudProvider,
      backupFolderName: backupFolderName.trim() || 'Hailite Manager',
      backupFileName,
      backupConnectionMethod,
      personalBackupConnected: storageMode !== 'supabase' && storageSetupReady,
      personalBackupAutomatic: storageMode !== 'supabase' && storageSetupReady && backupConnectionMethod !== 'system_export',
"""
)

start = text.find("  const storageOptions:")
if start != -1:
    end = text.find("\n\n  return (", start)
    if end == -1:
        raise RuntimeError('fin storageOptions introuvable')
    replacement = """  const storageModeLabel = storageMode === 'local'
    ? (isFR ? 'Appareil local + fichier de sauvegarde' : 'Local device + backup file')
    : storageMode === 'personal_cloud'
      ? (isFR ? 'Cloud personnel' : 'Personal cloud')
      : 'Supabase';
"""
    text = text[:start] + replacement + text[end:]

old_storage_ui = """            <div className=\"grid sm:grid-cols-3 gap-3\">{storageOptions.map(option => <button key={option.id} type=\"button\" onClick={() => setStorageMode(option.id)} className={`rounded-2xl border p-4 text-left min-h-36 ${storageMode === option.id ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700 bg-slate-900'}`}><span className=\"text-3xl\">{option.icon}</span><p className=\"font-black text-lg mt-2\">{isFR ? option.fr : option.en}</p><p className=\"text-xs text-slate-400 mt-1\">{isFR ? option.descFR : option.descEN}</p></button>)}</div>
            {storageMode !== 'local' && <div className=\"rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4\"><p className=\"font-black text-blue-300\">☁️ Supabase · Canada Central · {CLOUD_REGION}</p><p className=\"text-sm text-slate-300 mt-1\">{isFR ? 'Les données peuvent inclure employés, clients, chantiers, GPS au pointage, paie, factures, signatures, cartes de compétence, photos et pièces jointes.' : 'Data may include employees, clients, jobs, punch-time GPS, payroll, invoices, signatures, competency cards, photos, and attachments.'}</p></div>}
"""
new_storage_ui = """            <StorageDestinationSetup
              isFR={isFR}
              mode={storageMode}
              onModeChange={setStorageMode}
              provider={personalCloudProvider}
              onProviderChange={setPersonalCloudProvider}
              folderName={backupFolderName}
              onFolderNameChange={setBackupFolderName}
              fileName={backupFileName}
              onFileNameChange={setBackupFileName}
              setupReady={storageSetupReady}
              onSetupReadyChange={setStorageSetupReady}
              connectionMethod={backupConnectionMethod}
              onConnectionMethodChange={setBackupConnectionMethod}
              cloudRegion={CLOUD_REGION}
            />
"""
text = replace_once(text, old_storage_ui, new_storage_ui, 'interface destination stockage')

old_step5_start = "          {step === 5 && <div className=\"space-y-6\">\n            <div><h2 className=\"text-2xl font-black flex items-center gap-3\"><Palette"
new_step5_start = """          {step === 5 && <div className=\"space-y-6\">
            <div><h2 className=\"text-2xl font-black flex items-center gap-3\"><Database className=\"h-7 w-7 text-cyan-300\" />{isFR ? 'Importer les données existantes' : 'Import existing data'}</h2><p className=\"mt-2 text-slate-300\">{isFR ? 'Cette étape est facultative. Elle permet de commencer avec votre année fiscale, vos contrats et vos chantiers déjà en cours.' : 'This optional step lets you begin with your existing fiscal year, contracts, and active projects.'}</p></div>
            <LegacyDataImporter isFR={isFR} onImported={setMigrationImportedCount} />
          </div>}

          {step === 6 && <div className=\"space-y-6\">
            <div><h2 className=\"text-2xl font-black flex items-center gap-3\"><Palette"""
text = replace_once(text, old_step5_start, new_step5_start, 'nouvelle étape migration')

text = text.replace(
    "{[1, 2, 3, 4, 5].map(number =>",
    "{[1, 2, 3, 4, 5, 6].map(number =>"
)
text = text.replace(
    "<dd className=\"font-bold text-lg\">{storageOptions.find(option => option.id === storageMode)?.[isFR ? 'fr' : 'en']}</dd>",
    "<dd className=\"font-bold text-lg\">{storageModeLabel}</dd>"
)
text = text.replace(
    "<dd className=\"font-bold text-lg\">{storageMode === 'local' ? (isFR ? 'Aucun' : 'None') : `Canada Central (${CLOUD_REGION})`}</dd>",
    "<dd className=\"font-bold text-lg\">{storageMode === 'supabase' ? `Canada Central (${CLOUD_REGION})` : storageMode === 'personal_cloud' ? personalCloudProvider : (isFR ? 'Fichier choisi sur l’appareil' : 'Device-selected file')}</dd>"
)
summary_anchor = "</div></dl></div>"
summary_extra = """<div><dt className=\"text-slate-400\">{isFR ? 'Fichier de sauvegarde' : 'Backup file'}</dt><dd className=\"font-bold text-lg break-all\">{storageMode === 'supabase' ? (isFR ? 'Géré par Supabase' : 'Managed by Supabase') : backupFileName}</dd></div><div><dt className=\"text-slate-400\">{isFR ? 'Données migrées' : 'Migrated data'}</dt><dd className=\"font-bold text-lg\">{migrationImportedCount}</dd></div></dl></div>"""
if summary_extra not in text:
    text = replace_once(text, summary_anchor, summary_extra, 'résumé stockage et migration')

text = text.replace(
    "{step < 5 ? <button type=\"button\" disabled={!canContinue} onClick={() => setStep(value => Math.min(5, value + 1))}",
    "{step < 6 ? <button type=\"button\" disabled={!canContinue} onClick={() => setStep(value => Math.min(6, value + 1))}"
)

path.write_text(text, encoding='utf-8')
print('Choix appareil, Supabase, cloud personnel et migration intégrés à l’onboarding.')
