import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('tous les sélecteurs de logo ouvrent les photos ou fichiers, jamais la caméra forcée', async () => {
  const logoSources = await Promise.all([
    source('src/components/OnboardingScreen.tsx'),
    source('src/components/CompanyComplianceSettings.tsx'),
    source('src/components/BusinessLogoField.tsx')
  ]);

  for (const component of logoSources) {
    assert.match(component, /type="file"/);
    assert.match(component, /accept="image\/\*"/);
    assert.doesNotMatch(component, /capture=/);
  }
});
