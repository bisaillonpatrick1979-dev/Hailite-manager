// ---------------------------------------------------------------------------
// File des cartes de compétence à vérifier
// ---------------------------------------------------------------------------
// Le travailleur a photographié sa carte ; quelqu'un du bureau doit maintenant
// la confronter au registre de l'organisme émetteur. Ce panneau met côte à côte
// les deux photos, ce qui a été déclaré, et le lien direct vers le bon
// registre — avec ce que ce registre va demander et ce qu'il ne couvre pas.
//
// Aucune vérification automatique n'est proposée, parce qu'aucune n'existe :
// les registres publics sont des formulaires destinés à un humain, sans
// interface machine, et plusieurs exigent l'accord du titulaire avant de
// confirmer quoi que ce soit à un employeur. La décision est donc humaine, et
// l'application se contente de consigner qui l'a prise, quand, et par quel
// moyen.

import React, { useState } from 'react';
import { AlertTriangle, Check, ExternalLink, ShieldCheck, X } from 'lucide-react';
import type { EmployeeCredential } from '../types';
import {
  registriesForCredential, type CredentialVerificationMethod
} from '../../credentialVerification';

type Language = 'FR' | 'EN';

export interface PendingCredential {
  employeeId: string;
  employeeName: string;
  credential: EmployeeCredential;
}

interface Props {
  pending: PendingCredential[];
  currentLanguage: Language;
  country?: string;
  region?: string;
  onDecide: (
    employeeId: string,
    credentialId: string,
    decision: { approved: boolean; method?: string; note?: string }
  ) => Promise<void>;
  /** Version compacte pour l'accueil : on annonce, on n'étale pas. */
  compact?: boolean;
  onOpenEmployee?: (employeeId: string) => void;
}

