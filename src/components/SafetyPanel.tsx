// ---------------------------------------------------------------------------
// Sécurité de chantier — causeries et analyses de risques
// ---------------------------------------------------------------------------
// En toiture et revêtement, le danger dominant est la chute. L'OH&S de l'Alberta
// exige une évaluation des dangers propre au chantier avant le début des
// travaux, et un client commercial peut la demander avant d'accorder un contrat.
//
// Ce qui donne sa valeur au document, ce n'est pas la liste des dangers : c'est
// la SIGNATURE des travailleurs présents. On fait donc circuler l'appareil —
// chacun tape son nom et signe. Sans signature, la fiche reste « non signée »
// et le compteur le montre.
import { useMemo, useState } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import SignaturePad from './SignaturePad';
import type { Project, SafetyAttendee, SafetyRecord, SafetyRecordType } from '../types';
import { ChevronDown, ChevronUp, HardHat, Printer, Trash, X } from 'lucide-react';

const TYPES: SafetyRecordType[] = ['toolbox', 'hazard'];

// Dangers propres à la toiture et au revêtement extérieur : une liste générique
// ne serait jamais cochée honnêtement.
const HAZARD_KEYS = [
  'fall', 'ladder', 'weather', 'powerline', 'nailer',
  'lifting', 'traffic', 'asbestos', 'noise', 'debris'
] as const;

interface Props {
  project: Project;
  defaultOpen?: boolean;
}

