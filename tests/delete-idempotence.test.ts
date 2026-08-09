import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile(new URL('../apiRoutes.ts', import.meta.url), 'utf8');

// Isole le corps de la route DELETE, borné par la route suivante, pour ne pas
// confondre avec PATCH ni dépendre d'une longueur devinée.
function routeBody(start: string): string {
  const from = routes.indexOf(start);
  assert.notEqual(from, -1, `route introuvable : ${start}`);
  const next = routes.indexOf('  app.', from + start.length);
  return routes.slice(from, next === -1 ? routes.length : next);
}
const deleteRoute = routeBody("app.delete('/api/db/:table/:id'");

test('supprimer une ligne déjà absente n’est pas une erreur', () => {
  // Le 404 s'affichait comme « Sauvegarde nuage échouée — vérifiez la
  // connexion » alors que le réseau allait bien : un objectif hebdomadaire
  // jamais monté dans le nuage suffisait à déclencher la bannière rouge.
  assert.match(deleteRoute, /alreadyAbsent: true/);
  assert.doesNotMatch(deleteRoute, /if \(!existing\) return res\.status\(404\)/);
});

test('la suppression reste tracée même quand il n’y avait rien à supprimer', () => {
  assert.match(deleteRoute, /logAudit\(auth, 'delete_noop', table, id\)/);
});

test('une modification sur une ligne absente reste une erreur', () => {
  // Contrairement à la suppression, un PATCH sans cible ne peut pas aboutir :
  // l'intention de l'appelant n'est pas satisfaite.
  const patchRoute = routeBody("app.patch('/api/db/:table/:id'");
  assert.match(patchRoute, /Enregistrement introuvable/);
});

test('les contrôles d’appartenance restent en place après le raccourci', () => {
  assert.match(deleteRoute, /Suppression limitée à vos propres enregistrements/);
  assert.match(deleteRoute, /applyTenantWriteScope\(deleteQuery, table, auth\)/);
});
