// ---------------------------------------------------------------------------
// Assistant IA autonome — page /assistant
//
// Mini-application dédiée au téléphone : elle ouvre DIRECTEMENT le chat IA,
// sans charger l'interface complète. Réservée aux administrateurs (connexion
// NIP ; la session est partagée avec l'application principale par le même
// cookie HttpOnly sécurisé). Ajoutez /assistant à l'écran d'accueil du téléphone pour
// obtenir une icône qui ouvre l'IA en un tap.
//
// L'IA passe par le proxy serveur protégé /api/chat (clés API côté serveur
// uniquement) et ses actions structurées (function calling à schéma strict,
// revalidées par le serveur) sont exécutées ici via le store partagé — donc
// une dépense photographiée, un chantier ou une commande créés depuis cette
// page apparaissent immédiatement dans l'application, synchronisés au nuage.
// ---------------------------------------------------------------------------
import React, { useEffect, useRef, useState } from 'react';
import useAppStore from './store';
import { authHeaders } from './apiClient';
import { useAutoResizeTextarea } from './hooks/useAutoResizeTextarea';
import { apiFetch } from './runtimeConfig';
import { Camera, Check, Download, LogOut, Mic, Send, Volume2, VolumeX, X } from 'lucide-react';

interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
  imagePreviewUrl?: string;
  pdfName?: string;
  simulated?: boolean;
  sourceLabel?: string;
}

interface Attachment { dataUrl: string; mimeType: string; name: string }

interface AssistantInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}


