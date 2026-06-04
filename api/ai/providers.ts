type VercelLikeRequest = {
  method?: string;
};

type VercelLikeResponse = {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'GET') {
    res.setHeader?.('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { listAiProviderStatus } = await import('../../src/aiProviders');
    return res.status(200).json(listAiProviderStatus());
  } catch (error: any) {
    console.error('Error on Vercel /api/ai/providers:', error);
    return res.status(200).json({
      activeProvider: 'anthropic',
      providers: [{ id: 'anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', configured: Boolean(process.env.ANTHROPIC_API_KEY), active: true, error: error.message || 'Erreur backend provider status' }],
    });
  }
}