export default function SafetyPanel({ project, defaultOpen = false }: Props) {
  const {
    currentLanguage, activeEmployee, employees, companyInfo,
    safetyRecords, addSafetyRecord, updateSafetyRecord, deleteSafetyRecord
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';
  const isManager = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';

  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState<SafetyRecordType>('toolbox');
  const [topic, setTopic] = useState('');
  const [hazards, setHazards] = useState<string[]>([]);
  const [controls, setControls] = useState('');
  const [weather, setWeather] = useState('');
  const [notes, setNotes] = useState('');
  const [present, setPresent] = useState<string[]>([]);
  // Signature en cours : { recordId, employeeId }
  const [signing, setSigning] = useState<{ recordId: string; employeeId: string } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const records = useMemo(
    () => safetyRecords
      .filter(r => r.projectId === project.id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [safetyRecords, project.id]
  );

  const typeLabel = (v: SafetyRecordType) => (v === 'hazard' ? t.safeTypeHazard : t.safeTypeToolbox);
  // Les libellés de dangers sont indexés dynamiquement (safeHazard_fall, …) :
  // le double transtypage est nécessaire car le type des traductions est un
  // littéral figé, pas un index signature.
  const hazardLabel = (key: string) =>
    (t as unknown as Record<string, string>)[`safeHazard_${key}`] || key;

  const suggestions = isFR
    ? ['Protection contre les chutes', 'Installation des échelles', 'Vent et conditions météo',
       'Lignes électriques aériennes', 'Utilisation de la cloueuse', 'Circulation autour du chantier']
    : ['Fall protection', 'Ladder setup', 'Wind and weather',
       'Overhead power lines', 'Nailer safety', 'Traffic around the site'];

  const resetForm = () => {
    setForm(false); setError(''); setType('toolbox'); setTopic('');
    setHazards([]); setControls(''); setWeather(''); setNotes(''); setPresent([]);
  };

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

  const submit = () => {
    if (!topic.trim()) { setError(t.safeMissingTopic); return; }
    if (present.length === 0) { setError(t.safeMissingAttendees); return; }
    if (type === 'hazard' && hazards.length === 0) { setError(t.safeMissingHazards); return; }

    const attendees: SafetyAttendee[] = present.map(id => ({
      employeeId: id,
      employeeName: employees.find(e => e.id === id)?.name || '',
      signature: undefined,
      signedAt: undefined
    }));
    addSafetyRecord({
      type,
      projectId: project.id,
      date: new Date().toISOString().slice(0, 10),
      topic: topic.trim(),
      hazards: type === 'hazard' ? hazards : undefined,
      controls: controls.trim() || undefined,
      weather: weather.trim() || undefined,
      notes: notes.trim() || undefined,
      attendees,
      createdAt: new Date().toISOString(),
      createdById: activeEmployee?.id,
      createdByName: activeEmployee?.name
    });
    resetForm();
    setOpen(true);
  };

  const saveSignature = () => {
    if (!signing || !signature) return;
    const record = records.find(r => r.id === signing.recordId);
    if (!record) return;
    updateSafetyRecord({
      ...record,
      attendees: record.attendees.map(a =>
        a.employeeId === signing.employeeId
          ? { ...a, signature, signedAt: new Date().toISOString() }
          : a)
    });
    setSigning(null);
    setSignature(null);
  };

  const signedCount = (r: SafetyRecord) => r.attendees.filter(a => a.signature).length;

  // Feuille remise à un inspecteur ou à un client commercial.
  const printRecord = (r: SafetyRecord) => {
    const esc = (v: unknown) => String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const html = `<!doctype html><html lang="${isFR ? 'fr' : 'en'}"><head><meta charset="utf-8" />
      <title>${esc(typeLabel(r.type))} — ${esc(project.name)}</title><style>
      body{font-family:system-ui,sans-serif;margin:16mm;color:#111}
      h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}
      .meta{font-size:12px;color:#444;margin-bottom:8px}
      ul{margin:6px 0;padding-left:20px;font-size:12px}
      p{font-size:12px}
      table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f2f2f2}
      img{height:44px}
      .note{font-size:10px;color:#555;margin-top:22px;border-top:1px solid #ccc;padding-top:8px}
      @media print{button{display:none}}</style></head><body>
      <h1>${esc(typeLabel(r.type))}</h1>
      <div class="meta"><b>${esc(r.topic)}</b><br/>
        ${esc(project.name)} — ${esc(project.address)}<br/>
        ${esc(new Date(`${r.date}T12:00:00`).toLocaleDateString(dateLocale))} ·
        ${esc(companyInfo.name || '')}${r.createdByName ? ` · ${esc(t.safeLedBy)} ${esc(r.createdByName)}` : ''}
        ${r.weather ? `<br/>${esc(t.safeWeatherLabel)} : ${esc(r.weather)}` : ''}</div>
      ${r.hazards?.length ? `<h2>${esc(t.safeHazardsTitle)}</h2><ul>${r.hazards.map(h => `<li>${esc(hazardLabel(h))}</li>`).join('')}</ul>` : ''}
      ${r.controls ? `<h2>${esc(t.safeControlsLabel)}</h2><p>${esc(r.controls)}</p>` : ''}
      ${r.notes ? `<h2>${esc(t.safeNotesLabel)}</h2><p>${esc(r.notes)}</p>` : ''}
      <h2>${esc(t.safeAttendeesTitle)} (${r.attendees.length})</h2>
      <table><tr><th>${esc(t.safeColName)}</th><th>${esc(t.safeColSignature)}</th><th>${esc(t.safeColSignedAt)}</th></tr>
      ${r.attendees.map(a => `<tr><td>${esc(a.employeeName)}</td>
        <td>${a.signature ? `<img src="${esc(a.signature)}" alt="" />` : '—'}</td>
        <td>${a.signedAt ? esc(new Date(a.signedAt).toLocaleString(dateLocale)) : '—'}</td></tr>`).join('')}
      </table>
      <p class="note">${esc(t.safePrintNote)}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-900 hover:bg-gray-850 transition"
        aria-expanded={open}>
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-gray-300">
          <HardHat className="w-3.5 h-3.5 text-orange-500" />
          {t.safeSectionTitle} ({records.length})
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3">
          {!form && (
            <button type="button" onClick={() => setForm(true)}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition">
              {t.safeAddBtn}
            </button>
          )}

          {form && (
            <div className="p-3 bg-gray-950 border border-orange-500/40 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-white uppercase">{t.safeNewTitle}</h4>
                <button type="button" onClick={resetForm} className="p-1 text-gray-500 hover:text-white" aria-label={t.modalCancelBtn}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {TYPES.map(v => (
                  <button key={v} type="button" onClick={() => setType(v)}
                    className={`py-2.5 text-xs font-black rounded-lg border transition ${
                      type === v ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
                    {typeLabel(v)}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.safeTopicLabel}</span>
                <input value={topic} onChange={e => setTopic(e.target.value)} placeholder={t.safeTopicPh}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
                <span className="flex flex-wrap gap-1 mt-1.5">
                  {suggestions.map(s => (
                    <button key={s} type="button" onClick={() => setTopic(s)}
                      className="px-2 py-0.5 text-[9px] rounded border border-gray-800 bg-gray-900 text-gray-400">
                      {s}
                    </button>
                  ))}
                </span>
              </label>

              {type === 'hazard' && (
                <div>
                  <span className="text-[10px] font-mono uppercase text-gray-500">{t.safeHazardsTitle}</span>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {HAZARD_KEYS.map(key => (
                      <button key={key} type="button" onClick={() => toggle(hazards, setHazards, key)}
                        className={`py-2 px-2 text-[10px] font-bold rounded-lg border text-left transition ${
                          hazards.includes(key)
                            ? 'bg-red-500/15 text-red-200 border-red-500/40'
                            : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
                        {hazards.includes(key) ? '☑ ' : '☐ '}{hazardLabel(key)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.safeControlsLabel}</span>
                <textarea value={controls} onChange={e => setControls(e.target.value)} rows={2}
                  placeholder={t.safeControlsPh}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs resize-y" />
              </label>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.safeWeatherLabel}</span>
                <input value={weather} onChange={e => setWeather(e.target.value)} placeholder={t.safeWeatherPh}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
              </label>

              <div>
                <span className="text-[10px] font-mono uppercase text-gray-500">
                  {t.safeAttendeesTitle} ({present.length})
                </span>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {employees.filter(e => e.role !== 'accountant').map(e => (
                    <button key={e.id} type="button" onClick={() => toggle(present, setPresent, e.id)}
                      className={`py-2 px-2 text-[10px] font-bold rounded-lg border text-left transition ${
                        present.includes(e.id)
                          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
                          : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
                      {present.includes(e.id) ? '☑ ' : '☐ '}{e.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.safeNotesLabel}</span>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
              </label>

              {error && <p className="text-[11px] text-red-400 font-bold">{error}</p>}
              <button type="button" onClick={submit}
                className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg">
                {t.safeSaveBtn}
              </button>
              <p className="text-[10px] text-gray-500">{t.safeSaveHint}</p>
            </div>
          )}

          {records.length === 0 && !form && (
            <p className="text-[11px] text-gray-500 text-center py-2">{t.safeEmptyHint}</p>
          )}

          {records.map(r => {
            const signed = signedCount(r);
            const complete = signed === r.attendees.length && r.attendees.length > 0;
            return (
              <div key={r.id} className="p-3 bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white">{r.topic}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {typeLabel(r.type)} · {new Date(`${r.date}T12:00:00`).toLocaleDateString(dateLocale)}
                      {r.createdByName ? ` · ${r.createdByName}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 text-[9px] font-black uppercase rounded border ${
                    complete
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`}>
                    {signed}/{r.attendees.length} {t.safeSignedWord}
                  </span>
                </div>

                {r.hazards?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {r.hazards.map(h => (
                      <span key={h} className="px-1.5 py-0.5 text-[9px] rounded bg-red-500/10 text-red-300 border border-red-500/25">
                        {hazardLabel(h)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {r.controls && <p className="text-[10px] text-gray-400">{r.controls}</p>}

                {/* On fait circuler l'appareil : chacun tape son nom et signe */}
                <div className="flex flex-wrap gap-1.5">
                  {r.attendees.map(a => (
                    <button key={a.employeeId} type="button"
                      onClick={() => { setSigning({ recordId: r.id, employeeId: a.employeeId }); setSignature(null); }}
                      disabled={!!a.signature}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] transition ${
                        a.signature
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-gray-950 text-gray-300 border-gray-700 hover:border-orange-500/50'}`}>
                      {a.signature ? '✓' : '✎'} {a.employeeName}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-800">
                  <button type="button" onClick={() => printRecord(r)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase rounded border border-gray-700 bg-gray-950 text-gray-300">
                    <Printer className="w-3 h-3" /> {t.safePrintBtn}
                  </button>
                  {isManager && (
                    <button type="button"
                      onClick={() => { if (confirm(t.safeDeleteConfirm)) deleteSafetyRecord(r.id); }}
                      className="ml-auto p-1.5 rounded border border-gray-700 text-gray-500 hover:text-red-400"
                      aria-label={t.safeDeleteBtn}>
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Signature d'un travailleur présent */}
      {signing && (
        <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4"
          onClick={() => { setSigning(null); setSignature(null); }}>
          <div className="w-full max-w-sm bg-[#16191F] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-black text-white">
              {t.safeSignTitle}{' '}
              {records.find(r => r.id === signing.recordId)?.attendees
                .find(a => a.employeeId === signing.employeeId)?.employeeName}
            </h4>
            <p className="text-[11px] text-gray-400">{t.safeSignHint}</p>
            <SignaturePad label={t.safeColSignature} value={signature} onChange={setSignature} accentClass="text-orange-400" />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setSigning(null); setSignature(null); }}
                className="px-4 py-2.5 bg-gray-800 text-gray-300 text-xs font-black rounded-lg border border-gray-700">
                {t.modalCancelBtn}
              </button>
              <button type="button" onClick={saveSignature} disabled={!signature}
                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg disabled:opacity-40">
                {t.safeSignConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
