import crypto from 'crypto';
import type express from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

const TABLES_WITH_UUID_ID = new Set([
  'companies', 'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'supplier_orders',
  'supplier_order_items', 'clients', 'documents', 'document_items', 'document_payments',
  'payroll_entries', 'payroll_payments', 'production_entries', 'motivation_teams',
  'motivation_goals', 'hr_alerts', 'expenses'
]);

const UUID_REFERENCE_FIELDS = [
  'company_id', 'employee_id', 'user_id', 'project_id', 'supplier_id', 'order_id',
  'client_id', 'document_id', 'team_id', 'leader_id'
] as const;

const REQUIRED_REFERENCES: Record<string, string[]> = {
  project_tasks: ['project_id'],
  project_tools: ['project_id'],
  project_assignments: ['project_id', 'user_id'],
  supplier_order_items: ['order_id'],
  document_items: ['document_id'],
  document_payments: ['document_id'],
  weekly_goals: ['employee_id']
};

function tableFromRequest(req: express.Request): string | null {
  const match = req.path.match(/\/(?:api\/)?db\/([^/]+)/);
  return match?.[1] || null;
}

/**
 * Dernière barrière avant les routes Supabase.
 *
 * Les anciennes versions utilisaient des identifiants comme emp-1, proj-3 ou
 * task-123. Cette garde empêche ces valeurs d'atteindre des colonnes UUID :
 * - un nouvel id principal invalide est remplacé par un UUID;
 * - une référence facultative invalide est retirée;
 * - une référence obligatoire invalide retourne une erreur claire demandant
 *   un rafraîchissement, plutôt qu'une erreur PostgreSQL 500.
 */
export function legacyIdGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

  const table = tableFromRequest(req);
  if (!table || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next();
  }

  const payload = req.body as Record<string, any>;

  if (TABLES_WITH_UUID_ID.has(table) && payload.id && !isUuid(payload.id)) {
    if (req.method === 'PATCH') delete payload.id;
    else payload.id = crypto.randomUUID();
  }

  for (const field of UUID_REFERENCE_FIELDS) {
    if (!(field in payload)) continue;
    const value = payload[field];
    if (value === null || value === undefined || value === '') continue;

    // expenses.project_id est temporairement du texte pour assurer la transition
    // des anciennes dépenses locales vers le nouveau stockage cloud.
    if (table === 'expenses' && field === 'project_id') continue;
    if (isUuid(value)) continue;

    if ((REQUIRED_REFERENCES[table] || []).includes(field)) {
      res.status(409).json({
        error: 'Ancienne référence locale détectée. Actualisez l’application puis recommencez.',
        code: 'LEGACY_REFERENCE',
        table,
        field
      });
      return;
    }

    payload[field] = null;
  }

  for (const field of ['member_ids', 'project_ids', 'session_ids']) {
    if (Array.isArray(payload[field])) {
      payload[field] = payload[field].filter(isUuid);
    }
  }

  next();
}
