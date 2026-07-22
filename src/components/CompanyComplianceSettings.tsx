import React, { useState } from 'react';
import { Camera, Database, Globe2, RefreshCcw, ShieldCheck, Trash } from 'lucide-react';
import useAppStore from '../store';
import { compressImageFile } from '../imageUtils';
import { getDefaultRegion, marketLabel, type MarketCode } from '../internationalRegions';
import CompanyLogo from './CompanyLogo';

export default function CompanyComplianceSettings() {
  const { companyInfo, currentLanguage, updateCompanyInfo, setIsOnboarded } = useAppStore();
  const [error, setError] = useState('');
  const isFR = currentLanguage === 'FR';
  const market: MarketCode = companyInfo.country === 'US' || companyInfo.country === 'EU' ? companyInfo.country : 'CA';
  const region = getDefaultRegion(market, companyInfo.region);

  const upload = async (file?: File) => {
    if (!file) return;
    try {
      setError('');
      updateCompanyInfo({ logo: await compressImageFile(file, 1200, 0.84) });
    } catch {
      setError(isFR ? "Le logo n'a pas pu être traité." : 'The logo could not be processed.');
    }
  };

  return (
    <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CompanyLogo logo={companyInfo.logo} companyName={companyInfo.name} className="w-20 h-20 rounded-2xl border border-gray-700 bg-white p-1" imageClassName="w-full h-full object-contain rounded-xl" fallbackClassName="rounded-2xl bg-orange-600 text-white text-2xl" />
          <div>
            <h4 className="text-sm font-black text-white">{companyInfo.name}</h4>
            <p className="text-[10px] text-cyan-300 font-bold mt-1">{marketLabel(market, currentLanguage)} · {isFR ? region.nameFR : region.nameEN}</p>
            <p className="text-[10px] text-gray-500 mt-1">{companyInfo.currency || 'CAD'} · {companyInfo.unitSystem || 'imperial'} · {companyInfo.dateLocale || 'fr-CA'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input id="settings-company-logo" type="file" accept="image/*" capture="environment" className="hidden" onChange={event => upload(event.target.files?.[0])} />
          <label htmlFor="settings-company-logo" className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-black text-cyan-300"><Camera className="w-4 h-4" />{isFR ? 'Changer le logo' : 'Change logo'}</label>
          {companyInfo.logo && <button type="button" onClick={() => updateCompanyInfo({ logo: '' })} className="p-2 rounded-xl border border-red-900/50 bg-red-950 text-red-400" aria-label={isFR ? 'Retirer le logo' : 'Remove logo'}><Trash className="w-4 h-4" /></button>}
        </div>
      </div>
      {error && <p className="text-[10px] text-red-400 font-bold">{error}</p>}

      <div className="grid sm:grid-cols-3 gap-2 text-[10px]">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-3"><Globe2 className="w-4 h-4 text-cyan-400" /><p className="mt-2 uppercase text-gray-500 font-black">{isFR ? 'Fiscalité' : 'Tax setup'}</p><p className="text-white font-bold mt-1">{companyInfo.taxRate1Name || 'Tax 1'} + {companyInfo.taxRate2Name || 'Tax 2'} + {isFR ? 'locale' : 'local'}</p></div>
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-3"><Database className="w-4 h-4 text-blue-400" /><p className="mt-2 uppercase text-gray-500 font-black">{isFR ? 'Stockage' : 'Storage'}</p><p className="text-white font-bold mt-1">{companyInfo.dataStorageMode || 'hybrid'}{companyInfo.dataStorageMode !== 'local' ? ` · ${companyInfo.cloudRegion || 'ca-central-1'}` : ''}</p></div>
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-3"><ShieldCheck className="w-4 h-4 text-emerald-400" /><p className="mt-2 uppercase text-gray-500 font-black">{isFR ? 'Confidentialité' : 'Privacy'}</p><p className="text-white font-bold mt-1">v{companyInfo.privacyPolicyVersion || '—'} · {companyInfo.retentionMonths || 84} {isFR ? 'mois' : 'months'}</p></div>
      </div>

      <button type="button" onClick={() => setIsOnboarded(false)} className="w-full min-h-12 rounded-xl border border-orange-500/35 bg-orange-500/10 text-orange-300 font-black text-xs inline-flex items-center justify-center gap-2"><RefreshCcw className="w-4 h-4" />{isFR ? 'Reprendre la configuration pays, taxes et confidentialité' : 'Reopen country, tax, and privacy setup'}</button>
      <p className="text-[9px] text-gray-500">{isFR ? 'La réouverture ne supprime aucune donnée. Les nouveaux choix remplacent les paramètres de configuration.' : 'Reopening does not delete data. New choices replace configuration settings.'}</p>
    </section>
  );
}
