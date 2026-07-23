import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Camera, Check, FileText, PackageSearch, Pencil, Plus,
  Printer, ReceiptText, Search, ShieldAlert, Trash2, Wrench, X
} from 'lucide-react';
import useAppStore from '../store';
import { compressImageFile } from '../imageUtils';
import type { ToolAsset, ToolAssetStatus, ToolTheftReport, ToolTheftSnapshot } from '../types';

const TOOL_CATEGORIES = [
  'Outil électrique', 'Outil pneumatique', 'Outil à main', 'Équipement de sécurité',
  'Échelle / échafaudage', 'Mesure / laser', 'Compresseur / génératrice',
  'Remorque / rangement', 'Autre'
];

const EMPTY_TOOL: Omit<ToolAsset, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', category: 'Outil électrique', brand: '', model: '', serialNumber: '', assetTag: '',
  purchaseDate: '', purchasePrice: 0, replacementValue: 0, seller: '', warrantyExpiry: '',
  currentLocation: '', assignedEmployeeId: '', status: 'in_service', notes: '',
  toolPhoto: '', serialPhoto: '', receiptPhoto: '', receiptFileName: ''
};

const EMPTY_REPORT = {
  incidentDate: new Date().toISOString().slice(0, 10), incidentTime: '', incidentLocation: '',
  circumstances: '', discoveredBy: '', policeService: '', policeFileNumber: '',
  insurer: '', insuranceClaimNumber: '', contactName: '', contactPhone: '', contactEmail: ''
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Lecture impossible'));
    reader.readAsDataURL(file);
  });
}

async function prepareAttachment(file: File, allowPdf = false): Promise<string> {
  if (file.size > 6 * 1024 * 1024) throw new Error('MAX_FILE_SIZE');
  if (file.type.startsWith('image/')) return compressImageFile(file, 1400, 0.82);
  if (allowPdf && file.type === 'application/pdf') return readFileAsDataUrl(file);
  throw new Error('UNSUPPORTED_FILE');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function statusLabel(status: ToolAssetStatus, isFR: boolean) {
  const labels: Record<ToolAssetStatus, [string, string]> = {
    in_service: ['En service', 'In service'],
    loaned: ['Prêté / assigné', 'Loaned / assigned'],
    repair: ['En réparation', 'Under repair'],
    missing: ['Manquant', 'Missing'],
    stolen: ['Volé', 'Stolen'],
    retired: ['Retiré', 'Retired']
  };
  return labels[status][isFR ? 0 : 1];
}

function statusClass(status: ToolAssetStatus) {
  if (status === 'stolen' || status === 'missing') return 'border-red-500/40 bg-red-500/10 text-red-300';
  if (status === 'repair') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  if (status === 'retired') return 'border-gray-600 bg-gray-800 text-gray-400';
  if (status === 'loaned') return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
}

function money(value: number, language: 'FR' | 'EN', currency: string) {
  try {
    return new Intl.NumberFormat(language === 'FR' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 2
    }).format(Number(value) || 0);
  } catch {
    return `${(Number(value) || 0).toFixed(2)} $`;
  }
}

