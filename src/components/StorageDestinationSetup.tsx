import React, { useRef, useState } from 'react';
import { Check, Cloud, Database, Download, FileJson, FolderOpen, HardDrive, Import, ShieldCheck } from 'lucide-react';
import {
  chooseOrCreateBackupDestination,
  importApplicationBackup,
  normalizeBackupFileName,
  supportsPersistentFileAccess,
  type AppStorageMode,
  type BackupConnectionMethod,
  type PersonalCloudProvider
} from '../personalBackup';

const PROVIDERS: Array<{ id: PersonalCloudProvider; fr: string; en: string; icon: string }> = [
  { id: 'google_drive', fr: 'Google Drive', en: 'Google Drive', icon: '🔺' },
  { id: 'onedrive', fr: 'Microsoft OneDrive', en: 'Microsoft OneDrive', icon: '☁️' },
  { id: 'dropbox', fr: 'Dropbox', en: 'Dropbox', icon: '📦' },
  { id: 'icloud_drive', fr: 'Apple iCloud Drive', en: 'Apple iCloud Drive', icon: '🍎' },
  { id: 'samsung_cloud', fr: 'Samsung / Mes fichiers', en: 'Samsung / My Files', icon: '📱' },
  { id: 'device_folder', fr: 'Dossier de l’appareil', en: 'Device folder', icon: '📁' },
  { id: 'other', fr: 'Autre cloud ou dossier', en: 'Other cloud or folder', icon: '🌐' }
];

interface StorageDestinationSetupProps {
  isFR: boolean;
  mode: AppStorageMode;
  onModeChange: (mode: AppStorageMode) => void;
  provider: PersonalCloudProvider;
  onProviderChange: (provider: PersonalCloudProvider) => void;
  folderName: string;
  onFolderNameChange: (value: string) => void;
  fileName: string;
  onFileNameChange: (value: string) => void;
  setupReady: boolean;
  onSetupReadyChange: (ready: boolean) => void;
  connectionMethod?: BackupConnectionMethod;
  onConnectionMethodChange: (method?: BackupConnectionMethod) => void;
  cloudRegion: string;
}

