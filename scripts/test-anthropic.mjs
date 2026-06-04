import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

if (!apiKey) {
  console.error('✗ ANTHROPIC_API_KEY est absente. Ajoutez-la dans Vercel/ENV puis redéployez.');
  process.exit(1);
}

if (!apiKey.startsWith('sk-ant-')) {
  console.error('✗ ANTHROPIC_API_KEY doit commencer par sk-ant-. Vérifiez les espaces ou la mauvaise variable.');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

try {
  const response = await client.messages.create({
    model,
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Test' }],
  });

  const text = response.content
    .map((part) => part.type === 'text' ? part.text : '')
    .join('\n')
    .trim();

  console.log('✓ Connexion Anthropic réussie!');
  console.log(text);
} catch (error) {
  console.error('✗ Erreur Anthropic:', error instanceof Error ? error.message : error);
  process.exit(1);
}
