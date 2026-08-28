import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateTrial, NO_TRIAL, trialDays } from '../src/trialAccess';

const JOUR = 24 * 60 * 60 * 1000;
const DEBUT = '2026-08-27T12:00:00.000Z';
const apres = (jours: number, heures = 0) =>
  new Date(new Date(DEBUT).getTime() + jours * JOUR + heures * 3600_000);

// ---------------------------------------------------------------------------
// Est-ce une version d'essai ?
// ---------------------------------------------------------------------------

test('une variable absente ou illisible donne une application normale', () => {
  // Le bon défaut : une variable mal orthographiée doit produire une
  // application complète, jamais une application qui s'éteint toute seule.
  for (const valeur of [undefined, null, '', '   ', 'sept', '0', '-3', 'NaN']) {
    assert.equal(trialDays(valeur), 0, `pour ${JSON.stringify(valeur)}`);
  }
});

test('un nombre de jours valide est retenu', () => {
  assert.equal(trialDays('7'), 7);
  assert.equal(trialDays(' 14 '), 14);
  assert.equal(trialDays(30), 30);
  assert.equal(trialDays('7.9'), 7, 'on ne promet pas des fractions de jour');
});

test('sans essai configuré, rien n’est évalué', () => {
  assert.deepEqual(evaluateTrial(0, DEBUT, DEBUT, apres(99)), NO_TRIAL);
});

// ---------------------------------------------------------------------------
// Le décompte
// ---------------------------------------------------------------------------

test('au premier lancement, la semaine complète reste', () => {
  const etat = evaluateTrial(7, DEBUT, DEBUT, new Date(DEBUT));
  assert.equal(etat.enabled, true);
  assert.equal(etat.expired, false);
  assert.equal(etat.daysLeft, 7);
  assert.equal(etat.expiresAt, apres(7).toISOString());
});

test('le décompte suit les jours écoulés', () => {
  assert.equal(evaluateTrial(7, DEBUT, DEBUT, apres(1)).daysLeft, 6);
  assert.equal(evaluateTrial(7, DEBUT, DEBUT, apres(6)).daysLeft, 1);
  // Dernière journée entamée : il reste moins d'un jour, mais l'accès est
  // encore ouvert. Afficher « 0 jour » alors qu'on peut encore travailler
  // serait mentir dans le mauvais sens.
  assert.equal(evaluateTrial(7, DEBUT, DEBUT, apres(6, 12)).daysLeft, 1);
});

test('l’accès s’arrête exactement à l’échéance, pas avant', () => {
  const veille = evaluateTrial(7, DEBUT, DEBUT, apres(6, 23));
  assert.equal(veille.expired, false);

  const pile = evaluateTrial(7, DEBUT, DEBUT, apres(7));
  assert.equal(pile.expired, true);
  assert.equal(pile.daysLeft, 0);

  const apresCoup = evaluateTrial(7, DEBUT, DEBUT, apres(40));
  assert.equal(apresCoup.expired, true);
  assert.equal(apresCoup.daysLeft, 0);
});

// ---------------------------------------------------------------------------
// Reculer l'horloge ne rallonge pas l'essai
// ---------------------------------------------------------------------------

test('reculer l’horloge de l’appareil ne rend pas l’accès', () => {
  // Six jours ont été vus passer. Quelqu'un remet le téléphone au jour 1 :
  // l'essai doit rester là où il en était.
  const triche = evaluateTrial(7, DEBUT, apres(6, 23).toISOString(), apres(1));
  assert.equal(triche.daysLeft, 1, 'la date la plus avancée jamais vue fait foi');

  // Et une fois l'échéance dépassée, reculer ne rouvre rien.
  const apresEcheance = evaluateTrial(7, DEBUT, apres(9).toISOString(), apres(0));
  assert.equal(apresEcheance.expired, true);
});

test('avancer l’horloge met fin à l’essai, et c’est voulu', () => {
  // On ne cherche pas à empêcher quelqu'un de se pénaliser lui-même.
  assert.equal(evaluateTrial(7, DEBUT, DEBUT, apres(365)).expired, true);
});

// ---------------------------------------------------------------------------
// Données abîmées
// ---------------------------------------------------------------------------

test('une date de début illisible ne verrouille personne dehors', () => {
  // Elle ne doit pas non plus offrir un accès sans fin : l'essai repart de
  // maintenant, ce qui est le comportement d'une première installation.
  for (const abimee of [undefined, null, '', 'hier', 42, {}]) {
    const etat = evaluateTrial(7, abimee, null, new Date(DEBUT));
    assert.equal(etat.expired, false, `pour ${JSON.stringify(abimee)}`);
    assert.equal(etat.daysLeft, 7);
  }
});

test('une date « dernière vue » illisible est simplement ignorée', () => {
  const etat = evaluateTrial(7, DEBUT, 'pas une date', apres(3));
  assert.equal(etat.daysLeft, 4);
});

test('un essai plus long qu’une semaine fonctionne pareil', () => {
  assert.equal(evaluateTrial(30, DEBUT, DEBUT, apres(29)).daysLeft, 1);
  assert.equal(evaluateTrial(30, DEBUT, DEBUT, apres(30)).expired, true);
});
