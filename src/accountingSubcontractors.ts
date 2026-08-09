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

/** Seuil de déclaration et formulaire applicables, selon le pays et l'année. */
export function reportingThreshold(
  country: string | undefined,
  year: number
): { amount: number; form: string } | null {
  const code = String(country || '').toUpperCase();
  if (code === 'CA') return { amount: 500, form: 'T5018' };
  // Le seuil du 1099-NEC est passé de 600 $ à 2 000 $ pour les paiements
  // postérieurs au 31 décembre 2025.
  if (code === 'US') return { amount: year >= 2026 ? 2000 : 600, form: '1099-NEC' };
  return null;
}

/** Un sous-traitant se reconnaît à son type de travailleur, seul champ que le
 *  client conserve — le rôle « sous-traitant » de la base est ramené à
 *  « employé » au chargement. */
export function isSubcontractor(employee: Pick<Employee, 'workerType'>): boolean {
  return employee.workerType === 'contractor';
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
  meetsThreshold: boolean;
}

export interface SubcontractorSummary {
  rows: SubcontractorTotal[];
  /** Personnes payées dont le type de travailleur n'est pas renseigné : elles
   *  ne sont ni salariées ni sous-traitantes aux yeux de l'application, et
   *  seraient donc absentes d'une déclaration sans que rien ne le signale. */
  unclassified: Array<{ employeeId: string; name: string; total: number }>;
}

export function summarizeSubcontractorPayments(
  employees: Employee[],
  payments: PayrollPayment[],
  threshold: number | null
): SubcontractorSummary {
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const totals = new Map<string, { count: number; total: number }>();

  for (const payment of payments) {
    if (payment.status !== 'paid') continue;
    const current = totals.get(payment.employeeId) || { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(payment.amount || 0);
    totals.set(payment.employeeId, current);
  }

  const rows: SubcontractorTotal[] = [];
  const unclassified: SubcontractorSummary['unclassified'] = [];

  for (const [employeeId, sums] of totals) {
    const employee = byId.get(employeeId);
    const name = employee?.name || '';
    if (!employee || !employee.workerType) {
      // Type absent : on ne devine pas, on le signale.
      unclassified.push({ employeeId, name, total: sums.total });
      continue;
    }
    if (!isSubcontractor(employee)) continue;
    rows.push({
      employeeId,
      name,
      businessName: employee.businessName || '',
      taxNumber: employee.gstNumber || '',
      address: employee.address || '',
      phone: employee.phone || '',
      paymentCount: sums.count,
      total: sums.total,
      meetsThreshold: threshold === null ? true : sums.total >= threshold
    });
  }

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  unclassified.sort((a, b) => b.total - a.total);
  return { rows, unclassified };
}
