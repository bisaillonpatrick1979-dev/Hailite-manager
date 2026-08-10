// ---------------------------------------------------------------------------
// Défilement tactile : un conteneur ne doit jamais retenir un geste qu'il ne
// peut pas utiliser
// ---------------------------------------------------------------------------
// « overscroll-behavior: contain » était appliqué à tout élément défilant sur
// écran tactile. Conséquence mesurée au navigateur : un doigt posé sur le
// tableau de l'historique de l'équipe — qui ne défile qu'horizontalement —
// bloquait aussi le glissement vertical. La page ne bougeait pas d'un pixel ;
// il fallait viser la marge de l'écran pour descendre.
//
// Mesure d'un glissement de 240 px commencé sur le tableau :
//   ancienne règle : la page avance de 0 px
//   nouvelle règle : la page avance de 291 px
//
// La retenue reste en place là où elle sert vraiment : dans une fenêtre modale
// posée par-dessus l'écran, sans quoi c'est la page derrière qui défile
// pendant qu'on lit la fenêtre.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');

// Le bloc tactile : @media (max-width: 768px), (pointer: coarse)
const start = css.indexOf('@media (max-width: 768px), (pointer: coarse)');
assert.ok(start > 0, 'Le bloc de styles tactiles est introuvable.');
const end = css.indexOf('@media (prefers-reduced-motion', start);
assert.ok(end > start, 'La fin du bloc de styles tactiles est introuvable.');
const touchBlock = css.slice(start, end);

// 1. Plus de retenue globale sur les trois classes de défilement à la fois.
const globalRule = touchBlock.match(/\.overflow-x-auto,\s*\.overflow-y-auto,\s*\.overflow-auto\s*\{[^}]*\}/);
assert.ok(globalRule, 'La règle commune aux conteneurs défilants a disparu.');
assert.ok(
  !/overscroll-behavior\s*:/.test(globalRule[0]),
  'La règle commune ne doit plus imposer « overscroll-behavior » : elle figeait la page dès qu’un doigt touchait un tableau.'
);
assert.ok(
  globalRule[0].includes('-webkit-overflow-scrolling: touch'),
  'Le défilement fluide iOS doit rester en place.'
);

// 2. Un conteneur horizontal ne retient que l'axe horizontal.
const horizontal = touchBlock.match(/\.overflow-x-auto\s*\{[^}]*\}/);
assert.ok(horizontal, 'La règle propre aux conteneurs horizontaux est absente.');
assert.ok(horizontal[0].includes('overscroll-behavior-x: contain'), 'L’axe horizontal doit rester retenu.');
assert.ok(
  horizontal[0].includes('overscroll-behavior-y: auto'),
  'L’axe vertical doit rendre la main à la page : c’est exactement ce qui empêchait de défiler.'
);

// 3. Un conteneur vertical dans la page rend la main dès qu'il touche sa fin.
const vertical = touchBlock.match(/\.overflow-y-auto\s*\{[^}]*\}/);
assert.ok(vertical, 'La règle propre aux conteneurs verticaux est absente.');
assert.ok(
  !/overscroll-behavior-y\s*:\s*contain/.test(vertical[0]),
  'Une liste courte à l’intérieur de la page ne doit pas retenir le geste une fois arrivée à sa fin.'
);

// 4. La retenue subsiste dans les fenêtres modales, où elle a un sens.
assert.ok(
  /\.fixed\.inset-0[^{]*\{\s*overscroll-behavior:\s*contain/.test(touchBlock.replace(/\n/g, '')),
  'Les fenêtres modales doivent encore retenir le geste, sinon la page défile derrière elles.'
);

console.log('Défilement tactile validé', {
  plusDeRetenueGlobale: true,
  axeHorizontalSeulRetenu: true,
  listesInternesRendentLaMain: true,
  fenetresModalesRetiennent: true
});
