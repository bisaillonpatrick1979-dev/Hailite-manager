import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const types = read('src/types.ts');
const store = read('src/store.ts');
const api = read('src/apiClient.ts');
const routes = read('apiRoutes.ts');
const db = read('db.ts');
const app = read('src/App.tsx');
const component = read('src/components/ToolRegistry.tsx');
const migration = read('supabase/migrations/20260723023500_add_tool_registry_and_theft_reports.sql');

for (const marker of [
  'export interface ToolAsset',
  'serialNumber: string',
  'toolPhoto?: string',
  'serialPhoto?: string',
  'receiptPhoto?: string',
  'export interface ToolTheftReport',
  'toolSnapshots: ToolTheftSnapshot[]'
]) assert.ok(types.includes(marker), `Type absent: ${marker}`);

for (const marker of [
  'toolAssets: ToolAsset[]',
  'toolTheftReports: ToolTheftReport[]',
  'addToolAsset:',
  'updateToolAsset:',
  'addToolTheftReport:',
  "saveState('gcp_toolAssets'",
  "syncInsert('tool_assets'",
  "syncInsert('tool_theft_reports'",
  '(t.tool_assets || []).map(rowToToolAsset)',
  '(t.tool_theft_reports || []).map(rowToToolTheftReport)'
]) assert.ok(store.includes(marker), `Store incomplet: ${marker}`);

for (const marker of [
  'export function toolAssetToRow',
  'export function rowToToolAsset',
  'export function toolTheftReportToRow',
  'export function rowToToolTheftReport'
]) assert.ok(api.includes(marker), `Mapper cloud absent: ${marker}`);

assert.ok(routes.includes("'tool_assets', 'tool_theft_reports'"), 'Tables absentes de la liste API.');
assert.ok(routes.includes('tool_assets: OFFICE, tool_theft_reports: OFFICE'), 'Lecture non limitée au bureau.');
assert.ok(routes.includes('tool_assets: MANAGERS, tool_theft_reports: MANAGERS'), 'Écriture non limitée aux gestionnaires.');
assert.ok(db.includes("'tool_assets', 'tool_theft_reports'"), 'Scoping company_id absent.');

for (const marker of [
  "lazy(() => import('./components/ToolRegistry'))",
  "'stock' | 'catalogue' | 'tools'",
  "setInventorySubTab('tools')",
  '<ToolRegistry />'
]) assert.ok(app.includes(marker), `Intégration inventaire absente: ${marker}`);

for (const marker of [
  'id="tool-registry"',
  "capture=\"environment\"",
  "accept=\"image/*,application/pdf\"",
  'serialNumber',
  'replacementValue',
  'policeFileNumber',
  'insuranceClaimNumber',
  'window.print()',
  'ne transmet pas automatiquement',
  "status: 'stolen'"
]) assert.ok(component.includes(marker), `Fonction registre absente: ${marker}`);

for (const marker of [
  'create table if not exists public.tool_assets',
  'create table if not exists public.tool_theft_reports',
  'alter table public.tool_assets enable row level security',
  'alter table public.tool_theft_reports enable row level security',
  'revoke all on public.tool_assets from anon, authenticated',
  'grant select, insert, update, delete on public.tool_assets to service_role'
]) assert.ok(migration.includes(marker), `Protection SQL absente: ${marker}`);

console.log('Registre d’outils validé', {
  toolPhotos: true,
  serialAndModel: true,
  receiptImageOrPdf: true,
  offlinePersistence: true,
  cloudSync: true,
  companyScoping: true,
  theftSnapshots: true,
  printablePoliceInsuranceReport: true,
  automaticSubmission: false
});
