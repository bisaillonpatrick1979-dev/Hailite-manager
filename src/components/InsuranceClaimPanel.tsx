// ---------------------------------------------------------------------------
// Réclamations d'assurance — grêle, vent, dégât d'eau
// ---------------------------------------------------------------------------
// À Calgary, la grêle représente une part énorme du revenu en toiture. Le suivi
// d'une réclamation, c'est d'abord des chiffres qu'il ne faut pas mélanger :
//
//   RCV  valeur à neuf (ce que coûte le remplacement aujourd'hui)
//   ACV  valeur au jour du sinistre (RCV moins la dépréciation)
//   dépréciation récupérable = RCV − ACV, versée après exécution des travaux
//   premier chèque ≈ ACV − franchise
//
// L'application calcule ces écarts pour qu'on voie tout de suite ce qui reste à
// encaisser, et rassemble le dossier photo du chantier dans la même feuille
// imprimable — une réclamation sans photos ne vaut rien.
import { useMemo, useState } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import type { InsuranceClaim, InsuranceClaimStatus, InsuranceLossType, Project } from '../types';
import { ChevronDown, ChevronUp, Printer, ShieldAlert, Trash, X } from 'lucide-react';

const LOSS_TYPES: InsuranceLossType[] = ['hail', 'wind', 'water', 'fire', 'other'];
const STATUSES: InsuranceClaimStatus[] = ['open', 'submitted', 'approved', 'partial', 'denied', 'closed'];

interface Props {
  project: Project;
  defaultOpen?: boolean;
}

