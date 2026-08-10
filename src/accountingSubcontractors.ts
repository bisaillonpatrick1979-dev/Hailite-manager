import type { Employee, PayrollPayment } from './types';

// ---------------------------------------------------------------------------
// Cumul des paiements par sous-traitant
// ---------------------------------------------------------------------------
// Une entreprise dont plus de la moitié du revenu vient de la construction doit
// déclarer ce qu'elle a versé à chaque sous-traitant : T5018 au Canada,
// 1099-NEC aux États-Unis. Sans ce cumul, le comptable reconstitue les montants
// à la main à partir des heures, ce qui est long et faux dès qu'un versement ne
// correspond pas exactement aux heures pointées.
//
// Base retenue : les versements réellement effectués (statut « payé »), pas les
// heures travaillées ni les factures reçues. C'est ce qui est déclaré.

export type CanonicalWorkerType = 'salaried' | 'contractor';

export interface ReportingThreshold {
  amount: number | null;
  form: string;
  currency: 'CAD' | 'USD';
  /** Le T5018 s'applique à plus de 500 $, tandis que le 1099-NEC est à partir
   *  du seuil indiqué. */
  inclusive: boolean;
}

/** Seuil de déclaration et formulaire applicables, selon le pays et l'année. */
export function reportingThreshold(
  country: string | undefined,
  year: number
): ReportingThreshold | null {
  const code = String(country || '').toUpperCase();
  if (code === 'CA') return { amount: 500, form: 'T5018', currency: 'CAD', inclusive: false };
  if (code === 'US') {
    if (year <= 2025) return { amount: 600, form: '1099-NEC', currency: 'USD', inclusive: true };
    if (year === 2026) return { amount: 2000, form: '1099-NEC', currency: 'USD', inclusive: true };
    // À partir de 2027, le seuil américain est indexé. Une valeur écrite en
    // dur deviendrait silencieusement fausse; l'interface exige donc une
    // validation annuelle avant d'afficher oui/non.
    return { amount: null, form: '1099-NEC', currency: 'USD', inclusive: true };
  }
  return null;
}

function dateKey(value: string): { key: string; year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { key: value, year, month, day };
}

/**
 * Retourne l'année de fin seulement lorsque la plage représente une période
 * de déclaration complète. Le Canada permet un exercice fiscal de douze mois;
 * le 1099-NEC américain est évalué sur l'année civile.
 */
export function reportingYearForPeriod(
  country: string | undefined,
  from: string,
  to: string
): number | null {
  const start = dateKey(from);
  const end = dateKey(to);
  if (!start || !end || start.key > end.key) return null;
  const code = String(country || '').toUpperCase();
  if (code === 'US') {
    return start.month === 1 && start.day === 1 && end.month === 12 && end.day === 31 && start.year === end.year
      ? end.year
      : null;
  }
  if (code !== 'CA') return null;

  const expectedEnd = new Date(Date.UTC(start.year + 1, start.month - 1, start.day));
  expectedEnd.setUTCDate(expectedEnd.getUTCDate() - 1);
  const expectedKey = `${expectedEnd.getUTCFullYear()}-${String(expectedEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(expectedEnd.getUTCDate()).padStart(2, '0')}`;
  return expectedKey === end.key ? end.year : null;
}

export function canonicalWorkerType(value: unknown): CanonicalWorkerType | null {
  return value === 'salaried' || value === 'contractor' ? value : null;
}

export function meetsReportingThreshold(total: number, threshold: ReportingThreshold | null): boolean | null {
  if (!threshold || threshold.amount === null) return null;
  return threshold.inclusive ? total >= threshold.amount : total > threshold.amount;
}

/** Un sous-traitant se reconnaît à son type de travailleur, seul champ que le
 *  client conserve — le rôle « sous-traitant » de la base est ramené à
 *  « employé » au chargement. */
export function isSubcontractor(employee: Pick<Employee, 'workerType'>): boolean {
  return canonicalWorkerType(employee.workerType) === 'contractor';
}

