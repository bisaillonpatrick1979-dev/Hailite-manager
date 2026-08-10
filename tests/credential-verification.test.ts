import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyReview,
  buildSubmittedCredential,
  canEditCredential,
  canReviewCredential,
  canSubmitCredential,
  dataUrlByteLength,
  isAwaitingVerification,
  pendingVerifications,
  registriesForCredential,
  validateSubmission,
  verificationStatus,
  MAX_CREDENTIAL_PHOTO_BYTES
} from '../credentialVerification';
import type { EmployeeCredential } from '../src/types';

const photo = (bytes: number) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

function credential(overrides: Partial<EmployeeCredential> = {}): EmployeeCredential {
  return {
    id: 'c1',
    type: 'manlift',
    name: 'Manlift / nacelle élévatrice',
    issuer: 'IVES',
    credentialNumber: 'AB-77120',
    issuedDate: '2026-01-15',
    expiryDate: '2029-01-15',
    renewalReminderDays: 30,
    ...overrides
  };
}

test('une carte saisie par le bureau avant cette fonction compte comme vérifiée', () => {
  assert.equal(verificationStatus(credential()), 'verified');
  assert.equal(isAwaitingVerification(credential()), false);
});

test('une soumission est marquée « soumise », jamais vérifiée d’elle-même', () => {
  const built = buildSubmittedCredential(
    { type: 'manlift', name: '  Manlift  ', expiryDate: '2029-01-15', photoFront: 'a', photoBack: 'b' },
    'e1',
    'c9',
    new Date('2026-08-10T12:00:00.000Z')
  );
  assert.equal(built.verificationStatus, 'submitted');
  assert.equal(built.submittedBy, 'e1');
  assert.equal(built.submittedAt, '2026-08-10T12:00:00.000Z');
  assert.equal(built.name, 'Manlift', 'le nom est nettoyé');
});

test('un travailleur ne peut pas se déclarer vérifié en trafiquant l’entrée', () => {
  const built = buildSubmittedCredential(
    { type: 'manlift', name: 'Manlift', expiryDate: '2029-01-15', verificationStatus: 'verified', verifiedBy: 'moi' } as never,
    'e1',
    'c9'
  );
  assert.equal(built.verificationStatus, 'submitted');
  assert.equal(built.verifiedBy, undefined);
});

test('les deux photos sont exigées', () => {
  const problems = validateSubmission({ type: 'manlift', name: 'Manlift', expiryDate: '2029-01-15' });
  const fields = problems.map(problem => problem.field);
  assert.ok(fields.includes('photoFront'));
  assert.ok(fields.includes('photoBack'));
});

test('une soumission complète ne soulève aucun problème', () => {
  const problems = validateSubmission({
    type: 'manlift', name: 'Manlift', expiryDate: '2029-01-15', photoFront: photo(1000), photoBack: photo(1000)
  });
  assert.deepEqual(problems, []);
});

test('« n’expire pas » remplace la date d’expiration', () => {
  const problems = validateSubmission({
    type: 'whmis', name: 'SIMDUT', doesNotExpire: true, photoFront: photo(10), photoBack: photo(10)
  });
  assert.deepEqual(problems, []);
  const built = buildSubmittedCredential(
    { type: 'whmis', name: 'SIMDUT', doesNotExpire: true, expiryDate: '2029-01-15' }, 'e1', 'c2'
  );
  assert.equal(built.expiryDate, '', 'une carte sans expiration ne garde pas de date');
});

test('des photos trop lourdes sont refusées', () => {
  const heavy = photo(MAX_CREDENTIAL_PHOTO_BYTES + 10_000);
  const problems = validateSubmission({
    type: 'manlift', name: 'Manlift', expiryDate: '2029-01-15', photoFront: heavy, photoBack: heavy
  });
  assert.ok(problems.some(problem => problem.field === 'photoSize'));
});

test('la taille d’une image encodée est estimée sans la décoder', () => {
  assert.equal(dataUrlByteLength(undefined), 0);
  assert.ok(Math.abs(dataUrlByteLength(photo(3000)) - 3000) < 4);
});

