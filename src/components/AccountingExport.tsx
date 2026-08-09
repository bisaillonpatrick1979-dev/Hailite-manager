// ---------------------------------------------------------------------------
// Export comptable
// ---------------------------------------------------------------------------
// L'import depuis un ancien logiciel existait ; rien ne sortait. Onze mois par
// année ça ne paraît pas — au 31 décembre, c'est plusieurs soirées.
//
// Deux détails font toute la différence à l'usage et sont trop souvent ratés :
//   • le séparateur : Excel en français attend le point-virgule, QuickBooks la
//     virgule. Le choix est donc offert plutôt que deviné.
//   • la marque d'ordre d'octets (BOM) UTF-8 en tête de fichier, sans laquelle
//     Excel affiche « Ã© » à la place des accents.
import { useCallback, useMemo, useState } from 'react';
import useAppStore from '../store';
import { fmt, translations } from '../translations';
import { AlertTriangle, Download, FileSpreadsheet } from 'lucide-react';
import { reportingThreshold, summarizeSubcontractorPayments } from '../accountingSubcontractors';

type Period = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'all' | 'custom';

// Échappement CSV : guillemets doublés, champ encadré dès qu'il contient le
// séparateur, un guillemet ou un saut de ligne.
function csvCell(value: unknown, sep: string): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildCsv(headers: string[], rows: unknown[][], sep: string): string {
  const lines = [headers, ...rows].map(r => r.map(c => csvCell(c, sep)).join(sep));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM + fins de ligne Windows
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AccountingExport() {
  const {
    currentLanguage, companyInfo, documents, expenses,
    payrollPayments, punchSessions, projects, employees
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';

  const [period, setPeriod] = useState<Period>('thisYear');
  const [sep, setSep] = useState<';' | ','>(isFR ? ';' : ',');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Bornes de la période, en dates ISO comparables telles quelles.
  const range = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    switch (period) {
      case 'thisMonth': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
      case 'lastMonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
      case 'thisYear': return { from: `${y}-01-01`, to: `${y}-12-31` };
      case 'lastYear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
      case 'custom': return { from: from || '0000-01-01', to: to || '9999-12-31' };
      default: return { from: '0000-01-01', to: '9999-12-31' };
    }
  }, [period, from, to]);

  const inRange = useCallback((date?: string | null) => {
    if (!date) return false;
    const d = String(date).slice(0, 10);
    return d >= range.from && d <= range.to;
  }, [range.from, range.to]);

  const projectName = (id?: string) => projects.find(p => p.id === id)?.name || '';
  const num = (v: unknown) => Number(v || 0).toFixed(2);
  const stamp = `${range.from}_${range.to}`;
  const slug = (companyInfo.name || 'hailite').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ---------------------------------------------------------------------------
  // Jeux de données
  // ---------------------------------------------------------------------------
  const sales = useMemo(
    () => documents.filter(d => d.type === 'invoice' && inRange(d.date)),
    [documents, inRange]
  );
  const periodExpenses = useMemo(() => expenses.filter(e => inRange(e.date)), [expenses, inRange]);
  const periodPayroll = useMemo(() => payrollPayments.filter(p => inRange(p.date)), [payrollPayments, inRange]);
  const periodPunches = useMemo(
    () => punchSessions.filter(p => p.endTime && inRange(p.startTime)),
    [punchSessions, inRange]
  );

  const totals = useMemo(() => ({
    sales: sales.reduce((s, d) => s + (d.total || 0), 0),
    collected: sales.reduce((s, d) => s + ((d.total || 0) - (d.balanceDue || 0)), 0),
    expenses: periodExpenses.reduce((s, e) => s + (e.amount || 0) + (e.tax || 0), 0),
    payroll: periodPayroll.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0),
    hours: periodPunches.reduce((s, p) => s + (p.totalWorkedHours || 0), 0)
  }), [sales, periodExpenses, periodPayroll, periodPunches]);

  // Cumul des versements par sous-traitant : la pièce que le comptable réclame
  // pour le T5018 (Canada) ou le 1099-NEC (États-Unis), et la seule qui
  // manquait à cet export.
  const threshold = useMemo(
    () => reportingThreshold(companyInfo.country, Number(range.to.slice(0, 4)) || new Date().getFullYear()),
    [companyInfo.country, range.to]
  );
  const subcontractors = useMemo(
    () => summarizeSubcontractorPayments(employees, periodPayroll, threshold ? threshold.amount : null),
    [employees, periodPayroll, threshold]
  );

  const exportSubcontractors = () => download(`${slug}_sous-traitants_${stamp}.csv`, buildCsv(
    [t.accColSubName, t.accColSubBusiness, t.accColSubTaxNumber, t.accColSubAddress,
     t.accColSubPhone, t.accColSubPayments, t.accColSubTotal, t.accColSubThreshold],
    subcontractors.rows.map(r => [
      r.name, r.businessName, r.taxNumber, r.address, r.phone,
      r.paymentCount, num(r.total), r.meetsThreshold ? t.wordYes : t.wordNo
    ]), sep));

  const exportSales = () => download(`${slug}_ventes_${stamp}.csv`, buildCsv(
    [t.accColDate, t.accColNumber, t.accColClient, t.accColSubtotal, t.accColTax,
     t.accColTotal, t.accColPaid, t.accColBalance, t.accColStatus],
    sales.map(d => [
      d.date, d.number, d.clientName,
      num(d.subtotal), num(d.taxAmount), num(d.total),
      num((d.total || 0) - (d.balanceDue || 0)), num(d.balanceDue), d.status
    ]), sep));

  const exportExpenses = () => download(`${slug}_depenses_${stamp}.csv`, buildCsv(
    [t.accColDate, t.accColSupplier, t.accColCategory, t.accColProject,
     t.accColAmount, t.accColTax, t.accColTotal, t.accColSubmittedBy, t.accColNotes],
    periodExpenses.map(e => [
      e.date, e.provider, e.category, projectName(e.projectId),
      num(e.amount), num(e.tax), num((e.amount || 0) + (e.tax || 0)),
      e.submittedByName || '', e.notes || ''
    ]), sep));

  const exportPayroll = () => download(`${slug}_paie_${stamp}.csv`, buildCsv(
    [t.accColDate, t.accColEmployee, t.accColPeriod, t.accColHours, t.accColAmount, t.accColStatus],
    periodPayroll.map(p => [
      p.date, p.employeeName, p.period, p.hours ?? '', num(p.amount), p.status
    ]), sep));

  const exportHours = () => download(`${slug}_heures_${stamp}.csv`, buildCsv(
    [t.accColDate, t.accColEmployee, t.accColProject, t.accColHours, t.accColPayMode, t.accColLabourCost],
    periodPunches.map(p => [
      String(p.startTime).slice(0, 10), p.employeeName, p.projectName || projectName(p.projectId),
      (p.totalWorkedHours || 0).toFixed(2), p.payMode, num(p.revenue)
    ]), sep));

  // Sommaire mensuel : c'est ce que le comptable regarde en premier.
  const exportSummary = () => {
    const months = new Map<string, { sales: number; collected: number; expenses: number; payroll: number; hours: number }>();
    const bucket = (key: string) => {
      if (!months.has(key)) months.set(key, { sales: 0, collected: 0, expenses: 0, payroll: 0, hours: 0 });
      return months.get(key)!;
    };
    sales.forEach(d => {
      const b = bucket(String(d.date).slice(0, 7));
      b.sales += d.total || 0;
      b.collected += (d.total || 0) - (d.balanceDue || 0);
    });
    periodExpenses.forEach(e => { bucket(String(e.date).slice(0, 7)).expenses += (e.amount || 0) + (e.tax || 0); });
    periodPayroll.filter(p => p.status === 'paid')
      .forEach(p => { bucket(String(p.date).slice(0, 7)).payroll += p.amount || 0; });
    periodPunches.forEach(p => { bucket(String(p.startTime).slice(0, 7)).hours += p.totalWorkedHours || 0; });

    const rows = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => [
        month, num(v.sales), num(v.collected), num(v.expenses), num(v.payroll),
        v.hours.toFixed(2), num(v.collected - v.expenses - v.payroll)
      ]);
    download(`${slug}_sommaire_${stamp}.csv`, buildCsv(
      [t.accColMonth, t.accColSalesBilled, t.accColCollected, t.accColExpenses,
       t.accColPayroll, t.accColHours, t.accColNet],
      rows, sep));
  };

  const money = (v: number) => {
    try {
      return new Intl.NumberFormat(dateLocale, {
        style: 'currency', currency: companyInfo.currency || 'CAD', maximumFractionDigits: 0
      }).format(v);
    } catch { return `${v.toFixed(0)} $`; }
  };

  const exports: Array<{ key: string; label: string; hint: string; count: number; run: () => void }> = [
    { key: 'summary', label: t.accBtnSummary, hint: t.accHintSummary, count: sales.length + periodExpenses.length, run: exportSummary },
    { key: 'sales', label: t.accBtnSales, hint: t.accHintSales, count: sales.length, run: exportSales },
    { key: 'expenses', label: t.accBtnExpenses, hint: t.accHintExpenses, count: periodExpenses.length, run: exportExpenses },
    { key: 'payroll', label: t.accBtnPayroll, hint: t.accHintPayroll, count: periodPayroll.length, run: exportPayroll },
    { key: 'hours', label: t.accBtnHours, hint: t.accHintHours, count: periodPunches.length, run: exportHours },
    { key: 'subcontractors', label: t.accBtnSubcontractors,
      hint: threshold ? fmt(t.accHintSubcontractorsForm, { form: threshold.form }) : t.accHintSubcontractors,
      count: subcontractors.rows.length, run: exportSubcontractors }
  ];

  const periods: Array<{ key: Period; label: string }> = [
    { key: 'thisMonth', label: t.accPeriodThisMonth },
    { key: 'lastMonth', label: t.accPeriodLastMonth },
    { key: 'thisYear', label: t.accPeriodThisYear },
    { key: 'lastYear', label: t.accPeriodLastYear },
    { key: 'all', label: t.accPeriodAll },
    { key: 'custom', label: t.accPeriodCustom }
  ];

  return (
    <div id="view-accounting-export" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <h3 className="text-xl font-black text-white">{t.accTitle}</h3>
          <p className="text-xs text-gray-400 mt-1">{t.accSubtitle}</p>
        </div>
        <FileSpreadsheet className="w-6 h-6 text-orange-500 shrink-0" />
      </div>

      {/* Période */}
      <div>
        <p className="text-[10px] font-mono uppercase text-gray-500 mb-2">{t.accPeriodLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {periods.map(p => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-[11px] font-black uppercase rounded-lg border transition ${
                period === p.key ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mt-2 max-w-sm">
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.accFromLabel}</span>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="w-full mt-1 p-2 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.accToLabel}</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="w-full mt-1 p-2 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
          </div>
        )}
        <p className="text-[10px] text-gray-500 font-mono mt-2">
          {new Date(`${range.from}T12:00:00`).toLocaleDateString(dateLocale)} → {new Date(`${range.to}T12:00:00`).toLocaleDateString(dateLocale)}
        </p>
      </div>

      {/* Aperçu de la période : évite d'exporter un fichier vide sans le savoir */}
      {/* Un sous-traitant absent d'une déclaration légale parce que son type de
          travailleur n'a jamais été rempli, c'est exactement le genre d'oubli
          silencieux qui coûte cher. On le dit avant l'export, pas après. */}
      {subcontractors.unclassified.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-[11px] leading-relaxed text-amber-100">
            <p className="font-black uppercase tracking-wide">{t.accUnclassifiedTitle}</p>
            <p className="mt-1 font-bold">
              {fmt(t.accUnclassifiedBody, {
                count: subcontractors.unclassified.length,
                names: subcontractors.unclassified.map(u => u.name || u.employeeId).join(', ')
              })}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: t.accSumSales, value: money(totals.sales) },
          { label: t.accSumCollected, value: money(totals.collected) },
          { label: t.accSumExpenses, value: money(totals.expenses) },
          { label: t.accSumPayroll, value: money(totals.payroll) },
          { label: t.accSumHours, value: `${totals.hours.toFixed(0)} h` }
        ].map(s => (
          <div key={s.label} className="p-2.5 bg-gray-950 border border-gray-850 rounded-xl">
            <p className="text-[9px] font-mono uppercase text-gray-500">{s.label}</p>
            <p className="text-sm font-black text-white mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Séparateur : la cause numéro un des fichiers illisibles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono uppercase text-gray-500">{t.accSepLabel}</span>
        {([';', ','] as const).map(s => (
          <button key={s} type="button" onClick={() => setSep(s)}
            className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition ${
              sep === s ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
            {s === ';' ? t.accSepSemicolon : t.accSepComma}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 -mt-3">{t.accSepHint}</p>

      {/* Fichiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {exports.map(x => (
          <button key={x.key} type="button" onClick={x.run} disabled={x.count === 0}
            className="flex items-center justify-between gap-3 p-3 bg-gray-900 border border-gray-850 rounded-xl text-left transition hover:border-orange-500/50 disabled:opacity-40 disabled:hover:border-gray-850">
            <div className="min-w-0">
              <p className="text-xs font-black text-white">{x.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{x.hint}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-gray-500">{x.count}</span>
              <Download className="w-4 h-4 text-orange-400" />
            </div>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-gray-500 border-t border-gray-800 pt-3">{t.accFooterNote}</p>
    </div>
  );
}
