import { useMemo, useState } from 'react';
import type { PunchSession } from '../types';
import { localDayKey } from '../localTime';

// Écran de validation administrative des heures.
//
// Avant ce panneau, un pointage erroné était définitif : un oubli de punch out
// laissait quatorze heures dans la paie sans aucun moyen de rectifier. Le
// bureau peut maintenant corriger les bornes du quart, approuver un pointage
// vérifié, et consulter la piste d'audit de chaque changement.

type Langue = 'FR' | 'EN';

interface Props {
  punches: PunchSession[];
  currentLanguage: Langue;
  dateLocale: string;
  money: (value: number) => string;
  onCorrect: (
    id: string,
    changes: { startTime?: string; endTime?: string; totalPauseMinutes?: number },
    note?: string
  ) => { ok: boolean; message?: string };
  onApprove: (id: string) => { ok: boolean; message?: string };
}

const TEXTES = {
  FR: {
    titre: 'Validation des heures',
    sousTitre: 'Vérifiez, corrigez au besoin, puis approuvez. Chaque changement est journalisé.',
    filtreTous: 'Tous', filtreAttente: 'À vérifier', filtreApprouves: 'Approuvés',
    vide: 'Aucun pointage à afficher pour ce filtre.',
    statutPending: 'À vérifier', statutCorrected: 'Corrigé', statutApproved: 'Approuvé',
    corriger: 'Corriger', approuver: 'Approuver', annuler: 'Annuler', enregistrer: 'Enregistrer',
    debut: 'Début', fin: 'Fin', pause: 'Pause (minutes)', motif: 'Motif de la correction',
    motifExemple: 'Ex. : oubli de fin de quart, confirmé avec le contremaître',
    heures: 'heures', montant: 'Montant', historique: 'Historique des corrections',
    approuvePar: 'Approuvé par', champ: {
      startTime: 'Début', endTime: 'Fin', pauseMinutes: 'Pause (min)', approval: 'État'
    } as Record<string, string>,
    de: 'de', vers: 'vers', par: 'par'
  },
  EN: {
    titre: 'Hours approval',
    sousTitre: 'Review, correct if needed, then approve. Every change is logged.',
    filtreTous: 'All', filtreAttente: 'To review', filtreApprouves: 'Approved',
    vide: 'No punch to show for this filter.',
    statutPending: 'To review', statutCorrected: 'Corrected', statutApproved: 'Approved',
    corriger: 'Correct', approuver: 'Approve', annuler: 'Cancel', enregistrer: 'Save',
    debut: 'Start', fin: 'End', pause: 'Break (minutes)', motif: 'Reason for the correction',
    motifExemple: 'e.g. missed clock-out, confirmed with the foreman',
    heures: 'hours', montant: 'Amount', historique: 'Correction history',
    approuvePar: 'Approved by', champ: {
      startTime: 'Start', endTime: 'End', pauseMinutes: 'Break (min)', approval: 'Status'
    } as Record<string, string>,
    de: 'from', vers: 'to', par: 'by'
  }
};

