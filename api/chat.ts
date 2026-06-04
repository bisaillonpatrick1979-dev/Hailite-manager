import { generateAiReply, getProviderErrorReply, normalizeProvider } from '../src/aiProviders';
import type { ChatImage } from '../src/aiProviders';

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
};

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

function normalizeRequestBody(body: VercelLikeRequest['body'] | string | undefined): VercelLikeRequest['body'] {
  if (!body) return undefined;
  if (typeof body !== 'string') return body as VercelLikeRequest['body'];
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

  try {
    const { message, image, provider } = body || {};
    const result = await generateAiReply(normalizeProvider(provider), message || '', image);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error on Vercel /api/chat:', error);
    return res.status(200).json(getProviderErrorReply(normalizeProvider(body?.provider), error));
  }
}
