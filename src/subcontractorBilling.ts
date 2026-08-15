// Facturation des sous-traitants payés à la pièce.
//
// POURQUOI CE MODULE EXISTE
// `payroll.ts` calcule le brut d'un sous-traitant en faisant heures × taux
// horaire, et rien d'autre. Un punch enregistré en mode « forfait » ou au pied
// carré traversait donc ce calcul avec un taux horaire absent, et ressortait à
// zéro — silencieusement. La quantité posée n'entrait nulle part.
//
// Le partage des rôles retenu :
//   - la QUANTITÉ POSÉE décide de ce que le sous-traitant reçoit ;
//   - les HEURES POINTÉES ne payent pas, elles mesurent le rendement (temps
//     réel pour fermer un projet, pi² à l'heure, taux horaire effectif).
//
// Ces deux chiffres restent séparés partout dans le module. Les confondre ferait
// payer deux fois le même travail.

/** Modes de rémunération, une fois le vocabulaire normalisé. */
export type PayBasis = 'hourly' | 'piece' | 'flat';

/**
 * La base contient les deux vocabulaires : les punches disent « horaire » et
 * « forfait », les fiches employé disent « hourly ». Une comparaison directe
 * `pay_mode === 'hourly'` est donc fausse une fois sur deux selon la table d'où
 * vient la valeur. On normalise en lecture plutôt que de réécrire 50 punches
 * existants.
 */
export function normalizePayBasis(raw: string | null | undefined): PayBasis | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (['hourly', 'horaire', 'heure', 'hour'].includes(value)) return 'hourly';
  if (['piece', 'piecework', 'piece_rate', 'pi2', 'sqft', 'surface', 'quantite', 'quantité'].includes(value)) return 'piece';
  if (['flat', 'forfait', 'fixed', 'lump_sum'].includes(value)) return 'flat';
  return null;
}

// ---------------------------------------------------------------------------
// Résolution du taux
// ---------------------------------------------------------------------------

export interface PayRateRow {
  id: string;
  projectId: string;
  /** null = taux par défaut du projet, appliqué à défaut de ligne nominative. */
  userId: string | null;
  catalogItemId: string | null;
  label: string;
  unit: string;
  rate: number;
}

export interface CatalogRate {
  id: string;
  name: string;
  unit: string;
  /** Taux de pose au pied carré, distinct du prix client et du prix fournisseur. */
  pricePerSqft: number | null;
}

export type RateSource = 'assignment' | 'project_default' | 'catalog';

export interface ResolvedRate {
  rate: number;
  unit: string;
  source: RateSource;
  label: string;
}

/**
 * Taux applicable à un poste, par ordre de priorité : entente nominative sur le
 * projet, puis taux par défaut du projet, puis taux de pose du catalogue.
 *
 * Renvoie null quand aucun taux n'est fixé — et surtout PAS zéro. Un zéro
 * silencieux se propage jusqu'à une facture de 0 $ qui a l'air normale : le
 * sous-traitant a posé sa journée et l'écran affiche un montant, simplement
 * faux. Avec null, l'appelant est forcé de traiter le cas et l'écran peut
 * réclamer que le taux soit fixé avant de facturer quoi que ce soit.
 *
 * Un taux volontairement nul (poste offert, reprise de garantie) reste possible
 * : il faut l'écrire explicitement dans la grille, où il est visible et
 * attribuable à une décision, plutôt que de le laisser surgir d'un trou.
 */