// <input type="datetime-local"> attend une heure murale locale sans fuseau.
// Convertir en UTC ici décalerait l'heure affichée au technicien.
function versChampLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function depuisChampLocal(valeur: string): string {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export default function PunchApprovalPanel({
  punches, currentLanguage, dateLocale, money, onCorrect, onApprove
}: Props) {
  const t = TEXTES[currentLanguage];
  const [filtre, setFiltre] = useState<'all' | 'pending' | 'approved'>('pending');
  const [editionId, setEditionId] = useState<string | null>(null);
  const [formDebut, setFormDebut] = useState('');
  const [formFin, setFormFin] = useState('');
  const [formPause, setFormPause] = useState('0');
  const [formMotif, setFormMotif] = useState('');
  const [retour, setRetour] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  const visibles = useMemo(() => {
    const fermes = punches.filter(p => p.endTime !== null);
    const trie = [...fermes].sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    if (filtre === 'approved') return trie.filter(p => p.approvalStatus === 'approved');
    if (filtre === 'pending') return trie.filter(p => p.approvalStatus !== 'approved');
    return trie;
  }, [punches, filtre]);

  const ouvrirEdition = (punch: PunchSession) => {
    setEditionId(punch.id);
    setFormDebut(versChampLocal(punch.startTime));
    setFormFin(punch.endTime ? versChampLocal(punch.endTime) : '');
    setFormPause(String(Math.round(punch.totalPauseMinutes || 0)));
    setFormMotif('');
    setRetour(null);
  };

  const enregistrer = (punch: PunchSession) => {
    const resultat = onCorrect(punch.id, {
      startTime: depuisChampLocal(formDebut) || undefined,
      endTime: depuisChampLocal(formFin) || undefined,
      totalPauseMinutes: Number(formPause) || 0
    }, formMotif.trim() || undefined);
    setRetour({ id: punch.id, ok: resultat.ok, message: resultat.message || '' });
    if (resultat.ok) setEditionId(null);
  };

  const badge = (punch: PunchSession) => {
    const statut = punch.approvalStatus || 'pending';
    if (statut === 'approved') return { texte: t.statutApproved, classe: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/30' };
    if (statut === 'corrected') return { texte: t.statutCorrected, classe: 'bg-amber-600/15 text-amber-400 border-amber-600/30' };
    return { texte: t.statutPending, classe: 'bg-sky-600/15 text-sky-400 border-sky-600/30' };
  };

  const filtres: { cle: 'pending' | 'approved' | 'all'; libelle: string }[] = [
    { cle: 'pending', libelle: t.filtreAttente },
    { cle: 'approved', libelle: t.filtreApprouves },
    { cle: 'all', libelle: t.filtreTous }
  ];

  return (
    <div id="punch-approval-panel" className="bg-[#16191F] border border-gray-800 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black text-white uppercase tracking-wider">{t.titre}</h4>
          <p className="text-[11px] text-gray-400 mt-0.5">{t.sousTitre}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0" role="group" aria-label={t.titre}>
          {filtres.map(option => (
            <button
              key={option.cle}
              type="button"
              onClick={() => setFiltre(option.cle)}
              aria-pressed={filtre === option.cle}
              className={`min-h-11 px-3 rounded-lg text-xs font-black uppercase tracking-wide transition-colors cursor-pointer ${
                filtre === option.cle ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {option.libelle}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="text-xs text-gray-500 mt-6 text-center py-6">{t.vide}</p>
      ) : (
        <div className="flex flex-col gap-3 mt-5">
          {visibles.slice(0, 40).map(punch => {
            const marque = badge(punch);
            const enEdition = editionId === punch.id;
            const message = retour && retour.id === punch.id ? retour : null;
            return (
              <div key={punch.id} className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white break-words">{punch.employeeName}</p>
                    <p className="text-[11px] text-gray-400 break-words">{punch.projectName}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {new Date(punch.startTime).toLocaleDateString(dateLocale)} ·{' '}
                      {new Date(punch.startTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                      {punch.endTime && ` → ${new Date(punch.endTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`}
                      {punch.endTime && localDayKey(punch.endTime) !== localDayKey(punch.startTime) && ' (+1)'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border flex-shrink-0 ${marque.classe}`}>
                    {marque.texte}
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 mt-3 text-xs">
                  <span className="text-gray-300 font-mono font-bold">
                    {(punch.totalWorkedHours || 0).toFixed(2)} {t.heures}
                  </span>
                  <span className="text-green-400 font-bold">{money(punch.revenue || 0)}</span>
                </div>

                {punch.approvalStatus === 'approved' && punch.approvedByName && (
                  <p className="text-[10px] text-emerald-400/80 mt-2 break-words">
                    {t.approuvePar} {punch.approvedByName}
                    {punch.approvedAt && ` · ${new Date(punch.approvedAt).toLocaleDateString(dateLocale)}`}
                  </p>
                )}

                {enEdition ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-gray-800 pt-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-black text-gray-400">{t.debut}</span>
                      <input
                        type="datetime-local" value={formDebut}
                        onChange={event => setFormDebut(event.target.value)}
                        className="min-h-11 bg-gray-900 border border-gray-700 rounded-lg px-3 text-sm text-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-black text-gray-400">{t.fin}</span>
                      <input
                        type="datetime-local" value={formFin}
                        onChange={event => setFormFin(event.target.value)}
                        className="min-h-11 bg-gray-900 border border-gray-700 rounded-lg px-3 text-sm text-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-black text-gray-400">{t.pause}</span>
                      <input
                        type="number" min="0" step="1" value={formPause}
                        onChange={event => setFormPause(event.target.value)}
                        className="min-h-11 bg-gray-900 border border-gray-700 rounded-lg px-3 text-sm text-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-black text-gray-400">{t.motif}</span>
                      <input
                        type="text" value={formMotif} placeholder={t.motifExemple}
                        onChange={event => setFormMotif(event.target.value)}
                        className="min-h-11 bg-gray-900 border border-gray-700 rounded-lg px-3 text-sm text-white"
                      />
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button" onClick={() => enregistrer(punch)}
                        className="min-h-11 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase cursor-pointer"
                      >
                        {t.enregistrer}
                      </button>
                      <button
                        type="button" onClick={() => { setEditionId(null); setRetour(null); }}
                        className="min-h-11 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-black uppercase cursor-pointer"
                      >
                        {t.annuler}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap mt-3">
                    <button
                      type="button" onClick={() => ouvrirEdition(punch)}
                      className="min-h-11 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-black uppercase cursor-pointer"
                    >
                      {t.corriger}
                    </button>
                    {punch.approvalStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => {
                          const resultat = onApprove(punch.id);
                          setRetour({ id: punch.id, ok: resultat.ok, message: resultat.message || '' });
                        }}
                        className="min-h-11 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black uppercase cursor-pointer"
                      >
                        {t.approuver}
                      </button>
                    )}
                  </div>
                )}

                {message && (
                  <p className={`text-[11px] mt-2 break-words ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {message.message}
                  </p>
                )}

                {(punch.corrections || []).length > 0 && (
                  <details className="mt-3">
                    <summary className="text-[10px] uppercase font-black text-gray-400 cursor-pointer min-h-11 flex items-center">
                      {t.historique} ({(punch.corrections || []).length})
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {(punch.corrections || []).map((entree, index) => (
                        <li key={`${entree.at}-${index}`} className="text-[10px] text-gray-400 break-words">
                          <span className="text-gray-300 font-bold">{t.champ[entree.field] || entree.field}</span>{' '}
                          {t.de} <span className="font-mono">{entree.before}</span>{' '}
                          {t.vers} <span className="font-mono">{entree.after}</span>{' '}
                          — {t.par} {entree.byName} ·{' '}
                          {new Date(entree.at).toLocaleString(dateLocale)}
                          {entree.note && <span className="block text-gray-500 italic">« {entree.note} »</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