function AttachmentField({
  label, value, fileName, accept, capture, onChange, onClear, isFR
}: {
  label: string;
  value?: string;
  fileName?: string;
  accept: string;
  capture?: 'environment';
  onChange: (file: File) => void;
  onClear: () => void;
  isFR: boolean;
}) {
  const isImage = Boolean(value?.startsWith('data:image'));
  const isPdf = Boolean(value?.startsWith('data:application/pdf'));
  return (
    <div className="rounded-2xl border border-gray-700 bg-[#0F1115] p-3">
      <p className="text-xs font-black text-gray-200">{label}</p>
      {isImage ? (
        <img src={value} alt={label} className="mt-2 h-36 w-full rounded-xl border border-gray-700 bg-black object-contain" />
      ) : isPdf ? (
        <div className="mt-2 flex h-24 flex-col items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
          <FileText className="h-8 w-8" />
          <span className="mt-1 max-w-full truncate px-2 text-xs font-bold">{fileName || 'PDF'}</span>
        </div>
      ) : (
        <div className="mt-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-700 text-gray-500">
          <Camera className="h-7 w-7" />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 text-xs font-black text-white">
          <Camera className="h-4 w-4" />
          {value ? (isFR ? 'Remplacer' : 'Replace') : (isFR ? 'Prendre / ajouter' : 'Take / add')}
          <input
            type="file" accept={accept} capture={capture} className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) onChange(file);
              event.target.value = '';
            }}
          />
        </label>
        {value && (
          <button type="button" onClick={onClear} className="min-h-11 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-red-300" aria-label={isFR ? 'Retirer le fichier' : 'Remove file'}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ToolRegistry() {
  const {
    currentLanguage, companyInfo, activeEmployee, employees, toolAssets, toolTheftReports,
    addToolAsset, updateToolAsset, deleteToolAsset,
    addToolTheftReport, updateToolTheftReport, deleteToolTheftReport
  } = useAppStore();
  const isFR = currentLanguage === 'FR';
  const canManage = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';
  const [view, setView] = useState<'assets' | 'reports'>('assets');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ToolAssetStatus>('all');
  const [showToolForm, setShowToolForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toolForm, setToolForm] = useState(EMPTY_TOOL);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT);
  const [selectedForTheft, setSelectedForTheft] = useState<string[]>([]);
  const [attachmentError, setAttachmentError] = useState('');

  const currency = companyInfo.currency || 'CAD';
  const filteredTools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return toolAssets.filter(tool => {
      const matchesStatus = statusFilter === 'all' || tool.status === statusFilter;
      const haystack = [tool.name, tool.brand, tool.model, tool.serialNumber, tool.assetTag, tool.currentLocation]
        .join(' ').toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [toolAssets, search, statusFilter]);

  const registeredValue = toolAssets.reduce((sum, tool) => sum + Math.max(tool.replacementValue || tool.purchasePrice || 0, 0), 0);
  const selectedTool = selectedToolId ? toolAssets.find(tool => tool.id === selectedToolId) : undefined;

  const resetToolForm = () => {
    setToolForm(EMPTY_TOOL);
    setEditingId(null);
    setShowToolForm(false);
    setAttachmentError('');
  };

  const startEdit = (tool: ToolAsset) => {
    const { id: _id, createdAt: _created, updatedAt: _updated, ...editable } = tool;
    setToolForm({ ...EMPTY_TOOL, ...editable });
    setEditingId(tool.id);
    setShowToolForm(true);
    setSelectedToolId(null);
    setAttachmentError('');
  };

  const saveTool = () => {
    if (!toolForm.name.trim()) return;
    const assigned = employees.find(employee => employee.id === toolForm.assignedEmployeeId);
    const normalized = {
      ...toolForm,
      name: toolForm.name.trim(), brand: toolForm.brand.trim(), model: toolForm.model.trim(),
      serialNumber: toolForm.serialNumber.trim(), assetTag: toolForm.assetTag.trim(),
      seller: toolForm.seller.trim(), currentLocation: toolForm.currentLocation.trim(),
      notes: toolForm.notes.trim(), assignedEmployeeName: assigned?.name || ''
    };
    if (editingId) {
      const existing = toolAssets.find(tool => tool.id === editingId);
      if (existing) updateToolAsset({ ...existing, ...normalized, updatedAt: new Date().toISOString() });
    } else {
      addToolAsset(normalized);
    }
    resetToolForm();
  };

  const handleAttachment = async (field: 'toolPhoto' | 'serialPhoto' | 'receiptPhoto', file: File) => {
    try {
      setAttachmentError('');
      const data = await prepareAttachment(file, field === 'receiptPhoto');
      setToolForm(current => ({
        ...current,
        [field]: data,
        ...(field === 'receiptPhoto' ? { receiptFileName: file.name } : {})
      }));
    } catch (error: any) {
      setAttachmentError(error?.message === 'MAX_FILE_SIZE'
        ? (isFR ? 'Le fichier dépasse 6 Mo.' : 'The file is larger than 6 MB.')
        : (isFR ? 'Format non accepté. Utilisez une photo ou un PDF pour la facture.' : 'Unsupported format. Use an image or PDF for the receipt.'));
    }
  };

  const makeSnapshot = (tool: ToolAsset): ToolTheftSnapshot => ({
    toolId: tool.id, name: tool.name, category: tool.category, brand: tool.brand, model: tool.model,
    serialNumber: tool.serialNumber, assetTag: tool.assetTag, purchaseDate: tool.purchaseDate,
    purchasePrice: tool.purchasePrice, replacementValue: tool.replacementValue,
    currentLocation: tool.currentLocation,
    assignedEmployeeName: employees.find(employee => employee.id === tool.assignedEmployeeId)?.name || tool.assignedEmployeeName || '',
    notes: tool.notes, hasToolPhoto: Boolean(tool.toolPhoto), hasSerialPhoto: Boolean(tool.serialPhoto),
    hasReceipt: Boolean(tool.receiptPhoto), receiptFileName: tool.receiptFileName
  });

  const createTheftReport = () => {
    const chosen = toolAssets.filter(tool => selectedForTheft.includes(tool.id));
    if (!chosen.length || !reportForm.incidentDate || !reportForm.incidentLocation.trim()) return;
    const snapshots = chosen.map(makeSnapshot);
    addToolTheftReport({
      ...reportForm,
      incidentLocation: reportForm.incidentLocation.trim(), circumstances: reportForm.circumstances.trim(),
      toolIds: chosen.map(tool => tool.id), toolSnapshots: snapshots,
      totalReplacementValue: snapshots.reduce((sum, tool) => sum + (tool.replacementValue || tool.purchasePrice || 0), 0),
      status: reportForm.policeFileNumber.trim() ? 'reported' : 'draft'
    });
    chosen.forEach(tool => updateToolAsset({ ...tool, status: 'stolen', updatedAt: new Date().toISOString() }));
    setSelectedForTheft([]);
    setReportForm(EMPTY_REPORT);
    setShowReportForm(false);
    setView('reports');
  };

  const printReport = (report: ToolTheftReport) => {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      alert(isFR ? 'Autorisez les fenêtres contextuelles pour imprimer le dossier.' : 'Allow pop-ups to print the report.');
      return;
    }
    const reportTools = report.toolSnapshots.map(snapshot => ({
      snapshot,
      live: toolAssets.find(tool => tool.id === snapshot.toolId)
    }));
    const rows = reportTools.map(({ snapshot }) => `
      <tr><td>${escapeHtml(snapshot.name)}</td><td>${escapeHtml(snapshot.brand)}</td><td>${escapeHtml(snapshot.model)}</td>
      <td>${escapeHtml(snapshot.serialNumber || '—')}</td><td>${escapeHtml(snapshot.assetTag || '—')}</td>
      <td class="money">${escapeHtml(money(snapshot.replacementValue || snapshot.purchasePrice, currentLanguage, currency))}</td></tr>`).join('');
    const evidence = reportTools.map(({ snapshot, live }, index) => `
      <section class="evidence"><h3>${index + 1}. ${escapeHtml(snapshot.name)}</h3>
      <p><b>${isFR ? 'Marque / modèle' : 'Brand / model'}:</b> ${escapeHtml(`${snapshot.brand} ${snapshot.model}`.trim() || '—')}</p>
      <p><b>${isFR ? 'Numéro de série' : 'Serial number'}:</b> ${escapeHtml(snapshot.serialNumber || '—')}</p>
      <p><b>${isFR ? 'Étiquette interne' : 'Asset tag'}:</b> ${escapeHtml(snapshot.assetTag || '—')}</p>
      <p><b>${isFR ? 'Emplacement / responsable' : 'Location / assignee'}:</b> ${escapeHtml([snapshot.currentLocation, snapshot.assignedEmployeeName].filter(Boolean).join(' · ') || '—')}</p>
      <div class="photos">
        ${live?.toolPhoto?.startsWith('data:image') ? `<figure><img src="${live.toolPhoto}"/><figcaption>${isFR ? 'Photo de l’outil' : 'Tool photo'}</figcaption></figure>` : ''}
        ${live?.serialPhoto?.startsWith('data:image') ? `<figure><img src="${live.serialPhoto}"/><figcaption>${isFR ? 'Plaque modèle / série' : 'Model / serial plate'}</figcaption></figure>` : ''}
        ${live?.receiptPhoto?.startsWith('data:image') ? `<figure><img src="${live.receiptPhoto}"/><figcaption>${isFR ? 'Facture / reçu' : 'Receipt'}</figcaption></figure>` : ''}
      </div>
      ${live?.receiptPhoto?.startsWith('data:application/pdf') ? `<p class="attachment">PDF joint au registre : ${escapeHtml(live.receiptFileName || 'facture.pdf')}</p>` : ''}
      </section>`).join('');
    win.document.write(`<!doctype html><html lang="${isFR ? 'fr' : 'en'}"><head><meta charset="utf-8"><title>${isFR ? 'Dossier de vol' : 'Theft report'} ${escapeHtml(report.id.slice(0, 8))}</title><style>
      body{font-family:Arial,sans-serif;color:#111;margin:28px;line-height:1.35}header{border-bottom:3px solid #ea580c;padding-bottom:12px;margin-bottom:20px}
      h1{margin:0;font-size:26px}h2{margin:24px 0 10px;font-size:18px}h3{margin:0 0 8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}
      .box{border:1px solid #bbb;border-radius:8px;padding:12px;margin:14px 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #aaa;padding:7px;text-align:left}.money{text-align:right}.total{font-size:18px;font-weight:bold;text-align:right;margin-top:10px}
      .evidence{break-inside:avoid;border-top:2px solid #ddd;padding-top:14px;margin-top:20px}.photos{display:flex;gap:10px;flex-wrap:wrap}.photos figure{margin:0;width:30%}.photos img{width:100%;height:170px;object-fit:contain;border:1px solid #bbb}.photos figcaption{font-size:10px;text-align:center}.attachment{padding:8px;background:#eee}.note{font-size:11px;color:#555;margin-top:24px}@media print{button{display:none}body{margin:14mm}}
    </style></head><body><header><h1>${escapeHtml(companyInfo.name || 'Hailite Manager')} — ${isFR ? 'DOSSIER DE VOL D’OUTILS' : 'TOOL THEFT REPORT'}</h1><p>${isFR ? 'Document préparatoire pour la police et l’assureur' : 'Preparation document for police and insurer'}</p></header>
    <div class="meta"><div><b>${isFR ? 'Date / heure' : 'Date / time'}:</b> ${escapeHtml(report.incidentDate)} ${escapeHtml(report.incidentTime)}</div><div><b>${isFR ? 'Lieu' : 'Location'}:</b> ${escapeHtml(report.incidentLocation)}</div>
    <div><b>${isFR ? 'Découvert par' : 'Discovered by'}:</b> ${escapeHtml(report.discoveredBy || '—')}</div><div><b>${isFR ? 'Statut' : 'Status'}:</b> ${escapeHtml(report.status)}</div>
    <div><b>${isFR ? 'Service de police' : 'Police service'}:</b> ${escapeHtml(report.policeService || '—')}</div><div><b>${isFR ? 'No de dossier policier' : 'Police file no.'}:</b> ${escapeHtml(report.policeFileNumber || '—')}</div>
    <div><b>${isFR ? 'Assureur' : 'Insurer'}:</b> ${escapeHtml(report.insurer || '—')}</div><div><b>${isFR ? 'No de réclamation' : 'Claim no.'}:</b> ${escapeHtml(report.insuranceClaimNumber || '—')}</div></div>
    <div class="box"><b>${isFR ? 'Circonstances' : 'Circumstances'}:</b><br>${escapeHtml(report.circumstances || '—')}</div>
    <h2>${isFR ? 'Outils déclarés' : 'Reported tools'}</h2><table><thead><tr><th>${isFR ? 'Outil' : 'Tool'}</th><th>${isFR ? 'Marque' : 'Brand'}</th><th>${isFR ? 'Modèle' : 'Model'}</th><th>${isFR ? 'No série' : 'Serial'}</th><th>${isFR ? 'No interne' : 'Asset tag'}</th><th>${isFR ? 'Valeur' : 'Value'}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">${isFR ? 'Valeur totale de remplacement' : 'Total replacement value'} : ${escapeHtml(money(report.totalReplacementValue, currentLanguage, currency))}</p>
    <h2>${isFR ? 'Preuves photographiques et renseignements détaillés' : 'Photographic evidence and details'}</h2>${evidence}
    <div class="box"><b>${isFR ? 'Personne-ressource' : 'Contact'}:</b> ${escapeHtml(report.contactName || '—')} · ${escapeHtml(report.contactPhone || '')} · ${escapeHtml(report.contactEmail || '')}</div>
    <p class="note">${isFR ? 'Ce document rassemble les renseignements enregistrés dans Hailite Manager. Il ne transmet pas automatiquement une déclaration à la police ou à un assureur; vérifiez leurs exigences avant l’envoi.' : 'This document compiles information stored in Hailite Manager. It does not automatically submit a report to police or an insurer; verify their requirements before sending.'}</p>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    win.document.close();
  };

  return (
    <div id="tool-registry" className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-orange-500/25 bg-gradient-to-r from-orange-600/10 to-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Wrench className="h-6 w-6 text-orange-400" /><h3 className="text-xl font-black text-white">{isFR ? 'Registre des outils' : 'Tool registry'}</h3></div>
          <p className="mt-1 text-xs text-gray-300">{isFR ? 'Photos, modèle, numéro de série, facture, valeur et dossier de vol.' : 'Photos, model, serial number, receipt, value, and theft reports.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl border border-gray-700 bg-black/25 px-3 py-2"><b className="block text-lg text-white">{toolAssets.length}</b>{isFR ? 'outils' : 'tools'}</div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"><b className="block text-lg text-amber-300">{money(registeredValue, currentLanguage, currency)}</b>{isFR ? 'valeur inscrite' : 'registered value'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-950 p-1">
        <button type="button" onClick={() => setView('assets')} className={`min-h-12 rounded-lg text-sm font-black ${view === 'assets' ? 'bg-orange-600 text-white' : 'text-gray-400'}`}><Wrench className="mr-2 inline h-4 w-4" />{isFR ? 'Mes outils' : 'My tools'}</button>
        <button type="button" onClick={() => setView('reports')} className={`min-h-12 rounded-lg text-sm font-black ${view === 'reports' ? 'bg-red-600 text-white' : 'text-gray-400'}`}><ShieldAlert className="mr-2 inline h-4 w-4" />{isFR ? `Dossiers de vol (${toolTheftReports.length})` : `Theft reports (${toolTheftReports.length})`}</button>
      </div>

      {view === 'assets' ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1"><Search className="absolute left-3 top-3.5 h-5 w-5 text-gray-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={isFR ? 'Chercher par outil, marque, modèle ou no de série…' : 'Search tool, brand, model, or serial…'} className="w-full rounded-xl border border-gray-700 bg-gray-950 py-3 pl-11 pr-3 text-base" /></label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as any)} className="min-h-12 rounded-xl border border-gray-700 bg-gray-950 px-3">
              <option value="all">{isFR ? 'Tous les statuts' : 'All statuses'}</option>
              {(['in_service','loaned','repair','missing','stolen','retired'] as ToolAssetStatus[]).map(status => <option key={status} value={status}>{statusLabel(status, isFR)}</option>)}
            </select>
            {canManage && <button type="button" onClick={() => { resetToolForm(); setShowToolForm(true); }} className="min-h-12 rounded-xl bg-orange-600 px-5 font-black text-white"><Plus className="mr-2 inline h-5 w-5" />{isFR ? 'Ajouter un outil' : 'Add tool'}</button>}
          </div>

          {showToolForm && canManage && (
            <div className="rounded-3xl border border-orange-500/30 bg-gray-900 p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between"><h4 className="text-lg font-black text-white">{editingId ? (isFR ? 'Modifier la fiche' : 'Edit record') : (isFR ? 'Enregistrer un outil déjà acheté ou neuf' : 'Register an existing or new tool')}</h4><button type="button" onClick={resetToolForm} className="rounded-lg p-2 text-gray-400"><X className="h-5 w-5" /></button></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Nom de l’outil *' : 'Tool name *'}</span><input value={toolForm.name} onChange={event => setToolForm({...toolForm,name:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" placeholder="Cloueuse, scie, laser…" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Catégorie' : 'Category'}</span><select value={toolForm.category} onChange={event => setToolForm({...toolForm,category:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3">{TOOL_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Marque' : 'Brand'}</span><input value={toolForm.brand} onChange={event => setToolForm({...toolForm,brand:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" placeholder="Milwaukee, DeWalt, Hilti…" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Modèle' : 'Model'}</span><input value={toolForm.model} onChange={event => setToolForm({...toolForm,model:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Numéro de série' : 'Serial number'}</span><input value={toolForm.serialNumber} onChange={event => setToolForm({...toolForm,serialNumber:event.target.value})} className="mt-1 w-full rounded-xl border border-orange-500/40 bg-gray-950 p-3 font-mono text-orange-200" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Numéro interne / étiquette' : 'Internal asset tag'}</span><input value={toolForm.assetTag} onChange={event => setToolForm({...toolForm,assetTag:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3 font-mono" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Date d’achat' : 'Purchase date'}</span><input type="date" value={toolForm.purchaseDate} onChange={event => setToolForm({...toolForm,purchaseDate:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Prix payé' : 'Purchase price'}</span><input type="number" min="0" step="0.01" value={toolForm.purchasePrice || ''} onChange={event => setToolForm({...toolForm,purchasePrice:Number(event.target.value)})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Valeur de remplacement' : 'Replacement value'}</span><input type="number" min="0" step="0.01" value={toolForm.replacementValue || ''} onChange={event => setToolForm({...toolForm,replacementValue:Number(event.target.value)})} className="mt-1 w-full rounded-xl border border-amber-500/40 bg-gray-950 p-3 text-amber-200" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Magasin / vendeur' : 'Seller / store'}</span><input value={toolForm.seller} onChange={event => setToolForm({...toolForm,seller:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Garantie jusqu’au' : 'Warranty expiry'}</span><input type="date" value={toolForm.warrantyExpiry} onChange={event => setToolForm({...toolForm,warrantyExpiry:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Statut' : 'Status'}</span><select value={toolForm.status} onChange={event => setToolForm({...toolForm,status:event.target.value as ToolAssetStatus})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3">{(['in_service','loaned','repair','missing','stolen','retired'] as ToolAssetStatus[]).map(status => <option key={status} value={status}>{statusLabel(status,isFR)}</option>)}</select></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Emplacement actuel' : 'Current location'}</span><input value={toolForm.currentLocation} onChange={event => setToolForm({...toolForm,currentLocation:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" placeholder={isFR ? 'Entrepôt, camion, chantier…' : 'Warehouse, truck, job site…'} /></label>
                <label className="block"><span className="text-xs font-bold text-gray-300">{isFR ? 'Assigné à' : 'Assigned to'}</span><select value={toolForm.assignedEmployeeId} onChange={event => setToolForm({...toolForm,assignedEmployeeId:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3"><option value="">{isFR ? 'Personne' : 'Nobody'}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                <label className="block sm:col-span-2 lg:col-span-3"><span className="text-xs font-bold text-gray-300">{isFR ? 'Notes / caractéristiques' : 'Notes / identifying marks'}</span><textarea value={toolForm.notes} onChange={event => setToolForm({...toolForm,notes:event.target.value})} rows={3} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <AttachmentField label={isFR ? 'Photo complète de l’outil' : 'Full tool photo'} value={toolForm.toolPhoto} accept="image/*" capture="environment" onChange={file => handleAttachment('toolPhoto',file)} onClear={() => setToolForm({...toolForm,toolPhoto:''})} isFR={isFR} />
                <AttachmentField label={isFR ? 'Photo du modèle et numéro de série' : 'Model and serial plate photo'} value={toolForm.serialPhoto} accept="image/*" capture="environment" onChange={file => handleAttachment('serialPhoto',file)} onClear={() => setToolForm({...toolForm,serialPhoto:''})} isFR={isFR} />
                <AttachmentField label={isFR ? 'Facture / reçu (photo ou PDF)' : 'Receipt (photo or PDF)'} value={toolForm.receiptPhoto} fileName={toolForm.receiptFileName} accept="image/*,application/pdf" onChange={file => handleAttachment('receiptPhoto',file)} onClear={() => setToolForm({...toolForm,receiptPhoto:'',receiptFileName:''})} isFR={isFR} />
              </div>
              {attachmentError && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{attachmentError}</p>}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={resetToolForm} className="min-h-12 rounded-xl border border-gray-700 px-5 font-bold">{isFR ? 'Annuler' : 'Cancel'}</button><button type="button" disabled={!toolForm.name.trim()} onClick={saveTool} className="min-h-12 rounded-xl bg-orange-600 px-6 font-black text-white disabled:opacity-40"><Check className="mr-2 inline h-5 w-5" />{isFR ? 'Enregistrer la fiche' : 'Save record'}</button></div>
            </div>
          )}

          {filteredTools.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-700 p-10 text-center text-gray-400"><PackageSearch className="mx-auto h-12 w-12" /><p className="mt-3 font-bold">{isFR ? 'Aucun outil trouvé. Ajoutez même vos outils achetés il y a plusieurs années.' : 'No tools found. You can add tools purchased years ago.'}</p></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredTools.map(tool => {
                const assignee = employees.find(employee => employee.id === tool.assignedEmployeeId)?.name || tool.assignedEmployeeName;
                return <article key={tool.id} className={`overflow-hidden rounded-2xl border bg-gray-900 ${tool.status === 'stolen' ? 'border-red-500/60' : 'border-gray-800'}`}>
                  <button type="button" onClick={() => setSelectedToolId(tool.id)} className="block w-full text-left">
                    <div className="h-40 bg-black/40">{tool.toolPhoto?.startsWith('data:image') ? <img src={tool.toolPhoto} alt={tool.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center"><Wrench className="h-14 w-14 text-gray-700" /></div>}</div>
                    <div className="p-4"><div className="flex items-start justify-between gap-2"><div><h4 className="font-black text-white">{tool.name}</h4><p className="text-xs text-gray-400">{[tool.brand,tool.model].filter(Boolean).join(' · ') || tool.category}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(tool.status)}`}>{statusLabel(tool.status,isFR)}</span></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-gray-950 p-2"><span className="text-gray-500">{isFR ? 'Série' : 'Serial'}</span><b className="block truncate font-mono text-orange-200">{tool.serialNumber || '—'}</b></div><div className="rounded-lg bg-gray-950 p-2"><span className="text-gray-500">{isFR ? 'Valeur' : 'Value'}</span><b className="block text-amber-300">{money(tool.replacementValue || tool.purchasePrice,currentLanguage,currency)}</b></div></div>
                    <p className="mt-3 truncate text-xs text-gray-500">{[tool.currentLocation,assignee].filter(Boolean).join(' · ') || (isFR ? 'Emplacement non indiqué' : 'Location not recorded')}</p></div>
                  </button>
                  {canManage && <div className="flex gap-2 border-t border-gray-800 p-3"><button type="button" onClick={() => startEdit(tool)} className="min-h-11 flex-1 rounded-xl bg-gray-800 text-xs font-black"><Pencil className="mr-1 inline h-4 w-4" />{isFR ? 'Modifier' : 'Edit'}</button><button type="button" onClick={() => { if(confirm(isFR ? `Supprimer la fiche « ${tool.name} »?` : `Delete “${tool.name}” record?`)) deleteToolAsset(tool.id); }} className="min-h-11 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-red-300"><Trash2 className="h-4 w-4" /></button></div>}
                </article>;
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-300" /><div><h4 className="font-black text-red-200">{isFR ? 'Préparer une déclaration de vol' : 'Prepare a theft report'}</h4><p className="mt-1 text-xs text-red-100/80">{isFR ? 'L’application rassemble les détails, photos, factures et valeurs dans un document imprimable. Elle ne transmet pas automatiquement la plainte.' : 'The app compiles details, photos, receipts, and values into a printable document. It does not automatically submit a police report.'}</p></div></div></div>
          {canManage && <button type="button" onClick={() => setShowReportForm(!showReportForm)} className="min-h-12 rounded-xl bg-red-600 px-5 font-black text-white"><ShieldAlert className="mr-2 inline h-5 w-5" />{isFR ? 'Nouveau dossier de vol' : 'New theft report'}</button>}
          {showReportForm && canManage && (
            <div className="rounded-3xl border border-red-500/40 bg-gray-900 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Date du vol / découverte *' : 'Theft / discovery date *'}</span><input type="date" value={reportForm.incidentDate} onChange={event => setReportForm({...reportForm,incidentDate:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Heure approximative' : 'Approximate time'}</span><input type="time" value={reportForm.incidentTime} onChange={event => setReportForm({...reportForm,incidentTime:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Lieu du vol *' : 'Theft location *'}</span><input value={reportForm.incidentLocation} onChange={event => setReportForm({...reportForm,incidentLocation:event.target.value})} className="mt-1 w-full rounded-xl border border-red-500/40 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Découvert par' : 'Discovered by'}</span><input value={reportForm.discoveredBy} onChange={event => setReportForm({...reportForm,discoveredBy:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Service de police' : 'Police service'}</span><input value={reportForm.policeService} onChange={event => setReportForm({...reportForm,policeService:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Numéro de dossier policier' : 'Police file number'}</span><input value={reportForm.policeFileNumber} onChange={event => setReportForm({...reportForm,policeFileNumber:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3 font-mono" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Assureur' : 'Insurer'}</span><input value={reportForm.insurer} onChange={event => setReportForm({...reportForm,insurer:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Numéro de réclamation' : 'Claim number'}</span><input value={reportForm.insuranceClaimNumber} onChange={event => setReportForm({...reportForm,insuranceClaimNumber:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3 font-mono" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Personne-ressource' : 'Contact person'}</span><input value={reportForm.contactName} onChange={event => setReportForm({...reportForm,contactName:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Téléphone' : 'Phone'}</span><input value={reportForm.contactPhone} onChange={event => setReportForm({...reportForm,contactPhone:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label><span className="text-xs font-bold text-gray-300">{isFR ? 'Courriel' : 'Email'}</span><input type="email" value={reportForm.contactEmail} onChange={event => setReportForm({...reportForm,contactEmail:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
                <label className="sm:col-span-2 lg:col-span-3"><span className="text-xs font-bold text-gray-300">{isFR ? 'Circonstances et dommages observés' : 'Circumstances and observed damage'}</span><textarea rows={4} value={reportForm.circumstances} onChange={event => setReportForm({...reportForm,circumstances:event.target.value})} className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 p-3" /></label>
              </div>
              <h5 className="mt-5 font-black text-white">{isFR ? 'Sélectionnez tous les outils disparus' : 'Select all missing tools'}</h5>
              <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{toolAssets.filter(tool => tool.status !== 'retired').map(tool => { const checked=selectedForTheft.includes(tool.id); return <label key={tool.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked?'border-red-500 bg-red-500/10':'border-gray-700 bg-gray-950'}`}><input type="checkbox" checked={checked} onChange={() => setSelectedForTheft(current => checked ? current.filter(id=>id!==tool.id) : [...current,tool.id])} className="h-5 w-5" /><div className="min-w-0"><b className="block truncate text-white">{tool.name}</b><span className="block truncate text-xs text-gray-400">{tool.brand} {tool.model} · {tool.serialNumber || (isFR?'sans no série':'no serial')}</span></div><span className="ml-auto text-xs font-black text-amber-300">{money(tool.replacementValue||tool.purchasePrice,currentLanguage,currency)}</span></label>; })}</div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-950 p-3"><span className="text-sm font-bold text-gray-300">{selectedForTheft.length} {isFR ? 'outil(s) sélectionné(s)' : 'tool(s) selected'}</span><b className="text-lg text-amber-300">{money(toolAssets.filter(tool=>selectedForTheft.includes(tool.id)).reduce((sum,tool)=>sum+(tool.replacementValue||tool.purchasePrice||0),0),currentLanguage,currency)}</b></div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowReportForm(false)} className="min-h-12 rounded-xl border border-gray-700 px-5 font-bold">{isFR?'Annuler':'Cancel'}</button><button type="button" disabled={!selectedForTheft.length || !reportForm.incidentDate || !reportForm.incidentLocation.trim()} onClick={createTheftReport} className="min-h-12 rounded-xl bg-red-600 px-6 font-black text-white disabled:opacity-40">{isFR?'Créer le dossier et marquer volé':'Create report and mark stolen'}</button></div>
            </div>
          )}
          {toolTheftReports.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-700 p-10 text-center text-gray-400"><ShieldAlert className="mx-auto h-12 w-12" /><p className="mt-3 font-bold">{isFR?'Aucun dossier de vol.':'No theft reports.'}</p></div> : <div className="space-y-3">{toolTheftReports.map(report => <article key={report.id} className="rounded-2xl border border-red-500/30 bg-gray-900 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-black uppercase text-red-300">{report.status}</span><span className="text-xs text-gray-500">{report.incidentDate} {report.incidentTime}</span></div><h4 className="mt-2 font-black text-white">{report.incidentLocation}</h4><p className="mt-1 text-xs text-gray-400">{report.toolSnapshots.length} {isFR?'outil(s)':'tool(s)'} · {money(report.totalReplacementValue,currentLanguage,currency)}</p><p className="mt-2 line-clamp-2 text-xs text-gray-400">{report.circumstances || (isFR?'Circonstances non indiquées':'Circumstances not recorded')}</p></div><div className="flex gap-2"><button type="button" onClick={() => printReport(report)} className="min-h-11 rounded-xl bg-orange-600 px-4 text-xs font-black text-white"><Printer className="mr-1 inline h-4 w-4" />{isFR?'Imprimer / PDF':'Print / PDF'}</button>{canManage && report.status==='draft' && <button type="button" onClick={() => updateToolTheftReport({...report,status:'reported',updatedAt:new Date().toISOString()})} className="min-h-11 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-black text-emerald-300">{isFR?'Marquer transmis':'Mark submitted'}</button>}{canManage && <button type="button" onClick={() => { if(confirm(isFR?'Supprimer ce dossier?':'Delete this report?')) deleteToolTheftReport(report.id); }} className="min-h-11 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-red-300"><Trash2 className="h-4 w-4" /></button>}</div></div></article>)}</div>}
        </>
      )}

      {selectedTool && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-2 sm:items-center" onClick={() => setSelectedToolId(null)}>
          <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-gray-700 bg-[#16191F] p-4 sm:rounded-3xl sm:p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h3 className="text-xl font-black text-white">{selectedTool.name}</h3><p className="text-sm text-gray-400">{selectedTool.brand} {selectedTool.model}</p></div><button onClick={() => setSelectedToolId(null)} className="rounded-lg p-2 text-gray-400"><X className="h-5 w-5" /></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-gray-950 p-3"><span className="text-xs text-gray-500">{isFR?'Numéro de série':'Serial number'}</span><b className="block break-all font-mono text-orange-200">{selectedTool.serialNumber||'—'}</b></div><div className="rounded-xl bg-gray-950 p-3"><span className="text-xs text-gray-500">{isFR?'Numéro interne':'Asset tag'}</span><b className="block font-mono text-white">{selectedTool.assetTag||'—'}</b></div><div className="rounded-xl bg-gray-950 p-3"><span className="text-xs text-gray-500">{isFR?'Prix payé':'Purchase price'}</span><b className="block text-white">{money(selectedTool.purchasePrice,currentLanguage,currency)}</b></div><div className="rounded-xl bg-gray-950 p-3"><span className="text-xs text-gray-500">{isFR?'Valeur remplacement':'Replacement value'}</span><b className="block text-amber-300">{money(selectedTool.replacementValue,currentLanguage,currency)}</b></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">{selectedTool.toolPhoto?.startsWith('data:image') && <img src={selectedTool.toolPhoto} alt="Outil" className="h-48 w-full rounded-xl bg-black object-contain" />}{selectedTool.serialPhoto?.startsWith('data:image') && <img src={selectedTool.serialPhoto} alt="Série" className="h-48 w-full rounded-xl bg-black object-contain" />}{selectedTool.receiptPhoto?.startsWith('data:image') && <img src={selectedTool.receiptPhoto} alt="Facture" className="h-48 w-full rounded-xl bg-black object-contain" />}</div>
            {selectedTool.receiptPhoto?.startsWith('data:application/pdf') && <a href={selectedTool.receiptPhoto} target="_blank" rel="noreferrer" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 font-black text-red-200"><ReceiptText className="h-5 w-5" />{isFR?'Ouvrir la facture PDF':'Open receipt PDF'}</a>}
            {selectedTool.notes && <p className="mt-4 rounded-xl bg-gray-950 p-3 text-sm text-gray-300">{selectedTool.notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
