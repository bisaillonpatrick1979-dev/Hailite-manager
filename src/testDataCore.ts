import type { CatalogueMaterial, Client, InventoryItem, Project, Supplier } from './types';
import { TEST_EMPLOYEES } from './testProfiles';

export const TEST_PERIOD_START = '2025-07-01';
export const TEST_PERIOD_END = '2026-06-30';

export const TEST_EMPLOYMENT_END: Record<string, string> = {
  'test-former-1': '2026-02-13',
  'test-former-2': '2026-05-01'
};

export function isTestEmployeeActiveOn(employeeId: string, date: string): boolean {
  const employee = TEST_EMPLOYEES.find(item => item.id === employeeId);
  if (!employee || date < employee.hireDate) return false;
  const end = TEST_EMPLOYMENT_END[employeeId];
  return !end || date <= end;
}

const CLIENT_SPECS: Array<[string, string, string?]> = [
  ['Amélie et Hugo Fontaine', 'Aspen Woods, Calgary, AB'],
  ['Daniel Caron', 'Cooper’s Crossing, Airdrie, AB'],
  ['Maya Singh', 'Mahogany, Calgary, AB'],
  ['West Ridge Custom Homes', 'Rivercrest, Cochrane, AB', 'West Ridge Custom Homes Ltd.'],
  ['Ethan Brooks', 'Kinniburgh, Chestermere, AB'],
  ['Isabelle Fortin', 'D’Arcy, Okotoks, AB'],
  ['Prairie Commerce Group', 'Foothills Industrial, Calgary, AB', 'Prairie Commerce Group Inc.'],
  ['Lucie et Karim Haddad', 'Royal Oak, Calgary, AB'],
  ['Samuel Nguyen', 'Tuscany, Calgary, AB'],
  ['Beltline Condominium Board', 'Beltline, Calgary, AB', 'Condo Corporation 2610'],
  ['Claire Beaumont', 'Springbank, Rocky View County, AB'],
  ['Seton Living Developments', 'Seton, Calgary, AB', 'Seton Living Developments LP'],
  ['Northern Shield Insurance', 'Bayside, Airdrie, AB', 'Northern Shield Insurance'],
  ['Zoé Lapointe', 'Legacy, Calgary, AB'],
  ['Christopher Evans', 'Auburn Bay, Calgary, AB'],
  ['Nora et Michel Bouchard', 'Varsity, Calgary, AB'],
  ['Fatima Rahman', 'Panorama Hills, Calgary, AB'],
  ['Currie Barracks Property Group', 'Currie Barracks, Calgary, AB', 'Currie Barracks Property Group'],
  ['Owen McLeod', 'Bearspaw, Rocky View County, AB']
];

export const TEST_CLIENTS: Client[] = CLIENT_SPECS.map(([name, address, company], index) => ({
  id: `test-client-${String(index + 1).padStart(2, '0')}`,
  name,
  company,
  email: `client${String(index + 1).padStart(2, '0')}.test@example.com`,
  phone: `403-555-${String(1101 + index).padStart(4, '0')}`,
  address
}));

TEST_CLIENTS.push({
  id: 'test-client-company',
  name: 'Hailite Exteriors',
  company: 'Hailite Exteriors Ltd.',
  email: 'admin.test@hailite.local',
  phone: '403-555-0100',
  address: 'Calgary, Alberta'
});

