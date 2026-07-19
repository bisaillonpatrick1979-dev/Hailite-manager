import React, { useMemo, useState } from 'react';
import { Camera, Check, Edit, Plus, Trash, X } from 'lucide-react';
import type { EmployeeCredential, EmployeeCredentialType } from '../types';
import { addYearsToDate, getCredentialDaysRemaining, getCredentialStatus } from '../credentialUtils';

type Props = {
  value: EmployeeCredential[];
  onChange: (credentials: EmployeeCredential[]) => void;
  currentLanguage: 'FR' | 'EN';
  canManage?: boolean;
  title?: string;
};

type CredentialDraft = Omit<EmployeeCredential, 'id'>;

const PRESETS: Array<{ type: EmployeeCredentialType; emoji: string; fr: string; en: string }> = [
  { type: 'manlift', emoji: '🪜', fr: 'Manlift / nacelle élévatrice', en: 'Manlift / boom lift' },
  { type: 'scissor_lift', emoji: '🏗️', fr: 'Plateforme autopropulsée / ciseau', en: 'Self-propelled / scissor lift' },
  { type: 'first_aid_cpr', emoji: '❤️', fr: 'Premiers soins, RCR / DEA', en: 'First aid, CPR / AED' },
  { type: 'fall_protection', emoji: '🦺', fr: 'Protection contre les chutes / harnais', en: 'Fall protection / harness' },
  { type: 'whmis', emoji: '⚠️', fr: 'SIMDUT / WHMIS', en: 'WHMIS' },
  { type: 'forklift', emoji: '🚜', fr: 'Chariot élévateur', en: 'Forklift' },
  { type: 'confined_space', emoji: '🕳️', fr: 'Espace clos', en: 'Confined space' },
  { type: 'custom', emoji: '📇', fr: 'Autre certification', en: 'Other certification' }
];

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `credential-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyDraft(language: 'FR' | 'EN'): CredentialDraft {
  return {
    type: 'manlift',
    name: language === 'FR' ? 'Manlift / nacelle élévatrice' : 'Manlift / boom lift',
    issuer: '',
    credentialNumber: '',
    issuedDate: todayIso(),
    expiryDate: '',
    renewalReminderDays: 30,
    doesNotExpire: false,
    photoFront: '',
    photoBack: '',
    notes: '',
    notifiedAt: undefined
  };
}

async function compressImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'));
    reader.onerror = () => reject(reader.error || new Error('Image read failed'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = source;
  });

  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export default function EmployeeCredentialsManager({ value, onChange, currentLanguage, canManage = true, title }: Props) {
  const t = (fr: string, en: string) => currentLanguage === 'FR' ? fr : en;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CredentialDraft>(() => emptyDraft(currentLanguage));
  const [showForm, setShowForm] = useState(false);
  const [imageError, setImageError] = useState('');

  const summary = useMemo(() => value.reduce((totals, credential) => {
    const status = getCredentialStatus(credential);
    totals[status] += 1;
    return totals;
  }, { valid: 0, dueSoon: 0, expired: 0, noExpiry: 0 }), [value]);

  const beginAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft(currentLanguage));
    setImageError('');
    setShowForm(true);
  };

  const beginEdit = (credential: EmployeeCredential) => {
    const { id: _id, ...rest } = credential;
    setEditingId(credential.id);
    setDraft(rest);
    setImageError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setImageError('');
  };

  const save = () => {
    const cleanName = draft.name.trim();
    if (!cleanName) return;
    const nextCredential: EmployeeCredential = {
      ...draft,
      id: editingId || newId(),
      name: cleanName,
      issuer: draft.issuer.trim(),
      credentialNumber: draft.credentialNumber.trim(),
      expiryDate: draft.doesNotExpire ? '' : draft.expiryDate,
      renewalReminderDays: Math.max(0, Number(draft.renewalReminderDays || 30))
    };
    onChange(editingId
      ? value.map(item => item.id === editingId ? nextCredential : item)
      : [...value, nextCredential]);
    closeForm();
  };

  const remove = (id: string) => {
    onChange(value.filter(item => item.id !== id));
    if (editingId === id) closeForm();
  };

  const handlePhoto = async (file: File | undefined, side: 'front' | 'back') => {
    if (!file) return;
    setImageError('');
    try {
      const dataUrl = await compressImage(file);
      setDraft(current => ({ ...current, [side === 'front' ? 'photoFront' : 'photoBack']: dataUrl }));
    } catch {
      setImageError(t("La photo n'a pas pu être traitée.", 'The photo could not be processed.'));
    }
  };

  const selectPreset = (type: EmployeeCredentialType) => {
    const preset = PRESETS.find(item => item.type === type) || PRESETS[PRESETS.length - 1];
    setDraft(current => ({
      ...current,
      type,
      name: type === 'custom' ? '' : (currentLanguage === 'FR' ? preset.fr : preset.en)
    }));
  };

  const statusPresentation = (credential: EmployeeCredential) => {
    const status = getCredentialStatus(credential);
    const days = getCredentialDaysRemaining(credential.expiryDate);
    if (status === 'expired') return { label: t('Expirée', 'Expired'), detail: t(`Expirée depuis ${Math.abs(days || 0)} jour(s)`, `Expired ${Math.abs(days || 0)} day(s) ago`), classes: 'bg-red-500/15 border-red-500/40 text-red-400' };
    if (status === 'dueSoon') return { label: t('À renouveler', 'Renew soon'), detail: t(`${days} jour(s) restant(s)`, `${days} day(s) remaining`), classes: 'bg-amber-500/15 border-amber-500/40 text-amber-400' };
    if (status === 'noExpiry') return { label: t("Sans expiration", 'No expiry'), detail: '', classes: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' };
    return { label: t('Valide', 'Valid'), detail: days === null ? '' : t(`${days} jour(s) restant(s)`, `${days} day(s) remaining`), classes: 'bg-green-500/10 border-green-500/30 text-green-400' };
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/35 p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h5 className="text-sm font-black text-white">🪪 {title || t('Certifications et cartes de compétence', 'Certifications and competency cards')}</h5>
          <p className="text-[10px] text-gray-500 mt-1">{t("Photos, dates d'expiration et rappels de renouvellement.", 'Photos, expiry dates, and renewal reminders.')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={beginAdd} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 px-4 py-2.5 text-xs font-black text-white">
            <Plus className="w-4 h-4" /> {t('Ajouter une carte', 'Add a card')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-2.5"><p className="text-[9px] uppercase font-black text-green-500">{t('Valides', 'Valid')}</p><p className="text-xl font-black text-green-400">{summary.valid}</p></div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5"><p className="text-[9px] uppercase font-black text-amber-500">{t('Bientôt', 'Soon')}</p><p className="text-xl font-black text-amber-400">{summary.dueSoon}</p></div>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-2.5"><p className="text-[9px] uppercase font-black text-red-500">{t('Expirées', 'Expired')}</p><p className="text-xl font-black text-red-400">{summary.expired}</p></div>
        <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-2.5"><p className="text-[9px] uppercase font-black text-cyan-500">{t('Sans échéance', 'No expiry')}</p><p className="text-xl font-black text-cyan-400">{summary.noExpiry}</p></div>
      </div>

      {value.length === 0 && !showForm && (
        <div className="rounded-2xl border-2 border-dashed border-gray-700 p-6 text-center">
          <div className="text-4xl">🪪</div>
          <p className="mt-2 text-sm font-black text-white">{t('Aucune carte enregistrée', 'No card recorded')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('Ajoutez le manlift, la plateforme, les premiers soins/RCR, la protection contre les chutes ou une autre formation.', 'Add manlift, platform, first aid/CPR, fall protection, or another training card.')}</p>
        </div>
      )}

      <div className="space-y-3">
        {value.map(credential => {
          const preset = PRESETS.find(item => item.type === credential.type) || PRESETS[PRESETS.length - 1];
          const status = statusPresentation(credential);
          return (
            <article key={credential.id} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-3xl" aria-hidden="true">{preset.emoji}</span>
                  <div className="min-w-0">
                    <h6 className="text-sm font-black text-white break-words">{credential.name}</h6>
                    <p className="text-[10px] text-gray-500 mt-1">{credential.issuer || t('Organisme non précisé', 'Issuer not specified')}{credential.credentialNumber ? ` · #${credential.credentialNumber}` : ''}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${status.classes}`}>{status.label}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div className="rounded-lg bg-gray-900 p-2"><span className="block uppercase font-bold text-gray-500">{t('Obtenue', 'Issued')}</span><span className="font-bold text-white">{credential.issuedDate || '—'}</span></div>
                <div className="rounded-lg bg-gray-900 p-2"><span className="block uppercase font-bold text-gray-500">{t('Expiration', 'Expiry')}</span><span className="font-bold text-white">{credential.doesNotExpire ? t('Aucune', 'None') : credential.expiryDate || '—'}</span></div>
                <div className="rounded-lg bg-gray-900 p-2"><span className="block uppercase font-bold text-gray-500">{t('Alerte', 'Alert')}</span><span className="font-bold text-amber-400">{credential.doesNotExpire ? '—' : `${credential.renewalReminderDays ?? 30} ${t('jours', 'days')}`}</span></div>
                <div className="rounded-lg bg-gray-900 p-2"><span className="block uppercase font-bold text-gray-500">{t('État', 'Status')}</span><span className="font-bold" style={{ color: status.classes.includes('red') ? '#f87171' : status.classes.includes('amber') ? '#fbbf24' : '#4ade80' }}>{status.detail || status.label}</span></div>
              </div>

              {(credential.photoFront || credential.photoBack) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {credential.photoFront && <img src={credential.photoFront} alt={t('Recto de la carte', 'Card front')} className="w-full h-36 object-contain rounded-xl border border-gray-800 bg-black" />}
                  {credential.photoBack && <img src={credential.photoBack} alt={t('Verso de la carte', 'Card back')} className="w-full h-36 object-contain rounded-xl border border-gray-800 bg-black" />}
                </div>
              )}

              {credential.notes && <p className="text-xs text-gray-400 rounded-xl bg-gray-900 p-3">{credential.notes}</p>}

              {canManage && (
                <div className="flex flex-wrap gap-2 justify-end">
                  {(getCredentialStatus(credential) === 'dueSoon' || getCredentialStatus(credential) === 'expired') && (
                    <button type="button" onClick={() => onChange(value.map(item => item.id === credential.id ? { ...item, notifiedAt: new Date().toISOString() } : item))} className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-black">
                      <Check className="inline w-3.5 h-3.5 mr-1" /> {credential.notifiedAt ? t('Avis envoyé', 'Notice sent') : t('Marquer comme averti', 'Mark notified')}
                    </button>
                  )}
                  <button type="button" onClick={() => beginEdit(credential)} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-[10px] font-black"><Edit className="inline w-3.5 h-3.5 mr-1" />{t('Modifier / renouveler', 'Edit / renew')}</button>
                  <button type="button" onClick={() => remove(credential.id)} className="p-2 rounded-lg bg-red-950 border border-red-900/50 text-red-400" aria-label={t('Supprimer', 'Delete')}><Trash className="w-4 h-4" /></button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {showForm && canManage && (
        <div className="rounded-2xl border border-orange-500/35 bg-gray-950 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h6 className="text-xs font-black uppercase text-orange-400">{editingId ? t('Modifier ou renouveler la carte', 'Edit or renew card') : t('Nouvelle carte de compétence', 'New competency card')}</h6>
            <button type="button" onClick={closeForm} className="p-2 rounded-full bg-gray-900 text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] uppercase font-black text-gray-500">{t('Type de formation', 'Training type')}</label>
              <select value={draft.type} onChange={event => selectPreset(event.target.value as EmployeeCredentialType)} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs">
                {PRESETS.map(preset => <option key={preset.type} value={preset.type}>{preset.emoji} {currentLanguage === 'FR' ? preset.fr : preset.en}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-gray-500">{t('Nom inscrit sur la carte', 'Name on card')}</label>
              <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-gray-500">{t('Organisme de formation', 'Training provider')}</label>
              <input value={draft.issuer} onChange={event => setDraft({ ...draft, issuer: event.target.value })} placeholder={t('Ex. Energy Safety Canada', 'E.g. Energy Safety Canada')} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-gray-500">{t('Numéro de carte', 'Card number')}</label>
              <input value={draft.credentialNumber} onChange={event => setDraft({ ...draft, credentialNumber: event.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs font-mono" />
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-gray-500">{t("Date d'obtention", 'Issue date')}</label>
              <input type="date" value={draft.issuedDate} onChange={event => setDraft({ ...draft, issuedDate: event.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-gray-500">{t("Date d'expiration", 'Expiry date')}</label>
              <input type="date" disabled={draft.doesNotExpire} value={draft.expiryDate} onChange={event => setDraft({ ...draft, expiryDate: event.target.value, notifiedAt: undefined })} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs disabled:opacity-40" />
              {!draft.doesNotExpire && draft.issuedDate && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {[1, 2, 3, 4].map(years => <button type="button" key={years} onClick={() => setDraft({ ...draft, expiryDate: addYearsToDate(draft.issuedDate, years), notifiedAt: undefined })} className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-[9px] font-bold text-gray-300">+{years} {t('an', 'yr')}</button>)}
                </div>
              )}
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 rounded-xl bg-gray-900 border border-gray-800 p-3 text-xs font-bold text-gray-300">
              <input type="checkbox" checked={draft.doesNotExpire} onChange={event => setDraft({ ...draft, doesNotExpire: event.target.checked, expiryDate: event.target.checked ? '' : draft.expiryDate })} className="w-4 h-4 accent-orange-600" />
              {t("Cette carte n'a pas de date d'expiration", 'This card has no expiry date')}
            </label>
            {!draft.doesNotExpire && (
              <div>
                <label className="text-[9px] uppercase font-black text-gray-500">{t("Alerter avant l'expiration", 'Alert before expiry')}</label>
                <select value={draft.renewalReminderDays} onChange={event => setDraft({ ...draft, renewalReminderDays: Number(event.target.value) })} className="w-full mt-1 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs">
                  {[7, 14, 30, 45, 60, 90].map(days => <option key={days} value={days}>{days} {t('jours', 'days')}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['front', 'back'] as const).map(side => {
              const photo = side === 'front' ? draft.photoFront : draft.photoBack;
              const inputId = `credential-photo-${side}-${editingId || 'new'}`;
              return (
                <div key={side} className="rounded-xl bg-gray-900 border border-gray-800 p-3 space-y-2">
                  <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => handlePhoto(event.target.files?.[0], side)} />
                  <label htmlFor={inputId} className="flex items-center justify-center gap-2 cursor-pointer rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 px-3 py-2 text-[10px] font-black uppercase"><Camera className="w-4 h-4" />{side === 'front' ? t('Photographier le recto', 'Photograph front') : t('Photographier le verso', 'Photograph back')}</label>
                  {photo && <><img src={photo} alt={side} className="w-full h-32 object-contain rounded-lg bg-black border border-gray-800" /><button type="button" onClick={() => setDraft({ ...draft, [side === 'front' ? 'photoFront' : 'photoBack']: '' })} className="w-full text-[9px] font-bold text-red-400">{t('Retirer la photo', 'Remove photo')}</button></>}
                </div>
              );
            })}
          </div>
          {imageError && <p className="text-xs text-red-400">{imageError}</p>}

          <div>
            <label className="text-[9px] uppercase font-black text-gray-500">{t('Notes', 'Notes')}</label>
            <textarea value={draft.notes || ''} onChange={event => setDraft({ ...draft, notes: event.target.value })} className="w-full mt-1 min-h-20 p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-xs" placeholder={t('Restrictions, catégorie de machine, détails du cours…', 'Restrictions, machine category, course details…')} />
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={closeForm} className="px-4 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-xs font-black">{t('Annuler', 'Cancel')}</button>
            <button type="button" disabled={!draft.name.trim()} onClick={save} className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black disabled:opacity-40"><Check className="inline w-4 h-4 mr-1" />{t('Enregistrer', 'Save')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
