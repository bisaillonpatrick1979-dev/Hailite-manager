import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('le mois des statistiques n’est jamais figé sur une date écrite à la main', () => {
  // Il valait '2026-06' : passé juin 2026, l'onglet Statistiques affichait un
  // mois vide pendant que le tableau de bord montrait les heures du jour.
  assert.doesNotMatch(app, /useState<string>\('\d{4}-\d{2}'\)/);
  assert.match(app, /const \[statsMonth, setStatsMonth\] = useState<string>\(\(\) => localMonthKey\(\)\)/);
});

test('le mois courant est calculé sur l’heure locale, pas en UTC', () => {
  // toISOString() bascule de mois trop tôt en soirée dans les fuseaux négatifs.
  const initializer = app.slice(app.indexOf('const [statsMonth'), app.indexOf('const [statsMonth') + 400);
  assert.match(initializer, /localMonthKey\(\)/);
  assert.doesNotMatch(initializer, /toISOString/);
});

test('les pointages UTC et la liste de mois passent par les utilitaires dynamiques', () => {
  assert.match(app, /isInLocalMonth\(p\.startTime, ym\)/);
  assert.match(app, /monthOptions\(statsMonth\)/);
  assert.doesNotMatch(app, /\["2026-12", "2026-11"/);
  assert.match(app, /statsMonthFollowsCurrent/);
});

test('les en-têtes de l’onglet Statistiques passent par les traductions', async () => {
  for (const english of ['>TEAM CALENDAR<', '>ADMIN PANEL<', '>FIELD STATISTICS<']) {
    assert.ok(!app.includes(english), `${english} doit être traduit`);
  }
  const translations = await readFile(new URL('../src/translations.ts', import.meta.url), 'utf8');
  for (const key of ['statsTeamCalendarTag', 'statsAdminPanelTag', 'statsFieldTag']) {
    assert.equal((translations.match(new RegExp(`${key}:`, 'g')) || []).length, 2, `${key} FR et EN`);
  }
});
