from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'AssistantApp.tsx'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    text = text.replace(old, new, 1)


replace_once(
    "import { Camera, Check, LogOut, Send, X } from 'lucide-react';",
    "import { Camera, Check, Download, LogOut, Mic, Send, Volume2, VolumeX, X } from 'lucide-react';",
    'icônes vocales assistant'
)

replace_once(
    "interface Attachment { dataUrl: string; mimeType: string; name: string }\n",
    """interface Attachment { dataUrl: string; mimeType: string; name: string }

interface AssistantInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const ASSISTANT_VOICE_MUTED_KEY = 'gcp_assistant_voice_muted';
""",
    'types voix et installation'
)

refs_anchor = """  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
"""
refs_replacement = """  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const dictatedTextRef = useRef('');
  const recognitionFailedRef = useRef(false);
  const speechSequenceRef = useRef(0);
  const voiceMutedRef = useRef(false);
  const installPromptRef = useRef<AssistantInstallPrompt | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [canInstallAssistant, setCanInstallAssistant] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(ASSISTANT_VOICE_MUTED_KEY) === '1'; }
    catch { return false; }
  });
"""
replace_once(refs_anchor, refs_replacement, 'états vocaux assistant')

scroll_effect = """  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, busy]);
"""
voice_effects = scroll_effect + """

  // Le son est activé par défaut. Le seul état persistant est le choix explicite
  // « Muet » de l'utilisateur sur cet appareil.
  useEffect(() => {
    voiceMutedRef.current = voiceMuted;
    try { localStorage.setItem(ASSISTANT_VOICE_MUTED_KEY, voiceMuted ? '1' : '0'); } catch { /* stockage indisponible */ }
    if (voiceMuted && 'speechSynthesis' in window) {
      speechSequenceRef.current += 1;
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [voiceMuted]);

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
"""
replace_once(scroll_effect, voice_effects, 'effets voix et installation')

send_anchor = """  // ------------------------------ Envoi IA ----------------------------------
  const sendMessage = async () => {
    if ((!message.trim() && !attachment) || busy || !isAdmin) return;
    const current = attachment;
    const userText = message.trim() || (isFR ? 'Analyse cette photo (reçu, facture ou chantier).' : 'Analyze this photo (receipt, invoice, or job site).');
"""
voice_helpers_and_send = """  // ---------------------- Synthèse vocale automatique ----------------------
  const cleanTextForSpeech = (rawText: string): string => rawText
    .replace(/```[\\s\\S]*?```/g, ' ')
    .replace(/https?:\\/\\/\\S+/g, ' ')
    .replace(/[✅✔️]/g, isFR ? 'Confirmé. ' : 'Confirmed. ')
    .replace(/[⚠️]/g, isFR ? 'Attention. ' : 'Warning. ')
    .replace(/[*_#`>|~]/g, ' ')
    .replace(/\\s+/g, ' ')
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
    if (voiceMutedRef.current || !('speechSynthesis' in window) || !rawText.trim()) return;
    const chunks = splitSpeechText(rawText);
    if (!chunks.length) return;

    const synth = window.speechSynthesis;
    const sequence = ++speechSequenceRef.current;
    synth.cancel();
    synth.resume();
    setIsSpeaking(true);

    const speakChunk = (index: number) => {
      if (voiceMutedRef.current || sequence !== speechSequenceRef.current || index >= chunks.length) {
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

  const toggleVoiceMute = () => {
    setVoiceMuted(current => !current);
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
"""
replace_once(send_anchor, voice_helpers_and_send, 'synthèse avant envoi IA')

success_block = """        setHistory(prev => [
          ...prev,
          { role: 'assistant', text: displayText, simulated: data.simulated, sourceLabel },
          ...notes.map((note: string) => ({ role: 'assistant' as const, text: note }))
        ]);
"""
success_speech = success_block + """        speakResponse([displayText, ...notes].join(' '));
"""
replace_once(success_block, success_speech, 'lecture réponse réussie')

