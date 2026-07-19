import type { Employee } from './types';

export const LOCAL_TEST_MODE = true;
export const LOCAL_TEST_DATA_VERSION = '2026.07-test-2';

function avatar(emoji: string, background: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="80" fill="${background}"/><text x="80" y="106" text-anchor="middle" font-size="82">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const TEST_EMPLOYEES: Employee[] = [
  {
    id: 'test-admin', name: 'Administrateur Test', nip: '0000', role: 'admin', hourlyRate: 52,
    workerType: 'Propriétaire — accès complet', asNumber: 'TEST-ADMIN', phone: '403-555-0100',
    address: 'Calgary, Alberta', hireDate: '2024-07-01', avatar: avatar('👑', '#EA580C'), level: 8, xp: 9100,
    email: 'admin.test@hailite.local', employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-secretary', name: 'Sophie Bureau', nip: '1001', role: 'secretary', hourlyRate: 30,
    workerType: 'Secrétaire — projets, documents et équipe', asNumber: 'TEST-SEC', phone: '403-555-0101',
    address: 'Calgary, Alberta', hireDate: '2025-08-04', avatar: avatar('🗂️', '#0EA5E9'), level: 4, xp: 2700,
    email: 'secretariat.test@hailite.local', employeeProvince: 'AB', payFrequency: 'biweekly', credentials: []
  },
  {
    id: 'test-accountant', name: 'Marc Comptable', nip: '1002', role: 'accountant', hourlyRate: 42,
    workerType: 'Comptable — finances, paie et facturation', asNumber: 'TEST-CPA', phone: '403-555-0102',
    address: 'Calgary, Alberta', hireDate: '2025-10-20', avatar: avatar('🧮', '#7C3AED'), level: 4, xp: 3100,
    email: 'comptabilite.test@hailite.local', employeeProvince: 'AB', payFrequency: 'biweekly', credentials: []
  },
  {
    id: 'test-employee-1', name: 'Liam Tremblay', nip: '1003', role: 'employee', hourlyRate: 34,
    workerType: 'Poseur de revêtement', asNumber: 'TEST-E01', phone: '403-555-0103', address: 'Airdrie, Alberta',
    hireDate: '2025-07-08', avatar: avatar('👷', '#F97316'), level: 5, xp: 4600,
    employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-employee-2', name: 'Emma Roy', nip: '1004', role: 'employee', hourlyRate: 31,
    workerType: 'Apprentie revêtement', asNumber: 'TEST-E02', phone: '403-555-0104', address: 'Calgary, Alberta',
    hireDate: '2025-09-15', avatar: avatar('👷‍♀️', '#0284C7'), level: 3, xp: 2200,
    employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-employee-3', name: 'Noah Gagnon', nip: '1005', role: 'employee', hourlyRate: 38,
    workerType: 'Chef d’équipe chantier', asNumber: 'TEST-E03', phone: '403-555-0105', address: 'Cochrane, Alberta',
    hireDate: '2024-03-04', avatar: avatar('🦺', '#16A34A'), level: 7, xp: 7900,
    employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-employee-4', name: 'Olivia Martin', nip: '1006', role: 'employee', hourlyRate: 36,
    workerType: 'Spécialiste soffite et fascia', asNumber: 'TEST-E04', phone: '403-555-0106', address: 'Okotoks, Alberta',
    hireDate: '2025-11-17', avatar: avatar('🔨', '#DB2777'), level: 4, xp: 3500,
    employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-contractor-1', name: 'Éric Cladding', nip: '2001', role: 'employee', hourlyRate: 0,
    workerType: 'contractor', workMode: 'sqft', asNumber: 'TEST-ST01', phone: '403-555-0201', address: 'Calgary, Alberta',
    hireDate: '2025-07-01', avatar: avatar('🏗️', '#D97706'), level: 6, xp: 5600,
    businessName: 'Éric Cladding Ltd.', gstNumber: 'TEST-GST-01', employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-contractor-2', name: 'Nadia Exteriors', nip: '2002', role: 'employee', hourlyRate: 0,
    workerType: 'contractor', workMode: 'flat', asNumber: 'TEST-ST02', phone: '403-555-0202', address: 'Chestermere, Alberta',
    hireDate: '2025-09-01', avatar: avatar('🏠', '#059669'), level: 5, xp: 4300,
    businessName: 'Nadia Exteriors Inc.', gstNumber: 'TEST-GST-02', employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-contractor-3', name: 'Samuel Roofing', nip: '2003', role: 'employee', hourlyRate: 0,
    workerType: 'contractor', workMode: 'sqft', asNumber: 'TEST-ST03', phone: '403-555-0203', address: 'Strathmore, Alberta',
    hireDate: '2026-04-01', avatar: avatar('🧰', '#4F46E5'), level: 3, xp: 1800,
    businessName: 'Samuel Roofing & Siding', gstNumber: 'TEST-GST-03', employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-former-1', name: 'Julien Mercier', nip: '9001', role: 'employee', hourlyRate: 32,
    workerType: 'Ancien employé — départ volontaire le 13 février 2026', asNumber: 'TEST-H01', phone: '403-555-0901',
    address: 'Calgary, Alberta', hireDate: '2025-07-02', avatar: avatar('👷', '#64748B'), level: 3, xp: 2100,
    employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  },
  {
    id: 'test-former-2', name: 'Karine Pelletier', nip: '9002', role: 'employee', hourlyRate: 33,
    workerType: 'Ancienne employée — fin d’emploi le 1er mai 2026', asNumber: 'TEST-H02', phone: '403-555-0902',
    address: 'Calgary, Alberta', hireDate: '2025-08-18', avatar: avatar('👷‍♀️', '#475569'), level: 3, xp: 1900,
    employeeProvince: 'AB', payFrequency: 'weekly', credentials: []
  }
];

export const TEST_PIN_DIRECTORY = [
  'Administrateur Test — 0000',
  'Sophie Bureau — 1001',
  'Marc Comptable — 1002',
  'Employés actifs — 1003 à 1006',
  'Sous-traitants actifs — 2001 à 2003'
];
