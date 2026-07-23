from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)


# API client: import cloud migration with per-record retry retention.
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')
anchor = "export interface CloudHydrateResult {\n"
function = r'''export async function syncLegacyMigrationQueue(queue: Record<string, any[]>): Promise<{
  synced: number;
  remaining: Record<string, any[]>;
}> {
  const remaining: Record<string, any[]> = {};
  let synced = 0;

  const localEmployees: Employee[] = (() => {
    try { return JSON.parse(localStorage.getItem('gcp_employees') || '[]'); }
    catch { return []; }
  })();
  const localProjects: Project[] = (() => {
    try { return JSON.parse(localStorage.getItem('gcp_projects') || '[]'); }
    catch { return []; }
  })();

  const keep = (type: string, item: any) => {
    if (!remaining[type]) remaining[type] = [];
    remaining[type].push(item);
  };

  for (const [type, items] of Object.entries(queue || {})) {
    for (const original of Array.isArray(items) ? items : []) {
      try {
        if (type === 'employees') {
          await dbUpsert('app_users', employeeToRow(original as Employee));
        } else if (type === 'clients') {
          await dbUpsert('clients', clientToRow(original as Client));
        } else if (type === 'suppliers') {
          await dbUpsert('suppliers', supplierToRow(original as Supplier));
        } else if (type === 'projects') {
          const project = original as Project;
          await dbUpsert('projects', projectToRow(project));
          await syncProjectChildren(project);
        } else if (type === 'punches') {
          const punch = { ...original } as PunchSession;
          if (!punch.employeeId) {
            punch.employeeId = localEmployees.find(employee => employee.name.toLowerCase() === punch.employeeName.toLowerCase())?.id || '';
          }
          if (!punch.projectId && punch.projectName) {
            punch.projectId = localProjects.find(project => project.name.toLowerCase() === punch.projectName.toLowerCase())?.id || '';
          }
          if (!isUuid(punch.employeeId)) throw new Error('EMPLOYEE_LINK_REQUIRED');
          await dbUpsert('punches', { ...punchToRow(punch), project_id: isUuid(punch.projectId) ? punch.projectId : null });
        } else if (type === 'documents') {
          const document = original as GCPDocument;
          await dbUpsert('documents', { ...documentToRow(document), client_name: document.clientName });
          await syncDocumentLines(document);
        } else if (type === 'expenses') {
          await dbUpsert('expenses', expenseToRow(original as ExpenseRecord));
        } else if (type === 'payroll') {
          const payment = { ...original } as PayrollPayment;
          if (!payment.employeeId) {
            payment.employeeId = localEmployees.find(employee => employee.name.toLowerCase() === payment.employeeName.toLowerCase())?.id || '';
          }
          if (!isUuid(payment.employeeId)) throw new Error('EMPLOYEE_LINK_REQUIRED');
          await dbUpsert('payroll_payments', payrollPaymentToRow(payment));
        } else if (type === 'catalogue') {
          await dbUpsert('catalog_items', catalogueToRow(original as CatalogueMaterial));
        } else if (type === 'inventory') {
          await dbUpsert('inventory_items', inventoryToRow(original as InventoryItem));
        } else if (type === 'tools') {
          await dbUpsert('tool_assets', toolAssetToRow(original as ToolAsset));
        } else {
          throw new Error('UNSUPPORTED_MIGRATION_TYPE');
        }
        synced += 1;
      } catch (error: any) {
        console.warn(`[migration-cloud] ${type} conservé pour nouvelle tentative :`, error?.message || error);
        keep(type, original);
      }
    }
  }

  return { synced, remaining };
}

'''
text = replace_once(text, anchor, function + anchor, 'fonction synchronisation migration')
path.write_text(text, encoding='utf-8')


# Store: call the cloud migration only after a successful authenticated hydrate.
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  genId, syncInsert, syncUpsert, syncUpdate, syncDelete, syncDocumentLines, syncDocumentInsert, syncOrderItems, hydrateFromCloud, getCompanyId, msSinceLastMutation,\n",
    "  genId, syncInsert, syncUpsert, syncUpdate, syncDelete, syncDocumentLines, syncDocumentInsert, syncOrderItems, hydrateFromCloud, getCompanyId, msSinceLastMutation, syncLegacyMigrationQueue,\n",
    'import syncLegacyMigrationQueue'
)
anchor = """    saveState('gcp_companyInfo', s.companyInfo);
  }
}));
"""
replacement = """    saveState('gcp_companyInfo', s.companyInfo);

    // Les données provenant d’un ancien logiciel ont d’abord été conservées
    // localement. Après une hydratation authentifiée réussie, elles sont envoyées
    // à Supabase. Seules les lignes confirmées sont retirées de la file; les
    // autres restent disponibles pour une tentative ultérieure.
    try {
      const migrationQueue = JSON.parse(localStorage.getItem('gcp_pendingLegacyMigration') || '{}');
      if (Object.values(migrationQueue).some((items: any) => Array.isArray(items) && items.length > 0)) {
        const migrationResult = await syncLegacyMigrationQueue(migrationQueue);
        if (Object.keys(migrationResult.remaining).length > 0) {
          localStorage.setItem('gcp_pendingLegacyMigration', JSON.stringify(migrationResult.remaining));
        } else {
          localStorage.removeItem('gcp_pendingLegacyMigration');
        }
        if (migrationResult.synced > 0) console.info(`[migration-cloud] ${migrationResult.synced} élément(s) transféré(s) vers Supabase.`);
      }
    } catch (error) {
      console.warn('[migration-cloud] La file locale est conservée pour une prochaine tentative.', error);
    }
  }
}));
"""
text = replace_once(text, anchor, replacement, 'appel synchronisation migration après hydrate')
path.write_text(text, encoding='utf-8')
print('Migration héritée synchronisée vers Supabase après authentification.')