export function resolveRate(
  projectId: string,
  userId: string,
  label: string,
  rates: PayRateRow[],
  catalog: CatalogRate[] = []
): ResolvedRate | null {
  const wanted = label.trim().toLowerCase();
  const onProject = rates.filter(r => r.projectId === projectId && r.label.trim().toLowerCase() === wanted);

  const named = onProject.find(r => r.userId === userId);
  if (named) return { rate: named.rate, unit: named.unit, source: 'assignment', label: named.label };

  const fallback = onProject.find(r => r.userId === null);
  if (fallback) return { rate: fallback.rate, unit: fallback.unit, source: 'project_default', label: fallback.label };

  const item = catalog.find(c => c.name.trim().toLowerCase() === wanted);
  if (item && item.pricePerSqft !== null && item.pricePerSqft !== undefined) {
    return { rate: item.pricePerSqft, unit: item.unit || 'pi2', source: 'catalog', label: item.name };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Montant d'une entrée de production
// ---------------------------------------------------------------------------

export interface ProductionEntryInput {
  projectId: string;
  userId: string;
  label: string;
  quantity: number;
  /** Taux figé à la saisie. Absent pour une entrée neuve : il sera résolu. */
  unitPrice?: number | null;
  unit?: string | null;
}

export interface PricedEntry {
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  source: RateSource | 'snapshot';
}

export interface PricingProblem {
  label: string;
  quantity: number;
  reason: 'no_rate' | 'invalid_quantity';
}

export interface PricingResult {
  priced: PricedEntry[];
  problems: PricingProblem[];
  total: number;
}

/** Arrondi au cent. Les flottants accumulés produisent sinon des totaux à
 *  0,004 $ près qui ne réconcilient pas avec la facture imprimée. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Chiffre une série de quantités posées.
 *
 * Un `unitPrice` déjà enregistré fait foi : c'est l'instantané du taux au moment
 * de la saisie. Modifier la grille pour un prochain chantier ne doit pas
 * réécrire ce qui a déjà été convenu et peut-être déjà payé.
 *
 * Les entrées sans taux ne sont pas chiffrées à zéro : elles sortent dans
 * `problems`, pour que l'écran refuse de produire la facture tant qu'elles ne
 * sont pas réglées.
 */
export function priceProduction(
  entries: ProductionEntryInput[],
  rates: PayRateRow[],
  catalog: CatalogRate[] = []
): PricingResult {
  const priced: PricedEntry[] = [];
  const problems: PricingProblem[] = [];

  for (const entry of entries) {
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      problems.push({ label: entry.label, quantity: entry.quantity, reason: 'invalid_quantity' });
      continue;
    }

    if (entry.unitPrice !== null && entry.unitPrice !== undefined && Number.isFinite(entry.unitPrice)) {
      const unitPrice = Number(entry.unitPrice);
      priced.push({
        label: entry.label,
        quantity,
        unit: entry.unit || 'pi2',
        unitPrice,
        amount: toCents(quantity * unitPrice),
        source: 'snapshot'
      });
      continue;
    }

    const resolved = resolveRate(entry.projectId, entry.userId, entry.label, rates, catalog);
    if (!resolved) {
      problems.push({ label: entry.label, quantity, reason: 'no_rate' });
      continue;
    }

    priced.push({
      label: resolved.label,
      quantity,
      unit: resolved.unit,
      unitPrice: resolved.rate,
      amount: toCents(quantity * resolved.rate),
      source: resolved.source
    });
  }

  return { priced, problems, total: toCents(priced.reduce((sum, p) => sum + p.amount, 0)) };
}

// ---------------------------------------------------------------------------
// Heures : affichage et rendement
// ---------------------------------------------------------------------------

/**
 * Heures décimales en heures et minutes.
 *
 * 6,32 h se lit spontanément « 6 h 32 » alors que ce sont 6 h 19. Sur une
 * facture, l'écart se conteste. Les deux formes doivent apparaître.
 */
export function formatHours(decimalHours: number): string {
  if (!Number.isFinite(decimalHours) || decimalHours < 0) return '—';
  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

export interface ProjectPerformance {
  totalHours: number;
  totalQuantity: number;
  unit: string;
  labourCost: number;
  /** Quantité posée par heure travaillée. null si aucune heure pointée. */
  quantityPerHour: number | null;
  /** Ce que le sous-traitant gagne réellement à l'heure. null si aucune heure. */
  effectiveHourlyRate: number | null;
  /** Coût de pose par unité. null si rien n'a été posé. */
  costPerUnit: number | null;
}

/**
 * Rendement d'un chantier : ce que les heures servent à mesurer une fois
 * qu'elles ne payent plus.
 *
 * Les ratios valent null plutôt que zéro quand le dénominateur est absent. Un
 * chantier sans heure pointée n'a pas un rendement de zéro pi²/h : il a un
 * rendement inconnu, et l'écran doit le dire.
 */
export function projectPerformance(
  totalHours: number,
  pricing: PricingResult,
  unit = 'pi2'
): ProjectPerformance {
  const hours = Number.isFinite(totalHours) && totalHours > 0 ? totalHours : 0;
  const matching = pricing.priced.filter(p => p.unit === unit);
  const quantity = matching.reduce((sum, p) => sum + p.quantity, 0);
  const cost = toCents(matching.reduce((sum, p) => sum + p.amount, 0));

  return {
    totalHours: hours,
    totalQuantity: quantity,
    unit,
    labourCost: cost,
    quantityPerHour: hours > 0 ? Math.round((quantity / hours) * 100) / 100 : null,
    effectiveHourlyRate: hours > 0 ? toCents(cost / hours) : null,
    costPerUnit: quantity > 0 ? Math.round((cost / quantity) * 10000) / 10000 : null
  };
}
