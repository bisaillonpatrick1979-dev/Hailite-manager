import type {
  ExpenseRecord, HRAlert, MotivationGoal, MotivationTeam, SupplierOrder, WeeklyGoal
} from './types';
import { TEST_EMPLOYEES } from './testProfiles';
import { TEST_PERIOD_END, TEST_PROJECT_META } from './testDataCore';

const round2 = (value: number) => Math.round(value * 100) / 100;
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = asDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateOnly(value);
};
const minDate = (a: string, b: string) => (a < b ? a : b);

function randomGenerator(seed = 20260720) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
const random = randomGenerator();

function expenseDate(start: string, end: string, offset: number) {
  return minDate(addDays(start, offset), minDate(end, TEST_PERIOD_END));
}

function buildExpenses(): ExpenseRecord[] {
  const expenses: ExpenseRecord[] = [];
  let sequence = 1;
  const add = (
    provider: string,
    category: ExpenseRecord['category'],
    projectId: string,
    amount: number,
    date: string,
    notes: string
  ) => {
    expenses.push({
      id: `test-expense-${String(sequence++).padStart(4, '0')}`,
      provider,
      category,
      projectId,
      amount: round2(amount),
      tax: round2(amount * 0.05),
      date,
      notes
    });
  };

  TEST_PROJECT_META.filter(project => project.id !== 'test-project-admin').forEach(project => {
    add('Convoy Supply Calgary', 'materials', project.id, project.subtotal * 0.255, expenseDate(project.start, project.end, 3), `Matériaux principaux — ${project.service}`);
    add('Roofmart Calgary', 'materials', project.id, project.subtotal * 0.045, expenseDate(project.start, project.end, 8), 'Soffite, fascia, solins et accessoires');
    add('Petro-Canada Fleet', 'fuel', project.id, project.subtotal * 0.012, expenseDate(project.start, project.end, 5), 'Carburant des véhicules et livraisons');
    add(project.commercial ? 'United Rentals' : 'Skyline Scaffold Rentals', 'rental', project.id, project.subtotal * (project.commercial ? 0.038 : 0.022), expenseDate(project.start, project.end, 2), 'Nacelle, échafaudage et protection du chantier');
    if (project.assignedEmployees.some(id => id.startsWith('test-contractor-'))) {
      add('Sous-traitance spécialisée', 'subcontractor', project.id, project.subtotal * 0.065, expenseDate(project.start, project.end, 14), 'Travaux spécialisés facturés au projet');
    }
    add('Calgary Waste Services', 'other', project.id, project.subtotal * 0.014, expenseDate(project.start, project.end, 10), 'Conteneur, transport et frais de disposition');
  });

  const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  months.forEach((month, index) => {
    add('Bureau Hailite', 'admin', 'test-project-admin', 2350, `${month}-01`, 'Loyer du bureau et de l’entrepôt');
    add('Intact Assurance', 'admin', 'test-project-admin', 690, `${month}-05`, 'Assurances responsabilité, véhicules et équipements');
    add('Ford Credit', 'admin', 'test-project-admin', 1825, `${month}-08`, 'Paiements des véhicules de service');
    add('Télécommunications et logiciels', 'admin', 'test-project-admin', 375 + index * 8, `${month}-12`, 'Téléphonie, logiciels et stockage');
    add('Marketing local', 'admin', 'test-project-admin', index < 3 ? 650 : 950 + (index % 3) * 125, `${month}-18`, 'Publicité locale et acquisition de clients');
  });

  return expenses.sort((a, b) => a.date.localeCompare(b.date));
}

export const TEST_EXPENSES = buildExpenses();

