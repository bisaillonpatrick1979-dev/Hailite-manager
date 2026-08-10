// ---------------------------------------------------------------------------
// Portail d'un employé — tout ce qu'il a fait, en une fenêtre
// ---------------------------------------------------------------------------
// On voyait l'équipe en direct sans jamais pouvoir s'arrêter sur une personne.
// En touchant son nom dans une liste, l'administrateur ouvre maintenant son
// dossier : la journée en cours, le mois, l'année, les années passées, les
// chantiers où elle a travaillé, ses versements de paie et ses cartes de
// compétence.
//
// Ce que ce dossier ne montre jamais : le NIP et le numéro d'assurance sociale.
// Le filtre est dans employeeDossier.ts (dossierIdentity) et non ici, pour
// qu'un champ sensible ajouté plus tard au profil ne se retrouve pas à l'écran
// par simple oubli.

import React, { lazy, Suspense, useMemo, useState } from 'react';
import {
  Award, Briefcase, CalendarDays, Clock, DollarSign, Mail, MapPin, Phone,
  ShieldCheck, TrendingUp, X
} from 'lucide-react';
import EmployeeAvatar from './EmployeeAvatar';
import type { Employee, PayrollPayment, Project, PunchSession } from '../types';
import {
  buildEmployeeDossier, dossierIdentity, employeePaidTotal, employeePayrollHistory
} from '../employeeDossier';

const EmployeeWorkCalendar = lazy(() => import('./EmployeeWorkCalendar'));
const EmployeeCredentialsManager = lazy(() => import('./EmployeeCredentialsManager'));

type Language = 'FR' | 'EN';

interface Props {
  employee: Employee;
  punchSessions: PunchSession[];
  projects: Project[];
  payrollPayments: PayrollPayment[];
  currentLanguage: Language;
  dateLocale?: string;
  currency?: string;
  onClose: () => void;
}

