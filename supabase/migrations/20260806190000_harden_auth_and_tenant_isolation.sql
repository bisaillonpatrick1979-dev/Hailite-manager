-- Security hardening: hashed PINs, shared login throttling, strict tenant
-- isolation for child tables, private project media, and atomic child sync.

create extension if not exists pgcrypto with schema extensions;

-- Remove every remaining four-digit plaintext PIN immediately. bcrypt hashes
-- already present are left intact and remain accepted by the server.
update public.app_users
set access_code_hash = extensions.crypt(
  access_code_hash,
  extensions.gen_salt('bf', 12)
)
where access_code_hash ~ '^[0-9]{4}$';

-- Test identities must never remain active in a production tenant.
update public.app_users
set is_active = false
where lower(coalesce(email, '')) like '%@hailite.local';

-- -------------------------------------------------------------------------
-- Every API-exposed child table receives an explicit tenant key.
-- -------------------------------------------------------------------------
alter table public.project_tasks add column if not exists company_id uuid;
alter table public.project_tools add column if not exists company_id uuid;
alter table public.project_assignments add column if not exists company_id uuid;
alter table public.supplier_order_items add column if not exists company_id uuid;
alter table public.document_items add column if not exists company_id uuid;
alter table public.document_payments add column if not exists company_id uuid;
alter table public.weekly_goals add column if not exists company_id uuid;

update public.project_tasks child
set company_id = parent.company_id
from public.projects parent
where child.project_id = parent.id and child.company_id is null;

update public.project_tools child
set company_id = parent.company_id
from public.projects parent
where child.project_id = parent.id and child.company_id is null;

update public.project_assignments child
set company_id = parent.company_id
from public.projects parent
where child.project_id = parent.id and child.company_id is null;

update public.supplier_order_items child
set company_id = parent.company_id
from public.supplier_orders parent
where child.order_id = parent.id and child.company_id is null;

update public.document_items child
set company_id = parent.company_id
from public.documents parent
where child.document_id = parent.id and child.company_id is null;

update public.document_payments child
set company_id = parent.company_id
from public.documents parent
where child.document_id = parent.id and child.company_id is null;

update public.weekly_goals child
set company_id = parent.company_id
from public.app_users parent
where child.employee_id = parent.id and child.company_id is null;

do $$
declare
  table_name text;
  missing_count bigint;
begin
  foreach table_name in array array[
    'project_tasks', 'project_tools', 'project_assignments',
    'supplier_order_items', 'document_items', 'document_payments', 'weekly_goals'
  ] loop
    execute format('select count(*) from public.%I where company_id is null', table_name)
      into missing_count;
    if missing_count > 0 then
      raise exception 'Migration interrompue: %.company_id contient encore % ligne(s) orpheline(s)', table_name, missing_count;
    end if;
  end loop;
end $$;

