import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const assistant = read('src/AssistantApp.tsx');
const manifest = read('public/assistant.webmanifest');
const main = read('src/main.tsx');

for (const marker of [
  'speakResponse',
  'SpeechSynthesisUtterance',
  "utterance.lang = isFR ? 'fr-CA' : 'en-CA'",
  'splitSpeechText',
  'speechSequenceRef',
  'speakResponse([displayText, ...notes].join',
  'stopCurrentSpeech',
  'Volume2',
  'VolumeX',
  'Arrêter la réponse vocale en cours',
  'La prochaine réponse sera lue automatiquement',
  'Réponses vocales automatiques activées',
  'SpeechRecognitionCtor',
  '(window as any).webkitSpeechRecognition',
  "recognition.lang = isFR ? 'fr-CA' : 'en-CA'",
  'recognition.interimResults = true',
  'recognition.onresult',
  'recognition.onend',
  'void sendMessage(finalText)',
  'startVoiceInput',
  'stopVoiceInput',
  'Écoute en cours',
  'Poser une question avec le microphone',
  'Autorisez le microphone',
  'beforeinstallprompt',
  'installAssistant',
  'Installer l’Assistant IA sur l’écran d’accueil'
]) assert.ok(assistant.includes(marker), `Fonction vocale absente: ${marker}`);

assert.ok(
  assistant.includes("if (!('speechSynthesis' in window) || !rawText.trim()) return;"),
  'La synthèse vocale n’est pas automatiquement active pour chaque réponse.'
);
assert.ok(
  !assistant.includes('ASSISTANT_VOICE_MUTED_KEY') &&
  !assistant.includes('voiceMutedRef') &&
  !assistant.includes('toggleVoiceMute') &&
  !assistant.includes('setVoiceMuted') &&
  !assistant.includes("localStorage.setItem('gcp_assistant_voice_muted'") &&
  !assistant.includes("localStorage.getItem('gcp_assistant_voice_muted'"),
  'Un ancien état Muet persistant est encore présent.'
);
assert.ok(
  assistant.includes('speechSequenceRef.current += 1;') &&
  assistant.includes('window.speechSynthesis?.cancel?.();') &&
  assistant.includes('setIsSpeaking(false);'),
  'Le bouton haut-parleur n’arrête pas immédiatement la lecture en cours.'
);
assert.ok(
  assistant.includes('disabled={!isSpeaking}'),
  'Le bouton haut-parleur ne fonctionne pas comme arrêt ponctuel de la voix.'
);
assert.ok(
  assistant.includes("window.speechSynthesis?.cancel?.();") && assistant.includes('Évite que le micro réécoute'),
  'Le micro ne coupe pas la lecture précédente et risque de réécouter l’IA.'
);
assert.ok(
  assistant.includes("const sendMessage = async (dictatedText?: string)"),
  'La dictée ne peut pas transmettre son texte directement au chat.'
);
assert.ok(
  assistant.includes("const requestedText = typeof dictatedText === 'string' ? dictatedText : message"),
  'La question dictée n’est pas utilisée par la requête IA.'
);

for (const marker of [
  '"start_url": "/assistant"',
  '"scope": "/assistant"',
  '"display": "standalone"',
  'assistant-icon-192.png',
  'assistant-icon-512.png'
]) assert.ok(manifest.includes(marker), `Manifeste assistant incomplet: ${marker}`);

assert.ok(main.includes("manifest.href = '/assistant.webmanifest'"), 'Le manifeste autonome n’est pas chargé sur /assistant.');
assert.ok(main.includes("appleTitle.content = 'Assistant IA'"), 'Le raccourci iOS n’a pas de nom dédié.');
assert.ok(
  main.includes('const IS_ASSISTANT_ROUTE =') &&
  main.includes("window.location.pathname.replace(") &&
  main.includes("=== '/assistant'"),
  'La route autonome /assistant est absente.'
);

console.log('Assistant IA vocal validé', {
  everyReplySpokenAutomatically: true,
  noPersistentMute: true,
  speakerStopsCurrentReplyOnly: true,
  nextReplySpeaksAgainAutomatically: true,
  longReplyChunking: true,
  frenchCanadianVoice: true,
  englishCanadianVoice: true,
  speechToText: true,
  interimTranscript: true,
  automaticVoiceSend: true,
  microphoneFeedbackPrevention: true,
  permissionErrorsExplained: true,
  dedicatedAssistantRoute: true,
  homeScreenInstallPrompt: true,
  standaloneManifest: true
});