replace_once(
    """      } else if (res.status === 401) {
        setHistory(prev => [...prev, { role: 'assistant', text: isFR ? 'Session expirée — reconnectez-vous.' : 'Session expired — please log in again.' }]);
        logout();
      } else {
        setHistory(prev => [...prev, { role: 'assistant', text: String(data?.error || (isFR ? 'Serveur IA injoignable.' : 'AI server unreachable.')) }]);
      }
    } catch (err: any) {
      setHistory(prev => [...prev, { role: 'assistant', text: isFR ? `Erreur réseau : ${err?.message || err}` : `Network error: ${err?.message || err}` }]);
""",
    """      } else if (res.status === 401) {
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
""",
    'lecture erreurs IA'
)

send_end = """  };

  // ------------------------------ Rendu -------------------------------------
"""
voice_input = """  };

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
"""
replace_once(send_end, voice_input, 'dictée vocale assistant')

header_actions = """        <div className="flex items-center gap-2">
          <a href="/" className="px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-[10px] font-black text-gray-300">
"""
header_voice_actions = """        <div className="flex items-center gap-2">
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
            onClick={toggleVoiceMute}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${voiceMuted ? 'border-red-500/30 bg-red-500/10 text-red-300' : isSpeaking ? 'border-green-500/40 bg-green-500/15 text-green-300' : 'border-gray-700 bg-gray-900 text-orange-300'}`}
            title={voiceMuted ? (isFR ? 'Son désactivé — toucher pour activer' : 'Sound off — tap to enable') : (isFR ? 'Réponses vocales activées — toucher pour mettre en sourdine' : 'Spoken replies on — tap to mute')}
            aria-label={voiceMuted ? (isFR ? 'Activer les réponses vocales' : 'Enable spoken replies') : (isFR ? 'Mettre les réponses vocales en sourdine' : 'Mute spoken replies')}
          >
            {voiceMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className={`h-5 w-5 ${isSpeaking ? 'animate-pulse' : ''}`} />}
          </button>
          <a href="/" className="px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-[10px] font-black text-gray-300">
"""
replace_once(header_actions, header_voice_actions, 'boutons son et installation')

replace_once(
    """              {isFR ? 'Posez n’importe quelle question sur la compagnie, ou photographiez une facture ou un chantier.' : 'Ask anything about the company, or snap a photo of a bill or job site.'}
""",
    """              {isFR ? 'Touchez le micro et posez votre question à voix haute, écrivez-la, ou photographiez une facture ou un chantier.' : 'Tap the microphone and ask out loud, type your question, or snap a photo of a bill or job site.'}
""",
    'instruction micro assistant'
)

attachment_end = """      )}

      {/* Barre de saisie */}
"""
voice_status = """      )}

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
"""
replace_once(attachment_end, voice_status, 'statut dictée vocale')

footer_gallery = """        <button type="button" onClick={() => galleryInputRef.current?.click()} className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 text-lg leading-none" aria-label={isFR ? 'Choisir une image' : 'Choose an image'}>
          🖼️
        </button>
        <input
"""
footer_mic = """        <button type="button" onClick={() => galleryInputRef.current?.click()} className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 text-lg leading-none" aria-label={isFR ? 'Choisir une image' : 'Choose an image'}>
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
        <input
"""
replace_once(footer_gallery, footer_mic, 'bouton microphone assistant')

text = text.replace(
    "placeholder={isFR ? 'Votre question…' : 'Your question…'}",
    "placeholder={isListening ? (isFR ? 'Je vous écoute…' : 'Listening…') : (isFR ? 'Votre question…' : 'Your question…')}"
)

path.write_text(text, encoding='utf-8')
print('Assistant IA vocal intégré : dictée, envoi automatique, lecture par défaut, muet persistant et installation rapide.')
