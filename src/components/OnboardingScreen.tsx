import React, { useMemo, useState } from 'react';
import useAppStore from '../store';
import { getDefaultRegion, getJurisdictionDefaults, getRegionsForMarket, marketLabel, type MarketCode, type UnitSystem } from '../internationalRegions';
import { setCloudSyncAllowed } from '../apiClient';
import { compressImageFile } from '../imageUtils';
import CompanyLogo from './CompanyLogo';
import {
  Building2, Camera, Check, ChevronLeft, ChevronRight, Database,
  Globe2, MapPin, Palette, ReceiptText, ShieldCheck, Trash
} from 'lucide-react';

export const COMPLIANCE_VERSION = '2026.07';
export const PRIVACY_POLICY_VERSION = '2026.07';
const CLOUD_REGION = 'ca-central-1';

const THEMES = [
  { id: 'quantum' as const, labelFR: 'Bleu professionnel', labelEN: 'Professional blue', preview: 'bg-orange-500' },
  { id: 'arctic' as const, labelFR: 'Clair et accessible', labelEN: 'Bright and accessible', preview: 'bg-sky-300' },
  { id: 'carbon' as const, labelFR: 'Noir sobre', labelEN: 'Clean black', preview: 'bg-zinc-300' },
  { id: 'deco' as const, labelFR: 'Or chantier', labelEN: 'Job-site gold', preview: 'bg-amber-500' }
];

type StorageMode = 'local' | 'hybrid' | 'cloud';

