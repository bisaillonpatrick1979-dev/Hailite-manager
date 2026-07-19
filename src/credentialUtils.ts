import type { Employee, EmployeeCredential } from './types';

export type CredentialStatus = 'valid' | 'dueSoon' | 'expired' | 'noExpiry';

export interface CredentialAlertItem {
  employeeId: string;
  employeeName: string;
  credential: EmployeeCredential;
  daysRemaining: number;
  status: 'dueSoon' | 'expired';
}

function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function getCredentialDaysRemaining(expiryDate?: string): number | null {
  const expiry = parseDateOnly(expiryDate || '');
  if (!expiry) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
}

export function getCredentialStatus(credential: EmployeeCredential): CredentialStatus {
  if (credential.doesNotExpire || !credential.expiryDate) return 'noExpiry';
  const daysRemaining = getCredentialDaysRemaining(credential.expiryDate);
  if (daysRemaining === null) return 'noExpiry';
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= Math.max(0, credential.renewalReminderDays ?? 30)) return 'dueSoon';
  return 'valid';
}

export function getCredentialAlerts(employees: Employee[]): CredentialAlertItem[] {
  return employees.flatMap(employee => (employee.credentials || []).flatMap(credential => {
    const status = getCredentialStatus(credential);
    if (status !== 'dueSoon' && status !== 'expired') return [];
    return [{
      employeeId: employee.id,
      employeeName: employee.name,
      credential,
      daysRemaining: getCredentialDaysRemaining(credential.expiryDate) ?? 0,
      status
    }];
  })).sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function addYearsToDate(dateValue: string, years: number): string {
  const base = parseDateOnly(dateValue);
  if (!base) return '';
  base.setFullYear(base.getFullYear() + years);
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${base.getFullYear()}-${month}-${day}`;
}
