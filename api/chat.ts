type ChatImage = { data: string; mimeType: string; name?: string };

type VercelLikeRequest = {
  method?: string;
  body?: {
    message?: string;
    provider?: string;
    image?: ChatImage;
  } | string;
};

type VercelLikeResponse = {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
  maxDuration: 30,
};

function normalizeRequestBody(body: VercelLikeRequest['body']): Exclude<VercelLikeRequest['body'], string> | undefined {
  if (!body) return undefined;
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = normalizeRequestBody(req.body);
  const provider = body?.provider;

  try {
    const { generateAiReply, normalizeProvider } = await import('../src/aiProviders');
    const result = await generateAiReply(normalizeProvider(provider), body?.message || '', body?.image);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error on Vercel /api/chat:', error);
    try {
      const { getProviderErrorReply, normalizeProvider } = await import('../src/aiProviders');
      return res.status(200).json(getProviderErrorReply(normalizeProvider(provider), error));
    } catch (importError: any) {
      const message = error?.message || importError?.message || 'Erreur backend IA inconnue';
      return res.status(200).json({
        provider: provider || 'anthropic',
        simulated: true,
        error: message,
        reply: `⚠️ La fonction IA Vercel existe, mais elle a rencontré une erreur backend avant de joindre le provider. Vérifiez le déploiement, les dépendances npm et ANTHROPIC_API_KEY. Détail: ${message}`,
      });
    }
  }
}
