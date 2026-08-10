import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cappedAnnualContribution, CA_PENSION_CAP, CA_EMPLOYMENT_INSURANCE_CAP
} from '../src/regionsData';

const RRQ = 0.0595;  // taux employé hors Québec
const AE = 0.0166;

test('un salaire modeste cotise sur la totalité de ses gains', () => {
  const brut = 40000;
  const attendu = (brut - CA_PENSION_CAP.basicExemption) * RRQ;
  assert.equal(
    Number(cappedAnnualContribution(brut, RRQ, CA_PENSION_CAP).toFixed(2)),
    Number(attendu.toFixed(2))
  );
});

test('l’exemption de base est retirée avant le calcul', () => {
  // Sans exemption, 3 500 $ de gains cotiseraient ; ici la base tombe à zéro.
  assert.equal(cappedAnnualContribution(CA_PENSION_CAP.basicExemption, RRQ, CA_PENSION_CAP), 0);
});

test('la cotisation cesse au maximum annuel — c’était le bug', () => {
  // Avant, `cpp = gross * taux` s'appliquait sans fin : un salaire élevé
  // cotisait toute l'année, bien au-delà du plafond réel.
  const plafond = (CA_PENSION_CAP.maxEarnings - CA_PENSION_CAP.basicExemption) * RRQ;
  const tresHautSalaire = cappedAnnualContribution(250000, RRQ, CA_PENSION_CAP);
  assert.equal(Number(tresHautSalaire.toFixed(2)), Number(plafond.toFixed(2)));
  // Sans plafond, on aurait prélevé plus de trois fois trop.
  assert.ok(250000 * RRQ > tresHautSalaire * 3);
});

test('deux salaires au-dessus du plafond cotisent le même montant', () => {
  const a = cappedAnnualContribution(90000, RRQ, CA_PENSION_CAP);
  const b = cappedAnnualContribution(180000, RRQ, CA_PENSION_CAP);
  assert.equal(a, b);
});

test('l’assurance-emploi a son propre plafond, sans exemption', () => {
  assert.equal(CA_EMPLOYMENT_INSURANCE_CAP.basicExemption, 0);
  const plafond = CA_EMPLOYMENT_INSURANCE_CAP.maxEarnings * AE;
  assert.equal(
    Number(cappedAnnualContribution(200000, AE, CA_EMPLOYMENT_INSURANCE_CAP).toFixed(2)),
    Number(plafond.toFixed(2))
  );
});

test('les entrées absurdes ne produisent jamais de cotisation négative', () => {
  assert.equal(cappedAnnualContribution(-5000, RRQ, CA_PENSION_CAP), 0);
  assert.equal(cappedAnnualContribution(0, RRQ, CA_PENSION_CAP), 0);
  assert.equal(cappedAnnualContribution(Number.NaN, RRQ, CA_PENSION_CAP), 0);
  assert.equal(cappedAnnualContribution(50000, 0, CA_PENSION_CAP), 0);
});

test('les plafonds restent des ordres de grandeur plausibles', () => {
  // Garde-fou : si quelqu'un met à jour les constantes, une faute de frappe
  // d'un facteur dix se voit immédiatement.
  assert.ok(CA_PENSION_CAP.maxEarnings > 50000 && CA_PENSION_CAP.maxEarnings < 120000);
  assert.ok(CA_EMPLOYMENT_INSURANCE_CAP.maxEarnings > 40000 && CA_EMPLOYMENT_INSURANCE_CAP.maxEarnings < 110000);
  assert.ok(CA_PENSION_CAP.basicExemption >= 0 && CA_PENSION_CAP.basicExemption < 10000);
});
