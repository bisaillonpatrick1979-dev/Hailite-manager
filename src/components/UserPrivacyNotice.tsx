import React, { useState } from 'react';
import { Check, MapPin, ShieldCheck } from 'lucide-react';
import type { CompanyInfo, Employee } from '../types';

export const USER_PRIVACY_NOTICE_VERSION = '2026.07';

type Props = {
  employee: Employee;
  companyInfo: CompanyInfo;
  currentLanguage: 'FR' | 'EN';
  onAccept: (updated: Employee) => void;
};

export default function UserPrivacyNotice({ employee, companyInfo, currentLanguage, onAccept }: Props) {
  const [readNotice, setReadNotice] = useState(false);
  const [locationNotice, setLocationNotice] = useState(false);
  const t = (fr: string, en: string) => currentLanguage === 'FR' ? fr : en;
  const localOnly = companyInfo.dataStorageMode === 'local';
  const storageText = localOnly
    ? t('sur cet appareil seulement', 'on this device only')
    : t(`sur l’appareil et dans le service infonuagique situé au Canada (${companyInfo.cloudRegion || 'ca-central-1'})`, `on the device and in cloud services located in Canada (${companyInfo.cloudRegion || 'ca-central-1'})`);

  const accept = () => {
    if (!readNotice || !locationNotice) return;
    const now = new Date().toISOString();
    onAccept({
      ...employee,
      privacyNoticeVersion: USER_PRIVACY_NOTICE_VERSION,
      privacyNoticeAcknowledgedAt: now,
      locationNoticeAcknowledgedAt: now
    });
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md overflow-y-auto p-4 flex items-center justify-center">
      <section className="w-full max-w-2xl rounded-3xl border border-cyan-500/30 bg-[#111722] text-white shadow-2xl overflow-hidden">
        <header className="p-5 sm:p-7 border-b border-slate-700 bg-gradient-to-r from-slate-950 to-slate-900">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-400/30"><ShieldCheck className="w-7 h-7 text-cyan-300" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-cyan-300">{companyInfo.name}</p>
              <h2 className="text-2xl font-black mt-1">{t('Avis de confidentialité au personnel', 'Workforce privacy notice')}</h2>
              <p className="text-sm text-slate-300 mt-2">{t('Vous devez lire cet avis avant d’utiliser le pointage et les dossiers de chantier.', 'Read this notice before using time tracking and job records.')}</p>
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-7 space-y-5 text-sm leading-relaxed text-slate-200">
          <div className="rounded-2xl bg-slate-950 border border-slate-700 p-4 space-y-2">
            <h3 className="font-black text-white">1. {t('Données traitées', 'Data processed')}</h3>
            <p>{t('L’application peut traiter votre identité professionnelle, coordonnées, taux et heures de travail, chantiers assignés, pointages, pauses, factures, signatures, cartes de compétence, photos et documents nécessaires à l’emploi ou au contrat.', 'The application may process your professional identity, contact details, pay rate and work hours, assigned jobs, punches, breaks, invoices, signatures, competency cards, photos, and documents required for employment or contracting.')}</p>
          </div>

          <div className="rounded-2xl bg-slate-950 border border-slate-700 p-4 space-y-2">
            <h3 className="font-black text-white">2. {t('Pourquoi et où', 'Purpose and storage')}</h3>
            <p>{t(`Ces données servent à gérer les chantiers, la sécurité, la paie, la facturation et les obligations administratives. Elles sont conservées ${storageText}.`, `This data supports job management, safety, payroll, invoicing, and administrative obligations. It is stored ${storageText}.`)}</p>
            <p>{t(`Durée de conservation configurée par la compagnie : ${companyInfo.retentionMonths || 84} mois, sous réserve des obligations légales applicables.`, `Company-configured retention: ${companyInfo.retentionMonths || 84} months, subject to applicable legal obligations.`)}</p>
          </div>

          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2">
            <h3 className="font-black text-amber-300 flex items-center gap-2"><MapPin className="w-5 h-5" />3. {t('Localisation', 'Location')}</h3>
            <p>{t('Lorsque le géorepérage est activé, votre position est consultée au moment du pointage afin de vérifier la proximité du chantier. L’application n’annonce pas un suivi continu en arrière-plan. La compagnie doit vous informer de sa base juridique et de ses règles internes applicables.', 'When geofencing is enabled, your location is checked at punch time to verify proximity to the job site. The application does not represent that it performs continuous background tracking. The company must inform you of its applicable legal basis and internal rules.')}</p>
          </div>

          <div className="rounded-2xl bg-slate-950 border border-slate-700 p-4 space-y-2">
            <h3 className="font-black text-white">4. {t('Vos demandes', 'Your requests')}</h3>
            <p>{t('Pour demander l’accès, la correction ou la suppression de renseignements, ou poser une question sur leur utilisation, communiquez avec :', 'To request access, correction, or deletion of information, or ask how it is used, contact:')}</p>
            <p className="font-black text-cyan-300 break-all">{companyInfo.privacyContactEmail || companyInfo.email || t('Responsable de la compagnie', 'Company contact')}</p>
            {companyInfo.privacyOfficerName && <p className="text-slate-400">{companyInfo.privacyOfficerName}</p>}
          </div>

          <p className="text-[11px] text-slate-400">{t('Cet écran confirme que l’avis a été présenté. Il ne remplace pas l’analyse par la compagnie de la base juridique applicable dans chaque pays ou relation de travail.', 'This screen records that notice was presented. It does not replace the company’s assessment of the lawful basis applicable in each country or employment relationship.')}</p>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-600 bg-slate-950 p-4 cursor-pointer">
            <input type="checkbox" checked={readNotice} onChange={event => setReadNotice(event.target.checked)} className="mt-1 w-5 h-5 accent-cyan-500" />
            <span className="font-bold">{t('J’ai lu et compris l’avis sur la collecte, l’utilisation, le stockage et mes moyens de communiquer avec la compagnie.', 'I have read and understood the notice about collection, use, storage, and how to contact the company.')}</span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-600 bg-slate-950 p-4 cursor-pointer">
            <input type="checkbox" checked={locationNotice} onChange={event => setLocationNotice(event.target.checked)} className="mt-1 w-5 h-5 accent-cyan-500" />
            <span className="font-bold">{t('Je comprends que la localisation peut être consultée au moment du pointage lorsque cette fonction est activée.', 'I understand that location may be checked at punch time when this feature is enabled.')}</span>
          </label>
        </div>

        <footer className="p-5 sm:p-7 border-t border-slate-700 bg-slate-950/70">
          <button type="button" disabled={!readNotice || !locationNotice} onClick={accept} className="w-full min-h-14 rounded-2xl bg-emerald-500 text-slate-950 font-black text-lg disabled:opacity-40 inline-flex items-center justify-center gap-2">
            <Check className="w-5 h-5" /> {t('Confirmer et continuer', 'Confirm and continue')}
          </button>
        </footer>
      </section>
    </div>
  );
}
