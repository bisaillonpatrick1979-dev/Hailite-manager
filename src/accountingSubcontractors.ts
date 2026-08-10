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

export interface ReportingThreshold {
  /** Montant du seuil, ou null quand il n'est pas connu pour cette année-là. */
  amount: number | null;
  form: string;
  /** Le T5018 vise les paiements de plus de 500 $; le 1099-NEC part du seuil. */
  inclusive: boolean;
}

/**
 * Seuil de déclaration et formulaire applicables, selon le pays et l'année.
 *
 * Le montant peut être null, et c'est volontaire. Le seuil américain était de
 * 600 $ jusqu'en 2025, passe à 2 000 $ en 2026, puis devient indexé. Écrire
 * « year >= 2026 ? 2000 : 600 » affirmait donc 2 000 $ pour 2027, 2028 et les
 * suivantes — un chiffre qui deviendra faux sans que rien ne le signale, sur un
 * écran qui sert à produire des feuillets fiscaux. Mieux vaut avouer qu'on ne
 * sait pas que d'affirmer un montant périmé.
 */
export function reportingThreshold(
  country: string | undefined,
  year: number
): ReportingThreshold | null {
  const code = String(country || '').toUpperCase();
  if (code === 'CA') return { amount: 500, form: 'T5018', inclusive: false };
  if (code === 'US') {
    if (year <= 2025) return { amount: 600, form: '1099-NEC', inclusive: true };
    if (year === 2026) return { amount: 2000, form: '1099-NEC', inclusive: true };
    return { amount: null, form: '1099-NEC', inclusive: true };
  }
  return null;
}

/**
 * Le total atteint-il le seuil? Renvoie null quand la question n'a pas de
 * réponse connue — l'écran affiche alors « à valider » plutôt qu'un oui ou un
 * non inventé.
 */
export function meetsReportingThreshold(total: number, threshold: ReportingThreshold | null): boolean | null {
  if (!threshold || threshold.amount === null) return null;
  return threshold.inclusive ? total >= threshold.amount : total > threshold.amount;
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
  /** null quand le seuil de l'année n'est pas connu : l'écran affiche
   *  « à valider » plutôt qu'un oui ou un non inventé. */
  meetsThreshold: boolean | null;
  /** Vrai quand au moins un paiement a été classé d'après la fiche actuelle,
   *  faute d'instantané au moment du versement. */
  classificationInferred: boolean;
}

export interface SubcontractorSummary {
  rows: SubcontractorTotal[];
  /** Personnes payées dont le type de travailleur n'est pas renseigné : elles
   *  ne sont ni salariées ni sous-traitantes aux yeux de l'application, et
   *  seraient donc absentes d'une déclaration sans que rien ne le signale. */
  unclassified: Array<{ employeeId: string; name: string; total: number }>;
  /** Paiements antérieurs à l'instantané, classés d'après la fiche actuelle.
   *  Ils restent dans la déclaration, mais sont nommés pour qu'une personne
   *  vérifie qu'ils étaient bien de cette nature à l'époque. */
  inferred: Array<{ employeeId: string; name: string; total: number; paymentCount: number }>;
}

/**
 * Nature d'un versement au moment où il a été fait.
 *
 * L'instantané pris à l'enregistrement fait foi. Sans lui — versements
 * antérieurs à cette colonne — on retombe sur la fiche actuelle, mais le cas
 * est signalé : classer l'historique d'après le présent réécrit les
 * déclarations passées. Quelqu'un qui était sous-traitant en 2024 et qu'on
 * embauche comme salarié en 2026 verrait ses paiements de 2024 disparaître du
 * T5018 déjà produit.
 */
function classificationOfPayment(
  payment: PayrollPayment,
  employee: Employee | undefined
): { type: string | undefined; inferred: boolean } {
  const snapshot = payment.workerTypeAtPayment;
  if (snapshot) return { type: snapshot, inferred: false };
  return { type: employee?.workerType, inferred: true };
}

export function summarizeSubcontractorPayments(
  employees: Employee[],
  payments: PayrollPayment[],
  threshold: ReportingThreshold | null
): SubcontractorSummary {
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const totals = new Map<string, {
    count: number; total: number;
    contractorTotal: number; contractorCount: number;
    inferredTotal: number; inferredCount: number;
    seenType: boolean;
  }>();

  for (const payment of payments) {
    if (payment.status !== 'paid') continue;
    const employee = byId.get(payment.employeeId);
    const { type, inferred } = classificationOfPayment(payment, employee);
    const current = totals.get(payment.employeeId) || {
      count: 0, total: 0, contractorTotal: 0, contractorCount: 0,
      inferredTotal: 0, inferredCount: 0, seenType: false
    };
    const amount = Number(payment.amount || 0);
    current.count += 1;
    current.total += amount;
    if (type) {
      current.seenType = true;
      if (type === 'contractor') {
        current.contractorCount += 1;
        current.contractorTotal += amount;
        if (inferred) {
          current.inferredCount += 1;
          current.inferredTotal += amount;
        }
      }
    }
    totals.set(payment.employeeId, current);
  }

  const rows: SubcontractorTotal[] = [];
  const unclassified: SubcontractorSummary['unclassified'] = [];
  const inferredRows: SubcontractorSummary['inferred'] = [];

  for (const [employeeId, sums] of totals) {
    const employee = byId.get(employeeId);
    const name = employee?.name || '';
    if (!sums.seenType) {
      // Aucun versement n'a de nature connue : on ne devine pas, on le signale.
      unclassified.push({ employeeId, name, total: sums.total });
      continue;
    }
    if (sums.contractorCount === 0) continue;

    rows.push({
      employeeId,
      name,
      businessName: employee?.businessName || '',
      taxNumber: employee?.gstNumber || '',
      address: employee?.address || '',
      phone: employee?.phone || '',
      paymentCount: sums.contractorCount,
      total: sums.contractorTotal,
      meetsThreshold: meetsReportingThreshold(sums.contractorTotal, threshold),
      classificationInferred: sums.inferredCount > 0
    });

    if (sums.inferredCount > 0) {
      inferredRows.push({
        employeeId, name,
        total: sums.inferredTotal,
        paymentCount: sums.inferredCount
      });
    }
  }

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  unclassified.sort((a, b) => b.total - a.total);
  inferredRows.sort((a, b) => b.total - a.total);
  return { rows, unclassified, inferred: inferredRows };
}
