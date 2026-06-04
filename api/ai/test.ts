type VercelLikeRequest = {
  method?: string;
  body?: {
    provider?: string;
  } | string;
};

type VercelLikeResponse = {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
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

  try {
    const body = normalizeRequestBody(req.body);
    const { testAiProviders } = await import('../../src/aiProviders');
    return res.status(200).json(await testAiProviders(body?.provider));
  } catch (error: any) {
    console.error('Error on Vercel /api/ai/test:', error);
    return res.status(200).json({
      activeProvider: 'anthropic',
      results: [{ provider: 'anthropic', ok: false, error: error.message || 'Erreur backend test provider' }],
    });
  }
}
