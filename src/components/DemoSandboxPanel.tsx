import React, { useState, useTransition } from 'react';
import { BarChart3, Database, FileText, FolderKanban, Play, RefreshCw, ShieldCheck, Users, XCircle } from 'lucide-react';
import useAppStore from '../store';

type DemoDestination = 'home' | 'projects' | 'documents' | 'stats' | 'inventory' | 'prospects' | 'schedule' | 'accounting';

interface DemoSandboxPanelProps {
  onNavigate: (destination: DemoDestination) => void;
}

const countFormatter = new Intl.NumberFormat('fr-CA');

export default function DemoSandboxPanel({ onNavigate }: DemoSandboxPanelProps) {
  const currentLanguage = useAppStore(state => state.currentLanguage);
  const demoSandboxActive = useAppStore(state => state.demoSandboxActive);
  const summary = useAppStore(state => state.demoSandboxSummary);
  const activateDemoSandbox = useAppStore(state => state.activateDemoSandbox);
  const resetDemoSandbox = useAppStore(state => state.resetDemoSandbox);
  const deactivateDemoSandbox = useAppStore(state => state.deactivateDemoSandbox);
  const configuredCurrency = useAppStore(state => state.companyInfo.currency);
  const [confirmed, setConfirmed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isFrench = currentLanguage === 'FR';
  const currency = configuredCurrency || 'CAD';
  const money = (value: number) => new Intl.NumberFormat(isFrench ? 'fr-CA' : 'en-CA', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(value);

  const activate = () => {
    startTransition(async () => {
      if (await activateDemoSandbox()) onNavigate('home');
    });
  };

  const reset = () => {
    const accepted = window.confirm(isFrench
      ? 'Remettre toutes les données fictives à leur état initial? Tes essais dans le mode démo seront effacés.'
      : 'Reset all fictional data? Your changes made in demo mode will be discarded.');
    if (!accepted) return;
    startTransition(async () => { await resetDemoSandbox(); });
  };

  const exit = async () => {
    setIsExiting(true);
    try {
      await deactivateDemoSandbox();
      onNavigate('home');
    } finally {
      setIsExiting(false);
    }
  };

  if (!demoSandboxActive || !summary) {
    return (
      <section className="space-y-5 text-left" aria-labelledby="demo-sandbox-title">
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/45 via-gray-950 to-orange-950/30 p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-cyan-300">
              <Database className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Bac à sable administrateur</p>
              <h4 id="demo-sandbox-title" className="mt-1 text-xl font-black text-white">
                {isFrench ? 'Mode Démo — cinq ans de données' : 'Demo Mode — five years of data'}
              </h4>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-300">
                {isFrench
                  ? 'Charge une entreprise fictive complète pour éprouver tous les écrans comme si Hailite Manager fonctionnait depuis cinq ans.'
                  : 'Load a complete fictional business to test every screen as if Hailite Manager had been operating for five years.'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: FolderKanban, title: '100 chantiers', bodyFR: 'Terminés, actifs et en attente', bodyEN: 'Completed, active and on hold' },
            { icon: FileText, title: '285 documents', bodyFR: 'Devis, contrats et factures', bodyEN: 'Quotes, contracts and invoices' },
            { icon: Users, title: '5 ans de paie', bodyFR: 'Pointages, horaires et versements', bodyEN: 'Punches, schedules and payments' },
            { icon: BarChart3, title: 'Statistiques réelles', bodyFR: 'Revenus, dépenses et marges calculés', bodyEN: 'Calculated revenue, costs and margins' }
          ].map(card => (
            <div key={card.title} className="rounded-xl border border-gray-800 bg-gray-950/65 p-4">
              <card.icon className="h-5 w-5 text-orange-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-white">{card.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{isFrench ? card.bodyFR : card.bodyEN}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-black text-emerald-200">
                {isFrench ? 'Isolation garantie' : 'Guaranteed isolation'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
                {isFrench
                  ? 'Aucune donnée fictive ne sera envoyée à Supabase, enregistrée dans le téléphone ou incluse dans une sauvegarde. Les vraies données sont gardées en mémoire et restaurées à la sortie.'
                  : 'No fictional data is sent to Supabase, stored on the device, or included in a backup. Real data is kept in memory and restored when you exit.'}
              </p>
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/70 p-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-orange-600"
          />
          <span className="text-[11px] leading-relaxed text-gray-300">
            {isFrench
              ? 'Je comprends que toutes les modifications faites dans ce mode sont temporaires et seront jetées à la sortie.'
              : 'I understand that every change made in this mode is temporary and will be discarded on exit.'}
          </span>
        </label>

        <button
          type="button"
          onClick={activate}
          disabled={!confirmed || isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {isPending
            ? (isFrench ? 'Chargement des données…' : 'Loading data…')
            : (isFrench ? 'Activer le Mode Démo 5 ans' : 'Enable 5-year Demo Mode')}
        </button>
      </section>
    );
  }

  const countCards = [
    [isFrench ? 'Chantiers' : 'Projects', summary.counts.projects],
    [isFrench ? 'Pointages' : 'Punches', summary.counts.punchSessions],
    [isFrench ? 'Paies' : 'Payroll', summary.counts.payrollPayments],
    [isFrench ? 'Documents' : 'Documents', summary.counts.documents],
    [isFrench ? 'Dépenses' : 'Expenses', summary.counts.expenses],
    [isFrench ? 'Photos' : 'Photos', summary.counts.projectPhotos],
    [isFrench ? 'Sécurité' : 'Safety', summary.counts.safetyRecords],
    [isFrench ? 'Prospects' : 'Leads', summary.counts.leads]
  ] as const;

  return (
    <section className="space-y-5 text-left" aria-labelledby="demo-active-title">
      <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Données 100 % fictives</p>
            <h4 id="demo-active-title" className="mt-1 text-xl font-black text-white">
              {isFrench ? 'Le Mode Démo est actif' : 'Demo Mode is active'}
            </h4>
            <p className="mt-1 text-[11px] text-gray-300">
              {summary.periodStart} → {summary.periodEnd} · {countFormatter.format(summary.counts.totalRows)} {isFrench ? 'enregistrements simulés' : 'simulated records'}
            </p>
          </div>
          <ShieldCheck className="h-10 w-10 flex-none text-emerald-400" aria-label={isFrench ? 'Supabase bloqué' : 'Supabase blocked'} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {countCards.map(([label, count]) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
            <p className="text-xl font-black text-white">{countFormatter.format(count)}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [isFrench ? 'Revenus clients' : 'Client revenue', money(summary.clientRevenue), 'text-emerald-300'],
          [isFrench ? 'Dépenses' : 'Operating costs', money(summary.operatingExpenses), 'text-orange-300'],
          [isFrench ? 'Paie' : 'Payroll', money(summary.payroll), 'text-cyan-300'],
          [isFrench ? 'Marge simulée' : 'Simulated margin', money(summary.grossMargin), summary.grossMargin >= 0 ? 'text-emerald-300' : 'text-red-300']
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/65 p-4">
            <p className="text-[9px] font-black uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-2 text-lg font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
          {isFrench ? 'Ouvrir un module rempli' : 'Open a populated module'}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['stats', isFrench ? 'Statistiques' : 'Statistics'],
            ['projects', isFrench ? 'Chantiers' : 'Projects'],
            ['documents', isFrench ? 'Documents' : 'Documents'],
            ['accounting', isFrench ? 'Comptabilité' : 'Accounting'],
            ['prospects', isFrench ? 'Prospects' : 'Leads'],
            ['schedule', isFrench ? 'Horaire' : 'Schedule'],
            ['inventory', isFrench ? 'Inventaire' : 'Inventory'],
            ['home', isFrench ? 'Accueil' : 'Home']
          ].map(([destination, label]) => (
            <button
              key={destination}
              type="button"
              onClick={() => onNavigate(destination as DemoDestination)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-[10px] font-black text-gray-200 transition hover:border-orange-500 hover:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-gray-800 pt-5 sm:grid-cols-2">
        <button
          type="button"
          onClick={reset}
          disabled={isPending || isExiting}
          className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-xs font-black text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isFrench ? 'Remettre la démo à zéro' : 'Reset demo data'}
        </button>
        <button
          type="button"
          onClick={exit}
          disabled={isPending || isExiting}
          className="flex items-center justify-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs font-black text-red-200 transition hover:bg-red-500/20 disabled:opacity-40"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {isExiting
            ? (isFrench ? 'Retour aux vraies données…' : 'Restoring real data…')
            : (isFrench ? 'Quitter et restaurer les vraies données' : 'Exit and restore real data')}
        </button>
      </div>
    </section>
  );
}