export default function InsuranceClaimPanel({ project, defaultOpen = false }: Props) {
  const {
    currentLanguage, activeEmployee, insuranceClaims, projectPhotos, companyInfo,
    addInsuranceClaim, updateInsuranceClaim, deleteInsuranceClaim
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';
  const isManager = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';

  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    insurer: '', claimNumber: '', policyNumber: '', lossType: 'hail' as InsuranceLossType,
    lossDate: '', adjusterName: '', adjusterPhone: '', adjusterEmail: '',
    deductible: '', acv: '', rcv: '', supplementAmount: '', approvedAmount: '', notes: ''
  });

  const claims = useMemo(
    () => insuranceClaims
      .filter(c => c.projectId === project.id)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [insuranceClaims, project.id]
  );

  const photoCount = useMemo(
    () => projectPhotos.filter(p => p.projectId === project.id).length,
    [projectPhotos, project.id]
  );

  const money = (value: number) => {
    const currency = companyInfo.currency || 'CAD';
    try {
      return new Intl.NumberFormat(dateLocale, { style: 'currency', currency }).format(value);
    } catch {
      return `${value.toFixed(2)} $`;
    }
  };
  const num = (v: string) => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const lossLabel = (type: InsuranceLossType) => ({
    hail: t.icLossHail, wind: t.icLossWind, water: t.icLossWater, fire: t.icLossFire, other: t.icLossOther
  }[type]);

  const statusLabel = (s: InsuranceClaimStatus) => ({
    open: t.icStatusOpen, submitted: t.icStatusSubmitted, approved: t.icStatusApproved,
    partial: t.icStatusPartial, denied: t.icStatusDenied, closed: t.icStatusClosed
  }[s]);

  const statusStyle = (s: InsuranceClaimStatus) => (
    s === 'approved' || s === 'closed' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : s === 'denied' ? 'bg-red-500/15 text-red-300 border-red-500/30'
        : s === 'partial' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  );

  // Les écarts qui comptent, calculés plutôt que saisis : on ne veut pas qu'une
  // erreur d'arithmétique fasse oublier un montant à réclamer.
  const figures = (c: InsuranceClaim) => {
    const rcv = c.rcv || 0, acv = c.acv || 0, ded = c.deductible || 0;
    return {
      recoverableDepreciation: rcv > acv ? rcv - acv : 0,
      firstCheque: acv > ded ? acv - ded : 0,
      expectedTotal: (rcv || 0) + (c.supplementAmount || 0) - ded
    };
  };

  const resetForm = () => {
    setForm(false);
    setError('');
    setDraft({
      insurer: '', claimNumber: '', policyNumber: '', lossType: 'hail', lossDate: '',
      adjusterName: '', adjusterPhone: '', adjusterEmail: '',
      deductible: '', acv: '', rcv: '', supplementAmount: '', approvedAmount: '', notes: ''
    });
  };

  const submit = () => {
    if (!draft.insurer.trim()) { setError(t.icMissingInsurer); return; }
    addInsuranceClaim({
      projectId: project.id,
      insurer: draft.insurer.trim(),
      claimNumber: draft.claimNumber.trim(),
      policyNumber: draft.policyNumber.trim() || undefined,
      lossType: draft.lossType,
      lossDate: draft.lossDate || undefined,
      adjusterName: draft.adjusterName.trim() || undefined,
      adjusterPhone: draft.adjusterPhone.trim() || undefined,
      adjusterEmail: draft.adjusterEmail.trim() || undefined,
      deductible: num(draft.deductible),
      acv: num(draft.acv),
      rcv: num(draft.rcv),
      supplementAmount: num(draft.supplementAmount),
      approvedAmount: num(draft.approvedAmount),
      status: 'open',
      notes: draft.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdById: activeEmployee?.id,
      createdByName: activeEmployee?.name
    });
    resetForm();
    setOpen(true);
  };

  // Feuille remise à l'assureur : identité du dossier, chiffres, et le dossier
  // photo du chantier dans le même document.
  const printClaim = (c: InsuranceClaim) => {
    const esc = (v: unknown) => String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const f = figures(c);
    const row = (label: string, value: string) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
    const photos = projectPhotos.filter(p => p.projectId === project.id);
    const photoHtml = photos.length ? `<h2>${esc(t.photoDossierTitle)} — ${photos.length}</h2><div class="grid">${photos.map(p => `
      <figure><img src="${esc(p.imageUrl)}" alt="" /><figcaption>
        ${p.caption ? `<b>${esc(p.caption)}</b><br/>` : ''}
        ${esc(new Date(p.takenAt).toLocaleString(dateLocale))}${p.takenByName ? ` — ${esc(p.takenByName)}` : ''}
        ${typeof p.latitude === 'number' ? `<br/>GPS ${p.latitude}, ${p.longitude}` : ''}
      </figcaption></figure>`).join('')}</div>` : '';

    const html = `<!doctype html><html lang="${isFR ? 'fr' : 'en'}"><head><meta charset="utf-8" />
      <title>${esc(t.icPrintTitle)} — ${esc(c.claimNumber || project.name)}</title><style>
      body{font-family:system-ui,sans-serif;margin:16mm;color:#111}
      h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}
      .meta{font-size:12px;color:#444;margin-bottom:10px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th{text-align:left;width:46%;padding:5px 8px;background:#f2f2f2;border:1px solid #ddd;font-weight:600}
      td{padding:5px 8px;border:1px solid #ddd}
      .grid{display:flex;flex-wrap:wrap;gap:10px}
      figure{margin:0;width:31%;break-inside:avoid}
      img{width:100%;height:150px;object-fit:cover;border:1px solid #bbb}
      figcaption{font-size:10px;line-height:1.35;margin-top:3px}
      .note{font-size:10px;color:#555;margin-top:24px;border-top:1px solid #ccc;padding-top:8px}
      @media print{button{display:none}}</style></head><body>
      <h1>${esc(t.icPrintTitle)}</h1>
      <div class="meta"><b>${esc(project.name)}</b> — ${esc(project.clientName)}<br/>${esc(project.address)}<br/>
        ${esc(companyInfo.name || '')} · ${esc(t.photoDossierGenerated)} ${esc(new Date().toLocaleString(dateLocale))}</div>
      <h2>${esc(t.icPrintFileSection)}</h2>
      <table>
        ${row(t.icInsurerLabel, c.insurer)}
        ${row(t.icClaimNumberLabel, c.claimNumber || '—')}
        ${c.policyNumber ? row(t.icPolicyLabel, c.policyNumber) : ''}
        ${row(t.icLossTypeLabel, lossLabel(c.lossType))}
        ${c.lossDate ? row(t.icLossDateLabel, new Date(c.lossDate).toLocaleDateString(dateLocale)) : ''}
        ${row(t.icStatusLabel, statusLabel(c.status))}
        ${c.adjusterName ? row(t.icAdjusterLabel, `${c.adjusterName}${c.adjusterPhone ? ` · ${c.adjusterPhone}` : ''}${c.adjusterEmail ? ` · ${c.adjusterEmail}` : ''}`) : ''}
      </table>
      <h2>${esc(t.icPrintMoneySection)}</h2>
      <table>
        ${row(t.icRcvLabel, c.rcv ? money(c.rcv) : '—')}
        ${row(t.icAcvLabel, c.acv ? money(c.acv) : '—')}
        ${row(t.icDeductibleLabel, c.deductible ? money(c.deductible) : '—')}
        ${row(t.icRecoverableLabel, money(f.recoverableDepreciation))}
        ${row(t.icFirstChequeLabel, money(f.firstCheque))}
        ${c.supplementAmount ? row(t.icSupplementLabel, money(c.supplementAmount)) : ''}
        ${c.approvedAmount ? row(t.icApprovedLabel, money(c.approvedAmount)) : ''}
      </table>
      ${c.notes ? `<h2>${esc(t.icNotesLabel)}</h2><p style="font-size:12px">${esc(c.notes)}</p>` : ''}
      ${photoHtml}
      <p class="note">${esc(t.icPrintNote)}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const field = (key: keyof typeof draft, label: string, type = 'text', placeholder = '') => (
    <label className="block">
      <span className="text-[10px] font-mono uppercase text-gray-500">{label}</span>
      <input type={type} inputMode={type === 'number' ? 'decimal' : undefined} step={type === 'number' ? '0.01' : undefined}
        value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}
        placeholder={placeholder}
        className={`w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs${type === 'number' ? ' font-mono' : ''}`} />
    </label>
  );

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-900 hover:bg-gray-850 transition"
        aria-expanded={open}>
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-gray-300">
          <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
          {t.icSectionTitle} ({claims.length})
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3">
          {!form && (
            <button type="button" onClick={() => setForm(true)}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition">
              {t.icAddBtn}
            </button>
          )}

          {form && (
            <div className="p-3 bg-gray-950 border border-orange-500/40 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-white uppercase">{t.icNewTitle}</h4>
                <button type="button" onClick={resetForm} className="p-1 text-gray-500 hover:text-white" aria-label={t.modalCancelBtn}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {field('insurer', t.icInsurerLabel, 'text', t.icInsurerPh)}
              <div className="grid grid-cols-2 gap-2">
                {field('claimNumber', t.icClaimNumberLabel)}
                {field('policyNumber', t.icPolicyLabel)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-mono uppercase text-gray-500">{t.icLossTypeLabel}</span>
                  <select value={draft.lossType} onChange={e => setDraft({ ...draft, lossType: e.target.value as InsuranceLossType })}
                    className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs">
                    {LOSS_TYPES.map(type => <option key={type} value={type}>{lossLabel(type)}</option>)}
                  </select>
                </label>
                {field('lossDate', t.icLossDateLabel, 'date')}
              </div>

              <p className="text-[10px] font-mono uppercase text-gray-500 pt-1 border-t border-gray-800">{t.icAdjusterSection}</p>
              {field('adjusterName', t.icAdjusterLabel)}
              <div className="grid grid-cols-2 gap-2">
                {field('adjusterPhone', t.icAdjusterPhoneLabel, 'tel')}
                {field('adjusterEmail', t.icAdjusterEmailLabel, 'email')}
              </div>

              <p className="text-[10px] font-mono uppercase text-gray-500 pt-1 border-t border-gray-800">{t.icMoneySection}</p>
              <div className="grid grid-cols-2 gap-2">
                {field('rcv', t.icRcvLabel, 'number')}
                {field('acv', t.icAcvLabel, 'number')}
                {field('deductible', t.icDeductibleLabel, 'number')}
                {field('supplementAmount', t.icSupplementLabel, 'number')}
              </div>
              <p className="text-[10px] text-gray-500">{t.icMoneyHint}</p>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.icNotesLabel}</span>
                <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} rows={2}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs resize-y" />
              </label>

              {error && <p className="text-[11px] text-red-400 font-bold">{error}</p>}
              <button type="button" onClick={submit}
                className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg">
                {t.icSaveBtn}
              </button>
            </div>
          )}

          {claims.length === 0 && !form && (
            <p className="text-[11px] text-gray-500 text-center py-2">{t.icEmptyHint}</p>
          )}

          {claims.map(claim => {
            const f = figures(claim);
            return (
              <div key={claim.id} className="p-3 bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white">{claim.insurer}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {claim.claimNumber || '—'} · {lossLabel(claim.lossType)}
                      {claim.lossDate ? ` · ${new Date(claim.lossDate).toLocaleDateString(dateLocale)}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 text-[9px] font-black uppercase rounded border ${statusStyle(claim.status)}`}>
                    {statusLabel(claim.status)}
                  </span>
                </div>

                {claim.adjusterName && (
                  <p className="text-[10px] text-gray-400">
                    {t.icAdjusterLabel} : {claim.adjusterName}
                    {claim.adjusterPhone ? ` · ${claim.adjusterPhone}` : ''}
                  </p>
                )}

                {/* Les écarts calculés : ce qui reste à encaisser saute aux yeux */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  {claim.rcv ? <span className="text-gray-400">{t.icRcvLabel} <b className="text-white">{money(claim.rcv)}</b></span> : null}
                  {claim.acv ? <span className="text-gray-400">{t.icAcvLabel} <b className="text-white">{money(claim.acv)}</b></span> : null}
                  {claim.deductible ? <span className="text-gray-400">{t.icDeductibleLabel} <b className="text-white">{money(claim.deductible)}</b></span> : null}
                  {f.recoverableDepreciation > 0 && (
                    <span className="text-gray-400">{t.icRecoverableLabel} <b className="text-amber-300">{money(f.recoverableDepreciation)}</b></span>
                  )}
                  {f.firstCheque > 0 && (
                    <span className="text-gray-400">{t.icFirstChequeLabel} <b className="text-emerald-400">{money(f.firstCheque)}</b></span>
                  )}
                  {claim.supplementAmount ? <span className="text-gray-400">{t.icSupplementLabel} <b className="text-sky-300">{money(claim.supplementAmount)}</b></span> : null}
                </div>

                {claim.notes && <p className="text-[10px] text-gray-400 italic">{claim.notes}</p>}

                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-800">
                  <button type="button" onClick={() => printClaim(claim)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase rounded border border-gray-700 bg-gray-950 text-gray-300">
                    <Printer className="w-3 h-3" /> {t.icPrintBtn} {photoCount > 0 ? `(${photoCount} ${t.photoCountWord})` : ''}
                  </button>
                  {isManager && (
                    <>
                      <select value={claim.status}
                        onChange={e => updateInsuranceClaim({ ...claim, status: e.target.value as InsuranceClaimStatus })}
                        className="px-2 py-1 text-[10px] font-black uppercase rounded border border-gray-700 bg-gray-950 text-gray-300">
                        {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>
                      <button type="button"
                        onClick={() => { if (confirm(t.icDeleteConfirm)) deleteInsuranceClaim(claim.id); }}
                        className="ml-auto p-1.5 rounded border border-gray-700 text-gray-500 hover:text-red-400"
                        aria-label={t.icDeleteBtn}>
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {photoCount === 0 && (
                  <p className="text-[10px] text-amber-400">{t.icNoPhotoWarning}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
