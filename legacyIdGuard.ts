import crypto from 'crypto';
import type express from 'express';
import { TABLES_WITH_COMPANY_ID, TABLE_ID_COLUMN } from './db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

// La liste était recopiée à la main, et neuf tables ajoutées depuis n'y
// figuraient plus : outils, vols d'outils, photos de chantier, avenants,
// réclamations, prospects, horaires et fiches de sécurité. Pour elles, le garde
// ne faisait rien — un ancien identifiant local partait tel quel vers une
// colonne uuid et l'écriture échouait par une erreur de base, sans explication.
//
// Elle est maintenant DÉDUITE des tables réellement exposées par l'API. Une
// table ajoutée demain est couverte le jour même, sans que personne y pense.
// Les tables dont la clé primaire n'est pas « id » — weekly_goals, dont la clé
// est employee_id — s'excluent d'elles-mêmes.
const TABLES_WITH_UUID_ID = new Set(
  ['companies', ...TABLES_WITH_COMPANY_ID].filter(
    table => (TABLE_ID_COLUMN[table] || 'id') === 'id'
  )
);

// Même histoire : ces colonnes de référence sont toutes de type uuid en base.
// Les dix dernières ont été ajoutées avec les tables ci-dessus et n'étaient pas
// nettoyées.
const UUID_REFERENCE_FIELDS = [
  'company_id', 'employee_id', 'user_id', 'project_id', 'supplier_id', 'order_id',
  'client_id', 'document_id', 'team_id', 'leader_id',
  'assigned_user_id', 'assigned_employee_id', 'catalog_item_id', 'payroll_entry_id',
  'approved_by', 'created_by', 'taken_by', 'submitted_by',
  'converted_client_id', 'converted_project_id'
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