export interface SubcontractorTotal {
  employeeId: string;
  name: string;
  businessName: string;
  taxNumber: string;
  address: string;
  phone: string;
  paymentCount: number;
  total: number;
  meetsThreshold: boolean | null;
  classificationInferred: boolean;
}

export interface SubcontractorSummary {
  rows: SubcontractorTotal[];
  /** Personnes payées dont le type de travailleur n'est pas renseigné : elles
   *  ne sont ni salariées ni sous-traitantes aux yeux de l'application, et
   *  seraient donc absentes d'une déclaration sans que rien ne le signale. */
  unclassified: Array<{ employeeId: string; name: string; total: number }>;
  /** Paiements historiques antérieurs au champ d'instantané. Ils sont classés
   *  avec la fiche actuelle, mais restent signalés pour validation humaine. */
  inferred: Array<{
    employeeId: string;
    name: string;
    total: number;
    paymentCount: number;
    classification: CanonicalWorkerType;
  }>;
}

export function summarizeSubcontractorPayments(
  employees: Employee[],
  payments: PayrollPayment[],
  threshold: ReportingThreshold | null
): SubcontractorSummary {
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const contractorTotals = new Map<string, { count: number; total: number; name: string; inferred: boolean }>();
  const unclassifiedTotals = new Map<string, { total: number; name: string }>();
  const inferredTotals = new Map<string, {
    total: number;
    count: number;
    name: string;
    classification: CanonicalWorkerType;
  }>();

  for (const payment of payments) {
    if (payment.status !== 'paid') continue;
    const employee = byId.get(payment.employeeId);
    const amount = Number(payment.amount || 0);
    const name = employee?.name || payment.employeeName || '';
    const snapshot = canonicalWorkerType(payment.workerTypeAtPayment);
    const currentType = canonicalWorkerType(employee?.workerType);
    const classification = snapshot || currentType;
    const inferred = !snapshot && Boolean(currentType);

    if (!classification) {
      const current = unclassifiedTotals.get(payment.employeeId) || { total: 0, name };
      current.total += amount;
      if (!current.name) current.name = name;
      unclassifiedTotals.set(payment.employeeId, current);
      continue;
    }

    if (inferred) {
      const current = inferredTotals.get(payment.employeeId) || {
        total: 0,
        count: 0,
        name,
        classification
      };
      current.total += amount;
      current.count += 1;
      if (!current.name) current.name = name;
      inferredTotals.set(payment.employeeId, current);
    }

    if (classification !== 'contractor') continue;
    const current = contractorTotals.get(payment.employeeId) || { count: 0, total: 0, name, inferred: false };
    current.count += 1;
    current.total += amount;
    current.inferred = current.inferred || inferred;
    if (!current.name) current.name = name;
    contractorTotals.set(payment.employeeId, current);
  }

  const rows: SubcontractorTotal[] = [];
  for (const [employeeId, sums] of contractorTotals) {
    const employee = byId.get(employeeId);
    rows.push({
      employeeId,
      name: sums.name,
      businessName: employee?.businessName || '',
      taxNumber: employee?.gstNumber?.trim() || employee?.sin?.trim() || '',
      address: employee?.address || '',
      phone: employee?.phone || '',
      paymentCount: sums.count,
      total: sums.total,
      meetsThreshold: meetsReportingThreshold(sums.total, threshold),
      classificationInferred: sums.inferred
    });
  }

  const unclassified = Array.from(unclassifiedTotals, ([employeeId, sums]) => ({
    employeeId,
    name: sums.name,
    total: sums.total
  }));
  const inferred = Array.from(inferredTotals, ([employeeId, sums]) => ({
    employeeId,
    name: sums.name,
    total: sums.total,
    paymentCount: sums.count,
    classification: sums.classification
  }));
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  unclassified.sort((a, b) => b.total - a.total);
  inferred.sort((a, b) => b.total - a.total);
  return { rows, unclassified, inferred };
}
