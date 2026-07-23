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
# TYPES
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'types.ts'
text = path.read_text(encoding='utf-8')
anchor = """export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  emoji: string;
  minThreshold: number;
}
"""
addition = anchor + """

export type ToolAssetStatus = 'in_service' | 'loaned' | 'repair' | 'missing' | 'stolen' | 'retired';

export interface ToolAsset {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  purchaseDate: string;
  purchasePrice: number;
  replacementValue: number;
  seller: string;
  warrantyExpiry: string;
  currentLocation: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  status: ToolAssetStatus;
  notes: string;
  toolPhoto?: string;
  serialPhoto?: string;
  receiptPhoto?: string;
  receiptFileName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolTheftSnapshot {
  toolId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  purchaseDate: string;
  purchasePrice: number;
  replacementValue: number;
  currentLocation: string;
  assignedEmployeeName?: string;
  notes: string;
  hasToolPhoto: boolean;
  hasSerialPhoto: boolean;
  hasReceipt: boolean;
  receiptFileName?: string;
}

export interface ToolTheftReport {
  id: string;
  incidentDate: string;
  incidentTime: string;
  incidentLocation: string;
  circumstances: string;
  discoveredBy: string;
  policeService: string;
  policeFileNumber: string;
  insurer: string;
  insuranceClaimNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  toolIds: string[];
  toolSnapshots: ToolTheftSnapshot[];
  totalReplacementValue: number;
  status: 'draft' | 'reported' | 'insurance_submitted' | 'closed';
  createdAt: string;
  updatedAt: string;
}
"""
text = replace_once(text, anchor, addition, 'types registre outils')
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# API CLIENT — mappers cloud
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  Employee, Project, PunchSession, Invoice, Supplier, CatalogueMaterial, InventoryItem,\n",
    "  Employee, Project, PunchSession, Invoice, Supplier, CatalogueMaterial, InventoryItem, ToolAsset, ToolTheftReport,\n",
    'imports apiClient outils'
)
mapper_anchor = """export function rowToInventory(r: any): InventoryItem {
  return { id: r.id, name: r.name || '', quantity: r.quantity || 0, unit: r.unit || '', emoji: r.emoji || '📦', minThreshold: r.min_threshold || 0 };
}
"""
mapper_addition = mapper_anchor + """

export function toolAssetToRow(tool: ToolAsset, companyId?: string) {
  return {
    id: tool.id, company_id: companyId, name: tool.name, category: tool.category,
    brand: tool.brand, model: tool.model, serial_number: tool.serialNumber,
    asset_tag: tool.assetTag, purchase_date: tool.purchaseDate || null,
    purchase_price: tool.purchasePrice, replacement_value: tool.replacementValue,
    seller: tool.seller, warranty_expiry: tool.warrantyExpiry || null,
    current_location: tool.currentLocation, assigned_employee_id: tool.assignedEmployeeId || null,
    assigned_employee_name: tool.assignedEmployeeName || null, status: tool.status, notes: tool.notes,
    tool_photo: tool.toolPhoto || null, serial_photo: tool.serialPhoto || null,
    receipt_photo: tool.receiptPhoto || null, receipt_file_name: tool.receiptFileName || null,
    created_at: tool.createdAt, updated_at: tool.updatedAt
  };
}

export function rowToToolAsset(r: any): ToolAsset {
  return {
    id: r.id, name: r.name || '', category: r.category || 'Autre', brand: r.brand || '',
    model: r.model || '', serialNumber: r.serial_number || '', assetTag: r.asset_tag || '',
    purchaseDate: r.purchase_date || '', purchasePrice: Number(r.purchase_price || 0),
    replacementValue: Number(r.replacement_value || 0), seller: r.seller || '',
    warrantyExpiry: r.warranty_expiry || '', currentLocation: r.current_location || '',
    assignedEmployeeId: r.assigned_employee_id || undefined,
    assignedEmployeeName: r.assigned_employee_name || undefined,
    status: r.status || 'in_service', notes: r.notes || '', toolPhoto: r.tool_photo || undefined,
    serialPhoto: r.serial_photo || undefined, receiptPhoto: r.receipt_photo || undefined,
    receiptFileName: r.receipt_file_name || undefined,
    createdAt: r.created_at || new Date().toISOString(), updatedAt: r.updated_at || r.created_at || new Date().toISOString()
  };
}

export function toolTheftReportToRow(report: ToolTheftReport, companyId?: string) {
  return {
    id: report.id, company_id: companyId, incident_date: report.incidentDate,
    incident_time: report.incidentTime || null, incident_location: report.incidentLocation,
    circumstances: report.circumstances, discovered_by: report.discoveredBy,
    police_service: report.policeService, police_file_number: report.policeFileNumber,
    insurer: report.insurer, insurance_claim_number: report.insuranceClaimNumber,
    contact_name: report.contactName, contact_phone: report.contactPhone, contact_email: report.contactEmail,
    tool_ids: report.toolIds, tool_snapshots: report.toolSnapshots,
    total_replacement_value: report.totalReplacementValue, status: report.status,
    created_at: report.createdAt, updated_at: report.updatedAt
  };
}

export function rowToToolTheftReport(r: any): ToolTheftReport {
  return {
    id: r.id, incidentDate: r.incident_date || '', incidentTime: r.incident_time || '',
    incidentLocation: r.incident_location || '', circumstances: r.circumstances || '',
    discoveredBy: r.discovered_by || '', policeService: r.police_service || '',
    policeFileNumber: r.police_file_number || '', insurer: r.insurer || '',
    insuranceClaimNumber: r.insurance_claim_number || '', contactName: r.contact_name || '',
    contactPhone: r.contact_phone || '', contactEmail: r.contact_email || '',
    toolIds: Array.isArray(r.tool_ids) ? r.tool_ids : [],
    toolSnapshots: Array.isArray(r.tool_snapshots) ? r.tool_snapshots : [],
    totalReplacementValue: Number(r.total_replacement_value || 0), status: r.status || 'draft',
    createdAt: r.created_at || new Date().toISOString(), updatedAt: r.updated_at || r.created_at || new Date().toISOString()
  };
}
"""
text = replace_once(text, mapper_anchor, mapper_addition, 'mappers registre outils')
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# DB + API ROUTES — tables protégées par le serveur et company_id
# ---------------------------------------------------------------------------
path = ROOT / 'db.ts'
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  'app_users', 'projects', 'punches', 'catalog_items', 'suppliers', 'inventory_items',\n",
    "  'app_users', 'projects', 'punches', 'catalog_items', 'suppliers', 'inventory_items', 'tool_assets', 'tool_theft_reports',\n",
    'tables company_id outils'
)
path.write_text(text, encoding='utf-8')

