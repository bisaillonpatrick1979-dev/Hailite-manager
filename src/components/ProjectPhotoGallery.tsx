// ---------------------------------------------------------------------------
// Dossier photo d'un chantier — avant / pendant / après
// ---------------------------------------------------------------------------
// Preuve d'état initial et d'exécution : c'est la pièce maîtresse d'une
// réclamation d'assurance (grêle, tempête), la défense en cas de litige avec un
// client, et le matériel de vente pour le prochain contrat.
//
// Les photos sont réduites côté client avant l'envoi (comme les reçus), datées,
// signées du nom de l'employé et localisées quand le GPS répond — une photo
// datée et localisée a une valeur probante bien supérieure.
import { useMemo, useRef, useState } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import { compressImageFile } from '../imageUtils';
import type { Project, ProjectPhoto, ProjectPhotoPhase } from '../types';
import { Camera, ChevronDown, ChevronUp, Images, Printer, Trash, X } from 'lucide-react';

const PHASES: ProjectPhotoPhase[] = ['before', 'during', 'after'];

interface Props {
  project: Project;
  defaultOpen?: boolean;
  /** Vue compacte pour l'accueil de l'employé : capture directe, sans galerie. */
  compact?: boolean;
}

export default function ProjectPhotoGallery({ project, defaultOpen = false, compact = false }: Props) {
  const {
    currentLanguage, activeEmployee, projectPhotos,
    addProjectPhoto, deleteProjectPhoto, companyInfo
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';
  const isManager = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';

  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<ProjectPhotoPhase | 'all'>('all');
  const [pending, setPending] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<ProjectPhotoPhase>('during');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<ProjectPhoto | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const photos = useMemo(
    () => projectPhotos
      .filter(p => p.projectId === project.id)
      .sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || '')),
    [projectPhotos, project.id]
  );

  const counts = useMemo(() => ({
    all: photos.length,
    before: photos.filter(p => p.phase === 'before').length,
    during: photos.filter(p => p.phase === 'during').length,
    after: photos.filter(p => p.phase === 'after').length
  }), [photos]);

  const shown = filter === 'all' ? photos : photos.filter(p => p.phase === filter);

  const phaseLabel = (phase: ProjectPhotoPhase) =>
    phase === 'before' ? t.photoPhaseBefore : phase === 'after' ? t.photoPhaseAfter : t.photoPhaseDuring;

  const phaseStyle = (phase: ProjectPhotoPhase) =>
    phase === 'before'
      ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
      : phase === 'after'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

  // Position GPS : demandée dès la prise de la photo et déposée ici, pour que
  // l'enregistrement reste instantané. Sur un chantier, un bouton qui met six
  // secondes à répondre passe pour un bogue — la position est un bonus, jamais
  // une condition.
  const positionRef = useRef<{ latitude?: number; longitude?: number }>({});

  const readPosition = (): Promise<{ latitude?: number; longitude?: number }> =>
    new Promise(resolve => {
      if (!navigator.geolocation) return resolve({});
      const done = (value: { latitude?: number; longitude?: number }) => resolve(value);
      navigator.geolocation.getCurrentPosition(
        pos => done({ latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }),
        () => done({}),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    });

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError(t.photoUnsupported);
      return;
    }
    setBusy(true);
    try {
      setPending(await compressImageFile(file, 1600, 0.82));
      // La localisation part en arrière-plan pendant que l'utilisateur choisit
      // la phase et saisit sa note.
      positionRef.current = {};
      readPosition().then(pos => { positionRef.current = pos; });
    } catch {
      setError(t.photoProcessFailed);
    } finally {
      setBusy(false);
    }
  };

  const savePending = () => {
    if (!pending || busy) return;
    addProjectPhoto({
      projectId: project.id,
      phase: pendingPhase,
      imageUrl: pending,
      caption: caption.trim() || undefined,
      takenAt: new Date().toISOString(),
      takenById: activeEmployee?.id,
      takenByName: activeEmployee?.name,
      ...positionRef.current
    });
    setPending(null);
    setCaption('');
    positionRef.current = {};
    setOpen(true);
  };

  // Feuille imprimable : ce qu'on remet à un assureur ou qu'on joint à un dossier.
  const printDossier = () => {
    const esc = (v: unknown) => String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const section = (phase: ProjectPhotoPhase) => {
      const list = photos.filter(p => p.phase === phase);
      if (!list.length) return '';
      return `<h2>${esc(phaseLabel(phase))} — ${list.length}</h2><div class="grid">${list.map(p => `
        <figure>
          <img src="${esc(p.imageUrl)}" alt="" />
          <figcaption>
            ${p.caption ? `<b>${esc(p.caption)}</b><br/>` : ''}
            ${esc(new Date(p.takenAt).toLocaleString(dateLocale))}
            ${p.takenByName ? ` — ${esc(p.takenByName)}` : ''}
            ${typeof p.latitude === 'number' ? `<br/>GPS ${p.latitude}, ${p.longitude}` : ''}
          </figcaption>
        </figure>`).join('')}</div>`;
    };
    const html = `<!doctype html><html lang="${isFR ? 'fr' : 'en'}"><head><meta charset="utf-8" />
      <title>${esc(t.photoDossierTitle)} — ${esc(project.name)}</title><style>
      body{font-family:system-ui,sans-serif;margin:16mm;color:#111}
      h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}
      .meta{font-size:12px;color:#444;margin-bottom:6px}
      .grid{display:flex;flex-wrap:wrap;gap:10px}
      figure{margin:0;width:31%;break-inside:avoid}
      img{width:100%;height:150px;object-fit:cover;border:1px solid #bbb}
      figcaption{font-size:10px;line-height:1.35;margin-top:3px}
      .note{font-size:10px;color:#555;margin-top:24px;border-top:1px solid #ccc;padding-top:8px}
      @media print{button{display:none}}</style></head><body>
      <h1>${esc(t.photoDossierTitle)}</h1>
      <div class="meta">
        <b>${esc(project.name)}</b> — ${esc(project.clientName)}<br/>
        ${esc(project.address)}<br/>
        ${esc(companyInfo.name || '')} · ${esc(t.photoDossierGenerated)} ${esc(new Date().toLocaleString(dateLocale))} · ${photos.length} ${esc(t.photoCountWord)}
      </div>
      ${PHASES.map(section).join('')}
      <p class="note">${esc(t.photoDossierNote)}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const captureButtons = (
    <div className="flex gap-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden"
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy}
        className="flex-1 flex items-center justify-center gap-2 py-3 px-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition disabled:opacity-50">
        <Camera className="w-4 h-4" /> {t.photoTakeBtn}
      </button>
      <button type="button" onClick={() => libraryRef.current?.click()} disabled={busy}
        className="flex items-center justify-center gap-2 py-3 px-3 bg-gray-800 hover:bg-gray-750 text-gray-200 border border-gray-700 text-xs font-black rounded-lg transition disabled:opacity-50">
        <Images className="w-4 h-4" /> {t.photoLibraryBtn}
      </button>
    </div>
  );

  // Écran de confirmation après la prise : phase + légende avant enregistrement
  const pendingPanel = pending && (
    <div className="mt-3 p-3 bg-gray-950 border border-orange-500/40 rounded-xl flex flex-col gap-3">
      <img src={pending} alt="" className="w-full max-h-56 object-contain rounded-lg border border-gray-800" />
      <div>
        <p className="text-[10px] font-mono uppercase text-gray-500 mb-1.5">{t.photoPhaseQuestion}</p>
        <div className="grid grid-cols-3 gap-2">
          {PHASES.map(phase => (
            <button key={phase} type="button" onClick={() => setPendingPhase(phase)}
              className={`py-2.5 text-xs font-black rounded-lg border transition ${
                pendingPhase === phase ? phaseStyle(phase) : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
              {phaseLabel(phase)}
            </button>
          ))}
        </div>
      </div>
      <input value={caption} onChange={e => setCaption(e.target.value)} placeholder={t.photoCaptionPh}
        className="w-full p-2.5 bg-gray-900 rounded-lg border border-gray-800 text-white text-xs" />
      <div className="flex gap-2">
        <button type="button" onClick={() => { setPending(null); setCaption(''); }}
          className="px-4 py-2.5 bg-gray-800 text-gray-300 text-xs font-black rounded-lg border border-gray-700">
          {t.modalCancelBtn}
        </button>
        <button type="button" onClick={savePending} disabled={busy}
          className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg disabled:opacity-50">
          {busy ? t.photoSaving : t.photoSaveBtn}
        </button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {captureButtons}
        {error && <p className="text-[10px] text-red-400 font-bold">{error}</p>}
        {pendingPanel}
        {counts.all > 0 && !pending && (
          <p className="text-[10px] text-gray-500 font-mono">
            {counts.all} {t.photoCountWord} · {t.photoPhaseBefore} {counts.before} · {t.photoPhaseDuring} {counts.during} · {t.photoPhaseAfter} {counts.after}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-900 hover:bg-gray-850 transition"
        aria-expanded={open}>
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-gray-300">
          <Camera className="w-3.5 h-3.5 text-orange-500" />
          {t.photoSectionTitle} ({counts.all})
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="p-3 flex flex-col gap-3">
          {captureButtons}
          {error && <p className="text-[10px] text-red-400 font-bold">{error}</p>}
          {pendingPanel}

          {counts.all === 0 && !pending && (
            <p className="text-[11px] text-gray-500 text-center py-3">{t.photoEmptyHint}</p>
          )}

          {counts.all > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', ...PHASES] as const).map(key => (
                  <button key={key} type="button" onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded border transition ${
                      filter === key
                        ? 'bg-orange-600 text-white border-orange-500'
                        : 'bg-gray-900 text-gray-400 border-gray-800'}`}>
                    {key === 'all' ? t.photoFilterAll : phaseLabel(key)} ({counts[key]})
                  </button>
                ))}
                <button type="button" onClick={printDossier}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase rounded border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-850">
                  <Printer className="w-3 h-3" /> {t.photoPrintBtn}
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {shown.map(photo => (
                  <button key={photo.id} type="button" onClick={() => setViewer(photo)}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-800 group">
                    <img src={photo.imageUrl} alt={photo.caption || ''} className="w-full h-full object-cover" loading="lazy" />
                    <span className={`absolute bottom-0 left-0 right-0 text-[8px] font-black uppercase text-center py-0.5 border-t ${phaseStyle(photo.phase)}`}>
                      {phaseLabel(photo.phase)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Visionneuse plein écran */}
      {viewer && (
        <div className="fixed inset-0 z-[130] bg-black/95 flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <span className={`px-2.5 py-1 text-[10px] font-black uppercase rounded border ${phaseStyle(viewer.phase)}`}>
              {phaseLabel(viewer.phase)}
            </span>
            <div className="flex items-center gap-2">
              {isManager && (
                <button type="button"
                  onClick={() => {
                    if (confirm(t.photoDeleteConfirm)) { deleteProjectPhoto(viewer.id); setViewer(null); }
                  }}
                  className="p-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300"
                  aria-label={t.photoDeleteBtn}>
                  <Trash className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={() => setViewer(null)}
                className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300" aria-label={t.modalCancelBtn}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <img src={viewer.imageUrl} alt={viewer.caption || ''}
            className="flex-1 min-h-0 w-full object-contain" onClick={e => e.stopPropagation()} />
          <div className="px-4 py-3 shrink-0 text-white" onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            {viewer.caption && <p className="text-sm font-bold mb-1">{viewer.caption}</p>}
            <p className="text-[10px] text-gray-400 font-mono">
              {new Date(viewer.takenAt).toLocaleString(dateLocale)}
              {viewer.takenByName ? ` · ${viewer.takenByName}` : ''}
              {typeof viewer.latitude === 'number' ? ` · GPS ${viewer.latitude}, ${viewer.longitude}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
