import { listAiProviderStatus } from '../../src/aiProviders';

type VercelLikeRequest = {
  method?: string;
};

type VercelLikeResponse = {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

export default function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'GET') {
    res.setHeader?.('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json(listAiProviderStatus());
}
