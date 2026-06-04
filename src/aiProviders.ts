import { GoogleGenAI } from '@google/genai';

export type AiProvider = 'gemini' | 'openai' | 'anthropic';
export type ChatImage = { data: string; mimeType: string; name?: string };

export const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic'];

const SYSTEM_INSTRUCTION = `
  Tu es l'assistant d'IA intelligent d'une entreprise québécoise de pose de toiture et parement extérieur appelée "Hailite Xteriors".
  L'application de gestion de chantier s'appelle "Gestion Chantier Pro".
  Ton but est d'aider les administrateurs et les ouvriers sur les chantiers de construction.
  Tu connais la CCQ (Commission de la construction du Québec) et les réglementations CNESST.
  Donne des conseils professionnels, clairs et utilise des termes québécois quand approprié (ex: "Chantier", "Pièce", "Bardeaux", "Soufflage").
  Réponds de manière concise, polie et technique pour les calculs de toiture, la rentabilité de chantier, la sécurité ou la gestion de l'inventaire.
  Si une photo est fournie, analyse ce que tu vois comme un assistant de chantier: matériaux, défauts visibles, sécurité, estimation ou prochaine action. Mentionne les limites si l'image ne permet pas de conclure.
`;

export function normalizeProvider(provider?: string): AiProvider {
  const normalized = String(provider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
  return AI_PROVIDERS.includes(normalized as AiProvider) ? (normalized as AiProvider) : 'gemini';
}

export function getProviderKey(provider: AiProvider): string | undefined {
  const key = provider === 'gemini'
    ? process.env.GEMINI_API_KEY
    : provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;
  return key?.trim();
}

export function isMissingKey(provider: AiProvider): boolean {
  const key = getProviderKey(provider);
  const placeholders = ['MY_GEMINI_API_KEY', 'MY_OPENAI_API_KEY', 'MY_ANTHROPIC_API_KEY'];
  if (!key || placeholders.includes(key)) return true;
  return provider === 'anthropic' && !key.startsWith('sk-ant-');
}

export function getProviderModel(provider: AiProvider): string {
  if (provider === 'gemini') return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (provider === 'openai') return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
}

function getProviderEnvKeyName(provider: AiProvider): string {
  if (provider === 'gemini') return 'GEMINI_API_KEY';
  if (provider === 'openai') return 'OPENAI_API_KEY';
  return 'ANTHROPIC_API_KEY';
}

export function getFallbackReply(provider: AiProvider, image?: ChatImage) {
  const keyName = getProviderEnvKeyName(provider);
  return {
    provider,
    reply: image
      ? `🤖 Photo reçue en mode simulation locale. Configurez ${keyName} dans Vercel pour activer l'analyse visuelle avec le provider ${provider}.`
      : `🤖 L'assistant IA fonctionne en mode simulation locale car ${keyName} n'est pas disponible côté serveur. Vérifiez que la variable est ajoutée dans Vercel (Production/Preview), puis redéployez.`,
    simulated: true,
  };
}

export function getProviderErrorReply(provider: AiProvider, error: unknown) {
  const message = error instanceof Error ? error.message : 'Erreur inconnue du provider IA';
  return {
    provider,
    reply: `⚠️ L'agent IA a bien reçu la demande, mais le provider ${provider} a retourné une erreur. Vérifiez la clé API dans Vercel, le modèle choisi et les limites du compte. Détail: ${message}`,
    simulated: true,
    error: message,
  };
}

async function generateWithGemini(message: string, image?: ChatImage) {
  const ai = new GoogleGenAI({
    apiKey: getProviderKey('gemini') || '',
    httpOptions: { headers: { 'User-Agent': 'hailite-manager' } }
  });

  const userParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: `Système: ${SYSTEM_INSTRUCTION}\n\nClient message: ${message || 'Analyse cette photo de chantier et donne tes recommandations.'}` }
  ];

  if (image?.data && image?.mimeType) {
    userParts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  const response = await ai.models.generateContent({
    model: getProviderModel('gemini'),
    contents: [{ role: 'user', parts: userParts }],
  });

  return response.text || '';
}

async function generateWithOpenAI(message: string, image?: ChatImage) {
  const content: any[] = [
    { type: 'text', text: `Système: ${SYSTEM_INSTRUCTION}\n\nClient message: ${message || 'Analyse cette photo de chantier et donne tes recommandations.'}` }
  ];

  if (image?.data && image?.mimeType) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getProviderKey('openai')}`,
    },
    body: JSON.stringify({
      model: getProviderModel('openai'),
      messages: [{ role: 'user', content }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function generateWithAnthropic(message: string, image?: ChatImage) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: getProviderKey('anthropic'),
  });

  const content: any[] = [
    { type: 'text', text: message || 'Analyse cette photo de chantier et donne tes recommandations.' }
  ];

  if (image?.data && image?.mimeType) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.data,
      },
    });
  }

  const response = await client.messages.create({
    model: getProviderModel('anthropic'),
    max_tokens: 1024,
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content }],
  });

  return response.content
    .map((part) => part.type === 'text' ? part.text : '')
    .join('\n')
    .trim();
}

export async function generateAiReply(provider: AiProvider, message: string, image?: ChatImage) {
  if (isMissingKey(provider)) return getFallbackReply(provider, image);

  const reply = provider === 'gemini'
    ? await generateWithGemini(message, image)
    : provider === 'openai'
      ? await generateWithOpenAI(message, image)
      : await generateWithAnthropic(message, image);

  return { provider, reply, simulated: false };
}

export function listAiProviderStatus(activeProvider = normalizeProvider()) {
  return {
    activeProvider,
    providers: AI_PROVIDERS.map(provider => ({
      id: provider,
      model: getProviderModel(provider),
      configured: !isMissingKey(provider),
      active: provider === activeProvider,
    })),
  };
}

export async function testAiProviders(requestedProvider?: string) {
  const providersToTest = requestedProvider === 'all'
    ? AI_PROVIDERS
    : [normalizeProvider(requestedProvider)];

  const results = await Promise.all(providersToTest.map(async (provider) => {
    try {
      const result = await generateAiReply(provider, 'Réponds seulement: OK provider prêt pour Gestion Chantier Pro.');
      return { provider, ok: true, model: getProviderModel(provider), ...result };
    } catch (error: any) {
      return { provider, ok: false, model: getProviderModel(provider), error: error.message || 'Erreur inconnue' };
    }
  }));

  return { activeProvider: normalizeProvider(requestedProvider), results };
}
