export type AppStorageMode = 'local' | 'supabase' | 'personal_cloud';
export type PersonalCloudProvider =
  | 'google_drive'
  | 'onedrive'
  | 'dropbox'
  | 'icloud_drive'
  | 'samsung_cloud'
  | 'device_folder'
  | 'other';

export type BackupConnectionMethod = 'directory_handle' | 'file_handle' | 'system_export';

export interface PersonalBackupConfig {
  mode: AppStorageMode;
  provider: PersonalCloudProvider;
  folderName: string;
  fileName: string;
  connectionMethod?: BackupConnectionMethod;
  connected: boolean;
  automatic: boolean;
  lastBackupAt?: string;
  lastBackupError?: string;
}

export interface BackupSetupResult {
  ok: boolean;
  persistent: boolean;
  method?: BackupConnectionMethod;
  folderName?: string;
  fileName: string;
  message: string;
}

const CONFIG_KEY = 'gcp_personalBackupConfig';
const DB_NAME = 'hailite-manager-backup-handles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const PRIMARY_HANDLE_KEY = 'primary';
const BACKUP_FORMAT = 'hailite-manager-backup';
const BACKUP_VERSION = 1;
const EXCLUDED_KEYS = new Set([
  'gcp_activeEmployee',
  'gcp_authToken',
  'gcp_auth_token',
  'gcp_ai_token',
  CONFIG_KEY
]);

let backupTimer: ReturnType<typeof setTimeout> | null = null;
let backupInProgress = false;

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function normalizeBackupFileName(value: string): string {
  const cleaned = (value || 'hailite-manager-backup')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');
  return (cleaned || 'hailite-manager-backup').toLowerCase().endsWith('.json')
    ? (cleaned || 'hailite-manager-backup.json')
    : `${cleaned || 'hailite-manager-backup'}.json`;
}

export function getPersonalBackupConfig(): PersonalBackupConfig {
  const storage = safeLocalStorage();
  const fallback: PersonalBackupConfig = {
    mode: 'local',
    provider: 'device_folder',
    folderName: 'Hailite Manager',
    fileName: 'hailite-manager-backup.json',
    connected: false,
    automatic: false
  };
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(storage.getItem(CONFIG_KEY) || '{}');
    return {
      ...fallback,
      ...parsed,
      fileName: normalizeBackupFileName(parsed.fileName || fallback.fileName)
    };
  } catch {
    return fallback;
  }
}

export function savePersonalBackupConfig(config: PersonalBackupConfig): PersonalBackupConfig {
  const normalized = { ...config, fileName: normalizeBackupFileName(config.fileName) };
  safeLocalStorage()?.setItem(CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
  });
}

async function saveHandle(handle: any): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, PRIMARY_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to save file permission'));
  });
  db.close();
}

async function readHandle(): Promise<any | null> {
  try {
    const db = await openHandleDb();
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(PRIMARY_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Unable to read file permission'));
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearPersonalBackupHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(PRIMARY_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Unable to clear file permission'));
    });
    db.close();
  } catch {
    // No persisted handle to clear.
  }
}

function collectApplicationData(): Record<string, unknown> {
  const storage = safeLocalStorage();
  const data: Record<string, unknown> = {};
  if (!storage) return data;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith('gcp_') || EXCLUDED_KEYS.has(key)) continue;
    const raw = storage.getItem(key);
    if (raw == null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return data;
}

export function buildApplicationBackup() {
  const config = getPersonalBackupConfig();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    app: 'Hailite Manager',
    storage: {
      mode: config.mode,
      provider: config.provider,
      folderName: config.folderName,
      fileName: config.fileName
    },
    data: collectApplicationData()
  };
}

function backupBlob(): Blob {
  return new Blob([JSON.stringify(buildApplicationBackup(), null, 2)], {
    type: 'application/json;charset=utf-8'
  });
}

async function ensureWritePermission(handle: any, request = false): Promise<boolean> {
  if (!handle) return false;
  try {
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') return true;
    }
    if (request && typeof handle.requestPermission === 'function') {
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    }
    // Some implementations do not expose permission methods and fail on write instead.
    return typeof handle.createWritable === 'function' || handle.kind === 'directory';
  } catch {
    return false;
  }
}

async function writeBlobToHandle(handle: any, fileName: string, requestPermission = false): Promise<void> {
  let fileHandle = handle;
  if (handle?.kind === 'directory') {
    if (!(await ensureWritePermission(handle, requestPermission))) throw new Error('PERMISSION_REQUIRED');
    fileHandle = await handle.getFileHandle(normalizeBackupFileName(fileName), { create: true });
  }
  if (!(await ensureWritePermission(fileHandle, requestPermission))) throw new Error('PERMISSION_REQUIRED');
  const writable = await fileHandle.createWritable();
  await writable.write(backupBlob());
  await writable.close();
}