export default function StorageDestinationSetup({
  isFR,
  mode,
  onModeChange,
  provider,
  onProviderChange,
  folderName,
  onFolderNameChange,
  fileName,
  onFileNameChange,
  setupReady,
  onSetupReadyChange,
  connectionMethod,
  onConnectionMethodChange,
  cloudRegion
}: StorageDestinationSetupProps) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'ok' | 'warning' | 'error'>('warning');
  const persistentSupported = supportsPersistentFileAccess();

  const selectMode = (next: AppStorageMode) => {
    onModeChange(next);
    setMessage('');
    if (next === 'supabase') {
      onSetupReadyChange(true);
      onConnectionMethodChange(undefined);
    } else {
      onSetupReadyChange(false);
    }
  };

  const setupDestination = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await chooseOrCreateBackupDestination({
        fileName,
        folderName,
        preferDirectory: true
      });
      if (result.ok) {
        onFileNameChange(result.fileName);
        if (result.folderName) onFolderNameChange(result.folderName);
        onConnectionMethodChange(result.method);
        onSetupReadyChange(true);
        setMessageKind(result.persistent ? 'ok' : 'warning');
        setMessage(result.persistent
          ? (isFR
            ? 'Accès autorisé. Le fichier a été créé et pourra être mis à jour automatiquement tant que l’autorisation demeure valide.'
            : 'Access granted. The file was created and can be updated automatically while permission remains valid.')
          : (isFR
            ? 'Le fichier a été créé avec le sélecteur de votre appareil. Sur cet appareil, les prochaines sauvegardes devront être confirmées manuellement.'
            : 'The file was created with your device picker. On this device, future backups will require manual confirmation.'));
      } else {
        setMessageKind('error');
        setMessage(isFR ? result.message : 'Selection was cancelled or could not be completed.');
      }
    } catch {
      setMessageKind('error');
      setMessage(isFR ? 'Impossible de créer le fichier de sauvegarde.' : 'Unable to create the backup file.');
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const result = await importApplicationBackup(file);
    setBusy(false);
    setMessageKind(result.ok ? 'ok' : 'error');
    setMessage(isFR
      ? result.message
      : result.ok ? `${result.count} data sections were restored.` : 'The backup file is invalid or unreadable.');
    if (result.ok) {
      onSetupReadyChange(true);
      window.setTimeout(() => window.location.reload(), 900);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => selectMode('local')}
          className={`min-h-44 rounded-2xl border p-4 text-left transition ${mode === 'local' ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700 bg-slate-900'}`}
        >
          <HardDrive className="h-8 w-8 text-cyan-300" />
          <p className="mt-3 text-lg font-black">{isFR ? 'Appareil local' : 'Local device'}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {isFR
              ? 'Les données restent dans l’application sur cet appareil. Un fichier de sauvegarde séparé est créé pour la récupération.'
              : 'Data stays in the app on this device. A separate backup file is created for recovery.'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectMode('supabase')}
          className={`min-h-44 rounded-2xl border p-4 text-left transition ${mode === 'supabase' ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700 bg-slate-900'}`}
        >
          <Database className="h-8 w-8 text-emerald-300" />
          <p className="mt-3 text-lg font-black">Supabase</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {isFR
              ? 'Synchronisation gérée par Hailite Manager entre les appareils autorisés. Aucun dossier personnel à choisir.'
              : 'Hailite Manager-managed synchronization across authorized devices. No personal folder to choose.'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectMode('personal_cloud')}
          className={`min-h-44 rounded-2xl border p-4 text-left transition ${mode === 'personal_cloud' ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700 bg-slate-900'}`}
        >
          <Cloud className="h-8 w-8 text-blue-300" />
          <p className="mt-3 text-lg font-black">{isFR ? 'Mon cloud personnel' : 'My personal cloud'}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {isFR
              ? 'Vous choisissez le fournisseur, le dossier et le nom du fichier. L’application n’accède qu’à l’emplacement autorisé.'
              : 'Choose the provider, folder, and file name. The app only accesses the location you authorize.'}
          </p>
        </button>
      </div>

      {mode === 'supabase' ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" />
            <div>
              <p className="font-black text-emerald-200">Supabase · Canada Central · {cloudRegion}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                {isFR
                  ? 'La synchronisation cloud de l’application est activée. Les accès restent contrôlés par la compagnie et les rôles des utilisateurs.'
                  : 'The app cloud sync is enabled. Access remains controlled by the company and user roles.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
          {mode === 'personal_cloud' && (
            <div>
              <p className="mb-2 font-black text-slate-200">{isFR ? 'Fournisseur ou emplacement' : 'Provider or location'}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {PROVIDERS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onProviderChange(item.id); onSetupReadyChange(false); }}
                    className={`min-h-20 rounded-xl border p-2 text-center text-xs font-black ${provider === item.id ? 'border-blue-300 bg-blue-500/15 text-white' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                  >
                    <span className="block text-2xl">{item.icon}</span>
                    {isFR ? item.fr : item.en}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block font-bold text-slate-200">{isFR ? 'Nom du dossier' : 'Folder name'}</span>
              <input
                value={folderName}
                onChange={event => { onFolderNameChange(event.target.value); onSetupReadyChange(false); }}
                placeholder="Hailite Manager"
                className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3"
              />
            </label>
            <label>
              <span className="mb-2 block font-bold text-slate-200">{isFR ? 'Nom du fichier de sauvegarde' : 'Backup file name'}</span>
              <input
                value={fileName}
                onChange={event => { onFileNameChange(event.target.value); onSetupReadyChange(false); }}
                onBlur={() => onFileNameChange(normalizeBackupFileName(fileName))}
                placeholder="hailite-manager-backup.json"
                className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 font-mono"
              />
            </label>
          </div>

          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-xs leading-relaxed text-blue-100">
            {persistentSupported
              ? (isFR
                ? 'Votre navigateur permet de choisir un dossier ou un fichier et de conserver une autorisation. Choisissez votre dossier Google Drive, OneDrive ou autre s’il apparaît dans le sélecteur de fichiers.'
                : 'Your browser can select a folder or file and retain permission. Choose Google Drive, OneDrive, or another location if it appears in the file picker.')
              : (isFR
                ? 'Sur ce téléphone ou navigateur, l’accès permanent à un dossier n’est pas offert. L’application créera le fichier et ouvrira le menu Partager/Fichiers afin que vous puissiez choisir Google Drive, iCloud, OneDrive, Samsung ou un autre emplacement. Les prochaines sauvegardes demanderont une confirmation.'
                : 'This phone or browser does not provide permanent folder access. The app will create the file and open Share/Files so you can choose Google Drive, iCloud, OneDrive, Samsung, or another location. Future backups will require confirmation.')}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy || !folderName.trim() || !fileName.trim()}
              onClick={setupDestination}
              className="min-h-13 rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-40"
            >
              <FolderOpen className="mr-2 inline h-5 w-5" />
              {busy
                ? (isFR ? 'Ouverture…' : 'Opening…')
                : persistentSupported
                  ? (isFR ? 'Choisir/créer le dossier et le fichier' : 'Choose/create folder and file')
                  : (isFR ? 'Créer le fichier et choisir où le sauver' : 'Create file and choose where to save')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => importRef.current?.click()}
              className="min-h-13 rounded-xl border border-slate-600 bg-slate-900 px-4 font-black text-slate-200 disabled:opacity-40"
            >
              <Import className="mr-2 inline h-5 w-5" />
              {isFR ? 'Restaurer un fichier existant' : 'Restore an existing file'}
            </button>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={event => { importBackup(event.target.files?.[0]); event.target.value = ''; }} />
          </div>

          {message && (
            <div className={`rounded-xl border p-3 text-sm ${messageKind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : messageKind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
              {message}
            </div>
          )}

          <div className={`flex items-start gap-3 rounded-xl border p-3 ${setupReady ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700 bg-slate-900'}`}>
            {setupReady ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /> : connectionMethod === 'system_export' ? <Download className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /> : <FileJson className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />}
            <p className="text-xs leading-relaxed text-slate-300">
              {setupReady
                ? (isFR ? 'La destination initiale a été préparée. Vous pourrez changer ce choix plus tard dans les réglages.' : 'The initial destination is ready. You can change it later in settings.')
                : (isFR ? 'Créez ou sélectionnez le fichier avant de continuer.' : 'Create or select the file before continuing.')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