test('l’approbation consigne qui a vérifié, quand et comment', () => {
  const submitted = buildSubmittedCredential(
    { type: 'manlift', name: 'Manlift', expiryDate: '2029-01-15', photoFront: 'a', photoBack: 'b' }, 'e1', 'c1'
  );
  const reviewed = applyReview(
    submitted,
    { approved: true, reviewerId: 'admin1', method: 'registry', note: 'Vérifié sur Tradesecrets' },
    new Date('2026-08-11T09:00:00.000Z')
  );
  assert.equal(reviewed.verificationStatus, 'verified');
  assert.equal(reviewed.verifiedBy, 'admin1');
  assert.equal(reviewed.verifiedAt, '2026-08-11T09:00:00.000Z');
  assert.equal(reviewed.verificationMethod, 'registry');
  assert.equal(reviewed.verificationNote, 'Vérifié sur Tradesecrets');
});

test('un refus garde le motif et ne fait pas disparaître la carte', () => {
  const submitted = buildSubmittedCredential(
    { type: 'manlift', name: 'Manlift', expiryDate: '2029-01-15', photoFront: 'a', photoBack: 'b' }, 'e1', 'c1'
  );
  const reviewed = applyReview(submitted, { approved: false, reviewerId: 'admin1', note: 'Verso illisible' });
  assert.equal(reviewed.verificationStatus, 'rejected');
  assert.equal(reviewed.verificationNote, 'Verso illisible');
  assert.equal(reviewed.photoFront, 'a', 'la carte reste consultable');
  assert.equal(reviewed.verificationMethod, undefined, 'un refus ne prétend pas avoir consulté un registre');
});

test('la file de vérification passe les plus anciennes soumissions en premier', () => {
  const employees = [
    { id: 'e1', name: 'Léa', credentials: [credential({ id: 'a', verificationStatus: 'submitted', submittedAt: '2026-08-09T10:00:00Z' })] },
    { id: 'e2', name: 'Marc', credentials: [
      credential({ id: 'b', verificationStatus: 'submitted', submittedAt: '2026-08-07T10:00:00Z' }),
      credential({ id: 'c', verificationStatus: 'verified' })
    ] },
    { id: 'e3', name: 'Sophie', credentials: [] }
  ];
  const pending = pendingVerifications(employees);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].credential.id, 'b');
  assert.equal(pending[0].employeeName, 'Marc');
  assert.equal(pending[1].credential.id, 'a');
});

test('un travailleur ne soumet que pour lui-même', () => {
  assert.equal(canSubmitCredential({ id: 'e1', role: 'employee' }, 'e1'), true);
  assert.equal(canSubmitCredential({ id: 'e1', role: 'employee' }, 'e2'), false);
  assert.equal(canSubmitCredential(null, 'e1'), false);
});

test('seul le bureau vérifie et corrige', () => {
  assert.equal(canReviewCredential({ role: 'admin' }), true);
  assert.equal(canReviewCredential({ role: 'secretary' }), true);
  assert.equal(canReviewCredential({ role: 'employee' }), false);
  assert.equal(canReviewCredential(null), false);

  const submitted = credential({ verificationStatus: 'submitted', submittedBy: 'e1' });
  assert.equal(canEditCredential(submitted, { id: 'e1', role: 'employee' }), false,
    'le titulaire ne modifie pas une carte déjà soumise');
  assert.equal(canEditCredential(submitted, { id: 'admin1', role: 'admin' }), true);
});

test('les registres proposés collent au pays et à la province', () => {
  const alberta = registriesForCredential({ type: 'manlift' }, 'CA', 'AB');
  assert.ok(alberta.some(registry => registry.id === 'ab-tradesecrets'));
  assert.ok(!alberta.some(registry => registry.id === 'qc-ccq'), 'pas de registre québécois en Alberta');
  assert.equal(alberta[0].region, 'AB', 'le registre provincial passe en premier');

  const quebec = registriesForCredential({ type: 'manlift' }, 'CA', 'QC');
  assert.ok(quebec.some(registry => registry.id === 'qc-ccq'));
  assert.ok(!quebec.some(registry => registry.id === 'ab-tradesecrets'));

  const american = registriesForCredential({ type: 'whmis' }, 'US', 'TX');
  assert.ok(american.every(registry => registry.country === 'US'));
  assert.ok(american.some(registry => registry.id === 'us-osha-outreach'));
});

test('chaque registre dit ce qu’il exige et où il s’arrête', () => {
  for (const registry of registriesForCredential({ type: 'custom' }, 'CA', 'AB')) {
    assert.ok(registry.url.startsWith('https://'), `${registry.id} doit pointer vers une page sécurisée`);
    assert.ok(registry.requiresFR && registry.requiresEN, `${registry.id} doit dire ce qu’il demande`);
    assert.ok(registry.cautionFR && registry.cautionEN, `${registry.id} doit dire ce qu’il ne couvre pas`);
  }
});