export const TEST_SUPPLIERS: Supplier[] = [
  { id: 'test-supplier-01', name: 'Convoy Supply Calgary', contactName: 'Comptoir entrepreneurs', phone: '403-555-2101', email: 'orders.test@convoy.example.com', notes: 'Vinyle, Hardie, accessoires et membranes.' },
  { id: 'test-supplier-02', name: 'Roofmart Calgary', contactName: 'Service commercial', phone: '403-555-2102', email: 'commercial.test@roofmart.example.com', notes: 'Soffite, fascia, aluminium et solins.' },
  { id: 'test-supplier-03', name: 'Lansing Building Products', contactName: 'Bureau Calgary', phone: '403-555-2103', email: 'calgary.test@lansing.example.com', notes: 'Revêtements et moulures spécialisées.' },
  { id: 'test-supplier-04', name: 'Home Depot Pro', contactName: 'Compte Pro fictif', phone: '403-555-2104', email: 'prodesk.test@homedepot.example.com', notes: 'Consommables, outils et quincaillerie.' },
  { id: 'test-supplier-05', name: 'United Rentals', contactName: 'Location chantier', phone: '403-555-2105', email: 'rentals.test@united.example.com', notes: 'Nacelles, échafaudages et équipements.' },
  { id: 'test-supplier-06', name: 'Calgary Waste Services', contactName: 'Répartition', phone: '403-555-2106', email: 'dispatch.test@waste.example.com', notes: 'Conteneurs et disposition des déchets.' }
];

const MATERIAL_SPECS: Array<[string, string, number, number, number, string, CatalogueMaterial['unit'], string?]> = [
  ['Vinyle standard', '🏠', 2.2, 1.78, 8.75, 'test-supplier-01', 'pi2'],
  ['Vinyle premium', '✨', 2.65, 2.15, 10.25, 'test-supplier-01', 'pi2'],
  ['James Hardie Plank', '🧱', 3.15, 3.72, 14.5, 'test-supplier-01', 'pi2'],
  ['Hardie Panel 4 × 8', '▦', 3.4, 4.05, 16.25, 'test-supplier-03', 'pi2'],
  ['Soffite aluminium ventilé', '▤', 2.35, 2.1, 9.5, 'test-supplier-02', 'pi2'],
  ['Fascia aluminium', '📏', 1.75, 2.42, 8.25, 'test-supplier-02', 'pi_lin'],
  ['Membrane pare-air', '🛡️', 0.65, 0.42, 2.1, 'test-supplier-01', 'rouleau'],
  ['J-Trim aluminium', '📐', 1.25, 12.4, 29.5, 'test-supplier-02', 'unite', 'Longueur de 12 pi'],
  ['Coin extérieur', '◩', 1.45, 18.9, 42, 'test-supplier-01', 'unite', 'Longueur de 10 pi'],
  ['Bande de départ', '➖', 0.55, 8.4, 19.5, 'test-supplier-01', 'unite'],
  ['Clous galvanisés', '🔩', 0.35, 54, 78, 'test-supplier-04', 'boite', 'Boîte de 3 000'],
  ['Scellant extérieur', '🧴', 0.3, 8.75, 16.5, 'test-supplier-04', 'unite']
];

export const TEST_CATALOGUE: CatalogueMaterial[] = MATERIAL_SPECS.map((item, index) => ({
  id: `test-cat-${String(index + 1).padStart(2, '0')}`,
  name: item[0], emoji: item[1], pricePerSqFt: item[2], supplierPrice: item[3], clientPrice: item[4],
  supplierId: item[5], unit: item[6], unitNote: item[7]
}));

const STOCK_SPECS: Array<[string, number, string, string, number]> = [
  ['Hardie Plank — Boothbay Blue', 148, 'planches', '🧱', 80],
  ['Vinyle blanc premium', 34, 'boîtes', '🏠', 18],
  ['Soffite blanc ventilé', 22, 'boîtes', '▤', 12],
  ['Fascia noir 6 po', 46, 'longueurs', '📏', 24],
  ['Membrane pare-air', 9, 'rouleaux', '🛡️', 6],
  ['J-Trim noir', 67, 'longueurs', '📐', 30],
  ['Coins extérieurs blancs', 19, 'unités', '◩', 12],
  ['Bandes de départ', 42, 'longueurs', '➖', 25],
  ['Clous galvanisés', 7, 'boîtes', '🔩', 5],
  ['Scellant noir', 31, 'tubes', '🧴', 24],
  ['Lames fibrociment', 4, 'unités', '🪚', 3],
  ['Harnais antichute inspectés', 8, 'unités', '🦺', 6]
];

