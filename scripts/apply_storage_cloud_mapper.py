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
# API CLIENT — mappe la destination de sauvegarde dans la fiche compagnie.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')

outbound_old = """    cross_border_transfer_acknowledged_at: c.crossBorderTransferAcknowledgedAt || null,
    processor_terms_accepted_at: c.processorTermsAcceptedAt || null, compliance_version: c.complianceVersion
"""
outbound_new = """    cross_border_transfer_acknowledged_at: c.crossBorderTransferAcknowledgedAt || null,
    processor_terms_accepted_at: c.processorTermsAcceptedAt || null, compliance_version: c.complianceVersion,
    personal_cloud_provider: c.personalCloudProvider || null,
    backup_folder_name: c.backupFolderName || null,
    backup_file_name: c.backupFileName || null,
    backup_connection_method: c.backupConnectionMethod || null,
    personal_backup_connected: c.personalBackupConnected ?? false,
    personal_backup_automatic: c.personalBackupAutomatic ?? false,
    last_personal_backup_at: c.lastPersonalBackupAt || null
"""
text = replace_once(text, outbound_old, outbound_new, 'mapper compagnie sortant stockage')

inbound_old = """    crossBorderTransferAcknowledgedAt: r.cross_border_transfer_acknowledged_at || undefined,
    processorTermsAcceptedAt: r.processor_terms_accepted_at || undefined, complianceVersion: r.compliance_version || undefined
"""
inbound_new = """    crossBorderTransferAcknowledgedAt: r.cross_border_transfer_acknowledged_at || undefined,
    processorTermsAcceptedAt: r.processor_terms_accepted_at || undefined, complianceVersion: r.compliance_version || undefined,
    personalCloudProvider: r.personal_cloud_provider || undefined,
    backupFolderName: r.backup_folder_name || undefined,
    backupFileName: r.backup_file_name || undefined,
    backupConnectionMethod: r.backup_connection_method || undefined,
    personalBackupConnected: r.personal_backup_connected ?? undefined,
    personalBackupAutomatic: r.personal_backup_automatic ?? undefined,
    lastPersonalBackupAt: r.last_personal_backup_at || undefined
"""
text = replace_once(text, inbound_old, inbound_new, 'mapper compagnie entrant stockage')
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# CLOUD BOOTSTRAP — n’appelle Supabase que lorsque Supabase est choisi.
# Les modes local et cloud personnel ne doivent jamais charger l’identité
# Supabase en arrière-plan.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'cloudBootstrap.ts'
text = path.read_text(encoding='utf-8')

identity_old = """    dataStorageMode: company.dataStorageMode || current.dataStorageMode || 'hybrid',
    cloudRegion: company.cloudRegion || current.cloudRegion || 'ca-central-1',
    complianceVersion: company.complianceVersion || current.complianceVersion || '',
"""
identity_new = """    dataStorageMode: company.dataStorageMode || current.dataStorageMode || 'supabase',
    cloudRegion: company.cloudRegion || current.cloudRegion || 'ca-central-1',
    personalCloudProvider: company.personalCloudProvider || current.personalCloudProvider,
    backupFolderName: company.backupFolderName || current.backupFolderName,
    backupFileName: company.backupFileName || current.backupFileName,
    backupConnectionMethod: company.backupConnectionMethod || current.backupConnectionMethod,
    personalBackupConnected: company.personalBackupConnected ?? current.personalBackupConnected ?? false,
    personalBackupAutomatic: company.personalBackupAutomatic ?? current.personalBackupAutomatic ?? false,
    lastPersonalBackupAt: company.lastPersonalBackupAt || current.lastPersonalBackupAt,
    complianceVersion: company.complianceVersion || current.complianceVersion || '',
"""
text = replace_once(text, identity_old, identity_new, 'identité compagnie destination stockage')

guard_old = """  const localCompany = readObject('gcp_companyInfo');
  if (localCompany.dataStorageMode === 'local') {
    document.title = `${localCompany.name || 'Hailite Manager'} — Hailite Manager`;
    return;
  }

  try {
"""
guard_new = """  const localCompany = readObject('gcp_companyInfo');
  const supabaseSelected = ['supabase', 'hybrid', 'cloud'].includes(localCompany.dataStorageMode);
  if (!supabaseSelected) {
    document.title = `${localCompany.name || 'Hailite Manager'} — Hailite Manager`;
    return;
  }

  try {
"""
text = replace_once(text, guard_old, guard_new, 'garde bootstrap Supabase')
path.write_text(text, encoding='utf-8')

print('Destination de stockage conservée dans la compagnie et bootstrap Supabase isolé.')
