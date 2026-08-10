// Calcul de paie : brut, retenues à la source et net.
//
// POURQUOI CE MODULE EXISTE
// Ce calcul vivait au milieu d'App.tsx, enfermé dans la fermeture du composant
// React. Il était donc impossible à tester autrement qu'en ouvrant un
// navigateur — pour du code qui décide de ce que touchent les employés. Le
// comportement est repris à l'identique ; seules les dépendances implicites
// (pays, région, taux de la province) deviennent des paramètres explicites.

import type { CompanyInfo, Employee } from './types';
import type { MarketCode } from './internationalRegions';
import {
  type TaxRegion, type RegionPayrollMeta,
  CA_FEDERAL_BRACKETS, CA_PROVINCIAL_BRACKETS, CA_PROVINCIAL_FALLBACK_RATE,
  CA_PENSION_CAP, CA_EMPLOYMENT_INSURANCE_CAP,
  computeBracketTax, cappedAnnualContribution
} from './regionsData';
import { type HoursBreakdown, grossFromBreakdown, resolveOvertimeRules } from './overtime';

/** Contexte fiscal de la compagnie, jusqu'ici capté implicitement par le composant. */
export interface PayrollContext {
  country: MarketCode;
  region: TaxRegion;
  payrollMeta: RegionPayrollMeta;
}

export interface PayrollBreakdown {
  gross: number;
  vacationAmount: number;
  cpp: number;
  ei: number;
  fedTax: number;
  provTax: number;
  health: number;
  dental: number;
  life: number;
  ltd: number;
  rrsp: number;
  eap: number;
  custom1: number;
  custom2: number;
  gst: number;
  qst: number;
  totalTaxes: number;
  totalDeductions: number;
  net: number;
}

/** Nombre de périodes de paie dans une année selon la fréquence choisie. */
export function periodsPerYear(frequency: Employee['payFrequency']): number {
  if (frequency === 'biweekly') return 26;
  if (frequency === 'semi-monthly') return 24;
  if (frequency === 'monthly') return 12;
  return 52;
}

/**
 * Impôt progressif annuel.
 * Hors Canada, l'impôt fédéral/de l'État n'est pas modélisé : l'interface
 * affiche une mention « à valider » plutôt qu'un chiffre inventé.
 */
export function progressiveTax(annualGross: number, isFederal: boolean, context: PayrollContext): number {
  if (context.country !== 'CA') return 0;
  if (isFederal) return computeBracketTax(annualGross, CA_FEDERAL_BRACKETS);
  const brackets = CA_PROVINCIAL_BRACKETS[context.region.code];
  return brackets ? computeBracketTax(annualGross, brackets) : annualGross * CA_PROVINCIAL_FALLBACK_RATE;
}

/**
 * Paie détaillée d'un employé pour une période.
 *
 * `hours` accepte soit un total simple (traité comme entièrement régulier),
 * soit une répartition régulier/supplémentaire issue de `computeHoursBreakdown`.
 */
export function calculateDetailedPayroll(
  emp: Employee,
  company: CompanyInfo,
  hours: number | HoursBreakdown,
  context: PayrollContext
): PayrollBreakdown {
  const breakdown: HoursBreakdown = typeof hours === 'number'
    ? { regularHours: hours, overtimeHours: 0, totalHours: hours, byDay: [] }
    : hours;
  const overtimeMultiplier = resolveOvertimeRules(company, emp).multiplier;
  let gross = grossFromBreakdown(breakdown, emp.hourlyRate, overtimeMultiplier);

  // Sous-traitant : aucune retenue à la source ; on ajoute les taxes de vente
  // de la région lorsqu'il est inscrit.
  if (emp.workerType === 'contractor') {
    const hasGst = !!emp.gstNumber;
    const gst = hasGst ? gross * context.region.taxRate1 : 0;
    const qst = hasGst ? gross * context.region.taxRate2 : 0;
    const totalTaxes = gst + qst;
    return {
      gross, vacationAmount: 0,
      cpp: 0, ei: 0, fedTax: 0, provTax: 0,
      health: 0, dental: 0, life: 0, ltd: 0, rrsp: 0, eap: 0, custom1: 0, custom2: 0,
      gst, qst, totalTaxes,
      totalDeductions: 0,
      net: gross + totalTaxes
    };
  }

  const periods = periodsPerYear(emp.payFrequency);

  // Un salaire annuel fixe remplace le calcul horaire.
  if (emp.annualSalary && emp.annualSalary > 0) {
    gross = emp.annualSalary / periods;
  }

  const vacRate = emp.vacationRateOverride !== undefined
    ? emp.vacationRateOverride
    : (company.payrollVacationRate !== undefined ? company.payrollVacationRate : 6);
  const vacationAmount = gross * (vacRate / 100);

  // Retenues à la source. Les cotisations RRQ/RPC et AE s'arrêtent une fois le
  // maximum annuel atteint : sans ce plafond, la paie surévaluait les retenues
  // des meilleurs salaires toute l'année durant.
  const annualGross = gross * periods;
  const cpp = context.country === 'CA'
    ? cappedAnnualContribution(annualGross, context.payrollMeta.pensionRate, CA_PENSION_CAP) / periods
    : gross * context.payrollMeta.pensionRate;
  const ei = context.country === 'CA'
    ? cappedAnnualContribution(annualGross, context.payrollMeta.secondaryDeductionRate, CA_EMPLOYMENT_INSURANCE_CAP) / periods
    : gross * context.payrollMeta.secondaryDeductionRate;
  const fedTax = progressiveTax(annualGross, true, context) / periods;
  const provTax = progressiveTax(annualGross, false, context) / periods;

  const health = company.payrollHealthInsurance || 0;
  const dental = company.payrollDentalInsurance || 0;
  const life = company.payrollLifeInsurance || 0;
  const ltd = company.payrollLTD || 0;
  const rrsp = gross * ((company.payrollRRSP || 0) / 100);
  const eap = company.payrollEAP || 0;
  const custom1 = company.payrollCustom1Amount || 0;
  const custom2 = company.payrollCustom2Amount || 0;

  const totalDeductions = cpp + ei + fedTax + provTax + health + dental + life + ltd + rrsp + eap + custom1 + custom2;

  return {
    gross, vacationAmount,
    cpp, ei, fedTax, provTax,
    health, dental, life, ltd, rrsp, eap, custom1, custom2,
    gst: 0, qst: 0, totalTaxes: 0,
    totalDeductions,
    // Borné à zéro : des retenues fixes (assurances, RVER) supérieures au brut
    // d'une courte période produiraient sinon un net négatif à l'écran.
    net: Math.max(0, (gross + vacationAmount) - totalDeductions)
  };
}
