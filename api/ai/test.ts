import { testAiProviders } from '../../src/aiProviders';

type VercelLikeRequest = {
  method?: string;
  body?: {
    provider?: string;
  };
};

type VercelLikeResponse = {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return res.status(200).json(await testAiProviders(req.body?.provider));
  } catch (error: any) {
    console.error('Error on Vercel /api/ai/test:', error);
    return res.status(500).json({ error: error.message || 'Error occurred while testing AI provider' });
  }
}