function buildOrders(): SupplierOrder[] {
  const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  const suppliers = ['Convoy Supply Calgary', 'Roofmart Calgary', 'Lansing Building Products'];
  const orders: SupplierOrder[] = [];
  let sequence = 1;

  months.forEach((month, monthIndex) => {
    for (let orderIndex = 0; orderIndex < 2; orderIndex += 1) {
      const first = round2(2800 + random() * 6200 + monthIndex * 190);
      const second = round2(900 + random() * 2400);
      const status: SupplierOrder['status'] = month === '2026-06' && orderIndex === 1
        ? 'ordered'
        : month === '2026-06' ? 'pending' : 'received';
      orders.push({
        id: `test-order-${String(sequence++).padStart(3, '0')}`,
        supplierName: suppliers[(monthIndex + orderIndex) % suppliers.length],
        date: `${month}-${orderIndex === 0 ? '04' : '19'}`,
        items: [
          { name: orderIndex === 0 ? 'Revêtement et panneaux' : 'Soffite, fascia et moulures', quantity: Math.round(12 + random() * 28), price: first },
          { name: 'Accessoires, solins et consommables', quantity: Math.round(20 + random() * 45), price: second }
        ],
        status,
        totalAmount: round2(first + second)
      });
    }
  });
  return orders;
}

export const TEST_ORDERS = buildOrders();

export const TEST_HR_ALERTS: HRAlert[] = [
  { id: 'test-hr-01', type: 'info', title: 'Embauche de Liam Tremblay', message: 'Entrée en fonction comme poseur de revêtement.', date: '2025-07-08', employeeId: 'test-employee-1', employeeName: 'Liam Tremblay', resolved: true },
  { id: 'test-hr-02', type: 'info', title: 'Embauche de Sophie Bureau', message: 'Création du poste de secrétaire et coordonnatrice.', date: '2025-08-04', employeeId: 'test-secretary', employeeName: 'Sophie Bureau', resolved: true },
  { id: 'test-hr-03', type: 'info', title: 'Embauche d’Emma Roy', message: 'Début de l’apprentissage en revêtement extérieur.', date: '2025-09-15', employeeId: 'test-employee-2', employeeName: 'Emma Roy', resolved: true },
  { id: 'test-hr-04', type: 'info', title: 'Embauche de Marc Comptable', message: 'Mise en place de la comptabilité interne et de la paie.', date: '2025-10-20', employeeId: 'test-accountant', employeeName: 'Marc Comptable', resolved: true },
  { id: 'test-hr-05', type: 'info', title: 'Embauche d’Olivia Martin', message: 'Spécialiste soffite et fascia.', date: '2025-11-17', employeeId: 'test-employee-4', employeeName: 'Olivia Martin', resolved: true },
  { id: 'test-hr-06', type: 'info', title: 'Départ volontaire — Julien Mercier', message: 'Dernière journée le 13 février 2026. Dossier de paie fermé et outils retournés.', date: '2026-02-13', employeeId: 'test-former-1', employeeName: 'Julien Mercier', resolved: true },
  { id: 'test-hr-07', type: 'warning', title: 'Fin d’emploi — Karine Pelletier', message: 'Fin d’emploi documentée le 1er mai 2026 après le processus disciplinaire.', date: '2026-05-01', employeeId: 'test-former-2', employeeName: 'Karine Pelletier', resolved: true },
  { id: 'test-hr-08', type: 'info', title: 'Promotion de Noah Gagnon', message: 'Promotion au poste de chef d’équipe chantier.', date: '2026-03-02', employeeId: 'test-employee-3', employeeName: 'Noah Gagnon', resolved: true },
  { id: 'test-hr-09', type: 'warning', title: 'Renouvellement protection contre les chutes', message: 'La formation de Liam doit être renouvelée avant le 31 juillet 2026.', date: '2026-06-18', employeeId: 'test-employee-1', employeeName: 'Liam Tremblay', resolved: false },
  { id: 'test-hr-10', type: 'danger', title: 'WCB — vérification annuelle', message: 'Valider le dossier WCB et le taux de prime avant la prochaine paie.', date: '2026-06-24', resolved: false },
  { id: 'test-hr-11', type: 'warning', title: 'Inspection des harnais', message: 'Deux harnais doivent être inspectés et consignés.', date: '2026-06-27', employeeId: 'test-employee-3', employeeName: 'Noah Gagnon', resolved: false }
];

