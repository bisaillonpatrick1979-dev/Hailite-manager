import { COMPLIANCE_VERSION } from '../privacyVersions';
import type { CompanyInfo } from './types';

type CompanySnapshot = Partial<CompanyInfo>;

export interface OnboardingResolution {
  companyInfo: CompanySnapshot;
  isOnboarded: boolean;
  shouldSyncLocalCompletion: boolean;
}

const definedValues = (company: CompanySnapshot): CompanySnapshot =>
  Object.fromEntries(
    Object.entries(company).filter(([, value]) => value !== undefined)
  ) as CompanySnapshot;

export function hasCurrentOnboarding(
  company: CompanySnapshot,
  onboardingFlag: boolean
): boolean {
  return onboardingFlag &&
    company.isOnboarded === true &&
    company.complianceVersion === COMPLIANCE_VERSION;
}

/**
 * Résout le seul conflit permis pendant la première connexion : l'appareil a
 * terminé la configuration, mais la compagnie distante ne le sait pas encore.
 * Dans ce cas, l'état local reste visible et sera envoyé au cloud après login.
 */
export function resolveOnboardingState(
  localCompany: CompanySnapshot,
  localOnboardingFlag: boolean,
  remoteCompany: CompanySnapshot
): OnboardingResolution {
  const localComplete = hasCurrentOnboarding(localCompany, localOnboardingFlag);
  const remoteComplete = hasCurrentOnboarding(remoteCompany, remoteCompany.isOnboarded === true);

  if (localComplete && !remoteComplete) {
    return {
      companyInfo: { ...localCompany, isOnboarded: true },
      isOnboarded: true,
      shouldSyncLocalCompletion: true
    };
  }

  const merged = {
    ...localCompany,
    ...definedValues(remoteCompany),
    isOnboarded: remoteComplete
  };

  return {
    companyInfo: merged,
    isOnboarded: remoteComplete,
    shouldSyncLocalCompletion: false
  };
}
