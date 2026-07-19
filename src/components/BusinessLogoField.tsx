import React, { useState } from 'react';
import { Camera, Trash } from 'lucide-react';
import { compressImageFile } from '../imageUtils';
import CompanyLogo from './CompanyLogo';

type Props = {
  value?: string;
  onChange: (value: string) => void;
  businessName?: string;
  currentLanguage: 'FR' | 'EN';
  inputId: string;
};

export default function BusinessLogoField({ value, onChange, businessName, currentLanguage, inputId }: Props) {
  const [error, setError] = useState('');
  const t = (fr: string, en: string) => currentLanguage === 'FR' ? fr : en;

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      setError('');
      onChange(await compressImageFile(file, 900, 0.8));
    } catch {
      setError(t("Le logo n'a pas pu être traité.", 'The logo could not be processed.'));
    }
  };

  return (
    <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <CompanyLogo
          logo={value}
          companyName={businessName}
          className="w-16 h-16 rounded-xl border border-gray-700 bg-white p-1"
          imageClassName="w-full h-full object-contain rounded-lg"
          fallbackClassName="bg-emerald-600 text-white rounded-xl"
        />
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-black text-emerald-400">{t('Logo du sous-traitant', 'Subcontractor logo')}</p>
          <p className="text-[9px] text-gray-500 mt-1">{t('Utilisé sur ses factures envoyées à la compagnie.', 'Used on invoices sent to the company.')}</p>
        </div>
      </div>
      <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => handleFile(event.target.files?.[0])} />
      <div className="flex gap-2">
        <label htmlFor={inputId} className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300">
          <Camera className="w-4 h-4" /> {t('Prendre ou choisir le logo', 'Take or choose logo')}
        </label>
        {value && (
          <button type="button" onClick={() => onChange('')} className="p-2 rounded-lg border border-red-900/50 bg-red-950 text-red-400" aria-label={t('Retirer le logo', 'Remove logo')}>
            <Trash className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && <p className="text-[10px] font-bold text-red-400">{error}</p>}
    </div>
  );
}
