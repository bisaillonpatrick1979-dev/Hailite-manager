// ---------------------------------------------------------------------------
// Ordres de changement — les extras constatés en cours de chantier
// ---------------------------------------------------------------------------
// En toiture et revêtement, le contreplaqué pourri, le solin supplémentaire et
// la ventilation non prévue sont constants. Sans trace signée, le travail est
// fait, personne ne l'a approuvé, et la facture finale devient une négociation.
//
// Le flux tient sur le chantier : on constate, on photographie, on chiffre, le
// client signe sur l'appareil, et l'extra est approuvé sur-le-champ. Un extra
// enregistré sans signature reste « en attente » pour que le bureau relance.
import { useMemo, useRef, useState } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import { compressImageFile } from '../imageUtils';
import SignaturePad from './SignaturePad';
import type { ChangeOrder, ChangeOrderStatus, Project } from '../types';
import { Camera, ChevronDown, ChevronUp, FilePlus, Trash, X } from 'lucide-react';

interface Props {
  project: Project;
  defaultOpen?: boolean;
}

export default function ChangeOrderPanel({ project, defaultOpen = false }: Props) {
  const {
    currentLanguage, activeEmployee, changeOrders, companyInfo,
    addChangeOrder, updateChangeOrder, deleteChangeOrder
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';
  const isManager = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';

  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState(false);
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [clientName, setClientName] = useState(project.clientName || '');
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  const orders = useMemo(
    () => changeOrders
      .filter(o => o.projectId === project.id)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [changeOrders, project.id]
  );

  const approvedTotal = useMemo(
    () => orders.filter(o => o.status === 'approved' || o.status === 'invoiced')
      .reduce((sum, o) => sum + (o.amount || 0), 0),
    [orders]
  );
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  const money = (value: number) => {
    const currency = companyInfo.currency || 'CAD';
    try {
      return new Intl.NumberFormat(dateLocale, { style: 'currency', currency }).format(value);
    } catch {
      return `${value.toFixed(2)} $`;
    }
  };

  const statusLabel = (status: ChangeOrderStatus) => (
    status === 'approved' ? t.coStatusApproved
      : status === 'refused' ? t.coStatusRefused
        : status === 'invoiced' ? t.coStatusInvoiced
          : t.coStatusPending
  );
  const statusStyle = (status: ChangeOrderStatus) => (
    status === 'approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'refused' ? 'bg-red-500/15 text-red-300 border-red-500/30'
        : status === 'invoiced' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  );

  const resetForm = () => {
    setForm(false);
    setDescription(''); setReason(''); setAmount('');
    setPhoto(null); setSignature(null); setError('');
    setClientName(project.clientName || '');
  };

  const handlePhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(t.photoUnsupported); return; }
    setBusy(true);
    try {
      setPhoto(await compressImageFile(file, 1400, 0.82));
      setError('');
    } catch {
      setError(t.photoProcessFailed);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const value = Number(String(amount).replace(',', '.'));
    if (!description.trim()) { setError(t.coMissingDescription); return; }
    if (!Number.isFinite(value) || value <= 0) { setError(t.coMissingAmount); return; }

    // Numérotation lisible et stable par chantier : OC-001, OC-002…
    const number = `OC-${String(orders.length + 1).padStart(3, '0')}`;
    addChangeOrder({
      projectId: project.id,
      number,
      description: description.trim(),
      reason: reason.trim() || undefined,
      amount: value,
      photoUrl: photo || undefined,
      // Signé sur place = approuvé ; sinon le bureau devra relancer le client.
      status: signature ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      createdById: activeEmployee?.id,
      createdByName: activeEmployee?.name,
      clientName: clientName.trim() || undefined,
      clientSignature: signature || undefined,
      signedAt: signature ? new Date().toISOString() : undefined
    });
    resetForm();
    setOpen(true);
  };

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-900 hover:bg-gray-850 transition"
        aria-expanded={open}>
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-gray-300">
          <FilePlus className="w-3.5 h-3.5 text-orange-500" />
          {t.coSectionTitle} ({orders.length})
          {approvedTotal > 0 && (
            <span className="text-emerald-400 normal-case font-mono">· {money(approvedTotal)}</span>
          )}
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px]">
              {pendingCount} {t.coPendingBadge}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3">
          {!form && (
            <button type="button" onClick={() => setForm(true)}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition">
              {t.coAddBtn}
            </button>
          )}

          {form && (
            <div className="p-3 bg-gray-950 border border-orange-500/40 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-white uppercase">{t.coNewTitle}</h4>
                <button type="button" onClick={resetForm} className="p-1 text-gray-500 hover:text-white" aria-label={t.modalCancelBtn}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.coDescriptionLabel}</span>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={t.coDescriptionPh}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
              </label>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.coReasonLabel}</span>
                <input value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={t.coReasonPh}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
              </label>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.coAmountLabel}</span>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="0.00"
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs font-mono" />
              </label>

              <div>
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.coPhotoLabel}</span>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { handlePhoto(e.target.files?.[0]); e.target.value = ''; }} />
                {photo ? (
                  <div className="mt-1 flex items-center gap-2">
                    <img src={photo} alt="" className="h-16 rounded-lg border border-gray-800" />
                    <button type="button" onClick={() => setPhoto(null)}
                      className="px-2.5 py-1.5 text-[10px] font-black text-red-400 border border-red-500/30 rounded-lg">
                      {t.expRetakePhoto}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => photoRef.current?.click()} disabled={busy}
                    className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 border border-gray-800 text-gray-300 text-xs font-black rounded-lg disabled:opacity-50">
                    <Camera className="w-4 h-4" /> {t.photoTakeBtn}
                  </button>
                )}
              </div>

              <label className="block">
                <span className="text-[10px] font-mono uppercase text-gray-500">{t.coClientNameLabel}</span>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
              </label>

              <SignaturePad label={t.coSignatureLabel} value={signature} onChange={setSignature} accentClass="text-orange-400" />
              <p className="text-[10px] text-gray-500">{t.coSignatureHint}</p>

              {error && <p className="text-[11px] text-red-400 font-bold">{error}</p>}

              <button type="button" onClick={submit} disabled={busy}
                className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg disabled:opacity-50">
                {signature ? t.coSaveApprovedBtn : t.coSavePendingBtn}
              </button>
            </div>
          )}

          {orders.length === 0 && !form && (
            <p className="text-[11px] text-gray-500 text-center py-2">{t.coEmptyHint}</p>
          )}

          {orders.map(order => (
            <div key={order.id} className="p-3 bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-white">
                    <span className="font-mono text-orange-500">{order.number}</span> — {order.description}
                  </p>
                  {order.reason && <p className="text-[10px] text-gray-400 mt-0.5">{order.reason}</p>}
                </div>
                <span className={`shrink-0 px-2 py-0.5 text-[9px] font-black uppercase rounded border ${statusStyle(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-emerald-400 font-mono">{money(order.amount)}</span>
                {order.photoUrl && (
                  <a href={order.photoUrl} target="_blank" rel="noreferrer">
                    <img src={order.photoUrl} alt="" className="h-10 w-10 object-cover rounded border border-gray-700" />
                  </a>
                )}
                {order.clientSignature && (
                  <img src={order.clientSignature} alt="" className="h-8 bg-white rounded px-1 border border-gray-700" />
                )}
              </div>

              <p className="text-[9px] text-gray-500 font-mono">
                {new Date(order.createdAt).toLocaleDateString(dateLocale)}
                {order.createdByName ? ` · ${order.createdByName}` : ''}
                {order.signedAt ? ` · ${t.coSignedOn} ${new Date(order.signedAt).toLocaleDateString(dateLocale)}` : ''}
              </p>

              {isManager && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-800">
                  {order.status === 'pending' && (
                    <>
                      <button type="button" onClick={() => updateChangeOrder({ ...order, status: 'approved' })}
                        className="px-2.5 py-1 text-[10px] font-black uppercase rounded border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                        {t.coApproveBtn}
                      </button>
                      <button type="button" onClick={() => updateChangeOrder({ ...order, status: 'refused' })}
                        className="px-2.5 py-1 text-[10px] font-black uppercase rounded border border-red-500/40 text-red-300 bg-red-500/10">
                        {t.coRefuseBtn}
                      </button>
                    </>
                  )}
                  {order.status === 'approved' && (
                    <button type="button" onClick={() => updateChangeOrder({ ...order, status: 'invoiced' })}
                      className="px-2.5 py-1 text-[10px] font-black uppercase rounded border border-sky-500/40 text-sky-300 bg-sky-500/10">
                      {t.coMarkInvoicedBtn}
                    </button>
                  )}
                  <button type="button"
                    onClick={() => { if (confirm(t.coDeleteConfirm)) deleteChangeOrder(order.id); }}
                    className="ml-auto p-1.5 rounded border border-gray-700 text-gray-500 hover:text-red-400"
                    aria-label={t.coDeleteBtn}>
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
