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


# Aucun état Muet persistant : chaque ouverture et chaque nouvelle réponse
# commencent avec la voix active. Le bouton haut-parleur ne sert qu'à arrêter
# immédiatement la lecture en cours.
text = text.replace("const ASSISTANT_VOICE_MUTED_KEY = 'gcp_assistant_voice_muted';\n", '')
text = text.replace("  const voiceMutedRef = useRef(false);\n", '')

old_state = """  const [voiceMuted, setVoiceMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(ASSISTANT_VOICE_MUTED_KEY) === '1'; }
    catch { return false; }
  });
"""
text = text.replace(old_state, '')

old_effect = """  // Le son est activé par défaut. Le seul état persistant est le choix explicite
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

"""
text = text.replace(old_effect, '')

replace_once(
    """  const speakResponse = (rawText: string) => {
    if (voiceMutedRef.current || !('speechSynthesis' in window) || !rawText.trim()) return;
""",
    """  const speakResponse = (rawText: string) => {
    if (!('speechSynthesis' in window) || !rawText.trim()) return;
""",
    'lecture toujours active'
)

replace_once(
    """      if (voiceMutedRef.current || sequence !== speechSequenceRef.current || index >= chunks.length) {
""",
    """      if (sequence !== speechSequenceRef.current || index >= chunks.length) {
""",
    'séquence lecture sans muet'
)

replace_once(
    """  const toggleVoiceMute = () => {
    setVoiceMuted(current => !current);
  };
""",
    """  const stopCurrentSpeech = () => {
    speechSequenceRef.current += 1;
    window.speechSynthesis?.cancel?.();
    setIsSpeaking(false);
  };
""",
    'arrêt vocal ponctuel'
)

old_button = """          <button
            type="button"
            onClick={toggleVoiceMute}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${voiceMuted ? 'border-red-500/30 bg-red-500/10 text-red-300' : isSpeaking ? 'border-green-500/40 bg-green-500/15 text-green-300' : 'border-gray-700 bg-gray-900 text-orange-300'}`}
            title={voiceMuted ? (isFR ? 'Son désactivé — toucher pour activer' : 'Sound off — tap to enable') : (isFR ? 'Réponses vocales activées — toucher pour mettre en sourdine' : 'Spoken replies on — tap to mute')}
            aria-label={voiceMuted ? (isFR ? 'Activer les réponses vocales' : 'Enable spoken replies') : (isFR ? 'Mettre les réponses vocales en sourdine' : 'Mute spoken replies')}
          >
            {voiceMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className={`h-5 w-5 ${isSpeaking ? 'animate-pulse' : ''}`} />}
          </button>
"""
new_button = """          <button
            type="button"
            onClick={stopCurrentSpeech}
            disabled={!isSpeaking}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${isSpeaking ? 'border-red-500/40 bg-red-500/15 text-red-200 shadow-[0_0_14px_rgba(239,68,68,0.25)]' : 'border-gray-700 bg-gray-900 text-orange-300 opacity-60'}`}
            title={isSpeaking ? (isFR ? 'Arrêter la réponse vocale en cours' : 'Stop the current spoken reply') : (isFR ? 'La prochaine réponse sera lue automatiquement' : 'The next reply will be spoken automatically')}
            aria-label={isSpeaking ? (isFR ? 'Arrêter la voix de l’IA' : 'Stop AI voice') : (isFR ? 'Réponses vocales automatiques activées' : 'Automatic spoken replies enabled')}
          >
            {isSpeaking ? <VolumeX className="h-5 w-5 animate-pulse" /> : <Volume2 className="h-5 w-5" />}
          </button>
"""
replace_once(old_button, new_button, 'bouton arrêt vocal')

path.write_text(text, encoding='utf-8')
print('Voix IA toujours active; le bouton haut-parleur arrête uniquement la lecture en cours.')