export const TEST_TEAMS: MotivationTeam[] = [
  { id: 'test-team-01', name: 'Équipe Nord', memberIds: ['test-employee-3', 'test-employee-1', 'test-employee-2'], color: '#F97316', active: true, createdAt: '2025-09-15', leaderId: 'test-employee-3', projectIds: ['test-project-17', 'test-project-18'] },
  { id: 'test-team-02', name: 'Équipe Finitions', memberIds: ['test-employee-4', 'test-contractor-2'], color: '#0EA5E9', active: true, createdAt: '2025-11-17', leaderId: 'test-employee-4', projectIds: ['test-project-17'] },
  { id: 'test-team-03', name: 'Partenaires spécialisés', memberIds: ['test-contractor-1', 'test-contractor-3'], color: '#22C55E', active: true, createdAt: '2026-04-01', projectIds: ['test-project-18', 'test-project-19'] }
];

export const TEST_GOALS: MotivationGoal[] = [
  { id: 'test-goal-01', title: 'Atteindre 150 000 $ de contrats au trimestre', scope: 'company', metric: 'revenue', target: 150000, current: 164200, startDate: '2025-07-01', endDate: '2025-09-30', rewardType: 'lunch', rewardTitle: 'Dîner d’équipe', status: 'achieved' },
  { id: 'test-goal-02', title: '60 jours sans incident', scope: 'company', metric: 'safety_days', target: 60, current: 60, startDate: '2025-10-01', endDate: '2025-11-29', rewardType: 'draw', rewardTitle: 'Tirage d’équipement', status: 'achieved' },
  { id: 'test-goal-03', title: 'Livrer Foothills avant le 31 janvier', scope: 'team', metric: 'jobs_completed', target: 1, current: 1, startDate: '2025-12-01', endDate: '2026-01-31', teamId: 'test-team-01', rewardType: 'bonus', rewardTitle: 'Prime de livraison', status: 'achieved' },
  { id: 'test-goal-04', title: 'Augmenter la productivité Hardie', scope: 'individual', metric: 'hours', target: 420, current: 438, startDate: '2026-03-01', endDate: '2026-05-31', employeeId: 'test-employee-1', rewardType: 'gift', rewardTitle: 'Nouvel ensemble d’outils', status: 'achieved' },
  { id: 'test-goal-05', title: 'Terminer Currie Barracks sans reprise', scope: 'team', metric: 'checklist_done', target: 48, current: 19, startDate: '2026-06-08', endDate: '2026-08-28', teamId: 'test-team-01', rewardType: 'bonus', rewardTitle: 'Prime qualité', status: 'active' },
  { id: 'test-goal-06', title: 'Atteindre 250 000 $ de chiffre d’affaires estival', scope: 'company', metric: 'revenue', target: 250000, current: 87500, startDate: '2026-06-01', endDate: '2026-08-31', rewardType: 'trip', rewardTitle: 'Sortie d’équipe', status: 'active' }
];

export const TEST_WEEKLY_GOALS: WeeklyGoal[] = TEST_EMPLOYEES
  .filter(employee => !employee.id.startsWith('test-former-'))
  .map((employee, index) => ({
    employeeId: employee.id,
    targetAmount: employee.id.startsWith('test-contractor-') ? 2400 : employee.role === 'employee' ? 1600 : 2100,
    currentAmount: round2((900 + index * 137) % 2300),
    weekStart: '2026-06-29',
    xpPoints: employee.xp,
    level: employee.level,
    streak: 2 + (index % 6),
    lastPunchDate: employee.role === 'employee' ? '2026-06-30' : null
  }));
