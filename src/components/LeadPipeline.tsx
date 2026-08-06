// ---------------------------------------------------------------------------
// Suivi des prospects — ce qui se passe AVANT le devis
// ---------------------------------------------------------------------------
// Jusqu'ici le parcours commençait au client et au devis. Ce qui précède était
// invisible : appel entrant, inspection à planifier, soumission envoyée, vendu
// ou perdu — et surtout POURQUOI perdu. Sans ça, impossible de connaître son
// taux de conversion ni de voir quelle soumission dort depuis trois semaines.
//
// L'écran est construit autour de deux questions : qu'est-ce que je dois
// relancer aujourd'hui, et combien je convertis.
import { useCallback, useMemo, useState } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import type { Lead, LeadSource, LeadStatus } from '../types';
import { Phone, Plus, Trash, TrendingUp, UserPlus, X } from 'lucide-react';

const STATUSES: LeadStatus[] = ['new', 'contacted', 'inspection', 'quoted', 'won', 'lost'];
const SOURCES: LeadSource[] = ['referral', 'phone', 'website', 'door', 'repeat', 'insurance', 'other'];
// Étapes actives du pipeline : « vendu » et « perdu » sont des issues, pas des étapes.
const OPEN_STATUSES: LeadStatus[] = ['new', 'contacted', 'inspection', 'quoted'];

