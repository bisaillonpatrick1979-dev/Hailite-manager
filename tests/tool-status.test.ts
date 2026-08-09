import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TOOL_ASSET_STATUSES, normalizeToolAssetStatus } from '../src/types.ts';

test('un statut inconnu ne peut plus atteindre l’interface', () => {
  // Cas réel : une ligne portant « available » faisait chercher un libellé
  // inexistant, et tout l’onglet Outils tombait sur l’écran d’erreur.
  assert.equal(normalizeToolAssetStatus('available'), 'in_service');
  assert.equal(normalizeToolAssetStatus(null), 'in_service');
  assert.equal(normalizeToolAssetStatus(''), 'in_service');
  assert.equal(normalizeToolAssetStatus(42), 'in_service');
});

test('les statuts légitimes sont conservés tels quels', () => {
  for (const status of TOOL_ASSET_STATUSES) {
    assert.equal(normalizeToolAssetStatus(status), status);
  }
});

test('la lecture d’une ligne d’outil normalise le statut', async () => {
  const client = await readFile(new URL('../src/apiClient.ts', import.meta.url), 'utf8');
  assert.match(client, /status: normalizeToolAssetStatus\(r\.status\)/);
});

test('le libellé de statut ne peut pas planter sur une valeur hors liste', async () => {
  const registry = await readFile(new URL('../src/components/ToolRegistry.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(registry, /return labels\[status\]\[isFR/);
  assert.match(registry, /if \(!pair\) return String\(status/);
});
