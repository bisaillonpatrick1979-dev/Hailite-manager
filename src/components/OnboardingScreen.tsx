import React, { useMemo, useState } from 'react';
import useAppStore from '../store';
import { CANADIAN_REGIONS, US_REGIONS, TaxRegion } from '../regionsData';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  MapPin,
  Palette,
  ReceiptText,
  ShieldCheck
} from 'lucide-react';

const THEMES = [
  { id: 'quantum' as const, labelFR: 'Bleu professionnel', labelEN: 'Professional blue', preview: 'bg-cyan-500' },
  { id: 'arctic' as const, labelFR: 'Clair et accessible', labelEN: 'Bright and accessible', preview: 'bg-sky-300' },
  { id: 'carbon' as const, labelFR: 'Noir sobre', labelEN: 'Clean black', preview: 'bg-zinc-300' },
  { id: 'deco' as const, labelFR: 'Or chantier', labelEN: 'Job-site gold', preview: 'bg-amber-500' }
];

function defaultRegion(country: 'CA' | 'US', preferred?: string): TaxRegion {
  const regions = country === 'CA' ? CANADIAN_REGIONS : US_REGIONS;
  return regions.find(region => region.code === preferred)
    || (country === 'CA' ? regions.find(region => region.code === 'AB') : undefined)
    || regions[0];
}

