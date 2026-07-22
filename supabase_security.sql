-- =============================================================================
-- Sécurisation Supabase — Gestion Chantier Pro (Hailite Xteriors)
-- À exécuter dans l'éditeur SQL de Supabase (une seule fois).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Journal d'audit
-- Toutes les écritures passant par l'API du serveur (insert/upsert/update/delete),
-- les connexions (réussies, échouées, throttlées) et les actions proposées par
-- l'assistant IA y sont consignées (voir logAudit dans auth.ts).
-- -----------------------------------------------------------------------------
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  user_id     uuid,
  user_name   text,
  role        text,
  company_id  uuid,
  action      text not null,        -- login / login_failed / insert / update / delete / ai_actions_proposed / ...
  target      text not null,        -- nom de table, 'auth' ou 'ai'
  target_id   text,
  details     jsonb
);

create index if not exists audit_logs_at_idx on audit_logs (at desc);
create index if not exists audit_logs_user_idx on audit_logs (user_id);
create index if not exists audit_logs_target_idx on audit_logs (target, action);

-- Le journal d'audit n'est accessible qu'au service role (le serveur) :
-- aucune politique n'est créée, RLS activé = aucun accès par clé anon.
alter table audit_logs enable row level security;

-- -----------------------------------------------------------------------------
-- 2) Verrouillage par défaut des tables applicatives (défense en profondeur)
-- L'application n'accède à la base QUE via le serveur (service role, qui
-- contourne RLS). Activer RLS sans politique bloque tout accès direct via la
-- clé anon/publishable si elle venait à fuiter dans un client.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
    'punches', 'catalog_items', 'suppliers', 'inventory_items', 'supplier_orders', 'supplier_order_items',
    'clients', 'documents', 'document_items', 'document_payments', 'payroll_entries', 'payroll_payments',
    'production_entries', 'weekly_goals', 'motivation_teams', 'motivation_goals', 'hr_alerts', 'expenses'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Recommandé : purger la clé IA éventuellement déjà persistée en base
-- (les clés API vivent désormais exclusivement dans les variables
-- d'environnement du serveur — jamais en base ni dans le navigateur).
-- -----------------------------------------------------------------------------
update companies set ai_api_key = null where ai_api_key is not null;

-- -----------------------------------------------------------------------------
-- 4) Dépenses soumises du terrain (photo de reçu par un employé/sous-traitant)
-- -----------------------------------------------------------------------------
alter table expenses add column if not exists photo_url text;
alter table expenses add column if not exists submitted_by uuid;
alter table expenses add column if not exists submitted_by_name text;