path = ROOT / 'apiRoutes.ts'
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'supplier_orders', 'supplier_order_items',\n",
    "  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'tool_assets', 'tool_theft_reports', 'supplier_orders', 'supplier_order_items',\n",
    'tables API outils'
)
text = replace_once(
    text,
    "  projects: ALL_ROLES, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: ALL_ROLES,\n  punches: ALL_ROLES, catalog_items: ALL_ROLES, suppliers: ALL_ROLES, inventory_items: ALL_ROLES,\n",
    "  projects: ALL_ROLES, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: ALL_ROLES,\n  punches: ALL_ROLES, catalog_items: ALL_ROLES, suppliers: ALL_ROLES, inventory_items: ALL_ROLES,\n  tool_assets: OFFICE, tool_theft_reports: OFFICE,\n",
    'permissions lecture outils'
)
text = replace_once(
    text,
    "  projects: MANAGERS, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: MANAGERS,\n  punches: ALL_ROLES, catalog_items: MANAGERS, suppliers: MANAGERS, inventory_items: MANAGERS,\n",
    "  projects: MANAGERS, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: MANAGERS,\n  punches: ALL_ROLES, catalog_items: MANAGERS, suppliers: MANAGERS, inventory_items: MANAGERS,\n  tool_assets: MANAGERS, tool_theft_reports: MANAGERS,\n",
    'permissions écriture outils'
)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# STORE — état, CRUD local/hors-ligne, synchronisation cloud
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  InventoryItem, SupplierOrder, Supplier, Client, CompanyInfo, HRAlert, EmployeeRole, PayMode, VisualTheme,\n",
    "  InventoryItem, ToolAsset, ToolTheftReport, SupplierOrder, Supplier, Client, CompanyInfo, HRAlert, EmployeeRole, PayMode, VisualTheme,\n",
    'imports types store outils'
)
text = replace_once(
    text,
    "  employeeToRow, projectToRow, punchToRow, invoiceToRow, supplierToRow, catalogueToRow, inventoryToRow,\n",
    "  employeeToRow, projectToRow, punchToRow, invoiceToRow, supplierToRow, catalogueToRow, inventoryToRow, toolAssetToRow, toolTheftReportToRow,\n",
    'imports mappers sortants outils'
)
text = replace_once(
    text,
    "  rowToEmployee, rowToProject, rowToPunch, rowToInvoice, rowToSupplier, rowToCatalogue, rowToInventory,\n",
    "  rowToEmployee, rowToProject, rowToPunch, rowToInvoice, rowToSupplier, rowToCatalogue, rowToInventory, rowToToolAsset, rowToToolTheftReport,\n",
    'imports mappers entrants outils'
)
text = replace_once(
    text,
    "  inventory: InventoryItem[];\n  orders: SupplierOrder[];\n",
    "  inventory: InventoryItem[];\n  toolAssets: ToolAsset[];\n  toolTheftReports: ToolTheftReport[];\n  orders: SupplierOrder[];\n",
    'état store outils'
)
text = replace_once(
    text,
    "  deleteInventoryItem: (id: string) => void;\n\n  // Orders CRUD\n",
    "  deleteInventoryItem: (id: string) => void;\n\n  // Tool asset registry and theft reports\n  addToolAsset: (tool: Omit<ToolAsset, 'id' | 'createdAt' | 'updatedAt'>) => void;\n  updateToolAsset: (tool: ToolAsset) => void;\n  deleteToolAsset: (id: string) => void;\n  addToolTheftReport: (report: Omit<ToolTheftReport, 'id' | 'createdAt' | 'updatedAt'>) => void;\n  updateToolTheftReport: (report: ToolTheftReport) => void;\n  deleteToolTheftReport: (id: string) => void;\n\n  // Orders CRUD\n",
    'actions interface outils'
)
text = replace_once(
    text,
    "  inventory: getSavedState('gcp_inventory', initialInventory),\n  orders: getSavedState('gcp_orders', initialOrders),\n",
    "  inventory: getSavedState('gcp_inventory', initialInventory),\n  toolAssets: getSavedState('gcp_toolAssets', []),\n  toolTheftReports: getSavedState('gcp_toolTheftReports', []),\n  orders: getSavedState('gcp_orders', initialOrders),\n",
    'initialisation store outils'
)
crud_anchor = """  deleteInventoryItem: (id) => {
    const { inventory } = get();
    const updated = inventory.filter(i => i.id !== id);
    set({ inventory: updated });
    saveState('gcp_inventory', updated);
    syncDelete('inventory_items', id);
  },
"""
crud_addition = crud_anchor + """

  addToolAsset: (tool) => {
    const { toolAssets } = get();
    const now = new Date().toISOString();
    const newTool: ToolAsset = { ...tool, id: genId(), createdAt: now, updatedAt: now };
    const updated = [newTool, ...toolAssets];
    set({ toolAssets: updated });
    saveState('gcp_toolAssets', updated);
    syncInsert('tool_assets', toolAssetToRow(newTool));
  },

  updateToolAsset: (tool) => {
    const { toolAssets } = get();
    const normalized = { ...tool, updatedAt: tool.updatedAt || new Date().toISOString() };
    const updated = toolAssets.map(item => item.id === normalized.id ? normalized : item);
    set({ toolAssets: updated });
    saveState('gcp_toolAssets', updated);
    syncUpdate('tool_assets', normalized.id, toolAssetToRow(normalized));
  },

  deleteToolAsset: (id) => {
    const { toolAssets } = get();
    const updated = toolAssets.filter(tool => tool.id !== id);
    set({ toolAssets: updated });
    saveState('gcp_toolAssets', updated);
    syncDelete('tool_assets', id);
  },

  addToolTheftReport: (report) => {
    const { toolTheftReports } = get();
    const now = new Date().toISOString();
    const newReport: ToolTheftReport = { ...report, id: genId(), createdAt: now, updatedAt: now };
    const updated = [newReport, ...toolTheftReports];
    set({ toolTheftReports: updated });
    saveState('gcp_toolTheftReports', updated);
    syncInsert('tool_theft_reports', toolTheftReportToRow(newReport));
  },

  updateToolTheftReport: (report) => {
    const { toolTheftReports } = get();
    const normalized = { ...report, updatedAt: report.updatedAt || new Date().toISOString() };
    const updated = toolTheftReports.map(item => item.id === normalized.id ? normalized : item);
    set({ toolTheftReports: updated });
    saveState('gcp_toolTheftReports', updated);
    syncUpdate('tool_theft_reports', normalized.id, toolTheftReportToRow(normalized));
  },

  deleteToolTheftReport: (id) => {
    const { toolTheftReports } = get();
    const updated = toolTheftReports.filter(report => report.id !== id);
    set({ toolTheftReports: updated });
    saveState('gcp_toolTheftReports', updated);
    syncDelete('tool_theft_reports', id);
  },
"""
text = replace_once(text, crud_anchor, crud_addition, 'CRUD registre outils')
text = replace_once(
    text,
    "    const inventory = (t.inventory_items || []).map(rowToInventory);\n    const orderItems = t.supplier_order_items || [];\n",
    "    const inventory = (t.inventory_items || []).map(rowToInventory);\n    const toolAssets = (t.tool_assets || []).map(rowToToolAsset);\n    const toolTheftReports = (t.tool_theft_reports || []).map(rowToToolTheftReport);\n    const orderItems = t.supplier_order_items || [];\n",
    'hydratation données outils'
)
text = replace_once(
    text,
    "        inventory: mergeByKey(state.inventory, inventory, i => i.id),\n        orders: mergeByKey(state.orders, orders, o => o.id),\n",
    "        inventory: mergeByKey(state.inventory, inventory, i => i.id),\n        toolAssets: mergeByKey(state.toolAssets, toolAssets, i => i.id),\n        toolTheftReports: mergeByKey(state.toolTheftReports, toolTheftReports, i => i.id),\n        orders: mergeByKey(state.orders, orders, o => o.id),\n",
    'fusion cloud outils'
)
text = replace_once(
    text,
    "    saveState('gcp_inventory', s.inventory);\n    saveState('gcp_orders', s.orders);\n",
    "    saveState('gcp_inventory', s.inventory);\n    saveState('gcp_toolAssets', s.toolAssets);\n    saveState('gcp_toolTheftReports', s.toolTheftReports);\n    saveState('gcp_orders', s.orders);\n",
    'sauvegarde hydratation outils'
)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# APP — troisième sous-onglet distinct dans Inventaire
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));\n",
    "const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));\nconst ToolRegistry = lazy(() => import('./components/ToolRegistry'));\n",
    'lazy import ToolRegistry'
)
text = replace_once(
    text,
    "  const [inventorySubTab, setInventorySubTab] = useState<'stock' | 'catalogue'>('stock');\n",
    "  const [inventorySubTab, setInventorySubTab] = useState<'stock' | 'catalogue' | 'tools'>('stock');\n",
    'type sous-onglet outils'
)
text = text.replace('rounded-xl max-w-md">\n                  <button', 'rounded-xl max-w-2xl">\n                  <button', 1)
button_anchor = """                  <button
                    onClick={() => setInventorySubTab('catalogue')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all duration-200 uppercase tracking-wider cursor-pointer ${
                      inventorySubTab === 'catalogue'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-900'
                    }`}
                  >
                    {t.catalogTab} ({catalogue.length})
                  </button>
"""
button_addition = button_anchor + """                  <button
                    onClick={() => setInventorySubTab('tools')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all duration-200 uppercase tracking-wider cursor-pointer ${
                      inventorySubTab === 'tools'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-900'
                    }`}
                  >
                    {currentLanguage === 'FR' ? '🧰 Outils' : '🧰 Tools'}
                  </button>
"""
text = replace_once(text, button_anchor, button_addition, 'bouton sous-onglet outils')
render_anchor = """                  </>
                ) : (
                  <Suspense fallback={<LazySectionFallback />}>
                    <CatalogueManager />
                  </Suspense>
                )}
"""
render_replacement = """                  </>
                ) : inventorySubTab === 'catalogue' ? (
                  <Suspense fallback={<LazySectionFallback />}>
                    <CatalogueManager />
                  </Suspense>
                ) : (
                  <Suspense fallback={<LazySectionFallback />}>
                    <ToolRegistry />
                  </Suspense>
                )}
"""
text = replace_once(text, render_anchor, render_replacement, 'rendu sous-onglet outils')
path.write_text(text, encoding='utf-8')

print('Registre photographique des outils et dossiers de vol intégrés.')
