import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PunchSession } from '../src/types';
import { dayWithinRange, punchDayKeys, punchTouchesRange } from '../src/punchHours';

const EDMONTON = 'America/Edmonton';
const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8');

function punch(overrides: Partial<PunchSession> = {}): PunchSession {
  return {
    id: 'p1', employeeId: 'e1', employeeName: 'Mathieu',
    projectId: 'c1', projectName: 'Chantier', payMode: 'horaire', rate: 40,
    startTime: '2026-07-22T08:00:00-06:00', endTime: '2026-07-22T16:00:00-06:00',
    pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: 0,
    ...overrides
  };
}

function corpsDe(nom: string): string {
  // `lastIndexOf` vise l'implémentation : le même nom apparaît plus haut dans
  // la déclaration d'interface de l'état, qui n'a pas de corps.
  const debut = source.lastIndexOf(`  ${nom}: (`);
  assert.notEqual(debut, -1, `${nom} introuvable dans le store`);
  const fin = source.indexOf('\n  },', debut);
  assert.notEqual(fin, -1, `fin de ${nom} introuvable`);
  return source.slice(debut, fin);
}

/** Retire les lignes de commentaire : une assertion sur le code ne doit pas
 *  être satisfaite — ni mise en échec — par la prose qui l'explique. */
function sansCommentaires(bloc: string): string {
  return bloc.split('\n').filter(ligne => !ligne.trim().startsWith('//')).join('\n');
}

// ---------------------------------------------------------------------------
// La période d'un objectif
// ---------------------------------------------------------------------------
// Le calcul des objectifs balayait TOUS les pointages de l'entreprise, sans
// regarder les dates de l'objectif. Un objectif « 50 000 $ de revenus » créé
// ce matin naissait donc déjà atteint : la récompense s'affichait et l'XP
// tombait pour du travail fait avant que l'objectif existe.

test('une journée dans la période compte', () => {
  assert.equal(punchTouchesRange(punch(), '2026-07-01', '2026-07-31', EDMONTON), true);
});

test('une journée hors de la période ne compte pas', () => {
  const avant = punch({
    startTime: '2026-06-10T08:00:00-06:00',
    endTime: '2026-06-10T16:00:00-06:00'
  });
  assert.equal(punchTouchesRange(avant, '2026-07-01', '2026-07-31', EDMONTON), false,
    'du travail antérieur à l’objectif ne lui appartient pas');

  const apres = punch({
    startTime: '2026-08-10T08:00:00-06:00',
    endTime: '2026-08-10T16:00:00-06:00'
  });
  assert.equal(punchTouchesRange(apres, '2026-07-01', '2026-07-31', EDMONTON), false,
    'un objectif échu ne continue pas de se remplir');
});

test('les bornes sont incluses', () => {
  for (const jour of ['2026-07-01', '2026-07-31']) {
    const p = punch({ startTime: `${jour}T08:00:00-06:00`, endTime: `${jour}T16:00:00-06:00` });
    assert.equal(punchTouchesRange(p, '2026-07-01', '2026-07-31', EDMONTON), true, jour);
  }
});

test('un quart de nuit à cheval sur le début compte pour l’objectif', () => {
  // Il occupe le 30 juin et le 1er juillet. Celui qui l'a travaillé le compte
  // dans son mois de juillet; mieux vaut compter trop que de lui retirer une
  // nuit entière.
  const nuit = punch({
    startTime: '2026-06-30T22:00:00-06:00',
    endTime: '2026-07-01T02:00:00-06:00'
  });
  assert.equal(punchTouchesRange(nuit, '2026-07-01', '2026-07-31', EDMONTON), true);
});

test('une période ouverte d’un côté reste ouverte', () => {
  const p = punch();
  assert.equal(punchTouchesRange(p, '2026-01-01', undefined, EDMONTON), true, 'sans date de fin');
  assert.equal(punchTouchesRange(p, undefined, '2026-12-31', EDMONTON), true, 'sans date de début');
  assert.equal(punchTouchesRange(p, undefined, undefined, EDMONTON), true, 'sans aucune borne');
});

test('un objectif sans date de début n’est pas vidé', () => {
  // Une ligne ancienne ou importée peut ne pas en avoir. La refuser
  // remettrait à zéro un objectif déjà en cours, sans que personne comprenne
  // pourquoi.
  assert.equal(punchTouchesRange(punch(), null, null, EDMONTON), true);
  assert.equal(punchTouchesRange(punch(), '', '', EDMONTON), true);
});

// ---------------------------------------------------------------------------
// Les journées de sécurité comptent des JOURNÉES, pas des pointages
// ---------------------------------------------------------------------------
// « Le pointage touche la période » est la bonne question pour un revenu ou
// des heures : on additionne le pointage entier. Elle ne suffit pas pour
// `safety_days`, qui compte des journées distinctes : un quart de nuit à
// cheval sur la première journée passe le filtre, puis apporte ses DEUX
// journées au compte — dont une qui précède l'objectif. La récompense pouvait
// tomber un jour trop tôt.

