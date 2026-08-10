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
  compareReadingToDeclared,
  inspectionVerdict,
  parseCredentialReading,
  MAX_CREDENTIAL_PHOTO_BYTES,
  CREDENTIAL_READING_INSTRUCTION
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

// ---------------------------------------------------------------------------
// Lecture assistée des deux faces et recoupement avec ce qui a été saisi
// ---------------------------------------------------------------------------

test('une carte dont tout concorde ne soulève aucun écart', () => {
  const declared = { issuer: 'IVES', credentialNumber: 'AB-77120', issuedDate: '2026-07-02', expiryDate: '2029-07-02' };
  const reading = { issuer: 'IVES', credentialNumber: 'AB-77120', issuedDate: '2026-07-02', expiryDate: '2029-07-02' };
  const found = compareReadingToDeclared(declared, reading);
  assert.deepEqual(found, []);
  assert.equal(inspectionVerdict(reading, found), 'consistent');
});

test('un numéro saisi qui ne correspond pas à celui imprimé est signalé', () => {
  const found = compareReadingToDeclared(
    { credentialNumber: 'AB-77120', issuer: 'IVES' },
    { credentialNumber: 'AB-99999', issuer: 'IVES' }
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].field, 'credentialNumber');
  assert.equal(found[0].severity, 'mismatch');
  assert.match(found[0].messageFR, /AB-77120/);
  assert.match(found[0].messageFR, /AB-99999/);
  assert.equal(inspectionVerdict({ credentialNumber: 'AB-99999' }, found), 'needs_attention');
});

test('une date d’expiration rallongée à la saisie est signalée', () => {
  const found = compareReadingToDeclared(
    { credentialNumber: 'AB-77120', expiryDate: '2031-07-02' },
    { credentialNumber: 'AB-77120', expiryDate: '2027-07-02' }
  );
  assert.ok(found.some(item => item.field === 'expiryDate' && item.severity === 'mismatch'));
});

test('la comparaison ignore la ponctuation et les accents, pas le contenu', () => {
  const found = compareReadingToDeclared(
    { credentialNumber: 'ab 77120', issuer: 'Énergie Sécurité' },
    { credentialNumber: 'AB-77120', issuer: 'Energie Securite' }
  );
  assert.deepEqual(found, [], 'une différence de forme n’est pas une différence de fond');
});

test('une carte qui expire avant d’avoir été délivrée est incohérente', () => {
  const found = compareReadingToDeclared(
    { issuedDate: '2026-07-02', expiryDate: '2025-01-01' },
    { issuedDate: '2026-07-02', expiryDate: '2025-01-01' }
  );
  assert.ok(found.some(item => item.severity === 'inconsistent'));
});

test('un élément matériel absent et un champ illisible remontent', () => {
  const reading = { credentialNumber: 'AB-77120', missingFeatures: ['code QR'], unreadable: ['date d’expiration'] };
  const found = compareReadingToDeclared({ credentialNumber: 'AB-77120' }, reading);
  assert.ok(found.some(item => item.field === 'features'));
  assert.ok(found.some(item => item.field === 'readability'));
  assert.equal(inspectionVerdict(reading, found), 'needs_attention');
});

test('des photos dont rien ne se lit donnent « illisible », pas « concorde »', () => {
  assert.equal(inspectionVerdict({}, []), 'unreadable');
  assert.equal(inspectionVerdict({ unreadable: ['tout'] }, []), 'unreadable');
});

test('le verdict ne peut jamais affirmer qu’une carte est authentique', () => {
  const verdicts = new Set<string>();
  for (const reading of [{}, { credentialNumber: 'A' }, { issuer: 'B', expiryDate: '2030-01-01' }]) {
    verdicts.add(inspectionVerdict(reading, compareReadingToDeclared({ credentialNumber: 'A' }, reading)));
  }
  for (const verdict of verdicts) {
    assert.ok(['consistent', 'needs_attention', 'unreadable'].includes(verdict),
      `verdict inattendu : ${verdict}`);
  }
  assert.ok(!CREDENTIAL_READING_INSTRUCTION.includes('authentique') || CREDENTIAL_READING_INSTRUCTION.includes('JAMAIS'),
    'la consigne doit interdire au modèle de se prononcer sur l’authenticité');
});

test('la réponse du modèle est extraite même entourée de texte', () => {
  const parsed = parseCredentialReading('Voici ce que je lis :\n```json\n{"issuer":"IVES","credentialNumber":"AB-77120","unreadable":["verso"]}\n```\nVoilà.');
  assert.equal(parsed?.issuer, 'IVES');
  assert.equal(parsed?.credentialNumber, 'AB-77120');
  assert.deepEqual(parsed?.unreadable, ['verso']);
});

test('une réponse illisible ou vide ne fabrique pas de lecture', () => {
  assert.equal(parseCredentialReading('je ne peux pas lire cette carte'), null);
  assert.equal(parseCredentialReading(''), null);
  const empty = parseCredentialReading('{"issuer":"","credentialNumber":"   "}');
  assert.equal(empty?.issuer, undefined, 'une chaîne vide n’est pas une lecture');
  assert.equal(empty?.credentialNumber, undefined);
});

test('une réponse hostile ne peut pas injecter de champs inattendus', () => {
  const parsed = parseCredentialReading('{"issuer":"IVES","verificationStatus":"verified","verifiedBy":"moi","unreadable":[1,2,{"x":1}]}');
  assert.equal((parsed as any)?.verificationStatus, undefined);
  assert.equal((parsed as any)?.verifiedBy, undefined);
  assert.deepEqual(parsed?.unreadable, undefined, 'une liste sans texte utilisable est ignorée');
});