export default function OnboardingScreen() {
  const {
    currentLanguage, setLanguage, currentTheme, setTheme,
    companyInfo, updateCompanyInfo, setIsOnboarded
  } = useAppStore();

  const isFR = currentLanguage === 'FR';
  const initialMarket: MarketCode = companyInfo.country === 'US' || companyInfo.country === 'EU' ? companyInfo.country : 'CA';
  const initialDefaults = getJurisdictionDefaults(initialMarket, companyInfo.region);

  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState(companyInfo.name || '');
  const [companyEmail, setCompanyEmail] = useState(companyInfo.email || '');
  const [privacyContactEmail, setPrivacyContactEmail] = useState(companyInfo.privacyContactEmail || companyInfo.email || '');
  const [privacyOfficerName, setPrivacyOfficerName] = useState(companyInfo.privacyOfficerName || '');
  const [logo, setLogo] = useState(companyInfo.logo || '');
  const [logoError, setLogoError] = useState('');

  const [market, setMarket] = useState<MarketCode>(initialMarket);
  const [regionCode, setRegionCode] = useState(initialDefaults.region.code);
  const [currency, setCurrency] = useState(companyInfo.currency || initialDefaults.currency);
  const [dateLocale, setDateLocale] = useState(companyInfo.dateLocale || initialDefaults.locale);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(companyInfo.unitSystem || initialDefaults.unitSystem);

  const selectedDefaults = useMemo(() => getJurisdictionDefaults(market, regionCode), [market, regionCode]);
  const regions = getRegionsForMarket(market);
  const selectedRegion = getDefaultRegion(market, regionCode);

  const [taxRate1Pct, setTaxRate1Pct] = useState(Number(((companyInfo.taxRate1 ?? initialDefaults.region.taxRate1) * 100).toFixed(3)));
  const [taxRate2Pct, setTaxRate2Pct] = useState(Number(((companyInfo.taxRate2 ?? initialDefaults.region.taxRate2) * 100).toFixed(3)));
  const [localTaxPct, setLocalTaxPct] = useState(Number(((companyInfo.localTaxRate ?? 0) * 100).toFixed(3)));
  const [taxRate1Name, setTaxRate1Name] = useState(companyInfo.taxRate1Name || (isFR ? initialDefaults.region.taxRate1NameFR : initialDefaults.region.taxRate1NameEN));
  const [taxRate2Name, setTaxRate2Name] = useState(companyInfo.taxRate2Name || (isFR ? initialDefaults.region.taxRate2NameFR : initialDefaults.region.taxRate2NameEN));
  const [taxNum1, setTaxNum1] = useState(companyInfo.gstNumber || '');
  const [taxNum2, setTaxNum2] = useState(companyInfo.qstNumber || '');
  const [taxConfirmed, setTaxConfirmed] = useState(false);

  const [storageMode, setStorageMode] = useState<StorageMode>(companyInfo.dataStorageMode || 'hybrid');
  const [retentionMonths, setRetentionMonths] = useState(companyInfo.retentionMonths || 84);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [employeeBasisConfirmed, setEmployeeBasisConfirmed] = useState(false);
  const [locationNoticeConfirmed, setLocationNoticeConfirmed] = useState(false);
  const [crossBorderAccepted, setCrossBorderAccepted] = useState(false);

  const changeMarket = (nextMarket: MarketCode) => {
    const defaults = getJurisdictionDefaults(nextMarket);
    setMarket(nextMarket);
    setRegionCode(defaults.region.code);
    setCurrency(defaults.currency);
    setDateLocale(defaults.locale);
    setUnitSystem(defaults.unitSystem);
    setTaxRate1Pct(Number((defaults.region.taxRate1 * 100).toFixed(3)));
    setTaxRate2Pct(Number((defaults.region.taxRate2 * 100).toFixed(3)));
    setLocalTaxPct(0);
    setTaxRate1Name(isFR ? defaults.region.taxRate1NameFR : defaults.region.taxRate1NameEN);
    setTaxRate2Name(isFR ? defaults.region.taxRate2NameFR : defaults.region.taxRate2NameEN);
    setTaxConfirmed(false);
    setCrossBorderAccepted(false);
  };

  const changeRegion = (code: string) => {
    const defaults = getJurisdictionDefaults(market, code);
    setRegionCode(code);
    setCurrency(defaults.currency);
    setDateLocale(defaults.locale);
    setUnitSystem(defaults.unitSystem);
    setTaxRate1Pct(Number((defaults.region.taxRate1 * 100).toFixed(3)));
    setTaxRate2Pct(Number((defaults.region.taxRate2 * 100).toFixed(3)));
    setLocalTaxPct(0);
    setTaxRate1Name(isFR ? defaults.region.taxRate1NameFR : defaults.region.taxRate1NameEN);
    setTaxRate2Name(isFR ? defaults.region.taxRate2NameFR : defaults.region.taxRate2NameEN);
    setTaxConfirmed(false);
  };

  const handleLogo = async (file?: File) => {
    if (!file) return;
    try {
      setLogoError('');
      setLogo(await compressImageFile(file, 1200, 0.84));
    } catch {
      setLogoError(isFR ? "Le logo n'a pas pu être traité." : 'The logo could not be processed.');
    }
  };

  const needsCrossBorderAcknowledgement = market === 'EU' && storageMode !== 'local';
  const canContinue = (() => {
    if (step === 1) return companyName.trim().length >= 2 && companyEmail.includes('@') && privacyContactEmail.includes('@');
    if (step === 2) return !!regionCode && !!currency && !!dateLocale;
    if (step === 3) return taxConfirmed;
    if (step === 4) return privacyAccepted && employeeBasisConfirmed && locationNoticeConfirmed && (!needsCrossBorderAcknowledgement || crossBorderAccepted);
    return true;
  })();

  const finish = () => {
    const now = new Date().toISOString();
    const cleanName = companyName.trim() || (isFR ? 'Mon entreprise' : 'My company');
    const cloudAllowed = storageMode !== 'local';
    setCloudSyncAllowed(cloudAllowed);
    updateCompanyInfo({
      name: cleanName,
      email: companyEmail.trim(),
      privacyContactEmail: privacyContactEmail.trim(),
      privacyOfficerName: privacyOfficerName.trim(),
      logo,
      country: market,
      region: selectedRegion.code,
      currency,
      dateLocale,
      unitSystem,
      gstNumber: taxNum1.trim(),
      qstNumber: taxNum2.trim(),
      taxRate1: Math.max(0, taxRate1Pct) / 100,
      taxRate2: Math.max(0, taxRate2Pct) / 100,
      localTaxRate: Math.max(0, localTaxPct) / 100,
      taxRate1Name: taxRate1Name.trim(),
      taxRate2Name: taxRate2Name.trim(),
      taxConfirmedAt: now,
      taxDisclaimerAcceptedAt: now,
      dataStorageMode: storageMode,
      cloudSyncConsent: cloudAllowed,
      cloudRegion: CLOUD_REGION,
      retentionMonths: Math.max(1, retentionMonths),
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      privacyPolicyAcceptedAt: now,
      processorTermsAcceptedAt: now,
      employeeDataBasisConfirmed: employeeBasisConfirmed,
      locationDataNoticeConfirmed: locationNoticeConfirmed,
      crossBorderTransferAcknowledgedAt: needsCrossBorderAcknowledgement ? now : undefined,
      complianceVersion: COMPLIANCE_VERSION,
      isOnboarded: true
    });
    setIsOnboarded(true);
    document.title = `${cleanName} — Hailite Manager`;
  };

  const storageOptions: Array<{ id: StorageMode; icon: string; fr: string; en: string; descFR: string; descEN: string }> = [
    { id: 'local', icon: '📱', fr: 'Local seulement', en: 'Local only', descFR: 'Les données restent dans ce navigateur/appareil. Aucun nuage ni sauvegarde automatique.', descEN: 'Data stays in this browser/device. No cloud or automatic backup.' },
    { id: 'hybrid', icon: '🔄', fr: 'Hybride', en: 'Hybrid', descFR: 'Copie locale pour le chantier et synchronisation dans le nuage canadien.', descEN: 'Local job-site copy plus synchronization to the Canadian cloud.' },
    { id: 'cloud', icon: '☁️', fr: 'Nuage', en: 'Cloud', descFR: 'Le nuage canadien est la source principale, avec cache local technique.', descEN: 'The Canadian cloud is the main source, with a technical local cache.' }
  ];

  return (
    <main id="hailite-onboarding-screen" className="min-h-screen bg-[#0F1115] text-[#E0E2E6] font-sans px-4 py-5 sm:px-6 flex items-center justify-center">
      <section className="w-full max-w-4xl rounded-3xl border border-gray-800 bg-[#16191F] shadow-2xl overflow-hidden">
        <header className="p-5 sm:p-7 border-b border-gray-800 bg-gradient-to-r from-[#16191F] to-[#111318]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CompanyLogo logo={logo} companyName={companyName} className="w-14 h-14 rounded-2xl border border-orange-400/30 bg-white p-1" imageClassName="w-full h-full object-contain rounded-xl" fallbackClassName="rounded-2xl bg-orange-500 text-white text-lg" />
              <div><p className="text-sm font-bold uppercase tracking-widest text-orange-300">Hailite Manager</p><h1 className="text-2xl sm:text-3xl font-black">{isFR ? 'Configuration internationale' : 'International setup'}</h1></div>
            </div>
            <div className="flex items-center gap-1.5" aria-label={isFR ? 'Progression' : 'Progress'}>
              {[1, 2, 3, 4, 5].map(number => <div key={number} className={`h-9 w-9 rounded-xl border flex items-center justify-center font-black ${step === number ? 'bg-orange-600 text-white border-orange-500' : step > number ? 'bg-emerald-500/20 text-orange-400 border-emerald-500/40' : 'bg-[#1A1E26] text-gray-500 border-gray-800'}`}>{step > number ? <Check className="h-4 w-4" /> : number}</div>)}
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-8 max-h-[72vh] overflow-y-auto">
          {step === 1 && <div className="space-y-6">
            <div><h2 className="text-2xl font-black flex items-center gap-3"><Globe2 className="h-7 w-7 text-orange-300" />{isFR ? 'Langue, compagnie et logo' : 'Language, company, and logo'}</h2><p className="mt-2 text-gray-300">{isFR ? 'L’interface est offerte en français et en anglais. Les formats, taxes et documents suivront ensuite le pays choisi.' : 'The interface is available in French and English. Formats, taxes, and documents will then follow the selected country.'}</p></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => setLanguage('FR')} className={`min-h-14 rounded-2xl border px-5 text-lg font-bold ${currentLanguage === 'FR' ? 'bg-orange-600 text-white border-orange-500' : 'bg-[#1A1E26] border-gray-800'}`}>Français</button>
              <button type="button" onClick={() => setLanguage('EN')} className={`min-h-14 rounded-2xl border px-5 text-lg font-bold ${currentLanguage === 'EN' ? 'bg-orange-600 text-white border-orange-500' : 'bg-[#1A1E26] border-gray-800'}`}>English</button>
            </div>
            <div className="grid sm:grid-cols-[160px_1fr] gap-5 items-start">
              <div className="rounded-2xl border border-gray-800 bg-[#0F1115] p-4 space-y-3 text-center">
                <CompanyLogo logo={logo} companyName={companyName} className="w-28 h-28 mx-auto rounded-2xl border border-gray-700 bg-white p-2" imageClassName="w-full h-full object-contain rounded-xl" fallbackClassName="rounded-2xl bg-orange-600 text-white text-3xl" />
                <input id="company-logo-upload" type="file" accept="image/*" capture="environment" className="hidden" onChange={event => handleLogo(event.target.files?.[0])} />
                <label htmlFor="company-logo-upload" className="cursor-pointer min-h-11 rounded-xl bg-orange-500/15 border border-orange-400/30 text-orange-300 font-black text-xs px-3 inline-flex items-center justify-center gap-2"><Camera className="w-4 h-4" />{isFR ? 'Ajouter le logo' : 'Add logo'}</label>
                {logo && <button type="button" onClick={() => setLogo('')} className="w-full text-xs font-bold text-red-400 inline-flex items-center justify-center gap-1"><Trash className="w-3.5 h-3.5" />{isFR ? 'Retirer' : 'Remove'}</button>}
                {logoError && <p className="text-[10px] text-red-400">{logoError}</p>}
              </div>
              <div className="space-y-4">
                <label className="block"><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Nom légal ou commercial' : 'Legal or business name'}</span><input value={companyName} onChange={event => setCompanyName(event.target.value)} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg" /></label>
                <label className="block"><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Courriel de compagnie' : 'Company email'}</span><input type="email" value={companyEmail} onChange={event => setCompanyEmail(event.target.value)} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg" /></label>
                <label className="block"><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Courriel pour les demandes de confidentialité' : 'Privacy request email'}</span><input type="email" value={privacyContactEmail} onChange={event => setPrivacyContactEmail(event.target.value)} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg" /></label>
              </div>
            </div>
          </div>}

          {step === 2 && <div className="space-y-6">
            <div><h2 className="text-2xl font-black flex items-center gap-3"><MapPin className="h-7 w-7 text-orange-300" />{isFR ? 'Pays, région et formats' : 'Country, region, and formats'}</h2><p className="mt-2 text-gray-300">{isFR ? 'Le Canada comprend toutes les provinces et territoires; les États-Unis comprennent les 50 États et Washington D.C.; l’Union européenne comprend les 27 pays.' : 'Canada includes all provinces and territories; the United States includes all 50 states and Washington D.C.; the European Union includes all 27 countries.'}</p></div>
            <div className="grid sm:grid-cols-3 gap-3">{(['CA','US','EU'] as MarketCode[]).map(item => <button key={item} type="button" onClick={() => changeMarket(item)} className={`min-h-16 rounded-2xl border px-4 text-lg font-black ${market === item ? 'bg-orange-600 text-white border-orange-500' : 'bg-[#1A1E26] border-gray-800'}`}>{marketLabel(item, currentLanguage)}</button>)}</div>
            <label className="block"><span className="block mb-2 font-bold text-gray-200">{market === 'CA' ? (isFR ? 'Province ou territoire' : 'Province or territory') : market === 'US' ? (isFR ? 'État ou district' : 'State or district') : (isFR ? 'Pays de l’Union européenne' : 'European Union country')}</span><select value={selectedRegion.code} onChange={event => changeRegion(event.target.value)} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg">{regions.map(region => <option key={region.code} value={region.code}>{isFR ? region.nameFR : region.nameEN}</option>)}</select></label>
            <div className="grid sm:grid-cols-3 gap-4">
              <label><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Devise' : 'Currency'}</span><input value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} maxLength={3} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg font-mono uppercase" /></label>
              <label><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Format régional' : 'Regional format'}</span><input value={dateLocale} onChange={event => setDateLocale(event.target.value)} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg font-mono" /></label>
              <label><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Unités' : 'Units'}</span><select value={unitSystem} onChange={event => setUnitSystem(event.target.value as UnitSystem)} className="w-full min-h-14 rounded-2xl border border-gray-700 bg-[#0F1115] px-4 text-lg"><option value="imperial">{isFR ? 'Impériales (pi, po)' : 'Imperial (ft, in)'}</option><option value="metric">{isFR ? 'Métriques (m, cm)' : 'Metric (m, cm)'}</option></select></label>
            </div>
          </div>}

          {step === 3 && <div className="space-y-6">
            <div><h2 className="text-2xl font-black flex items-center gap-3"><ReceiptText className="h-7 w-7 text-orange-300" />{isFR ? 'Taxes à confirmer' : 'Tax confirmation'}</h2><p className="mt-2 text-gray-300">{isFR ? 'Les taux officiels de référence sont préremplis, mais l’application ne peut pas décider seule de la taxabilité d’un chantier.' : 'Official reference rates are prefilled, but the application cannot determine job taxability on its own.'}</p></div>
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5"><p className="font-black text-amber-300">⚠️ {isFR ? selectedDefaults.taxWarningFR : selectedDefaults.taxWarningEN}</p></div>
            <div className="grid sm:grid-cols-3 gap-4">
              <label><span className="block mb-2 text-sm font-bold text-gray-200">{isFR ? 'Nom taxe principale' : 'Primary tax name'}</span><input value={taxRate1Name} onChange={event => setTaxRate1Name(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3" /><input type="number" step="0.001" min="0" value={taxRate1Pct} onChange={event => setTaxRate1Pct(Number(event.target.value))} className="w-full mt-2 min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3 font-mono" /><span className="text-xs text-gray-500">%</span></label>
              <label><span className="block mb-2 text-sm font-bold text-gray-200">{isFR ? 'Deuxième taxe' : 'Second tax'}</span><input value={taxRate2Name} onChange={event => setTaxRate2Name(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3" /><input type="number" step="0.001" min="0" value={taxRate2Pct} onChange={event => setTaxRate2Pct(Number(event.target.value))} className="w-full mt-2 min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3 font-mono" /><span className="text-xs text-gray-500">%</span></label>
              <label><span className="block mb-2 text-sm font-bold text-gray-200">{market === 'US' ? (isFR ? 'Comté/ville/district' : 'County/city/district') : (isFR ? 'Taxe locale additionnelle' : 'Additional local tax')}</span><input type="number" step="0.001" min="0" value={localTaxPct} onChange={event => setLocalTaxPct(Number(event.target.value))} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3 font-mono" /><span className="text-xs text-gray-500">%</span></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-4"><label><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Numéro fiscal principal (facultatif)' : 'Primary tax number (optional)'}</span><input value={taxNum1} onChange={event => setTaxNum1(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3" /></label><label><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Deuxième numéro fiscal (facultatif)' : 'Second tax number (optional)'}</span><input value={taxNum2} onChange={event => setTaxNum2(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3" /></label></div>
            <label className="flex items-start gap-3 rounded-2xl border border-gray-700 bg-[#0F1115] p-4 cursor-pointer"><input type="checkbox" checked={taxConfirmed} onChange={event => setTaxConfirmed(event.target.checked)} className="mt-1 w-5 h-5 accent-orange-500" /><span className="font-bold">{isFR ? 'Je confirme avoir vérifié ces taux pour mon entreprise, mon lieu de travail et la nature de mes services. Je comprends que je dois les mettre à jour lorsque les règles changent.' : 'I confirm that I checked these rates for my business, work location, and services. I understand that I must update them when rules change.'}</span></label>
          </div>}

          {step === 4 && <div className="space-y-6">
            <div><h2 className="text-2xl font-black flex items-center gap-3"><Database className="h-7 w-7 text-orange-300" />{isFR ? 'Données, confidentialité et hébergement' : 'Data, privacy, and hosting'}</h2><p className="mt-2 text-gray-300">{isFR ? 'Choisissez où les données sont conservées. Le nuage actuellement connecté est situé au Canada, région Canada Central.' : 'Choose where data is stored. The currently connected cloud is located in Canada, Canada Central region.'}</p></div>
            <div className="grid sm:grid-cols-3 gap-3">{storageOptions.map(option => <button key={option.id} type="button" onClick={() => setStorageMode(option.id)} className={`rounded-2xl border p-4 text-left min-h-36 ${storageMode === option.id ? 'border-orange-300 bg-orange-500/15' : 'border-gray-800 bg-[#1A1E26]'}`}><span className="text-3xl">{option.icon}</span><p className="font-black text-lg mt-2">{isFR ? option.fr : option.en}</p><p className="text-xs text-gray-400 mt-1">{isFR ? option.descFR : option.descEN}</p></button>)}</div>
            {storageMode !== 'local' && <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4"><p className="font-black text-blue-300">☁️ Supabase · Canada Central · {CLOUD_REGION}</p><p className="text-sm text-gray-300 mt-1">{isFR ? 'Les données peuvent inclure employés, clients, chantiers, GPS au pointage, paie, factures, signatures, cartes de compétence, photos et pièces jointes.' : 'Data may include employees, clients, jobs, punch-time GPS, payroll, invoices, signatures, competency cards, photos, and attachments.'}</p></div>}
            <div className="grid sm:grid-cols-3 gap-4"><label className="sm:col-span-2"><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Responsable de la confidentialité' : 'Privacy contact person'}</span><input value={privacyOfficerName} onChange={event => setPrivacyOfficerName(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3" /></label><label><span className="block mb-2 font-bold text-gray-200">{isFR ? 'Conservation (mois)' : 'Retention (months)'}</span><input type="number" min="1" value={retentionMonths} onChange={event => setRetentionMonths(Number(event.target.value))} className="w-full min-h-12 rounded-xl border border-gray-700 bg-[#0F1115] px-3 font-mono" /></label></div>
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-2xl border border-gray-700 bg-[#0F1115] p-4 cursor-pointer"><input type="checkbox" checked={privacyAccepted} onChange={event => setPrivacyAccepted(event.target.checked)} className="mt-1 w-5 h-5 accent-orange-500" /><span><strong>{isFR ? 'Avis et rôle.' : 'Notice and role.'}</strong> {isFR ? 'Je comprends que ma compagnie détermine les finalités et agit généralement comme responsable du traitement pour les données de ses employés, clients et sous-traitants. Hailite Manager et ses fournisseurs techniques traitent les données selon la configuration choisie. Je dois maintenir une politique de confidentialité et répondre aux demandes applicables.' : 'I understand that my company determines purposes and generally acts as controller for employee, client, and subcontractor data. Hailite Manager and technical providers process data according to the selected configuration. I must maintain a privacy policy and respond to applicable requests.'}</span></label>
              <label className="flex items-start gap-3 rounded-2xl border border-gray-700 bg-[#0F1115] p-4 cursor-pointer"><input type="checkbox" checked={employeeBasisConfirmed} onChange={event => setEmployeeBasisConfirmed(event.target.checked)} className="mt-1 w-5 h-5 accent-orange-500" /><span>{isFR ? 'Je confirmerai la base juridique applicable et présenterai l’avis de confidentialité aux employés et sous-traitants avant de traiter leurs données.' : 'I will confirm the applicable lawful basis and present the privacy notice to employees and subcontractors before processing their data.'}</span></label>
              <label className="flex items-start gap-3 rounded-2xl border border-gray-700 bg-[#0F1115] p-4 cursor-pointer"><input type="checkbox" checked={locationNoticeConfirmed} onChange={event => setLocationNoticeConfirmed(event.target.checked)} className="mt-1 w-5 h-5 accent-orange-500" /><span>{isFR ? 'Je comprends que le GPS est consulté au pointage lorsque le géorepérage est activé et que je dois informer le personnel de cette utilisation.' : 'I understand that GPS is checked at punch time when geofencing is enabled and that I must inform personnel about this use.'}</span></label>
              {needsCrossBorderAcknowledgement && <label className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 cursor-pointer"><input type="checkbox" checked={crossBorderAccepted} onChange={event => setCrossBorderAccepted(event.target.checked)} className="mt-1 w-5 h-5 accent-amber-500" /><span>{isFR ? 'Je comprends que les données européennes seront transférées vers le Canada. Je dois vérifier et documenter le mécanisme de transfert applicable, notamment les clauses contractuelles et l’évaluation du transfert lorsque requises.' : 'I understand that European data will be transferred to Canada. I must verify and document the applicable transfer mechanism, including contractual clauses and a transfer assessment when required.'}</span></label>}
            </div>
          </div>}

          {step === 5 && <div className="space-y-6">
            <div><h2 className="text-2xl font-black flex items-center gap-3"><Palette className="h-7 w-7 text-orange-300" />{isFR ? 'Apparence et confirmation' : 'Appearance and confirmation'}</h2><p className="mt-2 text-gray-300">{isFR ? 'Le logo sera utilisé dans la navigation, les factures, les devis, les contrats et les filigranes.' : 'The logo will be used in navigation, invoices, quotes, contracts, and watermarks.'}</p></div>
            <div className="grid sm:grid-cols-2 gap-3">{THEMES.map(theme => <button key={theme.id} type="button" onClick={() => setTheme(theme.id)} className={`min-h-16 rounded-2xl border p-4 flex items-center gap-4 text-left font-bold ${currentTheme === theme.id ? 'border-orange-300 bg-orange-500/15' : 'border-gray-800 bg-[#1A1E26]'}`}><span className={`h-9 w-9 rounded-xl ${theme.preview}`} /><span>{isFR ? theme.labelFR : theme.labelEN}</span></button>)}</div>
            <div className="rounded-2xl border border-gray-700 bg-[#0F1115] p-5 sm:p-6"><h3 className="text-xl font-black flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-orange-400" />{isFR ? 'Résumé à enregistrer' : 'Configuration summary'}</h3><dl className="mt-4 grid sm:grid-cols-2 gap-4"><div><dt className="text-gray-400">{isFR ? 'Compagnie' : 'Company'}</dt><dd className="font-bold text-lg">{companyName}</dd></div><div><dt className="text-gray-400">{isFR ? 'Territoire' : 'Jurisdiction'}</dt><dd className="font-bold text-lg">{marketLabel(market, currentLanguage)} · {isFR ? selectedRegion.nameFR : selectedRegion.nameEN}</dd></div><div><dt className="text-gray-400">{isFR ? 'Devise et unités' : 'Currency and units'}</dt><dd className="font-bold text-lg">{currency} · {unitSystem}</dd></div><div><dt className="text-gray-400">{isFR ? 'Taxes combinées configurées' : 'Configured combined taxes'}</dt><dd className="font-bold text-lg">{(taxRate1Pct + taxRate2Pct + localTaxPct).toFixed(3)}%</dd></div><div><dt className="text-gray-400">{isFR ? 'Stockage' : 'Storage'}</dt><dd className="font-bold text-lg">{storageOptions.find(option => option.id === storageMode)?.[isFR ? 'fr' : 'en']}</dd></div><div><dt className="text-gray-400">{isFR ? 'Hébergement nuage' : 'Cloud hosting'}</dt><dd className="font-bold text-lg">{storageMode === 'local' ? (isFR ? 'Aucun' : 'None') : `Canada Central (${CLOUD_REGION})`}</dd></div></dl></div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{isFR ? 'Cette configuration améliore la conformité et documente les choix. Elle ne constitue pas un avis juridique, fiscal ou comptable et ne remplace pas la validation des règles locales.' : 'This configuration improves compliance and documents choices. It is not legal, tax, or accounting advice and does not replace validation of local rules.'}</div>
          </div>}
        </div>

        <footer className="p-5 sm:p-7 border-t border-gray-800 bg-[#0F1115]/90 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          <button type="button" onClick={() => setStep(value => Math.max(1, value - 1))} disabled={step === 1} className="min-h-14 rounded-2xl border border-gray-700 px-6 text-lg font-bold disabled:opacity-30 flex items-center justify-center gap-2"><ChevronLeft className="h-5 w-5" />{isFR ? 'Retour' : 'Back'}</button>
          {step < 5 ? <button type="button" disabled={!canContinue} onClick={() => setStep(value => Math.min(5, value + 1))} className="min-h-14 rounded-2xl bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-500 px-7 text-lg font-black text-white disabled:opacity-40 flex items-center justify-center gap-2">{isFR ? 'Continuer' : 'Continue'}<ChevronRight className="h-5 w-5" /></button> : <button type="button" onClick={finish} className="min-h-14 rounded-2xl bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-600 hover:bg-orange-500 px-7 text-lg font-black text-white flex items-center justify-center gap-2"><Check className="h-5 w-5" />{isFR ? 'Enregistrer et ouvrir' : 'Save and open'}</button>}
        </footer>
      </section>
    </main>
  );
}