export const TEST_INVENTORY: InventoryItem[] = STOCK_SPECS.map((item, index) => ({
  id: `test-inventory-${String(index + 1).padStart(2, '0')}`,
  name: item[0], quantity: item[1], unit: item[2], emoji: item[3], minThreshold: item[4]
}));

export interface TestProjectMeta extends Project {
  clientId: string;
  start: string;
  end: string;
  subtotal: number;
  service: string;
  commercial?: boolean;
}

type ProjectSpec = [string, string, string, number, Project['status'], string, string[], boolean?];
const PROJECT_SPECS: ProjectSpec[] = [
  ['Aspen Woods — Hardie complet', '2025-07-07', '2025-08-08', 58200, 'completed', 'Revêtement James Hardie, soffite et fascia', ['test-employee-1', 'test-employee-3', 'test-former-1', 'test-contractor-1']],
  ['Airdrie — remplacement vinyle', '2025-07-14', '2025-07-31', 21800, 'completed', 'Dépose et installation de vinyle premium', ['test-employee-1', 'test-former-1']],
  ['Mahogany — soffite et fascia', '2025-08-11', '2025-08-29', 16400, 'completed', 'Soffite ventilé, fascia et gouttières', ['test-employee-4', 'test-former-1']],
  ['Cochrane — LP SmartSide sur mesure', '2025-09-08', '2025-10-17', 55900, 'completed', 'Revêtement LP SmartSide et moulures personnalisées', ['test-employee-3', 'test-employee-1', 'test-employee-2', 'test-contractor-1']],
  ['Chestermere — réparation grêle', '2025-10-06', '2025-11-07', 39800, 'completed', 'Réparation de grêle, vinyle et accessoires', ['test-employee-1', 'test-employee-2', 'test-former-2', 'test-contractor-2']],
  ['Okotoks — façade Hardie', '2025-11-10', '2025-12-12', 34500, 'completed', 'Façade Hardie et détails architecturaux', ['test-employee-3', 'test-employee-4', 'test-former-2']],
  ['Foothills — panneaux commerciaux ACM', '2025-12-01', '2026-01-30', 92500, 'completed', 'Panneaux ACM, isolation et solins', ['test-employee-3', 'test-employee-1', 'test-employee-2', 'test-former-2', 'test-contractor-1'], true],
  ['Royal Oak — réparation hivernale', '2026-01-12', '2026-02-06', 18700, 'completed', 'Réparation localisée et étanchéité hivernale', ['test-employee-1', 'test-former-1']],
  ['Tuscany — vinyle premium', '2026-02-02', '2026-02-27', 27300, 'completed', 'Vinyle premium, coins et solins', ['test-employee-1', 'test-employee-2', 'test-former-1']],
  ['Beltline — réfection fascia copropriété', '2026-02-16', '2026-03-27', 64200, 'completed', 'Fascia, soffite et enveloppe de bâtiment', ['test-employee-3', 'test-employee-4', 'test-contractor-2'], true],
  ['Springbank — résidence Hardie', '2026-03-09', '2026-04-24', 78500, 'completed', 'Hardie complet, panneaux verticaux et finitions', ['test-employee-3', 'test-employee-1', 'test-employee-2', 'test-employee-4', 'test-contractor-1']],
  ['Seton — six maisons en rangée', '2026-04-06', '2026-05-29', 88900, 'completed', 'Revêtement multifamilial, soffite et fascia', ['test-employee-3', 'test-employee-1', 'test-employee-2', 'test-employee-4', 'test-contractor-1', 'test-contractor-3'], true],
  ['Airdrie — dossier assurance grêle', '2026-04-13', '2026-05-08', 31200, 'completed', 'Réparation après grêle et documentation assurance', ['test-employee-1', 'test-employee-2', 'test-former-2', 'test-contractor-2']],
  ['Legacy — remplacement de deux façades', '2026-05-04', '2026-05-22', 24600, 'completed', 'Vinyle et membrane sur deux façades', ['test-employee-1', 'test-employee-2']],
  ['Auburn Bay — enveloppe extérieure', '2026-05-11', '2026-06-12', 29400, 'completed', 'Soffite, fascia, membrane et réparations', ['test-employee-3', 'test-employee-4', 'test-contractor-3']],
  ['Varsity — remplacement cèdre', '2026-06-01', '2026-06-30', 47800, 'completed', 'Dépose du cèdre et installation Hardie', ['test-employee-3', 'test-employee-1', 'test-employee-4', 'test-contractor-1']],
  ['Panorama Hills — vinyle et soffite', '2026-06-15', '2026-07-24', 36200, 'active', 'Vinyle premium et soffite ventilé', ['test-employee-1', 'test-employee-2', 'test-employee-4']],
  ['Currie Barracks — immeuble mixte', '2026-06-08', '2026-08-28', 108000, 'active', 'Panneaux architecturaux et revêtement mixte', ['test-employee-3', 'test-employee-1', 'test-employee-2', 'test-employee-4', 'test-contractor-1', 'test-contractor-3'], true],
  ['Bearspaw — résidence personnalisée', '2026-04-20', '2026-08-14', 69000, 'on-hold', 'Hardie, accents bois et détails sur mesure', ['test-employee-3', 'test-employee-1', 'test-contractor-2']]
];