export default function OnboardingScreen() {
  const {
    currentLanguage,
    setLanguage,
    currentTheme,
    setTheme,
    companyInfo,
    updateCompanyInfo,
    setIsOnboarded
  } = useAppStore();

  const isFR = currentLanguage === 'FR';
  const initialCountry: 'CA' | 'US' = companyInfo.country === 'US' ? 'US' : 'CA';
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState(companyInfo.name || '');
  const [selectedCountry, setSelectedCountry] = useState<'CA' | 'US'>(initialCountry);
  const [selectedRegionCode, setSelectedRegionCode] = useState(
    defaultRegion(initialCountry, companyInfo.region).code
  );
  const [taxNum1, setTaxNum1] = useState(companyInfo.gstNumber || '');
  const [taxNum2, setTaxNum2] = useState(companyInfo.qstNumber || '');

  const regions = selectedCountry === 'CA' ? CANADIAN_REGIONS : US_REGIONS;
  const selectedRegion = useMemo(
    () => defaultRegion(selectedCountry, selectedRegionCode),
    [selectedCountry, selectedRegionCode]
  );

  const changeCountry = (country: 'CA' | 'US') => {
    setSelectedCountry(country);
    setSelectedRegionCode(defaultRegion(country, companyInfo.region).code);
  };

  const finish = () => {
    const cleanName = companyName.trim() || (isFR ? 'Mon entreprise' : 'My company');
    updateCompanyInfo({
      name: cleanName,
      country: selectedCountry,
      region: selectedRegion.code,
      gstNumber: taxNum1.trim(),
      qstNumber: taxNum2.trim(),
      taxRate1: selectedRegion.taxRate1,
      taxRate2: selectedRegion.taxRate2,
      taxRate1Name: isFR ? selectedRegion.taxRate1NameFR : selectedRegion.taxRate1NameEN,
      taxRate2Name: isFR ? selectedRegion.taxRate2NameFR : selectedRegion.taxRate2NameEN,
      isOnboarded: true
    });
    setIsOnboarded(true);
    document.title = `${cleanName} — Hailite Manager`;
  };

  const canContinue = step !== 1 || companyName.trim().length >= 2;

  return (
    <main className="min-h-screen bg-[#0A0D12] text-white px-4 py-6 sm:px-6 flex items-center justify-center">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-700 bg-[#111722] shadow-2xl overflow-hidden">
        <header className="p-5 sm:p-7 border-b border-slate-700 bg-gradient-to-r from-slate-950 to-slate-900">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-500/15 border border-cyan-400/30 p-3">
                <Building2 className="h-7 w-7 text-cyan-300" />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Hailite Manager</p>
                <h1 className="text-2xl sm:text-3xl font-black">
                  {isFR ? 'Configuration rapide' : 'Quick setup'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2" aria-label={isFR ? 'Progression' : 'Progress'}>
              {[1, 2, 3].map(number => (
                <div
                  key={number}
                  className={`h-10 w-10 rounded-xl border flex items-center justify-center font-black ${
                    step === number
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                      : step > number
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-900 text-slate-500 border-slate-700'
                  }`}
                >
                  {step > number ? <Check className="h-5 w-5" /> : number}
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-8">
          {step === 1 && (
            <div className="space-y-7">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-3">
                  <Globe2 className="h-7 w-7 text-cyan-300" />
                  {isFR ? 'Votre langue et votre entreprise' : 'Your language and company'}
                </h2>
                <p className="mt-2 text-slate-300 text-base sm:text-lg">
                  {isFR
                    ? 'Ces renseignements personnalisent immédiatement tous les écrans.'
                    : 'These details immediately personalize every screen.'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage('FR')}
                  className={`min-h-14 rounded-2xl border px-5 text-lg font-bold ${
                    currentLanguage === 'FR'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                >
                  Français (Canada)
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('EN')}
                  className={`min-h-14 rounded-2xl border px-5 text-lg font-bold ${
                    currentLanguage === 'EN'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                >
                  English
                </button>
              </div>

              <label className="block">
                <span className="block mb-2 text-base font-bold text-slate-200">
                  {isFR ? 'Nom de votre compagnie' : 'Company name'}
                </span>
                <input
                  autoFocus
                  value={companyName}
                  onChange={event => setCompanyName(event.target.value)}
                  placeholder={isFR ? 'Ex. Hailite Xteriors Inc.' : 'e.g. Hailite Xteriors Inc.'}
                  className="w-full min-h-14 rounded-2xl border border-slate-600 bg-slate-950 px-4 text-lg text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-7">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-3">
                  <MapPin className="h-7 w-7 text-cyan-300" />
                  {isFR ? 'Région et taxes' : 'Region and taxes'}
                </h2>
                <p className="mt-2 text-slate-300 text-base sm:text-lg">
                  {isFR
                    ? 'Les calculs de paie, les taxes et la conformité suivront cette région.'
                    : 'Payroll, taxes, and compliance will follow this region.'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => changeCountry('CA')}
                  className={`min-h-14 rounded-2xl border px-5 text-lg font-bold ${
                    selectedCountry === 'CA'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  Canada
                </button>
                <button
                  type="button"
                  onClick={() => changeCountry('US')}
                  className={`min-h-14 rounded-2xl border px-5 text-lg font-bold ${
                    selectedCountry === 'US'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  United States
                </button>
              </div>

              <label className="block">
                <span className="block mb-2 text-base font-bold text-slate-200">
                  {isFR ? 'Province ou état' : 'Province or state'}
                </span>
                <select
                  value={selectedRegion.code}
                  onChange={event => setSelectedRegionCode(event.target.value)}
                  className="w-full min-h-14 rounded-2xl border border-slate-600 bg-slate-950 px-4 text-lg text-white outline-none focus:border-cyan-400"
                >
                  {regions.map(region => (
                    <option key={region.code} value={region.code}>
                      {isFR ? region.nameFR : region.nameEN}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                <div className="flex gap-3">
                  <ReceiptText className="h-6 w-6 text-emerald-300 shrink-0" />
                  <div>
                    <p className="font-black text-lg">
                      {isFR ? 'Taxes configurées automatiquement' : 'Taxes configured automatically'}
                    </p>
                    <p className="mt-1 text-slate-200">
                      {(isFR ? selectedRegion.taxRate1NameFR : selectedRegion.taxRate1NameEN) || (isFR ? 'Taxe principale' : 'Primary tax')}: {(selectedRegion.taxRate1 * 100).toFixed(2)}%
                      {selectedRegion.taxRate2 > 0 && (
                        <> · {(isFR ? selectedRegion.taxRate2NameFR : selectedRegion.taxRate2NameEN) || (isFR ? 'Taxe régionale' : 'Regional tax')}: {(selectedRegion.taxRate2 * 100).toFixed(2)}%</>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <label>
                  <span className="block mb-2 font-bold text-slate-200">
                    {isFR ? 'Numéro GST/TPS (facultatif)' : 'GST number (optional)'}
                  </span>
                  <input
                    value={taxNum1}
                    onChange={event => setTaxNum1(event.target.value)}
                    className="w-full min-h-14 rounded-2xl border border-slate-600 bg-slate-950 px-4 text-lg"
                  />
                </label>
                <label>
                  <span className="block mb-2 font-bold text-slate-200">
                    {isFR ? 'Deuxième numéro de taxe (facultatif)' : 'Second tax number (optional)'}
                  </span>
                  <input
                    value={taxNum2}
                    onChange={event => setTaxNum2(event.target.value)}
                    className="w-full min-h-14 rounded-2xl border border-slate-600 bg-slate-950 px-4 text-lg"
                  />
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-7">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-3">
                  <Palette className="h-7 w-7 text-cyan-300" />
                  {isFR ? 'Apparence et confirmation' : 'Appearance and confirmation'}
                </h2>
                <p className="mt-2 text-slate-300 text-base sm:text-lg">
                  {isFR ? 'Choisissez un style simple. Vous pourrez le changer plus tard.' : 'Choose a simple style. You can change it later.'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setTheme(theme.id)}
                    className={`min-h-16 rounded-2xl border p-4 flex items-center gap-4 text-left font-bold ${
                      currentTheme === theme.id
                        ? 'border-cyan-300 bg-cyan-500/15'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    <span className={`h-9 w-9 rounded-xl ${theme.preview}`} />
                    <span>{isFR ? theme.labelFR : theme.labelEN}</span>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-600 bg-slate-950 p-5 sm:p-6">
                <h3 className="text-xl font-black flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6 text-emerald-300" />
                  {isFR ? 'Résumé' : 'Summary'}
                </h3>
                <dl className="mt-4 grid sm:grid-cols-2 gap-4 text-base">
                  <div>
                    <dt className="text-slate-400">{isFR ? 'Compagnie' : 'Company'}</dt>
                    <dd className="font-bold text-lg">{companyName.trim()}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{isFR ? 'Région' : 'Region'}</dt>
                    <dd className="font-bold text-lg">{isFR ? selectedRegion.nameFR : selectedRegion.nameEN}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{isFR ? 'Langue' : 'Language'}</dt>
                    <dd className="font-bold text-lg">{currentLanguage === 'FR' ? 'Français' : 'English'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{isFR ? 'Données' : 'Data'}</dt>
                    <dd className="font-bold text-lg">Supabase + mode hors ligne</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        <footer className="p-5 sm:p-7 border-t border-slate-700 bg-slate-950/60 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          <button
            type="button"
            onClick={() => setStep(value => Math.max(1, value - 1))}
            disabled={step === 1}
            className="min-h-14 rounded-2xl border border-slate-600 px-6 text-lg font-bold disabled:opacity-30 flex items-center justify-center gap-2"
          >
            <ChevronLeft className="h-5 w-5" />
            {isFR ? 'Retour' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep(value => Math.min(3, value + 1))}
              className="min-h-14 rounded-2xl bg-cyan-500 px-7 text-lg font-black text-slate-950 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isFR ? 'Continuer' : 'Continue'}
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="min-h-14 rounded-2xl bg-emerald-500 px-7 text-lg font-black text-slate-950 flex items-center justify-center gap-2"
            >
              <Check className="h-5 w-5" />
              {isFR ? 'Ouvrir mon application' : 'Open my application'}
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
