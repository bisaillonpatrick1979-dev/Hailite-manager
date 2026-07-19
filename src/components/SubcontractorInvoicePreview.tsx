import React from 'react';
import { Printer, X } from 'lucide-react';
import type { CompanyInfo, Employee, Invoice } from '../types';
import CompanyLogo from './CompanyLogo';

type Props = {
  invoice: Invoice;
  issuer: Employee;
  companyInfo: CompanyInfo;
  currentLanguage: 'FR' | 'EN';
  onClose: () => void;
};

export default function SubcontractorInvoicePreview({ invoice, issuer, companyInfo, currentLanguage, onClose }: Props) {
  const t = (fr: string, en: string) => currentLanguage === 'FR' ? fr : en;
  const locale = companyInfo.dateLocale || (currentLanguage === 'FR' ? 'fr-CA' : 'en-CA');
  const currency = invoice.currency || companyInfo.currency || (companyInfo.country === 'US' ? 'USD' : 'CAD');
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value || 0));
  const issuerName = invoice.issuerName || issuer.businessName || issuer.name;
  const issuerLogo = invoice.issuerLogo || issuer.businessLogo || issuer.avatar;
  const issuerTaxNumber = invoice.issuerTaxNumber || issuer.gstNumber || issuer.asNumber;
  const tax1Name = invoice.taxRate1Name || companyInfo.taxRate1Name || t('Taxe 1', 'Tax 1');
  const tax2Name = invoice.taxRate2Name || companyInfo.taxRate2Name || t('Taxe 2', 'Tax 2');

  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md overflow-y-auto p-4 flex items-start sm:items-center justify-center print:p-0 print:bg-white">
      <section className="w-full max-w-4xl rounded-2xl bg-[#12141C] border border-gray-800 p-4 sm:p-6 print:bg-white print:border-0 print:p-0">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div>
            <p className="text-[10px] uppercase font-black text-orange-400">{t('Facture du sous-traitant', 'Subcontractor invoice')}</p>
            <h3 className="text-lg font-black text-white">{invoice.invoiceNumber}</h3>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-black"><Printer className="w-4 h-4" />{t('Imprimer / PDF', 'Print / PDF')}</button>
            <button type="button" onClick={onClose} className="p-2 rounded-xl bg-gray-900 text-gray-400 border border-gray-800"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div id="subcontractor-invoice-sheet" className="relative overflow-hidden rounded-xl bg-white text-slate-900 p-6 sm:p-10 min-h-[850px] print:rounded-none print:min-h-0">
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.065]">
            <div className="-rotate-12 flex flex-col items-center gap-4">
              <CompanyLogo logo={issuerLogo} companyName={issuerName} className="w-64 h-64" imageClassName="w-full h-full object-contain grayscale" fallbackClassName="rounded-full border-8 border-slate-900 text-slate-900 bg-transparent text-7xl" />
              <span className="text-5xl font-black uppercase tracking-[0.22em]">{t('FACTURE', 'INVOICE')}</span>
            </div>
          </div>

          <div className="relative z-10 space-y-8">
            <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 border-b-2 border-slate-200 pb-6">
              <div className="flex items-start gap-4">
                <CompanyLogo logo={issuerLogo} companyName={issuerName} className="w-20 h-20 rounded-xl border border-slate-200 bg-white p-1" imageClassName="w-full h-full object-contain rounded-lg" fallbackClassName="rounded-xl bg-slate-900 text-white text-2xl" />
                <div>
                  <h1 className="text-2xl font-black uppercase">{issuerName}</h1>
                  <p className="text-sm text-slate-600 mt-1">{issuer.address || invoice.issuerAddress || '—'}</p>
                  <p className="text-sm text-slate-600">{issuer.phone || ''}{issuer.email ? ` · ${issuer.email}` : ''}</p>
                  {issuerTaxNumber && <p className="text-xs font-mono text-slate-500 mt-2">{t('No fiscal / licence', 'Tax / licence no.')} : {issuerTaxNumber}</p>}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-4xl font-black uppercase text-slate-800">{t('FACTURE', 'INVOICE')}</p>
                <p className="font-mono font-black mt-2">{invoice.invoiceNumber}</p>
                <p className="text-sm text-slate-500">{t('Date', 'Date')} : {invoice.date}</p>
              </div>
            </header>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-500">{t('Facturé à', 'Billed to')}</p>
                <p className="font-black text-lg mt-1">{invoice.recipientName || companyInfo.name}</p>
                <p className="text-sm text-slate-600 mt-1">{companyInfo.address}</p>
                <p className="text-sm text-slate-600">{companyInfo.email} {companyInfo.phone ? `· ${companyInfo.phone}` : ''}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-500">{t('Période et travail', 'Period and work')}</p>
                <p className="font-black text-lg mt-1">{invoice.totalHours.toFixed(2)} h</p>
                <p className="text-sm text-slate-600 mt-1">{invoice.sessionIds.length} {t('session(s) de chantier', 'job session(s)')}</p>
                {invoice.notes && <p className="text-xs text-slate-500 mt-2">{invoice.notes}</p>}
              </div>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b-2 border-slate-300 text-left text-slate-500 uppercase text-[10px]"><th className="py-3">{t('Description', 'Description')}</th><th className="py-3 text-right">{t('Quantité', 'Quantity')}</th><th className="py-3 text-right">{t('Montant', 'Amount')}</th></tr></thead>
              <tbody><tr className="border-b border-slate-200"><td className="py-5 font-bold">{t('Travaux de chantier selon les sessions approuvées', 'Job-site work based on approved sessions')}</td><td className="py-5 text-right font-mono">{invoice.totalHours.toFixed(2)} h</td><td className="py-5 text-right font-mono font-black">{money(invoice.amount)}</td></tr></tbody>
            </table>

            <div className="ml-auto w-full max-w-sm space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{t('Sous-total', 'Subtotal')}</span><span className="font-mono font-bold">{money(invoice.amount)}</span></div>
              {invoice.gstAmount !== 0 && <div className="flex justify-between"><span className="text-slate-500">{tax1Name}</span><span className="font-mono">{money(invoice.gstAmount)}</span></div>}
              {invoice.qstAmount !== 0 && <div className="flex justify-between"><span className="text-slate-500">{tax2Name}</span><span className="font-mono">{money(invoice.qstAmount)}</span></div>}
              {(invoice.localTaxAmount || 0) !== 0 && <div className="flex justify-between"><span className="text-slate-500">{t('Taxe locale', 'Local tax')}</span><span className="font-mono">{money(invoice.localTaxAmount || 0)}</span></div>}
              <div className="flex justify-between border-t-2 border-slate-800 pt-3 text-xl font-black"><span>{t('TOTAL', 'TOTAL')}</span><span>{money(invoice.totalWithTaxes)}</span></div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 pt-8 border-t border-slate-200">
              <div>
                <p className="text-[10px] uppercase font-black text-slate-500">{t('Signature du fournisseur', 'Supplier signature')}</p>
                {invoice.employeeSignature ? <img src={invoice.employeeSignature} alt={t('Signature', 'Signature')} className="h-20 max-w-full object-contain mt-2" /> : <div className="h-16 border-b border-slate-400" />}
                <p className="text-xs text-slate-500 mt-2">{invoice.employeeSignedAt ? new Date(invoice.employeeSignedAt).toLocaleString(locale) : t('Brouillon non envoyé', 'Unsent draft')}</p>
              </div>
              <div className="text-xs text-slate-500 leading-relaxed">
                <p className="font-black text-slate-700">{t('Information fiscale', 'Tax information')}</p>
                <p>{t('Les taux enregistrés proviennent de la configuration de la compagnie et doivent être validés selon le lieu et la nature des travaux.', 'Recorded rates come from company configuration and must be validated for the location and nature of the work.')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