const makeIconAvatar = (emoji: string, background: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="80" fill="${background}"/><text x="80" y="106" text-anchor="middle" font-size="82">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export default function AssistantApp() {
  const {
    currentLanguage, companyInfo, employees, activeEmployee,
    projects, punchSessions, inventory, orders, clients, documents,
    expenses, payrollPayments, motivationTeams,
    login, logout, hydrateCloud,
    addEmployee, addProject, addClient, addInventoryItem,
    updateInventoryItem, addExpense, addSupplierOrder
  } = useAppStore();

  const isFR = currentLanguage === 'FR';
  const isAdmin = !!activeEmployee && activeEmployee.role === 'admin';

  // ------------------------- Connexion (NIP admin) -------------------------
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // ------------------------------- Chat ------------------------------------
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useAutoResizeTextarea(message, 320);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const dictatedTextRef = useRef('');
  const recognitionFailedRef = useRef(false);
  const speechSequenceRef = useRef(0);
  const installPromptRef = useRef<AssistantInstallPrompt | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [canInstallAssistant, setCanInstallAssistant] = useState(false);

  useEffect(() => { hydrateCloud(); }, [hydrateCloud]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, busy]);


  // Capture le véritable événement d'installation Android/Chrome. La page
  // /assistant possède son propre manifeste et devient une icône autonome.
  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as AssistantInstallPrompt;
      setCanInstallAssistant(true);
    };
    const installed = () => {
      installPromptRef.current = null;
      setCanInstallAssistant(false);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      recognitionRef.current?.abort?.();
      speechSequenceRef.current += 1;
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  // Un NIP complet déclenche la connexion automatiquement
  const submitLogin = async (fullPin: string) => {
    if (!selectedId || loginBusy) return;
    setLoginBusy(true);
    const res = await login(fullPin, selectedId);
    setLoginBusy(false);
    setPin('');
    if (!res.success) setLoginError(res.message);
    else setLoginError(null);
  };

  const pressDigit = (d: number) => {
    if (pin.length >= 4) return;
    const next = pin + String(d);
    setPin(next);
    if (next.length === 4) submitLogin(next);
  };

  // ----------------- Photo (reçu, chantier) : réduite côté client ----------
  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1280;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setAttachment({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), mimeType: 'image/jpeg', name: file.name });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // ---- Contexte de gestion envoyé à l'IA (mêmes règles que l'app : jamais ----
  // ---- de NIP, NAS/SIN, clés API ni coordonnées bancaires) -------------------
  const buildAppContext = (): string => {
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const inMonth = (dateStr?: string | null) => !!dateStr && dateStr.startsWith(monthPrefix);
    const monthPunches = punchSessions.filter(p => inMonth(p.startTime) && p.endTime);

    const data = {
      dateDuJour: now.toISOString().split('T')[0],
      moisCourant: monthPrefix,
      financesDuMois: {
        revenusClientsEncaisses: Number(documents.filter(d => d.type === 'invoice')
          .reduce((s, d) => s + (d.paymentsHistory || []).filter(p => inMonth(p.date)).reduce((x, p) => x + p.amount, 0), 0).toFixed(2)),
        depenses: Number(expenses.filter(e => inMonth(e.date)).reduce((s, e) => s + e.amount + (e.tax || 0), 0).toFixed(2)),
        paiesVersees: Number(payrollPayments.filter(p => inMonth(p.date) && p.status === 'paid').reduce((s, p) => s + p.amount, 0).toFixed(2)),
        coutMainOeuvrePunches: Number(monthPunches.reduce((s, p) => s + (p.revenue || 0), 0).toFixed(2))
      },
      facturesClients: documents.slice(0, 15).map(d => ({
        numero: d.number, type: d.type, client: d.clientName, statut: d.status, total: d.total, solde: d.balanceDue
      })),
      employes: employees.map(emp => ({
        nom: emp.name, role: emp.role, tauxHoraire: emp.hourlyRate,
        heuresCeMois: Number(monthPunches.filter(p => p.employeeId === emp.id).reduce((s, p) => s + (p.totalWorkedHours || 0), 0).toFixed(1))
      })),
      equipes: motivationTeams.map(team => ({
        equipe: team.name,
        membres: team.memberIds.map(id => employees.find(e => e.id === id)?.name).filter(Boolean)
      })),
      chantiers: projects.map(p => ({
        nom: p.name, client: p.clientName, statut: p.status,
        heuresCeMois: Number(monthPunches.filter(x => x.projectId === p.id).reduce((s, x) => s + (x.totalWorkedHours || 0), 0).toFixed(1))
      })),
      inventaire: inventory.map(i => ({ nom: i.name, quantite: i.quantity, unite: i.unit, seuilMin: i.minThreshold, stockBas: i.quantity < i.minThreshold })),
      commandes: orders.slice(-8).map(o => ({ fournisseur: o.supplierName, date: o.date, statut: o.status, total: o.totalAmount })),
      clients: clients.map(c => c.name)
    };

    return `DONNÉES EN DIRECT DE L'APPLICATION (l'utilisateur est administrateur : tu peux répondre à ses questions de gestion — profits, heures, équipes, inventaire, factures — à partir de ces données réelles) :
${JSON.stringify(data)}

Des outils (fonctions) te sont fournis pour créer ou modifier des données. N'appelle un outil QUE si l'utilisateur a clairement demandé l'action, n'invente jamais de données (demande les informations manquantes), et confirme en langage naturel ce que tu viens de faire.`;
  };

  // ---- Exécution des actions structurées retournées par le serveur ----------
  // (function calling à schéma strict, déjà validées côté serveur ; les champs
  // requis sont revérifiés ici avant toute mutation — même logique que l'app)
  const executeAction = (name: string, args: Record<string, any>): string => {
    const p = { ...(args || {}) };
    switch (name) {
      case 'create_employee': {
        if (!p.name || !p.role || typeof p.hourlyRate !== 'number') return isFR ? '⚠️ Employé : informations manquantes.' : '⚠️ Employee: missing information.';
        const randomValue = new Uint32Array(1);
        crypto.getRandomValues(randomValue);
        const nip = String(1000 + (randomValue[0] % 9000));
        addEmployee({
          name: String(p.name), nip,
          role: (['admin', 'employee', 'secretary', 'accountant'].includes(p.role) ? p.role : 'employee') as any,
          hourlyRate: Math.max(0, Number(p.hourlyRate)),
          workerType: String(p.workerType || 'Ouvrier'),
          asNumber: String(p.asNumber || ''), phone: String(p.phone || ''), address: String(p.address || ''),
          hireDate: new Date().toISOString().split('T')[0],
          avatar: makeIconAvatar('👷', '#F97316')
        });
        return isFR ? `✅ Employé ${p.name} créé (NIP : ${nip}).` : `✅ Employee ${p.name} created (PIN: ${nip}).`;
      }
      case 'create_project': {
        if (!p.name) return isFR ? '⚠️ Chantier : nom manquant.' : '⚠️ Site: missing name.';
        addProject({
          name: String(p.name), clientName: String(p.clientName || ''), address: String(p.address || ''),
          latitude: 0, longitude: 0, radius: 100, assignedEmployees: [], status: 'active'
        });
        return isFR ? `✅ Chantier « ${p.name} » créé.` : `✅ Site “${p.name}” created.`;
      }
      case 'create_client': {
        if (!p.name) return isFR ? '⚠️ Client : nom manquant.' : '⚠️ Client: missing name.';
        addClient({ name: String(p.name), phone: String(p.phone || ''), email: String(p.email || ''), address: String(p.address || '') });
        return isFR ? `✅ Client ${p.name} ajouté.` : `✅ Client ${p.name} added.`;
      }
      case 'add_inventory_item': {
        if (!p.name || typeof p.quantity !== 'number') return isFR ? '⚠️ Inventaire : informations manquantes.' : '⚠️ Inventory: missing information.';
        addInventoryItem({
          name: String(p.name), quantity: Math.max(0, Number(p.quantity)),
          unit: String(p.unit || (isFR ? 'unités' : 'units')), emoji: '📦',
          minThreshold: Math.max(0, Number(p.minThreshold ?? 5))
        });
        return isFR ? `✅ ${p.name} ajouté à l'inventaire (${p.quantity}).` : `✅ ${p.name} added to inventory (${p.quantity}).`;
      }
      case 'adjust_inventory': {
        const item = inventory.find(i => i.name.toLowerCase() === String(p.name || '').toLowerCase());
        if (!item) return isFR ? `⚠️ Article « ${p.name} » introuvable.` : `⚠️ Item “${p.name}” not found.`;
        if (typeof p.quantity !== 'number') return isFR ? '⚠️ Quantité manquante.' : '⚠️ Missing quantity.';
        updateInventoryItem({ ...item, quantity: Math.max(0, Number(p.quantity)) });
        return isFR ? `✅ ${item.name} : quantité ajustée à ${Math.max(0, Number(p.quantity))} ${item.unit}.` : `✅ ${item.name}: quantity set to ${Math.max(0, Number(p.quantity))} ${item.unit}.`;
      }
      case 'create_expense': {
        const validCategories = ['materials', 'tools', 'fuel', 'rental', 'subcontractor', 'admin', 'other'];
        if (!p.provider || typeof p.amount !== 'number' || !validCategories.includes(p.category)) {
          return isFR ? '⚠️ Dépense : informations manquantes ou invalides.' : '⚠️ Expense: missing or invalid information.';
        }
        const matchedProject = p.projectName
          ? projects.find(proj => proj.name.toLowerCase() === String(p.projectName).toLowerCase())
          : undefined;
        const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : new Date().toISOString().split('T')[0];
        const amount = Math.max(0, Number(p.amount));
        const tax = Math.max(0, Number(p.tax) || 0);
        addExpense({
          provider: String(p.provider), category: p.category, projectId: matchedProject?.id || '',
          amount, tax, date: expenseDate, notes: p.notes ? String(p.notes) : undefined
        });
        return isFR
          ? `✅ Dépense enregistrée : ${p.provider} — ${amount.toFixed(2)} $ + ${tax.toFixed(2)} $ taxes (${p.category}, ${expenseDate}).`
          : `✅ Expense recorded: ${p.provider} — $${amount.toFixed(2)} + $${tax.toFixed(2)} tax (${p.category}, ${expenseDate}).`;
      }
      case 'create_order': {
        if (!p.supplierName || !Array.isArray(p.items) || p.items.length === 0) return isFR ? '⚠️ Commande : informations manquantes.' : '⚠️ Order: missing information.';
        const items = p.items.filter((it: any) => it && it.name)
          .map((it: any) => ({ name: String(it.name), quantity: Math.max(0, Number(it.quantity) || 0), price: Math.max(0, Number(it.price) || 0) }));
        const totalAmount = Number(items.reduce((s: number, it: any) => s + it.quantity * it.price, 0).toFixed(2));
        addSupplierOrder({ supplierName: String(p.supplierName), date: new Date().toISOString().split('T')[0], items, status: 'ordered', totalAmount });
        return isFR ? `✅ Commande créée chez ${p.supplierName} (${items.length} articles, ${totalAmount.toFixed(2)} $).` : `✅ Order created at ${p.supplierName} (${items.length} items, $${totalAmount.toFixed(2)}).`;
      }
      default:
        return isFR ? `⚠️ Action inconnue : ${name}.` : `⚠️ Unknown action: ${name}.`;
    }
  };

  // ---------------------- Synthèse vocale automatique ----------------------
  const cleanTextForSpeech = (rawText: string): string => rawText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[✅✔️]/g, isFR ? 'Confirmé. ' : 'Confirmed. ')
    .replace(/[⚠️]/g, isFR ? 'Attention. ' : 'Warning. ')
    .replace(/[*_#`>|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const splitSpeechText = (rawText: string): string[] => {
    const cleaned = cleanTextForSpeech(rawText);
    if (!cleaned) return [];
    const sentences = cleaned.match(/[^.!?;:]+[.!?;:]?|[^.!?;:]+$/g) || [cleaned];
    const chunks: string[] = [];
    let current = '';
    sentences.forEach(sentence => {
      const next = `${current} ${sentence.trim()}`.trim();
      if (next.length > 220 && current) {
        chunks.push(current);
        current = sentence.trim();
      } else {
        current = next;
      }
    });
    if (current) chunks.push(current);
    return chunks;
  };

  const speakResponse = (rawText: string) => {
    if (!('speechSynthesis' in window) || !rawText.trim()) return;
    const chunks = splitSpeechText(rawText);
    if (!chunks.length) return;

    const synth = window.speechSynthesis;
    const sequence = ++speechSequenceRef.current;
    synth.cancel();
    synth.resume();
    setIsSpeaking(true);

    const speakChunk = (index: number) => {
      if (sequence !== speechSequenceRef.current || index >= chunks.length) {
        if (sequence === speechSequenceRef.current) setIsSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = isFR ? 'fr-CA' : 'en-CA';
      utterance.rate = 0.98;
      utterance.pitch = 1;
      const voices = synth.getVoices();
      const preferred = voices.find(voice => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
        || voices.find(voice => voice.lang.toLowerCase().startsWith(isFR ? 'fr' : 'en'));
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => {
        if (sequence === speechSequenceRef.current) setIsSpeaking(false);
      };
      synth.speak(utterance);
    };

    speakChunk(0);
  };

  const stopCurrentSpeech = () => {
    speechSequenceRef.current += 1;
    window.speechSynthesis?.cancel?.();
    setIsSpeaking(false);
  };

  const installAssistant = async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      installPromptRef.current = null;
      setCanInstallAssistant(false);
    }
  };

  // ------------------------------ Envoi IA ----------------------------------
  const sendMessage = async (dictatedText?: string) => {
    const requestedText = typeof dictatedText === 'string' ? dictatedText : message;
    if ((!requestedText.trim() && !attachment) || busy || !isAdmin) return;
    const current = attachment;
    const userText = requestedText.trim() || (isFR ? 'Analyse cette photo (reçu, facture ou chantier).' : 'Analyze this photo (receipt, invoice, or job site).');
    const imagePayload = current ? { mimeType: current.mimeType, data: current.dataUrl.split(',')[1], name: current.name } : undefined;

    setHistory(prev => [...prev, { role: 'user', text: userText, imagePreviewUrl: current?.dataUrl }]);
    setMessage('');
    setAttachment(null);
    setBusy(true);

    try {
      const PROVIDER_NAMES: Record<string, string> = { anthropic: 'Anthropic Claude', openai: 'OpenAI', gemini: 'Google Gemini' };
      const regionLabel = companyInfo.region
        ? `${companyInfo.region} (${companyInfo.country === 'US' ? (isFR ? 'États-Unis' : 'United States') : 'Canada'})`
        : 'Canada';
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          message: userText,
          provider: companyInfo.aiProvider || 'gemini',
          regionLabel,
          image: imagePayload,
          appContext: buildAppContext(),
          language: currentLanguage,
          allowActions: true
        })
      });
      let data: any = null;
      try { data = JSON.parse(await res.text()); } catch { /* proxy absent */ }

      if (data && res.ok) {
        const notes = (Array.isArray(data.actions) ? data.actions.slice(0, 5) : []).map((a: any) => {
          try { return executeAction(a.name, a.args || {}); }
          catch { return isFR ? '⚠️ Action impossible à exécuter.' : '⚠️ Action could not be executed.'; }
        });
        const displayText = String(data.reply || '').trim() || (notes.length ? (isFR ? 'Action effectuée.' : 'Action completed.') : (isFR ? 'Réponse vide.' : 'Empty reply.'));
        const sourceLabel = !data.simulated && data.provider
          ? `${PROVIDER_NAMES[data.provider] || data.provider} · ${isFR ? 'clé serveur' : 'server key'}`
          : undefined;
        setHistory(prev => [
          ...prev,
          { role: 'assistant', text: displayText, simulated: data.simulated, sourceLabel },
          ...notes.map((note: string) => ({ role: 'assistant' as const, text: note }))
        ]);
        speakResponse([displayText, ...notes].join(' '));
      } else if (res.status === 401) {
        const errorText = isFR ? 'Session expirée — reconnectez-vous.' : 'Session expired — please log in again.';
        setHistory(prev => [...prev, { role: 'assistant', text: errorText }]);
        speakResponse(errorText);
        logout();
      } else {
        const errorText = String(data?.error || (isFR ? 'Serveur IA injoignable.' : 'AI server unreachable.'));
        setHistory(prev => [...prev, { role: 'assistant', text: errorText }]);
        speakResponse(errorText);
      }
    } catch (err: any) {
      const errorText = isFR ? `Erreur réseau : ${err?.message || err}` : `Network error: ${err?.message || err}`;
      setHistory(prev => [...prev, { role: 'assistant', text: errorText }]);
      speakResponse(errorText);
    } finally {
      setBusy(false);
    }
  };

  // ----------------------- Dictée vocale vers le chat -----------------------
  const stopVoiceInput = () => {
    recognitionRef.current?.stop?.();
  };

  const startVoiceInput = () => {
    if (busy || !isAdmin) return;
    if (isListening) {
      stopVoiceInput();
      return;
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSpeechError(isFR
        ? 'La dictée vocale n’est pas offerte par ce navigateur. Utilisez Chrome ou Samsung Internet à jour.'
        : 'Voice dictation is not supported by this browser. Use an up-to-date Chrome or Samsung Internet browser.');
      return;
    }

    // Évite que le micro réécoute la réponse que l’IA est en train de lire.
    speechSequenceRef.current += 1;
    window.speechSynthesis?.cancel?.();
    setIsSpeaking(false);
    setSpeechError(null);
    dictatedTextRef.current = '';
    recognitionFailedRef.current = false;

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = isFR ? 'fr-CA' : 'en-CA';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = String(event.results[index][0]?.transcript || '');
        if (event.results[index].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText.trim()) dictatedTextRef.current = `${dictatedTextRef.current} ${finalText}`.trim();
      setMessage(`${dictatedTextRef.current} ${interimText}`.trim());
    };
    recognition.onerror = (event: any) => {
      recognitionFailedRef.current = true;
      const reason = String(event?.error || 'unknown');
      const permissionDenied = reason === 'not-allowed' || reason === 'service-not-allowed';
      setSpeechError(permissionDenied
        ? (isFR ? 'Autorisez le microphone dans les réglages du navigateur, puis réessayez.' : 'Allow microphone access in browser settings, then try again.')
        : (isFR ? `La dictée vocale s’est arrêtée (${reason}).` : `Voice dictation stopped (${reason}).`));
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const finalText = dictatedTextRef.current.trim();
      dictatedTextRef.current = '';
      if (finalText && !recognitionFailedRef.current) {
        setMessage('');
        void sendMessage(finalText);
      }
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError(isFR ? 'Le microphone est déjà utilisé. Fermez l’autre écoute et réessayez.' : 'The microphone is already in use. Stop the other recording and try again.');
    }
  };

  // ------------------------------ Rendu -------------------------------------
  const adminProfiles = employees.filter(emp => emp.role === 'admin');

  if (!isAdmin) {
    return (
      <main className="min-h-[100dvh] bg-[#0A0D12] text-white flex flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="text-center">
          <div className="text-5xl mb-3">🤖</div>
          <h1 className="text-2xl font-black">{isFR ? 'Assistant IA' : 'AI Assistant'}</h1>
          <p className="text-sm text-gray-400 mt-1">{companyInfo.name || 'Hailite Manager'}</p>
          <p className="text-xs text-gray-500 mt-3 max-w-xs">
            {isFR ? 'Accès réservé aux administrateurs. Sélectionnez votre profil puis entrez votre NIP.' : 'Administrators only. Select your profile and enter your PIN.'}
          </p>
        </div>

        {adminProfiles.length === 0 && (
          <p className="text-sm text-orange-400 text-center max-w-xs">
            {isFR ? 'Aucun profil administrateur trouvé. Ouvrez d’abord l’application complète pour vous connecter une première fois.' : 'No administrator profile found. Open the full application first to sign in once.'}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {adminProfiles.map(emp => (
            <button
              key={emp.id}
              type="button"
              onClick={() => { setSelectedId(emp.id); setPin(''); setLoginError(null); }}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl border min-w-24 ${selectedId === emp.id ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900'}`}
            >
              {emp.avatar
                ? <img src={emp.avatar} alt="" className="w-14 h-14 rounded-full" />
                : <span className="w-14 h-14 rounded-full bg-orange-600 flex items-center justify-center text-xl font-black">{(emp.name || '?').charAt(0)}</span>}
              <span className="text-xs font-bold">{emp.name}</span>
            </button>
          ))}
        </div>

        {selectedId && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-2" aria-label="NIP">
              {[0, 1, 2, 3].map(i => (
                <span key={i} className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-orange-500' : 'bg-gray-700'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                <button key={d} type="button" onClick={() => pressDigit(d)} className="w-16 h-14 rounded-xl bg-gray-900 border border-gray-800 text-xl font-black active:bg-gray-800">{d}</button>
              ))}
              <span />
              <button type="button" onClick={() => pressDigit(0)} className="w-16 h-14 rounded-xl bg-gray-900 border border-gray-800 text-xl font-black active:bg-gray-800">0</button>
              <button type="button" onClick={() => setPin(pin.slice(0, -1))} className="w-16 h-14 rounded-xl bg-gray-900 border border-gray-800 text-sm font-black active:bg-gray-800">⌫</button>
            </div>
            {loginBusy && <p className="text-xs text-gray-400">{isFR ? 'Vérification…' : 'Verifying…'}</p>}
            {loginError && <p className="text-xs text-red-400">{loginError}</p>}
          </div>
        )}

        <a href="/" className="text-[11px] text-gray-500 underline">{isFR ? 'Ouvrir l’application complète' : 'Open the full application'}</a>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] bg-[#0A0D12] text-white flex flex-col">
      {/* En-tête */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#16191F]">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🤖</span>
          <div>
            <h1 className="text-sm font-black leading-none">{isFR ? 'Assistant IA' : 'AI Assistant'}</h1>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">{companyInfo.name || 'Hailite Manager'} · {activeEmployee?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canInstallAssistant && (
            <button
              type="button"
              onClick={installAssistant}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 text-[10px] font-black text-cyan-200"
              title={isFR ? 'Installer l’Assistant IA sur l’écran d’accueil' : 'Install AI Assistant on the home screen'}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{isFR ? 'Installer' : 'Install'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={stopCurrentSpeech}
            disabled={!isSpeaking}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${isSpeaking ? 'border-red-500/40 bg-red-500/15 text-red-200 shadow-[0_0_14px_rgba(239,68,68,0.25)]' : 'border-gray-700 bg-gray-900 text-orange-300 opacity-60'}`}
            title={isSpeaking ? (isFR ? 'Arrêter la réponse vocale en cours' : 'Stop the current spoken reply') : (isFR ? 'La prochaine réponse sera lue automatiquement' : 'The next reply will be spoken automatically')}
            aria-label={isSpeaking ? (isFR ? 'Arrêter la voix de l’IA' : 'Stop AI voice') : (isFR ? 'Réponses vocales automatiques activées' : 'Automatic spoken replies enabled')}
          >
            {isSpeaking ? <VolumeX className="h-5 w-5 animate-pulse" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <a href="/" className="px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-[10px] font-black text-gray-300">
            {isFR ? 'App complète' : 'Full app'}
          </a>
          <button type="button" onClick={() => logout()} className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400" aria-label={isFR ? 'Déconnexion' : 'Log out'}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {history.length === 0 && (
          <div className="m-auto text-center text-gray-500 max-w-xs flex flex-col gap-3">
            <span className="text-4xl">👋</span>
            <p className="text-sm font-bold text-gray-300">
              {isFR ? 'Touchez le micro et posez votre question à voix haute, écrivez-la, ou photographiez une facture ou un chantier.' : 'Tap the microphone and ask out loud, type your question, or snap a photo of a bill or job site.'}
            </p>
            <p className="text-[11px]">
              {isFR ? 'Exemples : « Combien d’heures cette semaine ? » · « Quelles factures sont en retard ? » · 📸 un reçu → dépense ajoutée automatiquement.' : 'Examples: “How many hours this week?” · “Which invoices are overdue?” · 📸 a receipt → expense added automatically.'}
            </p>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${entry.role === 'user' ? 'self-end bg-orange-600 text-white' : 'self-start bg-gray-900 border border-gray-800 text-gray-100'}`}>
            {entry.imagePreviewUrl && <img src={entry.imagePreviewUrl} alt="" className="rounded-lg mb-2 max-h-44 object-contain" />}
            {entry.text}
            {entry.sourceLabel && <div className="text-[9px] text-gray-500 font-mono mt-1.5">{entry.sourceLabel}</div>}
            {entry.simulated && <div className="text-[9px] text-amber-400 font-mono mt-1.5">{isFR ? 'mode simulation (aucune clé serveur)' : 'simulation mode (no server key)'}</div>}
          </div>
        ))}
        {busy && (
          <div className="self-start bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-400">
            <span className="inline-flex gap-1">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>●</span>
            </span>
          </div>
        )}
      </div>

      {/* Pièce jointe en attente */}
      {attachment && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <img src={attachment.dataUrl} alt="" className="h-14 rounded-lg border border-gray-700" />
          <span className="text-[10px] text-gray-400 flex-1 truncate">{attachment.name}</span>
          <button type="button" onClick={() => setAttachment(null)} className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400" aria-label={isFR ? 'Retirer la photo' : 'Remove photo'}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(isListening || speechError) && (
        <div className="px-4 pb-2" aria-live="polite">
          {isListening && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              {isFR ? 'Écoute en cours… Parlez normalement. La question sera envoyée quand vous aurez terminé.' : 'Listening… Speak normally. Your question will be sent when you finish.'}
            </div>
          )}
          {speechError && !isListening && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {speechError}
            </div>
          )}
        </div>
      )}

      {/* Barre de saisie */}
      <footer className="px-3 py-3 border-t border-gray-800 bg-[#16191F] flex items-end gap-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelected} />
        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        <button type="button" onClick={() => cameraInputRef.current?.click()} className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-orange-400" aria-label={isFR ? 'Prendre une photo' : 'Take a photo'}>
          <Camera className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => galleryInputRef.current?.click()} className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 text-lg leading-none" aria-label={isFR ? 'Choisir une image' : 'Choose an image'}>
          🖼️
        </button>
        <button
          type="button"
          onClick={startVoiceInput}
          disabled={busy}
          className={`relative p-3 rounded-xl border transition disabled:opacity-40 ${isListening ? 'border-red-400 bg-red-600 text-white shadow-[0_0_18px_rgba(239,68,68,0.45)]' : 'border-gray-800 bg-gray-900 text-cyan-300'}`}
          aria-label={isListening ? (isFR ? 'Arrêter et envoyer la dictée' : 'Stop and send dictation') : (isFR ? 'Poser une question avec le microphone' : 'Ask with the microphone')}
          title={isListening ? (isFR ? 'Touchez pour terminer' : 'Tap to finish') : (isFR ? 'Parler à l’IA' : 'Talk to the AI')}
        >
          <Mic className={`w-5 h-5 ${isListening ? 'animate-pulse' : ''}`} />
        </button>
        <textarea
          ref={messageInputRef}
          rows={1}
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={isListening ? (isFR ? 'Je vous écoute…' : 'Listening…') : (isFR ? 'Votre question…' : 'Your question…')}
          aria-label={isFR ? 'Message à envoyer à l’assistant' : 'Message to send to the assistant'}
          className="flex-1 min-w-0 min-h-12 max-h-80 resize-none overflow-y-hidden px-4 py-3 rounded-xl bg-gray-950 border border-gray-800 text-sm leading-6"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={busy || (!message.trim() && !attachment)}
          className="p-3 rounded-xl bg-orange-600 text-white disabled:opacity-40"
          aria-label={isFR ? 'Envoyer' : 'Send'}
        >
          {busy ? <Check className="w-5 h-5 opacity-50" /> : <Send className="w-5 h-5" />}
        </button>
      </footer>
    </main>
  );
}