alter table public.project_tasks alter column company_id set not null;
alter table public.project_tools alter column company_id set not null;
alter table public.project_assignments alter column company_id set not null;
alter table public.supplier_order_items alter column company_id set not null;
alter table public.document_items alter column company_id set not null;
alter table public.document_payments alter column company_id set not null;
alter table public.weekly_goals alter column company_id set not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_tasks', 'project_tools', 'project_assignments',
    'supplier_order_items', 'document_items', 'document_payments', 'weekly_goals'
  ] loop
    if not exists (
      select 1
      from pg_constraint
      where conname = table_name || '_company_id_fkey'
        and conrelid = ('public.' || table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (company_id) references public.companies(id) on delete cascade',
        table_name,
        table_name || '_company_id_fkey'
      );
    end if;
    execute format('create index if not exists %I on public.%I (company_id)', table_name || '_company_id_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

-- Les accès principaux utilisent toujours tenant + parent. Ces index évitent
-- qu'une hydratation ou un remplacement transactionnel balaie la table entière.
create index if not exists project_tasks_company_project_idx
  on public.project_tasks (company_id, project_id);
create index if not exists project_tools_company_project_idx
  on public.project_tools (company_id, project_id);
create unique index if not exists project_assignments_company_project_user_uidx
  on public.project_assignments (company_id, project_id, user_id);
create index if not exists project_assignments_company_user_project_idx
  on public.project_assignments (company_id, user_id, project_id);
create index if not exists supplier_order_items_company_order_idx
  on public.supplier_order_items (company_id, order_id);
create index if not exists document_items_company_document_idx
  on public.document_items (company_id, document_id);
create index if not exists document_payments_company_document_idx
  on public.document_payments (company_id, document_id);
create index if not exists weekly_goals_company_employee_idx
  on public.weekly_goals (company_id, employee_id);

-- Les clés composées rendent impossible une ligne enfant dont company_id ne
-- correspond pas au parent, même si une future route serveur oublie un garde.
create unique index if not exists projects_id_company_uidx
  on public.projects (id, company_id);
create unique index if not exists app_users_id_company_uidx
  on public.app_users (id, company_id);
create unique index if not exists supplier_orders_id_company_uidx
  on public.supplier_orders (id, company_id);
create unique index if not exists documents_id_company_uidx
  on public.documents (id, company_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_project_company_fkey') then
    alter table public.project_tasks add constraint project_tasks_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tools_project_company_fkey') then
    alter table public.project_tools add constraint project_tools_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_assignments_project_company_fkey') then
    alter table public.project_assignments add constraint project_assignments_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_assignments_user_company_fkey') then
    alter table public.project_assignments add constraint project_assignments_user_company_fkey
      foreign key (user_id, company_id) references public.app_users(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_assignee_company_fkey') then
    alter table public.project_tasks add constraint project_tasks_assignee_company_fkey
      foreign key (assigned_user_id, company_id) references public.app_users(id, company_id)
      on delete set null (assigned_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_order_items_order_company_fkey') then
    alter table public.supplier_order_items add constraint supplier_order_items_order_company_fkey
      foreign key (order_id, company_id) references public.supplier_orders(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_items_document_company_fkey') then
    alter table public.document_items add constraint document_items_document_company_fkey
      foreign key (document_id, company_id) references public.documents(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_payments_document_company_fkey') then
    alter table public.document_payments add constraint document_payments_document_company_fkey
      foreign key (document_id, company_id) references public.documents(id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weekly_goals_employee_company_fkey') then
    alter table public.weekly_goals add constraint weekly_goals_employee_company_fkey
      foreign key (employee_id, company_id) references public.app_users(id, company_id) on delete cascade;
  end if;
end $$;

-- Les relations parent/enfant sont également en cascade. Une suppression de
-- parent reste atomique et ne dépend plus d'une séquence de requêtes cliente.
do $$
declare
  child_table text;
  child_column text;
  parent_table text;
  constraint_name text;
  cascade_exists boolean;
begin
  for child_table, child_column, parent_table, constraint_name in
    select * from (values
      ('project_tasks', 'project_id', 'projects', 'project_tasks_project_cascade_fkey'),
      ('project_tools', 'project_id', 'projects', 'project_tools_project_cascade_fkey'),
      ('project_assignments', 'project_id', 'projects', 'project_assignments_project_cascade_fkey'),
      ('project_assignments', 'user_id', 'app_users', 'project_assignments_user_cascade_fkey'),
      ('supplier_order_items', 'order_id', 'supplier_orders', 'supplier_order_items_order_cascade_fkey'),
      ('document_items', 'document_id', 'documents', 'document_items_document_cascade_fkey'),
      ('document_payments', 'document_id', 'documents', 'document_payments_document_cascade_fkey'),
      ('weekly_goals', 'employee_id', 'app_users', 'weekly_goals_employee_cascade_fkey')
    ) as relationships(child_table, child_column, parent_table, constraint_name)
  loop
    select exists (
      select 1
      from pg_constraint fk
      join pg_attribute child_attribute
        on child_attribute.attrelid = fk.conrelid
       and child_attribute.attnum = fk.conkey[1]
      where fk.contype = 'f'
        and fk.conrelid = format('public.%I', child_table)::regclass
        and fk.confrelid = format('public.%I', parent_table)::regclass
        and array_length(fk.conkey, 1) = 1
        and child_attribute.attname = child_column
        and fk.confdeltype = 'c'
    ) into cascade_exists;

    if not cascade_exists then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete cascade',
        child_table,
        constraint_name,
        child_column,
        parent_table
      );
    end if;
  end loop;
end $$;

-- Défense en profondeur pour toutes les tables accessibles par l'API. La clé
-- service_role du serveur demeure la seule voie directe vers ces tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
    'punches', 'catalog_items', 'suppliers', 'inventory_items', 'tool_assets', 'tool_theft_reports',
    'supplier_orders', 'supplier_order_items', 'clients', 'documents', 'document_items',
    'document_payments', 'payroll_entries', 'payroll_payments', 'production_entries',
    'weekly_goals', 'motivation_teams', 'motivation_goals', 'hr_alerts', 'expenses',
    'project_photos', 'change_orders', 'insurance_claims', 'leads', 'shift_assignments', 'safety_records'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    end if;
  end loop;
end $$;

-- Cette fonction d'event trigger existe dans le projet de production. Les
-- rôles PostgREST ne doivent jamais pouvoir appeler une fonction SECURITY
-- DEFINER d'administration du schéma.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- Shared brute-force protection for serverless instances.
-- -------------------------------------------------------------------------
create table if not exists public.auth_login_attempts (
  key_hash text primary key,
  failure_count integer not null default 0 check (failure_count >= 0),
  first_failed_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists auth_login_attempts_blocked_idx
  on public.auth_login_attempts (blocked_until)
  where blocked_until is not null;

alter table public.auth_login_attempts enable row level security;
revoke all on public.auth_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.auth_login_attempts to service_role;

create or replace function public.record_auth_login_failure(
  p_key_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
returns table(failure_count integer, blocked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.auth_login_attempts%rowtype;
  current_time timestamptz := clock_timestamp();
begin
  insert into public.auth_login_attempts (key_hash, failure_count, first_failed_at, updated_at)
  values (p_key_hash, 0, current_time, current_time)
  on conflict (key_hash) do nothing;

  select * into current_row
  from public.auth_login_attempts
  where key_hash = p_key_hash
  for update;

  if current_row.first_failed_at < current_time - make_interval(secs => p_window_seconds) then
    current_row.failure_count := 1;
    current_row.first_failed_at := current_time;
  else
    current_row.failure_count := current_row.failure_count + 1;
  end if;

  current_row.blocked_until := case
    when current_row.failure_count >= p_max_attempts
      then current_time + make_interval(secs => p_window_seconds)
    else null
  end;

  update public.auth_login_attempts attempts
  set failure_count = current_row.failure_count,
      first_failed_at = current_row.first_failed_at,
      blocked_until = current_row.blocked_until,
      updated_at = current_time
  where attempts.key_hash = p_key_hash;

  return query select current_row.failure_count, current_row.blocked_until;
end;
$$;

revoke all on function public.record_auth_login_failure(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_auth_login_failure(text, integer, integer)
  to service_role;

-- -------------------------------------------------------------------------
-- Private file bucket. Only the server's secret/service key accesses it.
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- -------------------------------------------------------------------------
-- One database call = one transaction for project children.
-- -------------------------------------------------------------------------
create or replace function public.replace_project_children(
  p_company_id uuid,
  p_project_id uuid,
  p_tasks jsonb,
  p_tools jsonb,
  p_assignments jsonb,
  p_replace_assignments boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and company_id = p_company_id
  ) then
    raise exception 'project_not_found';
  end if;

  if jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_tools, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_children_payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) item
    left join public.app_users employee
      on employee.id = nullif(item->>'assigned_user_id', '')::uuid
     and employee.company_id = p_company_id
    where nullif(item->>'assigned_user_id', '') is not null
      and employee.id is null
  ) then
    raise exception 'invalid_task_assignee';
  end if;

  delete from public.project_tasks
  where company_id = p_company_id and project_id = p_project_id;

  insert into public.project_tasks (
    id, company_id, project_id, assigned_user_id, title, section,
    status, photo_required, sort_order, priority
  )
  select
    coalesce(nullif(item->>'id', '')::uuid, extensions.gen_random_uuid()),
    p_company_id,
    p_project_id,
    (
      select employee.id
      from public.app_users employee
      where employee.id = nullif(item->>'assigned_user_id', '')::uuid
        and employee.company_id = p_company_id
      limit 1
    ),
    left(coalesce(item->>'title', ''), 500),
    nullif(left(coalesce(item->>'section', ''), 250), ''),
    case when item->>'status' = 'done' then 'done' else 'todo' end,
    case when lower(coalesce(item->>'photo_required', 'false')) = 'true' then true else false end,
    case
      when coalesce(item->>'sort_order', '') ~ '^[0-9]+$' then (item->>'sort_order')::integer
      else (item_ordinality - 1)::integer
    end,
    case when item->>'priority' = 'critique' then 'critique' else 'normal' end
  from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) with ordinality as task_rows(item, item_ordinality);

  delete from public.project_tools
  where company_id = p_company_id and project_id = p_project_id;

  insert into public.project_tools (id, company_id, project_id, name, brought)
  select
    coalesce(nullif(item->>'id', '')::uuid, extensions.gen_random_uuid()),
    p_company_id,
    p_project_id,
    left(coalesce(item->>'name', ''), 250),
    coalesce((item->>'brought')::boolean, false)
  from jsonb_array_elements(coalesce(p_tools, '[]'::jsonb)) item;

  if p_replace_assignments then
    -- Refuse tout utilisateur extérieur au tenant avant la première mutation.
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) item
      left join public.app_users employee
        on employee.id = nullif(item->>'user_id', '')::uuid
       and employee.company_id = p_company_id
      where employee.id is null
    ) then
      raise exception 'invalid_project_assignment';
    end if;

    -- Un diff conserve pay_mode/rate pour les employés déjà assignés. Seules
    -- les assignations retirées sont supprimées et les nouvelles utilisent les
    -- valeurs par défaut sûres de la table (hourly, 0).
    delete from public.project_assignments assignment
    where assignment.company_id = p_company_id
      and assignment.project_id = p_project_id
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) item
        where assignment.user_id = nullif(item->>'user_id', '')::uuid
      );

    insert into public.project_assignments (company_id, project_id, user_id)
    select distinct p_company_id, p_project_id, employee.id
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) item
    join public.app_users employee
      on employee.id = nullif(item->>'user_id', '')::uuid
     and employee.company_id = p_company_id
    where not exists (
      select 1
      from public.project_assignments existing
      where existing.company_id = p_company_id
        and existing.project_id = p_project_id
        and existing.user_id = employee.id
    );
  end if;
end;
$$;

revoke all on function public.replace_project_children(uuid, uuid, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.replace_project_children(uuid, uuid, jsonb, jsonb, jsonb, boolean)
  to service_role;
