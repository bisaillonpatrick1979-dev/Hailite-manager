import { generateAiReply, normalizeProvider } from '../src/aiProviders';
import type { ChatImage } from '../src/aiProviders';

type VercelLikeRequest = {
  method?: string;
  body?: {
    message?: string;
    provider?: string;
    image?: ChatImage;
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
    const { message, image, provider } = req.body || {};
    const result = await generateAiReply(normalizeProvider(provider), message || '', image);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error on Vercel /api/chat:', error);
    return res.status(500).json({ error: error.message || 'Error occurred while calling AI provider' });
  }
}
