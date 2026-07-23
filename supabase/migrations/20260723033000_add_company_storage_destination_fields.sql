alter table public.companies
  add column if not exists personal_cloud_provider text,
  add column if not exists backup_folder_name text,
  add column if not exists backup_file_name text,
  add column if not exists backup_connection_method text,
  add column if not exists personal_backup_connected boolean not null default false,
  add column if not exists personal_backup_automatic boolean not null default false,
  add column if not exists last_personal_backup_at timestamptz;

alter table public.companies
  drop constraint if exists companies_personal_cloud_provider_check;
alter table public.companies
  add constraint companies_personal_cloud_provider_check
  check (personal_cloud_provider is null or personal_cloud_provider in ('google_drive','onedrive','dropbox','icloud_drive','samsung_cloud','device_folder','other'));

alter table public.companies
  drop constraint if exists companies_backup_connection_method_check;
alter table public.companies
  add constraint companies_backup_connection_method_check
  check (backup_connection_method is null or backup_connection_method in ('directory_handle','file_handle','system_export'));
