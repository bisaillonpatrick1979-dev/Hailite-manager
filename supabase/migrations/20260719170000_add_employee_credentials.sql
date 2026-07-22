alter table public.app_users
  add column if not exists credentials jsonb not null default '[]'::jsonb;

comment on column public.app_users.credentials is
  'Employee and subcontractor safety certifications, expiry dates, reminder settings, and compressed card images.';