export default function EmployeeDossier({
  employee, punchSessions, projects, payrollPayments,
  currentLanguage, dateLocale, currency, onClose
}: Props) {
  const isFrench = currentLanguage === 'FR';
  const t = (fr: string, en: string) => (isFrench ? fr : en);
  const locale = dateLocale || (isFrench ? 'fr-CA' : 'en-CA');
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 0 }).format(value || 0);
  const moneyExact = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'CAD' }).format(value || 0);
  const hours = (value: number) => `${(value || 0).toFixed(1)} h`;

  const identity = useMemo(() => dossierIdentity(employee), [employee]);
  const dossier = useMemo(() => buildEmployeeDossier(employee.id, punchSessions), [employee.id, punchSessions]);
  const payroll = useMemo(() => employeePayrollHistory(employee.id, payrollPayments), [employee.id, payrollPayments]);
  const paidTotal = useMemo(() => employeePaidTotal(employee.id, payrollPayments), [employee.id, payrollPayments]);

  const [selectedYear, setSelectedYear] = useState<string>(() => dossier.years[0]?.year || String(new Date().getFullYear()));
  const year = dossier.years.find(entry => entry.year === selectedYear) || null;

  const assignedProjects = useMemo(
    () => projects.filter(project => (project.assignedEmployees || []).includes(employee.id)),
    [employee.id, projects]
  );

  const monthLabel = (month: string) => {
    const [y, m] = month.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  };

  const dayLabel = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(`Dossier de ${identity.name}`, `${identity.name}'s file`)}
      onClick={onClose}
    >
      <section
        className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-gray-800 bg-[#12141C] sm:rounded-3xl"
        onClick={event => event.stopPropagation()}
      >

        {/* Identité */}
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-800 bg-[#12141C] p-4 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <EmployeeAvatar
              src={identity.avatar}
              name={identity.name}
              className="h-14 w-14 flex-shrink-0 rounded-2xl border border-orange-500/50 object-cover"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-black text-white sm:text-xl">{identity.name}</h2>
                {identity.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {t('Administrateur', 'Administrator')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-gray-400">
                {identity.workerType || t('Employé', 'Employee')}
                {identity.hourlyRate ? ` · ${moneyExact(identity.hourlyRate)}/h` : ''}
              </p>
              {dossier.activeSession && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-green-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  {dossier.activeSession.pausedAt
                    ? t('En pause', 'On break')
                    : t(`Au travail — ${dossier.activeSession.projectName}`, `Working — ${dossier.activeSession.projectName}`)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-lg border border-gray-800 bg-gray-900 p-2 text-gray-400 transition hover:text-white"
            aria-label={t('Fermer le dossier', 'Close file')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-6 p-4 sm:p-6">

          {/* Aujourd'hui */}
          <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4">
            <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t('Aujourd’hui', 'Today')}
            </h3>
            {dossier.today ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label={t('Heures', 'Hours')} value={hours(dossier.today.hours)} />
                  <Stat label={t('Revenu généré', 'Revenue')} value={money(dossier.today.revenue)} tone="green" />
                  <Stat label={t('Pointages', 'Punches')} value={String(dossier.today.sessions)} />
                  <Stat
                    label={t('État', 'Status')}
                    value={dossier.today.inProgress ? t('En cours', 'In progress') : t('Terminé', 'Done')}
                    tone={dossier.today.inProgress ? 'green' : 'plain'}
                  />
                </div>
                {dossier.today.projects.length > 0 && (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-300">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-orange-500" aria-hidden="true" />
                    {dossier.today.projects.join(' · ')}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm font-semibold text-gray-400">
                {t('Aucun pointage aujourd’hui.', 'No punch today.')}
              </p>
            )}
          </div>

          {/* Mois en cours, année en cours, carrière */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Panel
              icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
              title={t('Ce mois-ci', 'This month')}
              lines={[
                [t('Heures', 'Hours'), hours(dossier.currentMonth?.hours || 0)],
                [t('Jours travaillés', 'Days worked'), String(dossier.currentMonth?.daysWorked || 0)],
                [t('Revenu', 'Revenue'), money(dossier.currentMonth?.revenue || 0)]
              ]}
            />
            <Panel
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
              title={t('Cette année', 'This year')}
              lines={[
                [t('Heures', 'Hours'), hours(dossier.currentYear?.hours || 0)],
                [t('Jours travaillés', 'Days worked'), String(dossier.currentYear?.daysWorked || 0)],
                [t('Revenu', 'Revenue'), money(dossier.currentYear?.revenue || 0)]
              ]}
            />
            <Panel
              icon={<Award className="h-4 w-4" aria-hidden="true" />}
              title={t('Depuis le début', 'All time')}
              lines={[
                [t('Heures', 'Hours'), hours(dossier.totals.hours)],
                [t('Jours travaillés', 'Days worked'), String(dossier.totals.daysWorked)],
                [t('Revenu', 'Revenue'), money(dossier.totals.revenue)]
              ]}
            />
          </div>

          {/* Années passées, mois par mois */}
          <div className="rounded-2xl border border-gray-800 bg-[#16191F] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                {t('Historique par année', 'History by year')}
              </h3>
              {dossier.years.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {dossier.years.map(entry => (
                    <button
                      key={entry.year}
                      onClick={() => setSelectedYear(entry.year)}
                      className={`rounded-lg border px-3 py-1 font-mono text-xs font-black transition ${
                        entry.year === selectedYear
                          ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
                          : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-white'
                      }`}
                    >
                      {entry.year}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {year ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Stat label={t('Heures', 'Hours')} value={hours(year.hours)} />
                  <Stat label={t('Jours', 'Days')} value={String(year.daysWorked)} />
                  <Stat label={t('Revenu', 'Revenue')} value={money(year.revenue)} tone="green" />
                </div>

                <div className="mt-4 overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[420px] border-collapse text-left text-xs sm:min-w-0">
                    <thead>
                      <tr className="border-b border-gray-800 text-[10px] uppercase text-gray-500">
                        <th className="py-2">{t('Mois', 'Month')}</th>
                        <th className="py-2 text-right">{t('Heures', 'Hours')}</th>
                        <th className="py-2 text-right">{t('Jours', 'Days')}</th>
                        <th className="py-2 text-right">{t('Revenu', 'Revenue')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-850">
                      {year.months.map(month => (
                        <tr key={month.month}>
                          <td className="py-2 font-semibold capitalize text-white">{monthLabel(month.month)}</td>
                          <td className="py-2 text-right font-mono text-gray-300">{hours(month.hours)}</td>
                          <td className="py-2 text-right font-mono text-gray-300">{month.daysWorked}</td>
                          <td className="py-2 text-right font-mono font-bold text-green-400">{money(month.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm font-semibold text-gray-400">
                {t('Aucune heure enregistrée pour le moment.', 'No hours recorded yet.')}
              </p>
            )}
          </div>

          {/* Chantiers */}
          <div className="rounded-2xl border border-gray-800 bg-[#16191F] p-4">
            <h3 className="flex items-center gap-2 border-b border-gray-800 pb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
              {t('Chantiers travaillés', 'Sites worked')}
            </h3>
            {dossier.projects.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-gray-400">
                {t('Aucun chantier pointé.', 'No site punched.')}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto print:overflow-visible">
                <table className="w-full min-w-[460px] border-collapse text-left text-xs sm:min-w-0">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] uppercase text-gray-500">
                      <th className="py-2">{t('Chantier', 'Site')}</th>
                      <th className="py-2 text-right">{t('Heures', 'Hours')}</th>
                      <th className="py-2 text-right">{t('Jours', 'Days')}</th>
                      <th className="py-2 text-right">{t('Dernier jour', 'Last day')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850">
                    {dossier.projects.map(project => (
                      <tr key={project.projectId || project.projectName}>
                        <td className="py-2 font-semibold text-white">{project.projectName}</td>
                        <td className="py-2 text-right font-mono text-gray-300">{hours(project.hours)}</td>
                        <td className="py-2 text-right font-mono text-gray-300">{project.days}</td>
                        <td className="py-2 text-right font-mono text-gray-400">{project.lastWorked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {assignedProjects.length > 0 && (
              <p className="mt-3 text-[11px] text-gray-400">
                {t('Assigné actuellement à : ', 'Currently assigned to: ')}
                <span className="font-semibold text-gray-200">
                  {assignedProjects.map(project => project.name).join(' · ')}
                </span>
              </p>
            )}
          </div>

          {/* Paie */}
          <div className="rounded-2xl border border-gray-800 bg-[#16191F] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
              <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                {t('Versements de paie', 'Payroll payments')}
              </h3>
              <span className="font-mono text-xs font-black text-green-400">
                {t('Total versé : ', 'Total paid: ')}{moneyExact(paidTotal)}
              </span>
            </div>
            {payroll.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-gray-400">
                {t('Aucun versement enregistré.', 'No payment recorded.')}
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {payroll.slice(0, 12).map(payment => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-850 bg-gray-950 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{payment.period}</p>
                      <p className="font-mono text-[10px] text-gray-500">{payment.date}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                        payment.status === 'paid' ? 'bg-green-500/10 text-green-400'
                          : payment.status === 'refused' || payment.status === 'held' ? 'bg-red-500/10 text-red-400'
                          : 'bg-gray-800 text-gray-400'
                      }`}>
                        {payment.status}
                      </span>
                      <span className="font-mono text-xs font-black text-white">{moneyExact(payment.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendrier détaillé, jour par jour */}
          <div className="rounded-2xl border border-gray-800 bg-[#16191F] p-4">
            <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
              {t('Calendrier des journées', 'Day calendar')}
            </h3>
            <Suspense fallback={<p className="text-xs text-gray-500">{t('Chargement…', 'Loading…')}</p>}>
              <EmployeeWorkCalendar
                employee={employee}
                punchSessions={punchSessions}
                projects={projects}
                currentLanguage={currentLanguage}
                embedded
              />
            </Suspense>
          </div>

          {/* Cartes de compétence — lecture seule */}
          <Suspense fallback={null}>
            <EmployeeCredentialsManager
              value={employee.credentials || []}
              onChange={() => undefined}
              currentLanguage={currentLanguage}
              canManage={false}
              title={t('Cartes de compétence', 'Competency cards')}
            />
          </Suspense>

          {/* Coordonnées */}
          <div className="rounded-2xl border border-gray-800 bg-[#16191F] p-4 text-xs text-gray-300">
            <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
              {t('Coordonnées', 'Contact')}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {identity.phone && (
                <p className="flex items-center gap-2 break-words">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" aria-hidden="true" />{identity.phone}
                </p>
              )}
              {identity.email && (
                <p className="flex items-center gap-2 break-words">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" aria-hidden="true" />{identity.email}
                </p>
              )}
              {identity.address && (
                <p className="flex items-start gap-2 break-words sm:col-span-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-500" aria-hidden="true" />
                  {[identity.address, identity.city, identity.province, identity.postalCode].filter(Boolean).join(', ')}
                </p>
              )}
              {identity.hireDate && (
                <p className="text-gray-400">
                  {t('Embauché le ', 'Hired on ')}<span className="font-semibold text-gray-200">{identity.hireDate}</span>
                </p>
              )}
              {dossier.firstDay && (
                <p className="text-gray-400">
                  {t('Premier pointage : ', 'First punch: ')}
                  <span className="font-semibold capitalize text-gray-200">{dayLabel(dossier.firstDay)}</span>
                </p>
              )}
              {identity.emergencyContactName && (
                <p className="text-gray-400 sm:col-span-2">
                  {t('Contact d’urgence : ', 'Emergency contact: ')}
                  <span className="font-semibold text-gray-200">
                    {identity.emergencyContactName}
                    {identity.emergencyContactPhone ? ` — ${identity.emergencyContactPhone}` : ''}
                    {identity.emergencyContactRelation ? ` (${identity.emergencyContactRelation})` : ''}
                  </span>
                </p>
              )}
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'green' }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-2.5">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`mt-1 block text-sm font-black ${tone === 'green' ? 'text-green-400' : 'text-white'}`}>{value}</span>
    </div>
  );
}

function Panel({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-[#16191F] p-4">
      <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
        <span className="text-orange-500">{icon}</span>
        {title}
      </h3>
      <dl className="mt-3 space-y-1.5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-gray-500">{label}</dt>
            <dd className="font-mono text-sm font-black text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