test('la journée hors période d’un quart de nuit ne compte pas', () => {
  const nuit = punch({
    startTime: '2026-06-30T22:00:00-06:00',
    endTime: '2026-07-01T02:00:00-06:00'
  });
  const journees = punchDayKeys(nuit, EDMONTON);
  assert.deepEqual(journees, ['2026-06-30', '2026-07-01'], 'le quart occupe bien deux journées');

  // Le pointage entier compte pour l'objectif…
  assert.equal(punchTouchesRange(nuit, '2026-07-01', '2026-07-31', EDMONTON), true);
  // …mais une seule de ses journées entre dans le décompte.
  const retenues = journees.filter(jour => dayWithinRange(jour, '2026-07-01', '2026-07-31'));
  assert.deepEqual(retenues, ['2026-07-01']);
});

test('dayWithinRange inclut les bornes et tolère l’absence de bornes', () => {
  assert.equal(dayWithinRange('2026-07-01', '2026-07-01', '2026-07-31'), true);
  assert.equal(dayWithinRange('2026-07-31', '2026-07-01', '2026-07-31'), true);
  assert.equal(dayWithinRange('2026-06-30', '2026-07-01', '2026-07-31'), false);
  assert.equal(dayWithinRange('2026-08-01', '2026-07-01', '2026-07-31'), false);
  assert.equal(dayWithinRange('2026-01-01'), true, 'sans bornes, tout compte');
  assert.equal(dayWithinRange('2026-01-01', null, null), true);
});

test('le décompte des journées de sécurité filtre journée par journée', () => {
  const corps = corpsDe('recomputeGoalsAndStreaks');
  assert.match(corps, /punchDayKeys\(p\)\.filter\(day => dayWithinRange\(day, goal\.startDate, goal\.endDate\)\)/,
    'sinon la journée hors période d’un quart de nuit gonfle le compte');
});

test('le calcul des objectifs applique bien cette période', () => {
  const corps = corpsDe('recomputeGoalsAndStreaks');
  assert.match(corps, /punchSessions\.filter\(p => !!p\.endTime && punchWithinGoalWindow\(p, goal\)\)/,
    'les pointages doivent être bornés à la période de l’objectif');
  assert.match(source, /punchTouchesRange\(session, goal\.startDate, goal\.endDate\)/);
});

// ---------------------------------------------------------------------------
// La série de jours consécutifs
// ---------------------------------------------------------------------------

test('une série brisée vaut zéro, pas un', () => {
  // `Math.max(1, streak)` annulait la branche qui remet la série à zéro :
  // quelqu'un qui n'avait pas pointé depuis trois semaines lisait toujours
  // « 1 jour d'affilée ». La branche existait, elle ne servait à rien.
  // L'assertion porte sur le code, pas sur les commentaires qui l'entourent :
  // le commentaire de la correction cite justement l'expression fautive.
  const corps = sansCommentaires(corpsDe('recomputeGoalsAndStreaks'));
  assert.ok(!corps.includes('Math.max(1, streak)'), 'aucun plancher artificiel sur la série');
  assert.match(corps, /\n\s*wg\.streak = streak;/);
});

test('sans quart terminé, la série est remise à zéro', () => {
  const corps = corpsDe('recomputeGoalsAndStreaks');
  assert.match(corps, /\} else \{[\s\S]{0,300}wg\.streak = 0;[\s\S]{0,120}wg\.lastPunchDate = null;/,
    'effacer les pointages doit effacer la série');
  assert.doesNotMatch(corps, /streak: 1,/, 'une fiche neuve part de zéro');
});

// ---------------------------------------------------------------------------
// Devis converti en facture
// ---------------------------------------------------------------------------

test('la facture issue d’un devis naît impayée', () => {
  // La copie du devis emportait son historique de versements AVEC les mêmes
  // identifiants — et `syncDocumentInsert` ne synchronise que le document et
  // ses lignes, jamais `document_payments`. Après une resynchronisation,
  // l'historique disparaissait de la facture pendant que le solde restait
  // amputé d'autant : de l'argent dû en moins, sans rien à l'écran pour
  // l'expliquer.
  const corps = corpsDe('convertQuoteToInvoice');
  assert.match(corps, /paymentsHistory: \[\]/);
  assert.match(corps, /balanceDue: Number\(\(quote\.total - quote\.holdbackAmount\)\.toFixed\(2\)\)/,
    'le solde doit repartir du montant complet, retenue déduite');
});

test('les lignes copiées gardent des identifiants neufs', () => {
  // Protection déjà en place : elle tomberait en silence si quelqu'un
  // simplifiait la copie du devis.
  const corps = corpsDe('convertQuoteToInvoice');
  for (const champ of ['lineItems', 'materialLines', 'labourLines', 'otherLines', 'subcontractLines']) {
    assert.match(corps, new RegExp(`${champ}: quote\\.${champ}\\.map\\(l => \\(\\{ \\.\\.\\.l, id: genId\\(\\) \\}\\)\\)`), champ);
  }
});