export default function LeadPipeline() {
  const {
    currentLanguage, activeEmployee, leads, companyInfo,
    addLead, updateLead, deleteLead, addClient
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState(false);
  const [filter, setFilter] = useState<LeadStatus | 'all' | 'followup'>('all');
  const [error, setError] = useState('');
  const [lostFor, setLostFor] = useState<Lead | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [draft, setDraft] = useState({
    name: '', phone: '', email: '', address: '',
    source: 'phone' as LeadSource, estimatedValue: '', nextFollowUp: '', notes: ''
  });

  const money = (value: number) => {
    const currency = companyInfo.currency || 'CAD';
    try {
      return new Intl.NumberFormat(dateLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${value.toFixed(0)} $`;
    }
  };

  const statusLabel = (s: LeadStatus) => ({
    new: t.leadStatusNew, contacted: t.leadStatusContacted, inspection: t.leadStatusInspection,
    quoted: t.leadStatusQuoted, won: t.leadStatusWon, lost: t.leadStatusLost
  }[s]);

  const sourceLabel = (s: LeadSource) => ({
    referral: t.leadSourceReferral, phone: t.leadSourcePhone, website: t.leadSourceWebsite,
    door: t.leadSourceDoor, repeat: t.leadSourceRepeat, insurance: t.leadSourceInsurance,
    other: t.leadSourceOther
  }[s]);

  const statusStyle = (s: LeadStatus) => (
    s === 'won' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : s === 'lost' ? 'bg-red-500/15 text-red-300 border-red-500/30'
        : s === 'quoted' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
          : s === 'inspection' ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
            : s === 'contacted' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-gray-700/40 text-gray-300 border-gray-600'
  );

  const sorted = useMemo(
    () => [...leads].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [leads]
  );

  // Une relance est « due » si sa date est passée et que le dossier est encore ouvert.
  const isDue = useCallback(
    (lead: Lead) => !!lead.nextFollowUp && lead.nextFollowUp <= today && OPEN_STATUSES.includes(lead.status),
    [today]
  );

  const dueLeads = useMemo(() => sorted.filter(isDue), [sorted, isDue]);

  const stats = useMemo(() => {
    const won = leads.filter(l => l.status === 'won').length;
    const lost = leads.filter(l => l.status === 'lost').length;
    const decided = won + lost;
    const open = leads.filter(l => OPEN_STATUSES.includes(l.status));
    return {
      won, lost, open: open.length,
      // Taux de conversion sur les dossiers TRANCHÉS seulement : inclure les
      // dossiers encore ouverts ferait mentir le chiffre vers le bas.
      conversion: decided > 0 ? Math.round((won / decided) * 100) : null,
      openValue: open.reduce((sum, l) => sum + (l.estimatedValue || 0), 0),
      wonValue: leads.filter(l => l.status === 'won').reduce((sum, l) => sum + (l.estimatedValue || 0), 0)
    };
  }, [leads]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: leads.length, followup: dueLeads.length };
    STATUSES.forEach(s => { map[s] = leads.filter(l => l.status === s).length; });
    return map;
  }, [leads, dueLeads]);

  const shown = filter === 'all' ? sorted
    : filter === 'followup' ? dueLeads
      : sorted.filter(l => l.status === filter);

  const resetForm = () => {
    setForm(false); setError('');
    setDraft({ name: '', phone: '', email: '', address: '', source: 'phone', estimatedValue: '', nextFollowUp: '', notes: '' });
  };

  const submit = () => {
    if (!draft.name.trim()) { setError(t.leadMissingName); return; }
    const value = Number(String(draft.estimatedValue).replace(',', '.'));
    addLead({
      name: draft.name.trim(),
      phone: draft.phone.trim() || undefined,
      email: draft.email.trim() || undefined,
      address: draft.address.trim() || undefined,
      source: draft.source,
      status: 'new',
      estimatedValue: Number.isFinite(value) && value > 0 ? value : undefined,
      nextFollowUp: draft.nextFollowUp || undefined,
      notes: draft.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdById: activeEmployee?.id,
      createdByName: activeEmployee?.name
    });
    resetForm();
  };

  // « Vendu » crée le client, pour ne pas ressaisir les coordonnées.
  const markWon = (lead: Lead) => {
    if (!lead.convertedClientId) {
      addClient({
        name: lead.name,
        phone: lead.phone || '',
        email: lead.email || '',
        address: lead.address || ''
      });
    }
    updateLead({ ...lead, status: 'won', nextFollowUp: undefined });
  };

  const confirmLost = () => {
    if (!lostFor) return;
    updateLead({ ...lostFor, status: 'lost', lostReason: lostReason.trim() || undefined, nextFollowUp: undefined });
    setLostFor(null);
    setLostReason('');
  };

  return (
    <div id="view-prospects-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <h3 className="text-xl font-black text-white">{t.leadTitle}</h3>
          <p className="text-xs text-gray-400 mt-1">{t.leadSubtitle}</p>
        </div>
        <button type="button" onClick={() => setForm(v => !v)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition">
          <Plus className="w-4 h-4" /> {t.leadAddBtn}
        </button>
      </div>

      {/* Les deux chiffres qui comptent : ce que je convertis, ce qui dort */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-gray-950 border border-gray-850 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-gray-500">{t.leadStatConversion}</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">
            {stats.conversion === null ? '—' : `${stats.conversion} %`}
          </p>
          <p className="text-[9px] text-gray-500 font-mono mt-0.5">
            {stats.won} {t.leadStatWonWord} · {stats.lost} {t.leadStatLostWord}
          </p>
        </div>
        <div className="p-3 bg-gray-950 border border-gray-850 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-gray-500">{t.leadStatOpen}</p>
          <p className="text-2xl font-black text-white mt-1">{stats.open}</p>
          <p className="text-[9px] text-gray-500 font-mono mt-0.5">{money(stats.openValue)}</p>
        </div>
        <div className="p-3 bg-gray-950 border border-gray-850 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-gray-500">{t.leadStatWonValue}</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{money(stats.wonValue)}</p>
        </div>
        <button type="button" onClick={() => setFilter('followup')}
          className={`p-3 rounded-xl border text-left transition ${
            dueLeads.length > 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-gray-950 border-gray-850'}`}>
          <p className="text-[10px] font-mono uppercase text-gray-500">{t.leadStatFollowUp}</p>
          <p className={`text-2xl font-black mt-1 ${dueLeads.length > 0 ? 'text-amber-300' : 'text-gray-600'}`}>
            {dueLeads.length}
          </p>
          <p className="text-[9px] text-gray-500 font-mono mt-0.5">{t.leadStatFollowUpHint}</p>
        </button>
      </div>

      {form && (
        <div className="p-4 bg-gray-950 border border-orange-500/40 rounded-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-white uppercase">{t.leadNewTitle}</h4>
            <button type="button" onClick={resetForm} className="p-1 text-gray-500 hover:text-white" aria-label={t.modalCancelBtn}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadNameLabel}</span>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder={t.leadNamePh}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadPhoneLabel}</span>
              <input type="tel" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadEmailLabel}</span>
              <input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadAddressLabel}</span>
              <input value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadSourceLabel}</span>
              <select value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value as LeadSource })}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs">
                {SOURCES.map(s => <option key={s} value={s}>{sourceLabel(s)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadValueLabel}</span>
              <input type="number" inputMode="decimal" step="100" min="0" value={draft.estimatedValue}
                onChange={e => setDraft({ ...draft, estimatedValue: e.target.value })}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs font-mono" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadFollowUpLabel}</span>
              <input type="date" value={draft.nextFollowUp} onChange={e => setDraft({ ...draft, nextFollowUp: e.target.value })}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-[10px] font-mono uppercase text-gray-500">{t.leadNotesLabel}</span>
              <input value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}
                placeholder={t.leadNotesPh}
                className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            </label>
          </div>
          {error && <p className="text-[11px] text-red-400 font-bold">{error}</p>}
          <button type="button" onClick={submit}
            className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg">
            {t.leadSaveBtn}
          </button>
        </div>
      )}

      {/* Filtres par étape */}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setFilter('all')}
          className={`px-2.5 py-1 text-[10px] font-black uppercase rounded border transition ${
            filter === 'all' ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
          {t.leadFilterAll} ({counts.all})
        </button>
        {STATUSES.map(s => (
          <button key={s} type="button" onClick={() => setFilter(s)}
            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded border transition ${
              filter === s ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
            {statusLabel(s)} ({counts[s]})
          </button>
        ))}
        {dueLeads.length > 0 && (
          <button type="button" onClick={() => setFilter('followup')}
            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded border transition ${
              filter === 'followup' ? 'bg-amber-500 text-black border-amber-400' : 'bg-amber-500/10 text-amber-300 border-amber-500/40'}`}>
            ⏰ {t.leadFilterDue} ({dueLeads.length})
          </button>
        )}
      </div>

      {shown.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-8">
          {leads.length === 0 ? t.leadEmptyHint : t.leadNoneInFilter}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map(lead => (
          <div key={lead.id}
            className={`p-4 rounded-xl border flex flex-col gap-2 ${
              isDue(lead) ? 'bg-amber-500/5 border-amber-500/40' : 'bg-gray-900 border-gray-850'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-black text-white truncate">{lead.name}</h4>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                  {sourceLabel(lead.source)}
                  {lead.address ? ` · ${lead.address}` : ''}
                </p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 text-[9px] font-black uppercase rounded border ${statusStyle(lead.status)}`}>
                {statusLabel(lead.status)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-orange-400 font-bold">
                  <Phone className="w-3 h-3" /> {lead.phone}
                </a>
              )}
              {lead.estimatedValue ? (
                <span className="font-mono font-black text-emerald-400">{money(lead.estimatedValue)}</span>
              ) : null}
              {lead.nextFollowUp && (
                <span className={`font-mono ${isDue(lead) ? 'text-amber-300 font-black' : 'text-gray-500'}`}>
                  ⏰ {new Date(lead.nextFollowUp).toLocaleDateString(dateLocale)}
                </span>
              )}
            </div>

            {lead.notes && <p className="text-[11px] text-gray-400 italic">{lead.notes}</p>}
            {lead.status === 'lost' && lead.lostReason && (
              <p className="text-[11px] text-red-300">{t.leadLostBecause} {lead.lostReason}</p>
            )}

            {/* Faire avancer l'étape : le geste le plus fréquent doit être le plus court */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-800">
              {OPEN_STATUSES.includes(lead.status) && (
                <>
                  <select value={lead.status}
                    onChange={e => updateLead({ ...lead, status: e.target.value as LeadStatus })}
                    className="px-2 py-1 text-[10px] font-black uppercase rounded border border-gray-700 bg-gray-950 text-gray-300">
                    {OPEN_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                  <button type="button" onClick={() => markWon(lead)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase rounded border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                    <UserPlus className="w-3 h-3" /> {t.leadMarkWon}
                  </button>
                  <button type="button" onClick={() => { setLostFor(lead); setLostReason(''); }}
                    className="px-2.5 py-1 text-[10px] font-black uppercase rounded border border-red-500/40 text-red-300 bg-red-500/10">
                    {t.leadMarkLost}
                  </button>
                </>
              )}
              {lead.status === 'won' && (
                <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-400">
                  <TrendingUp className="w-3 h-3" /> {t.leadClientCreated}
                </span>
              )}
              <button type="button"
                onClick={() => { if (confirm(t.leadDeleteConfirm)) deleteLead(lead.id); }}
                className="ml-auto p-1.5 rounded border border-gray-700 text-gray-500 hover:text-red-400"
                aria-label={t.leadDeleteBtn}>
                <Trash className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Perdu : on demande TOUJOURS pourquoi. C'est la seule donnée qui permet
          d'améliorer le taux de conversion. */}
      {lostFor && (
        <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4" onClick={() => setLostFor(null)}>
          <div className="w-full max-w-sm bg-[#16191F] border border-gray-800 rounded-2xl p-5 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-black text-white">{t.leadLostTitle}</h4>
            <p className="text-[11px] text-gray-400">{t.leadLostHint}</p>
            <input value={lostReason} onChange={e => setLostReason(e.target.value)}
              placeholder={t.leadLostPh} autoFocus
              className="w-full p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setLostFor(null)}
                className="px-4 py-2.5 bg-gray-800 text-gray-300 text-xs font-black rounded-lg border border-gray-700">
                {t.modalCancelBtn}
              </button>
              <button type="button" onClick={confirmLost}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-lg">
                {t.leadLostConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