export default function CredentialVerificationQueue({
  pending, currentLanguage, country, region, onDecide, compact = false, onOpenEmployee
}: Props) {
  const isFrench = currentLanguage === 'FR';
  const t = (fr: string, en: string) => (isFrench ? fr : en);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, CredentialVerificationMethod>>({});
  const [failure, setFailure] = useState('');

  if (pending.length === 0) {
    if (compact) return null;
    return (
      <p className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm font-semibold text-gray-400">
        {t('Aucune carte en attente de vérification.', 'No card awaiting verification.')}
      </p>
    );
  }

  const decide = async (item: PendingCredential, approved: boolean) => {
    const key = item.credential.id;
    setFailure('');
    setBusyId(key);
    try {
      await onDecide(item.employeeId, key, {
        approved,
        method: approved ? (methods[key] || 'registry') : undefined,
        note: notes[key] || ''
      });
    } catch (error: any) {
      setFailure(String(error?.message || t('La décision n’a pas pu être enregistrée.', 'The decision could not be saved.')));
    } finally {
      setBusyId(null);
    }
  };

  if (compact) {
    return (
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
        <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t('Cartes à vérifier', 'Cards to verify')} ({pending.length})
        </h4>
        <ul className="mt-3 space-y-1.5">
          {pending.slice(0, 5).map(item => (
            <li key={item.credential.id}>
              <button
                type="button"
                onClick={() => onOpenEmployee?.(item.employeeId)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-850 bg-gray-950 px-3 py-2 text-left transition hover:border-cyan-500/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-white">{item.employeeName}</span>
                  <span className="block truncate text-[10px] text-gray-400">{item.credential.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-cyan-300">
                  {(item.credential.submittedAt || '').slice(0, 10)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {pending.length > 5 && (
          <p className="mt-2 text-[10px] text-gray-400">
            {t(`et ${pending.length - 5} autre(s)`, `and ${pending.length - 5} more`)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {failure && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-300" role="alert">
          {failure}
        </p>
      )}

      {pending.map(item => {
        const key = item.credential.id;
        const registries = registriesForCredential(item.credential, country, region);
        const busy = busyId === key;
        return (
          <article key={key} className="rounded-2xl border border-cyan-500/25 bg-gray-950 p-4 space-y-4">

            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h5 className="text-sm font-black text-white">{item.credential.name}</h5>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {item.employeeName}
                  {item.credential.submittedAt ? ` · ${t('soumise le ', 'submitted ')}${item.credential.submittedAt.slice(0, 10)}` : ''}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-300">
                {t('À vérifier', 'To verify')}
              </span>
            </div>

            {/* Ce que le travailleur a déclaré */}
            <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
              {[
                [t('Organisme', 'Issuer'), item.credential.issuer || '—'],
                [t('Numéro', 'Number'), item.credential.credentialNumber || '—'],
                [t('Obtenue', 'Issued'), item.credential.issuedDate || '—'],
                [t('Expiration', 'Expiry'), item.credential.doesNotExpire ? t('Aucune', 'None') : (item.credential.expiryDate || '—')]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-900 p-2">
                  <span className="block font-bold uppercase text-gray-500">{label}</span>
                  <span className="break-words font-bold text-white">{value}</span>
                </div>
              ))}
            </div>

            {/* Les deux faces, côte à côte : c'est ce qu'on compare au registre */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {item.credential.photoFront && (
                <figure>
                  <img src={item.credential.photoFront} alt={t('Recto de la carte', 'Card front')} className="h-44 w-full rounded-xl border border-gray-800 bg-black object-contain" />
                  <figcaption className="mt-1 text-center text-[9px] uppercase text-gray-500">{t('Recto', 'Front')}</figcaption>
                </figure>
              )}
              {item.credential.photoBack && (
                <figure>
                  <img src={item.credential.photoBack} alt={t('Verso de la carte', 'Card back')} className="h-44 w-full rounded-xl border border-gray-800 bg-black object-contain" />
                  <figcaption className="mt-1 text-center text-[9px] uppercase text-gray-500">{t('Verso', 'Back')}</figcaption>
                </figure>
              )}
            </div>

            {item.credential.notes && (
              <p className="rounded-xl bg-gray-900 p-3 text-xs text-gray-300">{item.credential.notes}</p>
            )}

            {/* Où aller vérifier */}
            {registries.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {t('Où vérifier cette carte', 'Where to verify this card')}
                </p>
                {registries.map(registry => (
                  <div key={registry.id} className="rounded-lg border border-gray-850 bg-gray-950 p-2.5">
                    <a
                      href={registry.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200"
                    >
                      {isFrench ? registry.nameFR : registry.nameEN}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <p className="mt-1 text-[10px] text-gray-400">
                      <strong className="text-gray-300">{t('À fournir : ', 'You will need: ')}</strong>
                      {isFrench ? registry.requiresFR : registry.requiresEN}
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-[10px] text-amber-300/90">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      {isFrench ? registry.cautionFR : registry.cautionEN}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* La décision */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[9px] font-black uppercase text-gray-500" htmlFor={`method-${key}`}>
                  {t('Vérifiée comment', 'Verified how')}
                </label>
                <select
                  id={`method-${key}`}
                  value={methods[key] || 'registry'}
                  onChange={event => setMethods(current => ({ ...current, [key]: event.target.value as CredentialVerificationMethod }))}
                  className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-900 p-2.5 text-xs text-white"
                >
                  <option value="registry">{t('Registre public de l’organisme', 'Issuer’s public registry')}</option>
                  <option value="issuer">{t('Appel ou courriel à l’organisme', 'Call or email to the issuer')}</option>
                  <option value="document">{t('Carte originale vue en personne', 'Original card seen in person')}</option>
                  <option value="other">{t('Autre', 'Other')}</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-gray-500" htmlFor={`note-${key}`}>
                  {t('Note (motif d’un refus, référence)', 'Note (reason for refusal, reference)')}
                </label>
                <input
                  id={`note-${key}`}
                  value={notes[key] || ''}
                  onChange={event => setNotes(current => ({ ...current, [key]: event.target.value }))}
                  placeholder={t('Ex. confirmé sur Tradesecrets', 'E.g. confirmed on Tradesecrets')}
                  className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-900 p-2.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { void decide(item, false); }}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-300 disabled:opacity-40"
              >
                <X className="mr-1 inline h-4 w-4" />{t('Refuser', 'Reject')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { void decide(item, true); }}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <Check className="mr-1 inline h-4 w-4" />
                {busy ? t('Enregistrement…', 'Saving…') : t('Confirmer la carte', 'Confirm card')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