export const TEST_PROJECT_META: TestProjectMeta[] = PROJECT_SPECS.map((spec, index) => {
  const client = TEST_CLIENTS[index];
  const id = `test-project-${String(index + 1).padStart(2, '0')}`;
  return {
    id,
    name: spec[0], clientId: client.id, clientName: client.name, address: client.address,
    latitude: 51.04 + ((index % 5) - 2) * 0.035, longitude: -114.07 + ((index % 7) - 3) * 0.04,
    radius: spec[7] ? 180 : 120, assignedEmployees: spec[6], status: spec[4], start: spec[1], end: spec[2],
    subtotal: spec[3], service: spec[5], commercial: spec[7],
    tasks: [
      { id: `${id}-task-1`, text: 'Validation des mesures et matériaux', done: spec[4] === 'completed', priority: 'normal', createdAt: `${spec[1]}T14:00:00.000Z` },
      { id: `${id}-task-2`, text: 'Inspection finale et photos', done: spec[4] === 'completed', priority: spec[7] ? 'critique' : 'normal', createdAt: `${spec[1]}T14:05:00.000Z` }
    ],
    tools: [
      { id: `${id}-tool-1`, name: 'Cloueuses et compresseur', brought: true },
      { id: `${id}-tool-2`, name: 'Équipement antichute', brought: true }
    ]
  };
});

TEST_PROJECT_META.push({
  id: 'test-project-admin', name: 'Administration et développement Hailite', clientId: 'test-client-company',
  clientName: 'Hailite Exteriors', address: 'Calgary, Alberta', latitude: 51.045, longitude: -114.071, radius: 50,
  assignedEmployees: ['test-admin', 'test-secretary', 'test-accountant'], status: 'active', start: TEST_PERIOD_START,
  end: TEST_PERIOD_END, subtotal: 0, service: 'Administration, ventes, comptabilité et formation'
});

export const TEST_PROJECTS: Project[] = TEST_PROJECT_META.map(meta => ({
  id: meta.id, name: meta.name, clientName: meta.clientName, address: meta.address, latitude: meta.latitude,
  longitude: meta.longitude, radius: meta.radius, assignedEmployees: meta.assignedEmployees, status: meta.status,
  tasks: meta.tasks, tools: meta.tools
}));
