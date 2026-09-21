import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Le simulateur de déductions
// ---------------------------------------------------------------------------
// Il écrivait ses résultats directement dans le DOM, par getElementById. Celui
// du « gain net » portait l'identifiant `net_sim_output font-mono` — une
// espace au milieu, donc un identifiant qui n'existe pas. La recherche ne
// trouvait rien, sans erreur, et la ligne restait figée sur 623,30 $ quel que
// soit le brut saisi, pendant que les déductions juste au-dessus, elles,
// bougeaient. Sur un écran de paie, un net faux qui a l'air calculé est pire
// qu'un net absent.

test('aucun identifiant ne contient d’espace', () => {
  // Un id avec une espace est introuvable par getElementById ET invalide comme
  // sélecteur : l'erreur ne se voit qu'à l'écran, jamais dans la console.
  const identifiants = [...app.matchAll(/\bid="([^"]*)"/g)].map(m => m[1]);
  const fautifs = identifiants.filter(id => /\s/.test(id));
  assert.deepEqual(fautifs, [], 'identifiants contenant une espace');
});

test('le simulateur passe par l’état React, plus par le DOM', () => {
  assert.match(app, /const \[simulatorGrossInput, setSimulatorGrossInput\] = useState<string>\('1000'\);/);
  assert.match(app, /const simulatedDeductions = calculateSimulatedDeductions\(simulatorGross\);/);
  assert.doesNotMatch(app, /document\.getElementById\("net_sim_output"\)/);
  assert.doesNotMatch(app, /elNet\.innerText/);
});

test('le champ garde le texte saisi, pas un nombre déjà converti', () => {
  // Un champ contrôlé sur un NOMBRE réécrit la valeur à chaque frappe et
  // efface le séparateur décimal au moment où on le tape : « 1000. »
  // redevenait « 1000 » et le chiffre suivant donnait 10005 au lieu de
  // 1000.5. Sur un simulateur de paie, une erreur d'un facteur dix.
  assert.match(app, /value=\{simulatorGrossInput\}/);
  assert.match(app, /onChange=\{\(e\) => setSimulatorGrossInput\(e\.target\.value\)\}/,
    'la frappe ne doit pas être transformée avant d’être réaffichée');
  assert.doesNotMatch(app, /value=\{simulatorGross\}/, 'le nombre converti ne pilote pas le champ');
});

test('chaque ligne affiche une valeur calculée, pas un exemple écrit en dur', () => {
  // Les valeurs de départ — 150,00 $ de fédéral, 64,00 $ de régime de
  // retraite, 623,30 $ net — étaient celles du Québec, affichées sous le nom
  // de la province réellement configurée. En Alberta, l'écran annonçait des
  // montants québécois.
  for (const champ of ['fedTax', 'provTax', 'rrq', 'ae', 'net']) {
    assert.match(app, new RegExp(`simulatedDeductions\\.${champ}\\.toFixed\\(2\\)`), champ);
  }
  assert.match(app, /\{simulatorGross\.toFixed\(2\)\}\$/, 'le brut affiché doit suivre la saisie');
  for (const enDur of ['>150.00$<', '>64.00$<', '>12.70$<', '>623.30$<', '>1000.00$<']) {
    assert.ok(!app.includes(enDur), `${enDur} ne doit plus être écrit en dur`);
  }
});

test('une saisie absurde ou incomplète ne produit pas un calcul absurde', () => {
  // « 1000. », « », « - » : le temps que la frappe se complète, le calcul
  // vaut zéro plutôt que NaN ou un montant négatif — sans jamais toucher à ce
  // que la personne est en train de taper.
  assert.match(app, /const simulatorGross = Math\.max\(0, Number\(simulatorGrossInput\) \|\| 0\);/);
});
