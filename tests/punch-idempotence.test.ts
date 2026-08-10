import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// `stopPunchSession` vit dans le store Zustand, qui touche localStorage et la
// couche réseau au chargement. Plutôt que de simuler tout un navigateur, on
// vérifie que le garde d'idempotence est bien présent AVANT le moindre effet
// de bord : c'est exactement ce qui manquait (un second appel recalculait une
// nouvelle heure de fin, redonnait l'XP et retirait deux fois les matériaux).
const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8');

function corpsDe(nom: string): string {
  // `lastIndexOf` vise l'implémentation : le même nom apparaît plus haut dans
  // la déclaration d'interface de l'état, qui n'a pas de corps.
  const debut = source.lastIndexOf(`  ${nom}: (`);
  assert.notEqual(debut, -1, `${nom} introuvable dans le store`);
  const fin = source.indexOf('\n  },', debut);
  assert.notEqual(fin, -1, `fin de ${nom} introuvable`);
  const corps = source.slice(debut, fin);
  assert.ok(corps.includes('=> {'), `${nom} : implémentation attendue, pas une signature`);
  return corps;
}

test('l’arrêt d’un pointage sort avant tout effet si la session est déjà fermée', () => {
  const corps = corpsDe('stopPunchSession');
  const garde = corps.indexOf('target.endTime !== null) return;');
  assert.notEqual(garde, -1, 'le garde d’idempotence doit exister');

  // Le garde doit précéder l'écriture de l'état, la sauvegarde locale,
  // l'attribution d'XP et la décrémentation de l'inventaire.
  for (const effet of ['set({ punchSessions', 'saveState(', 'addXP(', 'inventory']) {
    const position = corps.indexOf(effet);
    if (position === -1) continue;
    assert.ok(garde < position, `le garde doit précéder « ${effet} »`);
  }
});

test('le démarrage d’un pointage refuse déjà une seconde session ouverte', () => {
  const corps = corpsDe('startPunchSession');
  assert.match(corps, /p\.endTime === null\);?\s*\n\s*if \(active\) return;/,
    'un employé ne peut pas avoir deux pointages ouverts');
});
