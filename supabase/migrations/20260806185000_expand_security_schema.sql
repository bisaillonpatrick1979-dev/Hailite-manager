-- Backward-compatible expansion for the security rollout.
--
-- This migration is deliberately additive: the currently deployed server can
-- continue to run while the hardened server is built and verified. The
-- following migration enforces constraints, revokes legacy access, and hashes
-- every remaining plaintext PIN only after the new server is live.

create extension if not exists pgcrypto with schema extensions;

-- Tenant keys required by the hardened API. They remain nullable during the
-- deployment window so an older server cannot fail a write mid-rollout.
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

create index if not exists project_tasks_company_project_idx
  on public.project_tasks (company_id, project_id);
create index if not exists project_tools_company_project_idx
  on public.project_tools (company_id, project_id);
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

-- Shared brute-force protection for serverless instances.
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

-- Private file bucket. Only the server's service key receives access.
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

-- One database call = one transaction for project children.
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