async function exportWithSystem(fileName: string): Promise<BackupSetupResult> {
  const normalized = normalizeBackupFileName(fileName);
  const blob = backupBlob();
  const file = new File([blob], normalized, { type: 'application/json' });

  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({
        files: [file],
        title: 'Hailite Manager',
        text: 'Sauvegarde Hailite Manager / Hailite Manager backup'
      });
      return {
        ok: true,
        persistent: false,
        method: 'system_export',
        fileName: normalized,
        message: 'Le fichier a été remis au sélecteur de partage de votre appareil.'
      };
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, persistent: false, fileName: normalized, message: 'Sauvegarde annulée.' };
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = normalized;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {
    ok: true,
    persistent: false,
    method: 'system_export',
    fileName: normalized,
    message: 'Le fichier a été créé dans vos téléchargements. Déplacez-le dans votre cloud au besoin.'
  };
}

export async function chooseOrCreateBackupDestination(params: {
  fileName: string;
  folderName: string;
  preferDirectory?: boolean;
}): Promise<BackupSetupResult> {
  const fileName = normalizeBackupFileName(params.fileName);
  const pickerWindow = window as typeof window & {
    showDirectoryPicker?: (options?: any) => Promise<any>;
    showSaveFilePicker?: (options?: any) => Promise<any>;
  };

  if (params.preferDirectory !== false && pickerWindow.showDirectoryPicker) {
    try {
      const directory = await pickerWindow.showDirectoryPicker({ mode: 'readwrite', id: 'hailite-manager-backup' });
      await writeBlobToHandle(directory, fileName, true);
      await saveHandle(directory);
      return {
        ok: true,
        persistent: true,
        method: 'directory_handle',
        folderName: directory.name || params.folderName,
        fileName,
        message: 'Dossier autorisé et première sauvegarde créée.'
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') return { ok: false, persistent: false, fileName, message: 'Sélection annulée.' };
    }
  }

  if (pickerWindow.showSaveFilePicker) {
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        id: 'hailite-manager-backup-file',
        suggestedName: fileName,
        types: [{ description: 'Hailite Manager JSON', accept: { 'application/json': ['.json'] } }]
      });
      await writeBlobToHandle(fileHandle, fileName, true);
      await saveHandle(fileHandle);
      return {
        ok: true,
        persistent: true,
        method: 'file_handle',
        folderName: params.folderName,
        fileName: fileHandle.name || fileName,
        message: 'Fichier autorisé et première sauvegarde créée.'
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') return { ok: false, persistent: false, fileName, message: 'Sélection annulée.' };
    }
  }

  return exportWithSystem(fileName);
}

export async function writePersonalBackupNow(requestPermission = false): Promise<BackupSetupResult> {
  const config = getPersonalBackupConfig();
  const fileName = normalizeBackupFileName(config.fileName);
  const handle = await readHandle();
  if (!handle) {
    return exportWithSystem(fileName);
  }
  try {
    await writeBlobToHandle(handle, fileName, requestPermission);
    savePersonalBackupConfig({
      ...config,
      connected: true,
      automatic: config.connectionMethod !== 'system_export',
      lastBackupAt: new Date().toISOString(),
      lastBackupError: undefined
    });
    return {
      ok: true,
      persistent: true,
      method: config.connectionMethod,
      folderName: config.folderName,
      fileName,
      message: 'Sauvegarde mise à jour.'
    };
  } catch (error: any) {
    const message = error?.message === 'PERMISSION_REQUIRED'
      ? 'L’autorisation du fichier doit être renouvelée par un bouton utilisateur.'
      : 'La sauvegarde automatique a échoué.';
    savePersonalBackupConfig({ ...config, lastBackupError: message });
    return { ok: false, persistent: true, fileName, message };
  }
}

export function scheduleConfiguredBackup(): void {
  if (typeof window === 'undefined') return;
  const config = getPersonalBackupConfig();
  if (!config.connected || !config.automatic || config.mode === 'supabase') return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(async () => {
    if (backupInProgress) return;
    backupInProgress = true;
    try {
      await writePersonalBackupNow(false);
    } finally {
      backupInProgress = false;
    }
  }, 2500);
}

export async function importApplicationBackup(file: File): Promise<{ ok: boolean; count: number; message: string }> {
  if (file.size > 30 * 1024 * 1024) return { ok: false, count: 0, message: 'Le fichier dépasse 30 Mo.' };
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== BACKUP_FORMAT || !parsed?.data || typeof parsed.data !== 'object') {
      return { ok: false, count: 0, message: 'Ce fichier n’est pas une sauvegarde Hailite Manager valide.' };
    }
    const storage = safeLocalStorage();
    if (!storage) return { ok: false, count: 0, message: 'Le stockage local est indisponible.' };
    let count = 0;
    for (const [key, value] of Object.entries(parsed.data)) {
      if (!key.startsWith('gcp_') || EXCLUDED_KEYS.has(key)) continue;
      storage.setItem(key, JSON.stringify(value));
      count += 1;
    }
    return { ok: true, count, message: `${count} sections de données ont été restaurées.` };
  } catch {
    return { ok: false, count: 0, message: 'Le fichier ne peut pas être lu.' };
  }
}

export function supportsPersistentFileAccess(): boolean {
  if (typeof window === 'undefined') return false;
  const pickerWindow = window as typeof window & { showDirectoryPicker?: unknown; showSaveFilePicker?: unknown };
  return typeof pickerWindow.showDirectoryPicker === 'function' || typeof pickerWindow.showSaveFilePicker === 'function';
}
